//! Observables of [`Wavefunction`]s and [`Wavefunction2D`](crate::wavefunction::Wavefunction2D)s:
//! position, momentum, and energy expectations, uncertainties, and the
//! probability of spatial regions.
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
//!
//! The 2D family (`*_2d`, M2) mirrors all of this for
//! [`Wavefunction2D`](crate::wavefunction::Wavefunction2D): position-space
//! sums carry the area weight `dA = dx·dy`, and one 2D FFT serves both axes —
//! a single pass over φ = FFT2(ψ) accumulates the weight, the kx and ky
//! moments, and (for [`observables_snapshot_2d`]) the per-bin momentum
//! density.

use crate::fft::{k_grid, scratch_len, scratch2_len, transform_forward, transform2_forward};
use crate::grid::{Grid1D, Grid2D};
use crate::potential::{Potential, Potential2D};
use crate::wavefunction::{Wavefunction, Wavefunction2D};
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

// ===== 2D observables (M2) =====

/// Angular wavenumbers of the DFT bins of `grid` along each axis — the 2D
/// counterpart of [`momentum_grid`]: `(kx by column i, ky by row j)`, both in
/// the `numpy.fft.fftfreq` convention scaled by `2*pi` (identical to the
/// crate-internal `fft` module's k-grids, which the 2D propagator uses).
/// Bin 0 of each axis is the zero wavenumber; bins at and above `n/2` carry
/// the negative wavenumbers. These are wavenumbers, not momenta: the momentum
/// of bin `(i, j)` is `(hbar*kx[i], hbar*ky[j])`. Public because M2 renders
/// `|ψ̃(p)|²` momentum-space views on exactly these axes.
pub fn momentum_grid_2d(grid: &Grid2D) -> (Vec<f64>, Vec<f64>) {
    (k_grid(grid.nx(), grid.dx()), k_grid(grid.ny(), grid.dy()))
}

/// Position/momentum moments of a [`Wavefunction2D`] — see the module
/// documentation for the conventions (`dA = dx·dy` weights, ratio-form
/// k-space moments immune to the FFT normalization).
pub struct Moments2D {
    /// `⟨x⟩`
    pub x: f64,
    /// `⟨y⟩`
    pub y: f64,
    /// `σ_x = sqrt(⟨x²⟩ − ⟨x⟩²)`
    pub sigma_x: f64,
    /// `σ_y = sqrt(⟨y²⟩ − ⟨y⟩²)`
    pub sigma_y: f64,
    /// `⟨px⟩ = hbar·Σ kx|φ|² / Σ|φ|²`
    pub px: f64,
    /// `⟨py⟩ = hbar·Σ ky|φ|² / Σ|φ|²`
    pub py: f64,
    /// `σ_px = sqrt(⟨px²⟩ − ⟨px⟩²)`
    pub sigma_px: f64,
    /// `σ_py = sqrt(⟨py²⟩ − ⟨py⟩²)`
    pub sigma_py: f64,
}

/// `((⟨x⟩, ⟨x²⟩), (⟨y⟩, ⟨y²⟩))` with the dA-weighted Riemann sums
/// `⟨xⁿ⟩ = Σₖ xₖⁿ |ψₖ|² dx·dy` — the 2D analogue of [`position_moments`].
fn position_moments_2d(wf: &Wavefunction2D) -> ((f64, f64), (f64, f64)) {
    let grid = wf.grid();
    let d = grid.dx() * grid.dy();
    let (mut m1x, mut m2x, mut m1y, mut m2y) = (0.0, 0.0, 0.0, 0.0);
    for (k, c) in wf.psi().iter().enumerate() {
        let p = c.norm_sqr();
        let (x, y) = (grid.x(k % grid.nx()), grid.y(k / grid.nx()));
        m1x += x * p;
        m2x += x * x * p;
        m1y += y * p;
        m2y += y * y * p;
    }
    ((m1x * d, m2x * d), (m1y * d, m2y * d))
}

