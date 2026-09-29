//! Time propagation of [`Wavefunction`]s.
//!
//! [`SplitOperator`] advances the time-dependent Schrödinger equation with
//! second-order Strang splitting: one step `dt` applies the potential
//! half-step `exp(-i V dt / (2*hbar))`, then the full kinetic drift
//! `exp(-i T dt / hbar)` in momentum space, then the potential half-step
//! again. Every factor is unit-modulus in its representation, so the step
//! is exactly unitary up to rounding — verified after every step by the
//! norm guard.

use crate::error::CoreError;
use crate::fft::{k_grid, scratch_len, transform_forward, transform_inverse};
use crate::grid::Grid1D;
use crate::potential::Potential;
use crate::wavefunction::Wavefunction;
use num_complex::Complex64;

/// Tolerance on `|sum |psi_i|^2 dx - 1|` after each step.
const NORM_TOLERANCE: f64 = 1e-10;

/// Advances a [`Wavefunction`] by exactly one time step `dt`, in place.
pub trait Propagator {
    /// Advances the state by exactly one step `dt`, mutating `psi` in place.
    ///
    /// # Errors
    ///
    /// Implementations validate before mutating and report
    /// [`CoreError::DimensionMismatch`] or [`CoreError::NonFinite`] without
    /// touching the state; a norm violation is reported as
    /// [`CoreError::NormDrift`] after the step.
    fn step(&mut self, wf: &mut Wavefunction, v: &Potential) -> Result<(), CoreError>;
}

/// Split-operator (Strang splitting) propagator on a fixed grid.
///
/// The kinetic phase factors `exp(-i*hbar*k_j^2*dt/(2m))` per DFT bin and
/// the FFT plans (via the crate-wide thread-local planner cache) are
/// computed once in [`SplitOperator::new`]; each [`Propagator::step`] then
/// allocates nothing.
pub struct SplitOperator {
    /// Grid point count; validated input length.
    n: usize,
    /// Grid spacing, the weight of the norm's Riemann sum.
    dx: f64,
    /// Time step; the potential half-step uses `dt / 2`.
    dt: f64,
    /// Reduced Planck constant of the system being propagated.
    hbar: f64,
    /// `exp(-i*hbar*k_j^2*dt/(2m))` per DFT bin, precomputed in `new`.
    kinetic_phase: Vec<Complex64>,
    /// FFT scratch, sized by [`crate::fft::scratch_len`].
    scratch: Vec<Complex64>,
    /// Successful steps taken so far; reported by the norm guard.
    step: u64,
}

impl SplitOperator {
    /// Creates a split-operator propagator for `grid` with time step `dt`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidMassOrHbar`] unless `m` and `hbar` are
    /// finite and positive, and [`CoreError::InvalidTimeStep`] unless `dt`
    /// is finite and positive.
    pub fn new(grid: &Grid1D, dt: f64, m: f64, hbar: f64) -> Result<Self, CoreError> {
        if !(m.is_finite() && m > 0.0) || !(hbar.is_finite() && hbar > 0.0) {
            return Err(CoreError::InvalidMassOrHbar { m, hbar });
        }
        if !(dt.is_finite() && dt > 0.0) {
            return Err(CoreError::InvalidTimeStep { dt });
        }
        // Kinetic phase per DFT bin; warming the planner happens in
        // scratch_len, so planning occurs exactly once, here.
        let kinetic_phase = k_grid(grid.n(), grid.dx())
            .iter()
            .map(|&k| Complex64::cis(-hbar * k * k * dt / (2.0 * m)))
            .collect();
        let scratch = vec![Complex64::new(0.0, 0.0); scratch_len(grid.n())];
        Ok(Self {
            n: grid.n(),
            dx: grid.dx(),
            dt,
            hbar,
            kinetic_phase,
            scratch,
            step: 0,
        })
    }
}

