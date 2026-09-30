//! Canonical initial states for simulations, sampled on a [`Grid1D`] or a
//! [`Grid2D`].

use crate::error::{CoreError, Result};
use crate::grid::{Grid1D, Grid2D};
use crate::wavefunction::{Wavefunction, Wavefunction2D};
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
/// positive, and [`CoreError::NonFinite`] for a non-finite `x0` or `k0`.
/// The `x0`/`k0` checks happen up front because an infinite `x0` underflows
/// every sample to zero (a valid but meaningless wavefunction) and would
/// otherwise defer failure to the propagator's norm guard. Remaining
/// parameters are validated by [`Wavefunction::new`]: non-positive `m`/`hbar`
/// are rejected (→ [`CoreError::InvalidMassOrHbar`]).
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
    if !x0.is_finite() {
        return Err(CoreError::NonFinite {
            what: "x0",
            index: 0,
        });
    }
    if !k0.is_finite() {
        return Err(CoreError::NonFinite {
            what: "k0",
            index: 0,
        });
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

/// Builds a normalized anisotropic Gaussian wavepacket centered at `(x0, y0)`
/// with widths `sigma_x`/`sigma_y` and carrier wavevector `(kx, ky)`, sampled
/// on `grid`.
///
/// # Physics
///
/// The continuous wavepacket is
///
/// ```text
/// psi(x, y) ~ exp( -(x - x0)^2 / (4 sigma_x^2) - (y - y0)^2 / (4 sigma_y^2)
///                + i * (kx * x + ky * y) )
/// ```
///
/// sampled at every grid point (row-major, x-fastest, matching
/// [`Grid2D::index`]) and then normalized with the discrete Riemann-sum
/// norm of [`Wavefunction2D`], which carries the `dA = dx·dy` area weight.
/// As in the 1D [`gaussian`], the `4 sigma^2` denominators make
/// `sigma_x`/`sigma_y` the position-space standard deviations along each
/// axis, since `|psi|^2 ~ exp(-(x-x0)^2 / (2 sigma_x^2) - (y-y0)^2 /
/// (2 sigma_y^2))`. `(kx, ky)` is the carrier wavevector; the packet's mean
/// momentum is `p = hbar * (kx, ky)`.
///
/// # Errors
///
/// Returns [`CoreError::InvalidSigma`] unless `sigma_x` and `sigma_y` are
/// both finite and strictly positive, and [`CoreError::NonFinite`] for a
/// non-finite `x0`, `y0`, `kx`, or `ky` (each labelled by name). As in
/// [`gaussian`], these checks happen up front: an infinite `x0`/`y0`
/// underflows every sample to zero (a valid but meaningless wavefunction)
/// and an infinite `kx`/`ky` would poison every phase, so both fail at
/// construction instead of downstream. Remaining parameters are validated
/// by [`Wavefunction2D::new`]: non-positive `m`/`hbar` are rejected
/// (→ [`CoreError::InvalidMassOrHbar`]).
// The parameter list is fixed by the M1 plan: it mirrors `gaussian`
// parameter-for-parameter with the y-axis and `sigma_y` additions, so the
// 9-argument signature is deliberate (a parameter struct would break the
// published interface of this builder).
#[allow(clippy::too_many_arguments)]
pub fn gaussian_2d(
    grid: &Grid2D,
    x0: f64,
    y0: f64,
    kx: f64,
    ky: f64,
    sigma_x: f64,
    sigma_y: f64,
    m: f64,
    hbar: f64,
) -> Result<Wavefunction2D> {
    for sigma in [sigma_x, sigma_y] {
        if !(sigma.is_finite() && sigma > 0.0) {
            return Err(CoreError::InvalidSigma { sigma });
        }
    }
    for (value, what) in [(x0, "x0"), (y0, "y0"), (kx, "kx"), (ky, "ky")] {
        if !value.is_finite() {
            return Err(CoreError::NonFinite { what, index: 0 });
        }
    }
    // Row-major (x-fastest) order matching `Grid2D::index`: the flat index
    // of point (i, j) is j * nx + i, so j walks rows (y) in the outer loop.
    let mut psi = Vec::with_capacity(grid.nx() * grid.ny());
    for j in 0..grid.ny() {
        let y = grid.y(j);
        for i in 0..grid.nx() {
            let x = grid.x(i);
            let ux = (x - x0) / (2.0 * sigma_x);
            let uy = (y - y0) / (2.0 * sigma_y);
            // Same per-axis technique as `gaussian`: negate each squared
            // distance BEFORE exp (unary minus binds looser than a method
            // call); squaring first keeps each exponent finite-negative for
            // arbitrarily distant points (exp underflows to 0 instead of
            // overflowing). The two axis amplitudes multiply, the two
            // linear phases add inside from_polar's argument.
            let amplitude = (-(ux * ux)).exp() * (-(uy * uy)).exp();
            psi.push(Complex64::from_polar(amplitude, kx * x + ky * y));
        }
    }
    // `Wavefunction2D` owns its grid, so rebuild one from the validated
    // public fields. This cannot fail (a live `&Grid2D` already satisfied
    // every check); `?` keeps the builder panic-free per the crate contract.
    let owned_grid = Grid2D::new(
        grid.nx(),
        grid.ny(),
        grid.xmin(),
        grid.xmax(),
        grid.ymin(),
        grid.ymax(),
    )?;
    let mut wf = Wavefunction2D::new(owned_grid, psi, m, hbar)?;
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
        // A non-finite x0 or k0 is rejected up front by `gaussian` itself.
        for (x0, k0) in [(f64::NAN, K0), (X0, f64::NAN)] {
            assert!(
                matches!(
                    gaussian(&grid, x0, k0, SIGMA, 1.0, 1.0),
                    Err(CoreError::NonFinite { .. })
                ),
                "x0 = {x0}, k0 = {k0} must be rejected"
            );
        }
    }

    #[test]
    fn rejects_infinite_x0_at_construction_not_a_zero_wavefunction() {
        // x0 = +inf underflows every exp(-(x - x0)^2 / (4 sigma^2)) sample
        // to zero, so without the up-front check `gaussian` would return Ok
        // with an all-zero wavefunction (normalize() is a no-op on zero
        // norm) and defer failure to the first propagator step's norm
        // guard. Construction must fail instead.
        let grid = reference_grid();
        assert!(matches!(
            gaussian(&grid, f64::INFINITY, K0, SIGMA, 1.0, 1.0),
            Err(CoreError::NonFinite { what: "x0", .. })
        ));
    }

    mod gaussian_2d_tests {
        use super::*;

        // Reference packet from the M1 plan: 256×256 grid over [-20, 20)²
        // with non-unit dx = dy = 40/256 = 0.15625, anisotropic packet at
        // the origin — 13σx / 8σy from the nearest edge, so the boundary
        // tail is ~e^-32 ≈ 1e-14 and never pollutes the moments below.
        const NX: usize = 256;
        const NY: usize = 256;
        const X0: f64 = 0.0;
        const Y0: f64 = 0.0;
        const KX: f64 = 3.0;
        const KY: f64 = -2.0;
        const SIGMA_X: f64 = 1.5;
        const SIGMA_Y: f64 = 2.5;

        fn reference_grid() -> Grid2D {
            Grid2D::new(NX, NY, -20.0, 20.0, -20.0, 20.0).expect("reference grid is valid")
        }

        fn reference_packet() -> Wavefunction2D {
            gaussian_2d(
                &reference_grid(),
                X0,
                Y0,
                KX,
                KY,
                SIGMA_X,
                SIGMA_Y,
                1.0,
                1.0,
            )
            .expect("reference packet is valid")
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
        fn probability_density_peaks_at_grid_point_nearest_center() {
            let wf = reference_packet();
            let grid = reference_grid();

            let peak_index = wf
                .psi()
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.norm_sqr().total_cmp(&b.norm_sqr()))
                .map(|(k, _)| k)
                .expect("psi is nonempty");

            let distance_sqr = |k: usize| {
                let (i, j) = (k % grid.nx(), k / grid.nx());
                let dxk = grid.x(i) - X0;
                let dyk = grid.y(j) - Y0;
                dxk * dxk + dyk * dyk
            };
            let nearest_index = (0..grid.nx() * grid.ny())
                .min_by(|&a, &b| distance_sqr(a).total_cmp(&distance_sqr(b)))
                .expect("grid is nonempty");

            assert_eq!(peak_index, nearest_index);
            // Hand check: dx = dy = 40/256 = 0.15625, so x(128) =
            // -20 + 128·0.15625 = 0 exactly, and the grid point nearest
            // (x0, y0) = (0, 0) is (i, j) = (128, 128), flat index
            // 128·256 + 128 = 32896 (row-major, x-fastest).
            assert_eq!(nearest_index, 128 * 256 + 128);
        }

        #[test]
        fn discrete_widths_match_sigma_x_and_sigma_y() {
            let wf = reference_packet();
            let grid = reference_grid();
            let d_a = grid.dx() * grid.dy();

            // Hand-computed discrete moments with the dA-weighted
            // convention (the packet is normalized, so |psi_k|²·dA are
            // probabilities): first the mean of each axis,
            // x̄ = Σ x_i·|ψ|²·dA, then the centered second moment,
            // var_x = Σ (x_i - x̄)²·|ψ|²·dA (likewise along y). The moments
            // are computed test-locally with the dA weight because dx ≠ 1
            // here — an unweighted sum would not even be a moment.
            let mut xbar = 0.0;
            let mut ybar = 0.0;
            for j in 0..grid.ny() {
                for i in 0..grid.nx() {
                    let p = wf.psi()[grid.index(i, j)].norm_sqr() * d_a;
                    xbar += grid.x(i) * p;
                    ybar += grid.y(j) * p;
                }
            }
            let mut var_x = 0.0;
            let mut var_y = 0.0;
            for j in 0..grid.ny() {
                for i in 0..grid.nx() {
                    let p = wf.psi()[grid.index(i, j)].norm_sqr() * d_a;
                    let dxk = grid.x(i) - xbar;
                    let dyk = grid.y(j) - ybar;
                    var_x += dxk * dxk * p;
                    var_y += dyk * dyk * p;
                }
            }

            assert!(
                (var_x.sqrt() - SIGMA_X).abs() < 1e-6,
                "width_x = {}, expected {SIGMA_X} within 1e-6",
                var_x.sqrt()
            );
            assert!(
                (var_y.sqrt() - SIGMA_Y).abs() < 1e-6,
                "width_y = {}, expected {SIGMA_Y} within 1e-6",
                var_y.sqrt()
            );
        }

        #[test]
        fn rejects_non_positive_or_non_finite_sigma() {
            let grid = reference_grid();
            for sigma_x in [0.0, -1.5, f64::NAN, f64::INFINITY] {
                assert!(
                    matches!(
                        gaussian_2d(&grid, X0, Y0, KX, KY, sigma_x, SIGMA_Y, 1.0, 1.0),
                        Err(CoreError::InvalidSigma { .. })
                    ),
                    "sigma_x = {sigma_x} must be rejected"
                );
            }
            for sigma_y in [0.0, -2.5, f64::NAN, f64::INFINITY] {
                assert!(
                    matches!(
                        gaussian_2d(&grid, X0, Y0, KX, KY, SIGMA_X, sigma_y, 1.0, 1.0),
                        Err(CoreError::InvalidSigma { .. })
                    ),
                    "sigma_y = {sigma_y} must be rejected"
                );
            }
        }

        #[test]
        fn other_params_inherit_wavefunction_validation() {
            let grid = reference_grid();
            assert!(matches!(
                gaussian_2d(&grid, X0, Y0, KX, KY, SIGMA_X, SIGMA_Y, 0.0, 1.0),
                Err(CoreError::InvalidMassOrHbar { .. })
            ));
            assert!(matches!(
                gaussian_2d(&grid, X0, Y0, KX, KY, SIGMA_X, SIGMA_Y, 1.0, -1.0),
                Err(CoreError::InvalidMassOrHbar { .. })
            ));
            // A non-finite x0/y0/kx/ky is rejected up front by `gaussian_2d`
            // itself, labelled with the offending parameter's name.
            for (x0, y0, kx, ky, what) in [
                (f64::NAN, Y0, KX, KY, "x0"),
                (X0, f64::NAN, KX, KY, "y0"),
                (X0, Y0, f64::NAN, KY, "kx"),
                (X0, Y0, KX, f64::NAN, "ky"),
            ] {
                let got = match gaussian_2d(&grid, x0, y0, kx, ky, SIGMA_X, SIGMA_Y, 1.0, 1.0) {
                    Err(CoreError::NonFinite { what, .. }) => what,
                    _ => panic!("x0={x0}, y0={y0}, kx={kx}, ky={ky} must be rejected"),
                };
                assert_eq!(got, what);
            }
        }

        #[test]
        fn rejects_infinite_x0_at_construction_not_a_zero_wavefunction() {
            // x0 = +inf underflows every exp(-(x - x0)^2 / (4 sigma_x^2))
            // sample to zero, so without the up-front check `gaussian_2d`
            // would return Ok with an all-zero wavefunction (normalize() is
            // a no-op on zero norm) and defer failure to the propagator's
            // norm guard. (An infinite kx/ky instead poisons every phase to
            // NaN — also caught up front, by name.) Construction must fail
            // instead.
            let grid = reference_grid();
            assert!(matches!(
                gaussian_2d(&grid, f64::INFINITY, Y0, KX, KY, SIGMA_X, SIGMA_Y, 1.0, 1.0),
                Err(CoreError::NonFinite { what: "x0", .. })
            ));
        }
    }
}