/// One forward 2D FFT of a scratch copy of ψ, reduced in a **single pass** —
/// the shared engine of every 2D momentum observable. Returns the raw
/// k-space sums
///
/// ```text
/// (Σ|φ|²,  Σ kx|φ|²,  Σ kx²|φ|²,  Σ ky|φ|²,  Σ ky²|φ|²)
/// ```
///
/// over the bins of [`momentum_grid_2d`] (flat bin `k = j*nx + i`). When
/// `density` is `Some`, the same pass fills it with the per-bin momentum
/// density, so [`observables_snapshot_2d`] gets display data with zero
/// additional transforms.
fn k_space_sums_2d(
    wf: &Wavefunction2D,
    mut density: Option<&mut Vec<f32>>,
) -> (f64, f64, f64, f64, f64) {
    let grid = wf.grid();
    let (nx, ny) = (grid.nx(), grid.ny());
    // ψ is only borrowed, so transform a scratch copy; φ and the FFT scratch
    // are allocated per call — observables run per frame, not per step.
    let mut phi = wf.psi().to_vec();
    let mut scratch = vec![Complex64::new(0.0, 0.0); scratch2_len(nx, ny)];
    transform2_forward(&mut phi, &mut scratch, nx, ny);
    let (kx, ky) = momentum_grid_2d(grid);
    // Density scale: dA²/(2π)² turns |φ_k|² into a probability density on
    // the (kx, ky) grid — Σ density·dkx·dky = 1 exactly by discrete Parseval
    // (see ObservablesSnapshot2D::momentum_density).
    let scale = grid.dx() * grid.dy() / (2.0 * std::f64::consts::PI);
    let scale_sq = scale * scale;
    let (mut weight, mut mkx, mut mkx2, mut mky, mut mky2) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for (k, c) in phi.iter().enumerate() {
        let w = c.norm_sqr();
        let kxi = kx[k % nx];
        let kyj = ky[k / nx];
        if let Some(d) = density.as_mut() {
            d.push((w * scale_sq) as f32);
        }
        weight += w;
        mkx += kxi * w;
        mkx2 += kxi * kxi * w;
        mky += kyj * w;
        mky2 += kyj * kyj * w;
    }
    (weight, mkx, mkx2, mky, mky2)
}

/// `(⟨px⟩, ⟨py⟩, ⟨px²⟩, ⟨py²⟩)` in momentum space, in ratio form — the 2D
/// analogue of [`momentum_moments`]. With `φ = FFT2(ψ)` (unnormalized) and
/// `kx[i]`, `ky[j]` the [`momentum_grid_2d`] bins:
///
/// ```text
/// ⟨px⟩  = hbar   * Σ kx|φ|²  / Σ|φ|²      ⟨px²⟩ = hbar² * Σ kx²|φ|²  / Σ|φ|²
/// ⟨py⟩  = hbar   * Σ ky|φ|²  / Σ|φ|²      ⟨py²⟩ = hbar² * Σ ky²|φ|²  / Σ|φ|²
/// ```
///
/// All four are real by construction: only the real weights `|φ|²` enter,
/// and one 2D FFT serves both axes.
fn momentum_moments_2d(wf: &Wavefunction2D) -> (f64, f64, f64, f64) {
    let (weight, mkx, mkx2, mky, mky2) = k_space_sums_2d(wf, None);
    let hbar = wf.hbar();
    (
        hbar * mkx / weight,
        hbar * mky / weight,
        hbar * hbar * mkx2 / weight,
        hbar * hbar * mky2 / weight,
    )
}

/// All eight position and momentum moments of `wf` (means and uncertainties).
pub fn moments_2d(wf: &Wavefunction2D) -> Moments2D {
    let ((x, x2), (y, y2)) = position_moments_2d(wf);
    let (px, py, px2, py2) = momentum_moments_2d(wf);
    Moments2D {
        x,
        y,
        sigma_x: (x2 - x * x).sqrt(),
        sigma_y: (y2 - y * y).sqrt(),
        px,
        py,
        sigma_px: (px2 - px * px).sqrt(),
        sigma_py: (py2 - py * py).sqrt(),
    }
}

/// Kinetic energy `⟨T⟩ = (⟨px²⟩ + ⟨py²⟩) / (2m)` via the momentum-space
/// ratio form: `hbar² Σ (kx² + ky²)|φ|² / (2m Σ|φ|²)`.
pub fn kinetic_2d(wf: &Wavefunction2D) -> f64 {
    let (_, _, px2, py2) = momentum_moments_2d(wf);
    (px2 + py2) / (2.0 * wf.m())
}

/// Potential energy `⟨V⟩ = Σₖ Vₖ |ψₖ|² dx·dy`.
///
/// `v` must be sampled on the same grid as `wf` (`v.len() == wf.n_points()`);
/// a mismatch is a programming error, caught by a debug assertion.
pub fn potential_energy_2d(wf: &Wavefunction2D, v: &Potential2D) -> f64 {
    debug_assert_eq!(
        wf.n_points(),
        v.len(),
        "potential must be sampled on wf's grid"
    );
    let grid = wf.grid();
    wf.psi()
        .iter()
        .zip(v.values())
        .map(|(c, &vk)| vk * c.norm_sqr())
        .sum::<f64>()
        * grid.dx()
        * grid.dy()
}