impl Propagator for SplitOperator {
    fn step(&mut self, wf: &mut Wavefunction, v: &Potential) -> Result<(), CoreError> {
        // 1. Validate before touching any data.
        if wf.n() != self.n {
            return Err(CoreError::DimensionMismatch {
                expected: self.n,
                got: wf.n(),
            });
        }
        if v.len() != self.n {
            return Err(CoreError::DimensionMismatch {
                expected: self.n,
                got: v.len(),
            });
        }
        if let Some(index) = v.values().iter().position(|x| !x.is_finite()) {
            return Err(CoreError::NonFinite {
                what: "potential",
                index,
            });
        }

        let psi = wf.psi_mut();
        // exp(-i*V_i*dt/(2*hbar)): the potential half-step phase.
        let half_kick = -self.dt / (2.0 * self.hbar);

        // 2. Potential half-step: psi_i *= exp(-i*V_i*dt/(2*hbar)).
        for (c, &vi) in psi.iter_mut().zip(v.values()) {
            *c *= Complex64::cis(half_kick * vi);
        }

        // 3. Full kinetic drift in momentum space: the forward transform is
        //    unnormalized, the inverse rescales, so the round trip is exact
        //    and only the unit-modulus kinetic phases act.
        transform_forward(psi, &mut self.scratch);
        for (c, &phase) in psi.iter_mut().zip(&self.kinetic_phase) {
            *c *= phase;
        }
        transform_inverse(psi, &mut self.scratch);

        // 4. Second potential half-step, identical to step 2.
        for (c, &vi) in psi.iter_mut().zip(v.values()) {
            *c *= Complex64::cis(half_kick * vi);
        }

        // 5. Norm guard: g = sum |psi_i|^2 * dx must stay 1; a unitary step
        //    preserves it to rounding, so this catches unnormalized input on
        //    the first step and any numerical breakdown later.
        let g = psi.iter().map(|c| c.norm_sqr()).sum::<f64>() * self.dx;
        if (g - 1.0).abs() > NORM_TOLERANCE {
            return Err(CoreError::NormDrift {
                step: self.step,
                norm: g,
            });
        }
        self.step += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreError;
    use crate::fft::{k_grid, scratch_len, transform_forward, transform_inverse};
    use crate::grid::Grid1D;
    use crate::potential::{Potential, barrier, harmonic};
    use crate::wavefunction::Wavefunction;
    use num_complex::Complex64;
    use std::f64::consts::PI;

    const N: usize = 2048;
    const XMIN: f64 = -20.0;
    const XMAX: f64 = 20.0;

    /// Analytic harmonic-oscillator ground state
    /// `psi0(x) = pi^(-1/4) * exp(-x^2/2)` for `m = omega = hbar = 1`,
    /// sampled on the reference grid and normalized, plus the matching
    /// harmonic potential.
    fn ho_ground_state() -> (Wavefunction, Potential) {
        let grid = Grid1D::new(N, XMIN, XMAX).expect("reference grid is valid");
        let psi: Vec<Complex64> = (0..N)
            .map(|i| {
                let x = grid.x(i);
                Complex64::new(PI.powf(-0.25) * (-0.5 * x * x).exp(), 0.0)
            })
            .collect();
        let mut wf = Wavefunction::new(grid, psi, 1.0, 1.0).expect("ground state is valid");
        wf.normalize();
        let v = harmonic(wf.grid(), 1.0, 1.0);
        (wf, v)
    }

    /// Propagates the HO ground state `steps` steps at `dt` and asserts the
    /// probability density is pointwise stationary within `density_tol` and
    /// the norm stays 1 — an exact eigenstate only gains a global phase.
    fn assert_density_stationary(steps: usize, dt: f64, density_tol: f64) {
        let (mut wf, v) = ho_ground_state();
        let initial: Vec<f64> = wf.psi().iter().map(|c| c.norm_sqr()).collect();
        let mut prop = SplitOperator::new(wf.grid(), dt, 1.0, 1.0).expect("parameters valid");
        for i in 0..steps {
            prop.step(&mut wf, &v)
                .unwrap_or_else(|e| panic!("step {i} failed: {e}"));
        }
        let max_dev = wf
            .psi()
            .iter()
            .zip(&initial)
            .map(|(c, &d0)| (c.norm_sqr() - d0).abs())
            .fold(0.0, f64::max);
        assert!(
            max_dev < density_tol,
            "max density deviation {max_dev} exceeds {density_tol}"
        );
        let norm_error = (wf.norm() - 1.0).abs();
        assert!(norm_error < 1e-10, "norm error {norm_error}");
    }

    #[test]
    fn ho_ground_state_density_stationary_at_brief_parameters() {
        // dt = 0.01 over 100 steps: Strang's O(dt^2) eigenstate density error
        // measures ~5e-6, so the tolerance is 1e-4. Wrong Strang ordering, a
        // wrong k-grid, or sign errors produce O(1) deviations and still fail.
        assert_density_stationary(100, 0.01, 1e-4);
    }

    #[test]
    fn ho_ground_state_only_gains_phase_at_small_dt() {
        // At dt = 1e-4 the splitting error drops to ~1e-13, so the strict
        // phase-only gate holds: density stationary to 1e-10 pointwise.
        assert_density_stationary(100, 1e-4, 1e-10);
    }

    #[test]
    fn norm_guard_rejects_unnormalized_input() {
        let (mut wf, v) = ho_ground_state();
        for c in wf.psi_mut() {
            *c *= 2.0; // norm 2, so sum |psi_i|^2 dx = 4 after any unitary step
        }
        let mut prop = SplitOperator::new(wf.grid(), 0.01, 1.0, 1.0).expect("parameters valid");
        match prop.step(&mut wf, &v) {
            Err(CoreError::NormDrift { step, norm }) => {
                assert_eq!(step, 0, "first step must report step counter 0");
                assert!(
                    (norm - 4.0).abs() < 1e-9,
                    "norm^2 after doubling = {norm}, expected 4"
                );
            }
            other => panic!("expected NormDrift, got {other:?}"),
        }
    }

    #[test]
    fn non_finite_potential_is_rejected_before_mutating() {
        let (mut wf, _) = ho_ground_state();
        // A barrier of NaN height: every window-interior sample is NaN.
        let v = barrier(wf.grid(), 0.0, 1.0, f64::NAN);
        let expected_index = v
            .values()
            .iter()
            .position(|x| x.is_nan())
            .expect("barrier window is nonempty on the reference grid");
        let before = wf.psi().to_vec();
        let mut prop = SplitOperator::new(wf.grid(), 0.01, 1.0, 1.0).expect("parameters valid");
        assert!(matches!(
            prop.step(&mut wf, &v),
            Err(CoreError::NonFinite {
                what: "potential",
                index
            }) if index == expected_index
        ));
        assert_eq!(wf.psi(), before.as_slice(), "psi must be untouched");
    }

    #[test]
    fn dimension_mismatch_is_rejected_before_mutating() {
        let (mut wf, v) = ho_ground_state();
        let short_v = Potential::zeros(N / 2);
        let before = wf.psi().to_vec();
        let mut prop = SplitOperator::new(wf.grid(), 0.01, 1.0, 1.0).expect("parameters valid");

        assert!(matches!(
            prop.step(&mut wf, &short_v),
            Err(CoreError::DimensionMismatch { expected, got })
                if expected == N && got == N / 2
        ));
        assert_eq!(wf.psi(), before.as_slice(), "psi must be untouched");

        // A wavefunction of the wrong length is caught the same way.
        let small_grid = Grid1D::new(16, -1.0, 1.0).expect("small grid is valid");
        let mut small_wf =
            Wavefunction::new(small_grid, vec![Complex64::new(0.25, 0.0); 16], 1.0, 1.0)
                .expect("small wavefunction is valid");
        assert!(matches!(
            prop.step(&mut small_wf, &v),
            Err(CoreError::DimensionMismatch {
                expected: N,
                got: 16
            })
        ));
    }

    #[test]
    fn new_rejects_invalid_parameters() {
        let grid = Grid1D::new(N, XMIN, XMAX).expect("reference grid is valid");
        for dt in [0.0, -0.01, f64::INFINITY] {
            assert!(
                matches!(
                    SplitOperator::new(&grid, dt, 1.0, 1.0),
                    Err(CoreError::InvalidTimeStep { dt: d }) if d == dt
                ),
                "dt = {dt} must be rejected"
            );
        }
        assert!(matches!(
            SplitOperator::new(&grid, f64::NAN, 1.0, 1.0),
            Err(CoreError::InvalidTimeStep { .. })
        ));
        assert!(matches!(
            SplitOperator::new(&grid, 0.01, 0.0, 1.0),
            Err(CoreError::InvalidMassOrHbar { .. })
        ));
        assert!(matches!(
            SplitOperator::new(&grid, 0.01, 1.0, -1.0),
            Err(CoreError::InvalidMassOrHbar { .. })
        ));
        assert!(SplitOperator::new(&grid, 0.01, 1.0, 1.0).is_ok());
    }

    #[test]
    fn k_grid_matches_fftfreq_convention() {
        let n = 8;
        let dx = 1.5;
        let k = k_grid(n, dx);
        let dk = 2.0 * PI / (n as f64 * dx);
        let expected = [0.0, 1.0, 2.0, 3.0, -4.0, -3.0, -2.0, -1.0];
        for (kj, e) in k.iter().zip(expected) {
            assert!((kj - dk * e).abs() < 1e-12, "k = {kj}, expected {}", dk * e);
        }
    }

    #[test]
    fn fft_round_trip_is_identity() {
        let n = 64;
        let mut buf: Vec<Complex64> = (0..n)
            .map(|i| Complex64::new((i as f64 * 0.37).sin(), (i as f64 * 0.11).cos()))
            .collect();
        let original = buf.clone();
        let mut scratch = vec![Complex64::new(0.0, 0.0); scratch_len(n)];
        transform_forward(&mut buf, &mut scratch);
        transform_inverse(&mut buf, &mut scratch);
        for (a, &b) in buf.iter().zip(&original) {
            assert!((*a - b).norm() < 1e-12, "round trip changed {b} into {a}");
        }
    }
}
