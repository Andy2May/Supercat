//! Observables of [`Wavefunction`]s: position, momentum, and energy
//! expectations, uncertainties, and the probability of spatial regions.
//!
//! Every function takes the wavefunction by shared reference and relies on
//! the crate invariant that ψ is normalized (`‖ψ‖ = 1` with the dx-weighted
//! Riemann-sum norm of [`Wavefunction::norm`]): `|ψᵢ|² dx` are then discrete
//! probabilities and expectations are plain weighted sums.
//!
//! Momentum observables go through momentum space: ψ is copied into a scratch
//! buffer, forward-transformed once, and reduced in **ratio form** — only
//! quotients of quadratic forms in φ = FFT(ψ) appear, so every result is a
//! real scalar and immune to the normalization convention of the
//! (unnormalized) FFT.

use crate::fft::{k_grid, scratch_len, transform_forward};
use crate::grid::Grid1D;
use crate::potential::Potential;
use crate::wavefunction::Wavefunction;
use num_complex::Complex64;

/// Angular wavenumbers of the DFT bins of `grid` — the `numpy.fft.fftfreq`
/// convention scaled by `2*pi` (identical to the crate-internal `fft`
/// module's k-grid, which the propagator uses):
///
/// ```text
/// k_j = 2*pi / (n*dx) * j',   j' = j      for j <  n/2   (n even)
///                              j' = j - n  for j >= n/2   (n even)
/// ```
///
/// Bin 0 is the zero wavenumber; bins at and above `n/2` carry the negative
/// wavenumbers (bin `n/2` is the negative Nyquist `-pi/dx`). These are
/// wavenumbers, not momenta: the momentum of bin `j` is `p_j = hbar * k_j`
/// for the system's `hbar` (numerically equal in the default unitless system
/// `hbar = 1`). Public because M2 renders `|ψ̃(p)|²` momentum-space views on
/// exactly this axis.
pub fn momentum_grid(grid: &Grid1D) -> Vec<f64> {
    k_grid(grid.n(), grid.dx())
}

/// `(⟨x⟩, ⟨x²⟩)` with the dx-weighted Riemann sums
/// `⟨xⁿ⟩ = Σᵢ xᵢⁿ |ψᵢ|² dx`.
fn position_moments(wf: &Wavefunction) -> (f64, f64) {
    let grid = wf.grid();
    let dx = grid.dx();
    let (m1, m2) = wf
        .psi()
        .iter()
        .enumerate()
        .fold((0.0, 0.0), |(m1, m2), (i, c)| {
            let p = c.norm_sqr();
            let x = grid.x(i);
            (m1 + x * p, m2 + x * x * p)
        });
    (m1 * dx, m2 * dx)
}

/// `(⟨p⟩, ⟨p²⟩)` in momentum space, in ratio form — immune to the FFT's
/// normalization convention. With `φ = FFT(ψ)` (unnormalized) and `k_j` the
/// [`momentum_grid`] bins:
///
/// ```text
/// ⟨p⟩  = hbar   * Σ_j k_j   |φ_j|² / Σ_j |φ_j|²
/// ⟨p²⟩ = hbar²  * Σ_j k_j²  |φ_j|² / Σ_j |φ_j|²
/// ```
///
/// Both are real by construction: only the real weights `|φ_j|²` enter.
fn momentum_moments(wf: &Wavefunction) -> (f64, f64) {
    let n = wf.n();
    // ψ is only borrowed, so transform a scratch copy; φ and FFT scratch are
    // allocated per call — observables run per frame, not per step.
    let mut phi = wf.psi().to_vec();
    let mut scratch = vec![Complex64::new(0.0, 0.0); scratch_len(n)];
    transform_forward(&mut phi, &mut scratch);
    let k = k_grid(n, wf.grid().dx());
    let (weight, m1, m2) =
        phi.iter()
            .zip(&k)
            .fold((0.0, 0.0, 0.0), |(weight, m1, m2), (c, &kj)| {
                let w = c.norm_sqr();
                (weight + w, m1 + kj * w, m2 + kj * kj * w)
            });
    let hbar = wf.hbar();
    (hbar * m1 / weight, hbar * hbar * m2 / weight)
}

