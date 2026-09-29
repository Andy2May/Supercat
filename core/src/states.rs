//! Canonical initial states for simulations, sampled on a [`Grid1D`].

use crate::error::{CoreError, Result};
use crate::grid::Grid1D;
use crate::wavefunction::Wavefunction;
use num_complex::Complex64;

/// Builds a normalized Gaussian wavepacket centered at `x0` with width `sigma`
/// and carrier wavenumber `k0`, sampled on `grid`.
///
/// # Physics
///
/// The continuous wavepacket is
///
/// ```text
/// psi(x) ~ exp( -(x - x0)^2 / (4 sigma^2) + i * k0 * x )
/// ```
///
/// sampled at every grid point and then normalized with the discrete
/// (Riemann-sum) norm. The `4 sigma^2` in the amplitude makes `sigma` the
/// position-space standard deviation of the packet, since
/// `|psi(x)|^2 ~ exp(-(x - x0)^2 / (2 sigma^2))`. `k0` is the wavenumber; the
/// packet's mean momentum is `p0 = hbar * k0`.
///
/// # Errors
///
/// Returns [`CoreError::InvalidSigma`] unless `sigma` is finite and strictly
/// positive. Every other parameter is validated by [`Wavefunction::new`]:
/// non-finite `x0`/`k0` yield non-finite samples (→ [`CoreError::NonFinite`]),
/// and non-positive `m`/`hbar` are rejected (→
/// [`CoreError::InvalidMassOrHbar`]).
pub fn gaussian(
    grid: &Grid1D,
    x0: f64,
    k0: f64,
    sigma: f64,
    m: f64,
    hbar: f64,
) -> Result<Wavefunction> {
    if !(sigma.is_finite() && sigma > 0.0) {
        return Err(CoreError::InvalidSigma { sigma });
    }
    let psi = (0..grid.n())
        .map(|i| {
            let x = grid.x(i);
            let d = (x - x0) / (2.0 * sigma);
            // exp(-d^2) * exp(i k0 x). Negate d^2 BEFORE exp (unary minus
            // binds looser than a method call); squaring first keeps the
            // exponent finite-negative for arbitrarily distant points (exp
            // underflows to 0 instead of overflowing).
            Complex64::from_polar((-(d * d)).exp(), k0 * x)
        })
        .collect::<Vec<_>>();
    // `Wavefunction` owns its grid, so rebuild one from the validated public
    // fields. This cannot fail (a live `&Grid1D` already satisfied every
    // check); `?` keeps the builder panic-free per the crate contract.
    let owned_grid = Grid1D::new(grid.n(), grid.xmin(), grid.xmax())?;
    let mut wf = Wavefunction::new(owned_grid, psi, m, hbar)?;
    wf.normalize();
    Ok(wf)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Reference packet from the M0 plan: fine grid, packet well inside the
    // domain (7 sigma from either edge).
    const N: usize = 2048;
    const XMIN: f64 = -24.0;
    const XMAX: f64 = 24.0;
    const X0: f64 = -10.0;
    const K0: f64 = std::f64::consts::SQRT_2;
    const SIGMA: f64 = 2.0;

    fn reference_grid() -> Grid1D {
        Grid1D::new(N, XMIN, XMAX).expect("reference grid is valid")
    }

    fn reference_packet() -> Wavefunction {
        gaussian(&reference_grid(), X0, K0, SIGMA, 1.0, 1.0).expect("reference packet is valid")
    }

    #[test]
    fn norm_is_one_right_after_construction() {
        let wf = reference_packet();
        let norm = wf.norm();
        assert!(
            (norm - 1.0).abs() < 1e-12,
            "norm = {norm}, expected 1 within 1e-12"
        );
    }

    #[test]
    fn probability_density_peaks_at_grid_point_nearest_x0() {
        let wf = reference_packet();
        let grid = reference_grid();

        let peak_index = wf
            .psi()
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.norm_sqr().total_cmp(&b.norm_sqr()))
            .map(|(i, _)| i)
            .expect("psi is nonempty");

        let nearest_index = (0..grid.n())
            .min_by(|&a, &b| (grid.x(a) - X0).abs().total_cmp(&(grid.x(b) - X0).abs()))
            .expect("grid is nonempty");

        assert_eq!(peak_index, nearest_index);
        // Hand check: dx = 48/2048 = 0.0234375, so x(597) = -10.0078125 is
        // the closest point to x0 = -10 (distance dx/3 vs 2dx/3 for x(598)).
        assert_eq!(nearest_index, 597);
    }

    #[test]
    fn discrete_width_matches_sigma() {
        let wf = reference_packet();
        let grid = reference_grid();
        let dx = grid.dx();

        // Hand-computed discrete moments with the dx-weighted convention
        // (the packet is normalized, so |psi_i|^2 dx are probabilities):
        // xbar = sum x_i |psi_i|^2 dx, then width = sqrt(sum (x_i - xbar)^2
        // |psi_i|^2 dx).
        let xbar: f64 = (0..grid.n())
            .map(|i| grid.x(i) * wf.psi()[i].norm_sqr())
            .sum::<f64>()
            * dx;
        let variance: f64 = (0..grid.n())
            .map(|i| {
                let d = grid.x(i) - xbar;
                d * d * wf.psi()[i].norm_sqr()
            })
            .sum::<f64>()
            * dx;

        assert!(
            (variance.sqrt() - SIGMA).abs() < 1e-6,
            "width = {}, expected {SIGMA} within 1e-6",
            variance.sqrt()
        );
    }

    #[test]
    fn rejects_non_positive_or_non_finite_sigma() {
        let grid = reference_grid();
        for sigma in [0.0, -2.0, f64::NAN, f64::INFINITY] {
            assert!(
                matches!(
                    gaussian(&grid, X0, K0, sigma, 1.0, 1.0),
                    Err(CoreError::InvalidSigma { .. })
                ),
                "sigma = {sigma} must be rejected"
            );
        }
    }

    #[test]
    fn other_params_inherit_wavefunction_validation() {
        let grid = reference_grid();
        assert!(matches!(
            gaussian(&grid, X0, K0, SIGMA, 0.0, 1.0),
            Err(CoreError::InvalidMassOrHbar { .. })
        ));
        assert!(matches!(
            gaussian(&grid, X0, K0, SIGMA, 1.0, -1.0),
            Err(CoreError::InvalidMassOrHbar { .. })
        ));
        // A non-finite x0 produces non-finite samples, caught downstream.
        assert!(matches!(
            gaussian(&grid, f64::NAN, K0, SIGMA, 1.0, 1.0),
            Err(CoreError::NonFinite {
                what: "wavefunction",
                ..
            })
        ));
    }
}