/// Total energy `⟨E⟩ = ⟨T⟩ + ⟨V⟩ = kinetic_2d + potential_energy_2d`.
pub fn energy_2d(wf: &Wavefunction2D, v: &Potential2D) -> f64 {
    kinetic_2d(wf) + potential_energy_2d(wf, v)
}

/// Per-frame 2D observables bundle — everything the M2 scene view needs from
/// one call.
pub struct ObservablesSnapshot2D {
    /// Position and momentum moments (means and uncertainties).
    pub moments: Moments2D,
    /// Kinetic energy `⟨T⟩` (momentum space, ratio form).
    pub kinetic: f64,
    /// Potential energy `⟨V⟩` against the passed-in potential.
    pub potential: f64,
    /// Total energy `⟨E⟩ = ⟨T⟩ + ⟨V⟩`.
    pub energy: f64,
    /// Momentum density `|φ|²` per bin as a probability density on the
    /// `(kx, ky)` grid — scaled by `dA²/(2π)²` so that
    /// `Σ density·dkx·dky = 1` exactly (discrete Parseval). `f32` for
    /// transport economy, row-major `j*nx + i`, native fftfreq order (NOT
    /// fftshifted — the renderer applies any shift itself).
    pub momentum_density: Vec<f32>,
}

/// All 2D observables for one frame — moments, energies, and the
/// momentum-space density — from a **single** forward 2D FFT of ψ: one pass
/// over `φ = FFT2(ψ)` accumulates the weight, all four k-moments, and the
/// per-bin display density together ([`k_space_sums_2d`]).
///
/// # Design note (deliberate deviation from spec D6)
///
/// The M2 spec direction is to harvest `|ψ̃(p)|²` mid-step from inside the
/// Strang split, reusing the propagator's own FFT. But the φ available at
/// that point carries the half-step phase `e^{-iV·dt/(2ħ)}`, so its
/// `|φ(p)|²` deviates from the true momentum distribution by `O(dt·V)` —
/// visibly wrong in scenes with walls. This snapshot instead performs one
/// exact FFT of the current ψ and shares it across every quantity: the same
/// one-FFT cost as the mid-step harvest, zero cost when the momentum view is
/// off, and exact physics.
pub fn observables_snapshot_2d(wf: &Wavefunction2D, v: &Potential2D) -> ObservablesSnapshot2D {
    let ((x, x2), (y, y2)) = position_moments_2d(wf);
    let mut density = Vec::with_capacity(wf.n_points());
    let (weight, mkx, mkx2, mky, mky2) = k_space_sums_2d(wf, Some(&mut density));
    let hbar = wf.hbar();
    let (px, py) = (hbar * mkx / weight, hbar * mky / weight);
    let (px2, py2) = (hbar * hbar * mkx2 / weight, hbar * hbar * mky2 / weight);
    let kinetic = hbar * hbar * (mkx2 + mky2) / (2.0 * wf.m() * weight);
    let potential = potential_energy_2d(wf, v);
    ObservablesSnapshot2D {
        moments: Moments2D {
            x,
            y,
            sigma_x: (x2 - x * x).sqrt(),
            sigma_y: (y2 - y * y).sqrt(),
            px,
            py,
            sigma_px: (px2 - px * px).sqrt(),
            sigma_py: (py2 - py * py).sqrt(),
        },
        kinetic,
        potential,
        energy: kinetic + potential,
        momentum_density: density,
    }
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

#[cfg(test)]
mod obs2d {
    use super::*;
    use crate::grid::Grid2D;
    use crate::potential::{Potential2D, harmonic2d};
    use crate::states::gaussian_2d;
    use crate::wavefunction::Wavefunction2D;

    const NX: usize = 128;
    const NY: usize = 128;
    const X0: f64 = -4.0;
    const Y0: f64 = 2.0;
    const KX: f64 = std::f64::consts::SQRT_2;
    const KY: f64 = 0.0;
    const SX: f64 = 2.0;
    const SY: f64 = 1.5;

    fn packet() -> Wavefunction2D {
        let grid = Grid2D::new(NX, NY, -16.0, 16.0, -16.0, 16.0).unwrap();
        gaussian_2d(&grid, X0, Y0, KX, KY, SX, SY, 1.0, 1.0).unwrap()
    }
    fn close(a: f64, b: f64, tol: f64, what: &str) {
        assert!((a - b).abs() < tol, "{what}: {a} vs {b} (tol {tol})");
    }

    #[test]
    fn moments_match_separable_gaussian_analytic() {
        let m = moments_2d(&packet());
        // <x> tolerance 2e-8 (not the 1e-9 of the other means): x0 is only
        // 6*sigma_x from the grid edge, and the clipped left tail shifts the
        // discretized mean by +8.144e-9 — the exact Riemann-sum value is
        // -3.999999991855775 (verified independently), so 1e-9 is physically
        // unreachable with these constants. The 1D test affords 1e-9 only
        // because its packet sits 7 sigma out.
        close(m.x, X0, 2e-8, "<x>");
        close(m.y, Y0, 1e-9, "<y>");
        close(m.sigma_x, SX, 1e-6, "sigma_x");
        close(m.sigma_y, SY, 1e-6, "sigma_y");
        close(m.px, KX, 1e-9, "<px>");
        close(m.py, KY, 1e-9, "<py>");
        close(m.sigma_px, 1.0 / (2.0 * SX), 1e-6, "sigma_px");
        close(m.sigma_py, 1.0 / (2.0 * SY), 1e-6, "sigma_py");
        close(m.sigma_x * m.sigma_px, 0.5, 1e-6, "sx*spx");
        close(m.sigma_y * m.sigma_py, 0.5, 1e-6, "sy*spy");
    }

    #[test]
    fn free_and_harmonic_energies() {
        let wf = packet();
        let v0 = Potential2D::zeros(NX * NY);
        // <T> = (kx^2+ky^2)/2 + 1/(8 sx^2) + 1/(8 sy^2); <V>=0.
        let t = (KX * KX + KY * KY) / 2.0 + 1.0 / (8.0 * SX * SX) + 1.0 / (8.0 * SY * SY);
        close(kinetic_2d(&wf), t, 1e-5, "<T> free");
        close(potential_energy_2d(&wf, &v0), 0.0, 1e-12, "<V> free");
        close(energy_2d(&wf, &v0), t, 1e-5, "E free");
        let grid = Grid2D::new(NX, NY, -16.0, 16.0, -16.0, 16.0).unwrap();
        let vh = harmonic2d(&grid, 1.0, 1.0);
        // <V> = (<x^2> + <y^2>)/2 với omega=m=1.
        let pe = ((SX * SX + X0 * X0) + (SY * SY + Y0 * Y0)) / 2.0;
        close(potential_energy_2d(&wf, &vh), pe, 1e-5, "<V> harmonic");
    }

    #[test]
    fn momentum_grid_2d_follows_fftfreq() {
        let grid = Grid2D::new(8, 8, -1.0, 11.0, -1.0, 11.0).unwrap(); // dx = dy = 1.5
        let (kx, ky) = momentum_grid_2d(&grid);
        let dk = 2.0 * std::f64::consts::PI / (8.0 * 1.5);
        let expected = [0.0, 1.0, 2.0, 3.0, -4.0, -3.0, -2.0, -1.0];
        for (k, e) in kx.iter().zip(expected) {
            close(*k, dk * e, 1e-12, "kx bin");
        }
        assert_eq!(ky.len(), 8);
    }

    #[test]
    fn momentum_density_peaks_at_k0_bin_and_parses_to_one() {
        // (Review Focus 1) Gói có kx = sqrt(2): |phi|^2 phải đỉnh ở bin i sao cho
        // kx[i] ~ sqrt(2), KHÔNG phải bin 0; tổng |phi|^2 * dk^2 = 1 (Parseval rời rạc).
        let wf = packet();
        let snap = observables_snapshot_2d(&wf, &Potential2D::zeros(NX * NY));
        let grid = wf.grid();
        let (kxg, _kyg) = momentum_grid_2d(grid);
        // tìm bin đỉnh toàn trường — phải là bin kx gần KX (j đỉnh ~ 0 vì ky = 0)
        let mut best = (0usize, 0usize, 0f32);
        for (k, &d) in snap.momentum_density.iter().enumerate() {
            if d > best.2 {
                best = (k % NX, k / NX, d);
            }
        }
        close(
            kxg[best.0],
            KX,
            3.0 * (2.0 * std::f64::consts::PI / (NX as f64 * grid.dx())),
            "peak kx bin",
        );
        let dk = 2.0 * std::f64::consts::PI / (NX as f64 * grid.dx());
        let total: f64 = snap.momentum_density.iter().map(|&d| d as f64).sum::<f64>() * dk * dk;
        close(total, 1.0, 1e-3, "sum |phi|^2 dk^2");
        close(
            snap.energy,
            kinetic_2d(&wf),
            1e-12,
            "snapshot E = T khi V=0",
        );
    }
}