/// Position expectation value `⟨x⟩ = Σᵢ xᵢ |ψᵢ|² dx`.
pub fn expectation_x(wf: &Wavefunction) -> f64 {
    position_moments(wf).0
}

/// Position uncertainty `σ_x = sqrt(⟨x²⟩ − ⟨x⟩²)`.
pub fn sigma_x(wf: &Wavefunction) -> f64 {
    let (m1, m2) = position_moments(wf);
    (m2 - m1 * m1).sqrt()
}

/// Momentum expectation value `⟨p⟩`, computed in momentum space via the
/// ratio form described in the module documentation.
pub fn expectation_p(wf: &Wavefunction) -> f64 {
    momentum_moments(wf).0
}

/// Momentum uncertainty `σ_p = sqrt(⟨p²⟩ − ⟨p⟩²)`.
pub fn sigma_p(wf: &Wavefunction) -> f64 {
    let (m1, m2) = momentum_moments(wf);
    (m2 - m1 * m1).sqrt()
}

/// Kinetic energy `⟨T⟩ = ⟨p²⟩ / (2m)` via the momentum-space ratio form.
pub fn kinetic(wf: &Wavefunction) -> f64 {
    momentum_moments(wf).1 / (2.0 * wf.m())
}

/// Potential energy `⟨V⟩ = Σᵢ Vᵢ |ψᵢ|² dx`.
///
/// `v` must be sampled on the same grid as `wf` (`v.len() == wf.n()`); a
/// mismatch is a programming error, caught by a debug assertion.
pub fn potential_energy(wf: &Wavefunction, v: &Potential) -> f64 {
    debug_assert_eq!(wf.n(), v.len(), "potential must be sampled on wf's grid");
    let dx = wf.grid().dx();
    wf.psi()
        .iter()
        .zip(v.values())
        .map(|(c, &vi)| vi * c.norm_sqr())
        .sum::<f64>()
        * dx
}

/// Total energy `⟨E⟩ = ⟨T⟩ + ⟨V⟩ = kinetic + potential_energy`.
pub fn energy(wf: &Wavefunction, v: &Potential) -> f64 {
    kinetic(wf) + potential_energy(wf, v)
}

/// Probability of the half-open spatial window `[a, b)`:
/// `Σ_{a <= x_i < b} |ψᵢ|² dx` — the same right-open convention as the grid
/// itself. Windows outside the grid simply hold no grid points and yield 0.
pub fn norm_in_range(wf: &Wavefunction, a: f64, b: f64) -> f64 {
    let grid = wf.grid();
    let dx = grid.dx();
    wf.psi()
        .iter()
        .enumerate()
        .filter(|&(i, _)| {
            let x = grid.x(i);
            a <= x && x < b
        })
        .map(|(_, c)| c.norm_sqr())
        .sum::<f64>()
        * dx
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::Grid1D;
    use crate::potential::{Potential, harmonic};
    use crate::states::gaussian;

    // Reference packet from the M0 plan (same parameters as states.rs): a
    // fine grid with the packet 7 sigma from either edge, so the discretized
    // observables match the analytic minimum-uncertainty-Gaussian values.
    const N: usize = 2048;
    const X0: f64 = -10.0;
    const K0: f64 = std::f64::consts::SQRT_2;
    const SIGMA: f64 = 2.0;

    fn reference_packet() -> Wavefunction {
        let grid = Grid1D::new(N, -24.0, 24.0).expect("reference grid is valid");
        gaussian(&grid, X0, K0, SIGMA, 1.0, 1.0).expect("reference packet is valid")
    }

    fn assert_close(actual: f64, expected: f64, tol: f64, what: &str) {
        assert!(
            (actual - expected).abs() < tol,
            "{what}: actual = {actual}, expected {expected} (tol {tol})"
        );
    }

    #[test]
    fn expectation_x_is_packet_center() {
        let wf = reference_packet();
        assert_close(expectation_x(&wf), X0, 1e-9, "<x>");
    }

    #[test]
    fn sigma_x_is_sigma() {
        let wf = reference_packet();
        assert_close(sigma_x(&wf), SIGMA, 1e-6, "sigma_x");
    }

    #[test]
    fn expectation_p_is_hbar_k0() {
        let wf = reference_packet();
        assert_close(expectation_p(&wf), K0, 1e-9, "<p>");
    }

    #[test]
    fn sigma_p_is_one_over_two_sigma() {
        let wf = reference_packet();
        assert_close(sigma_p(&wf), 1.0 / (2.0 * SIGMA), 1e-6, "sigma_p");
    }

    #[test]
    fn sigma_x_times_sigma_p_saturates_uncertainty_bound() {
        let wf = reference_packet();
        assert_close(sigma_x(&wf) * sigma_p(&wf), 0.5, 1e-6, "sigma_x*sigma_p");
    }

    #[test]
    fn free_particle_kinetic_potential_and_energy() {
        let wf = reference_packet();
        let v = Potential::zeros(N);
        // <T> = (hbar*k0)^2/(2m) + hbar^2/(8 m sigma^2) = (2 + 0.0625)/2.
        let expected_t = (K0 * K0 + 1.0 / (4.0 * SIGMA * SIGMA)) / 2.0;
        assert_close(kinetic(&wf), expected_t, 1e-6, "<T>");
        assert_close(
            potential_energy(&wf, &v),
            0.0,
            1e-12,
            "<V> for the free particle",
        );
        assert_close(energy(&wf, &v), kinetic(&wf), 1e-12, "E with V = 0");
    }

    #[test]
    fn potential_energy_matches_harmonic_analytic_value() {
        let wf = reference_packet();
        let v = harmonic(wf.grid(), 1.0, 1.0);
        // <V> = m*omega^2*<x^2>/2 = (sigma^2 + x0^2)/2 = 52 for m = omega = 1.
        assert_close(
            potential_energy(&wf, &v),
            (SIGMA * SIGMA + X0 * X0) / 2.0,
            1e-6,
            "<V> harmonic",
        );
    }

    #[test]
    fn norm_in_range_is_three_sigma_probability() {
        let wf = reference_packet();
        // The window [x0 - 3*sigma, x0 + 3*sigma) = [-16, -4) holds the
        // Gaussian mass erf(3/sqrt(2)) ~ 0.9973002 of the normalized packet.
        assert_close(
            norm_in_range(&wf, -16.0, -4.0),
            0.997_300_203_936_739_8,
            1e-3,
            "norm in [-16, -4)",
        );
    }

    #[test]
    fn momentum_grid_follows_fftfreq_convention() {
        let grid = Grid1D::new(8, -1.0, 11.0).expect("grid is valid"); // dx = 1.5
        let k = momentum_grid(&grid);
        assert_eq!(k.len(), grid.n());
        let dk = 2.0 * std::f64::consts::PI / (8.0 * 1.5);
        let expected = [0.0, 1.0, 2.0, 3.0, -4.0, -3.0, -2.0, -1.0];
        for (kj, e) in k.iter().zip(expected) {
            assert_close(*kj, dk * e, 1e-12, "k bin");
        }

        // On the reference grid bin 0 is zero and bin n/2 is -pi/dx (the
        // negative Nyquist, n even).
        let fine = Grid1D::new(N, -24.0, 24.0).expect("fine grid is valid");
        let kf = momentum_grid(&fine);
        assert_close(kf[0], 0.0, 1e-12, "k[0]");
        assert_close(
            kf[N / 2],
            -std::f64::consts::PI / fine.dx(),
            1e-9,
            "Nyquist bin",
        );
    }
}
