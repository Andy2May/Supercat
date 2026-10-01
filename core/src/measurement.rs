//! Quantum measurement (M2): sampling measurement outcomes from the
//! probability distribution and collapsing the wavefunction to the outcome
//! at finite instrument resolution.
//!
//! # Physics
//!
//! A projective position measurement of a continuum particle never yields a
//! point: a real detector has finite spatial resolution `sigma_inst`, so the
//! post-measurement state is ψ conditioned on the outcome being within
//! `~sigma_inst` of the readout `(ix, iy)`. This module models that as
//! [`collapse_position`]: ψ is multiplied by the instrument's point-spread
//! function, a Gaussian `exp(-r²/(2σ_inst²))` centered on the outcome, then
//! renormalized. The renormalization is not cosmetic — the multiplier
//! projects ψ onto a strict subspace, discarding norm (the probability of
//! *other* outcomes), and the conditional post-measurement state must again
//! satisfy `‖ψ‖ = 1` for every later stage (observables, the propagator's
//! norm guard) to mean what they claim.
//!
//! [`collapse_momentum`] is the mirror operation in k-space: ψ is Fourier
//! transformed, φ multiplied by a Gaussian of width `sigma_k` around the
//! sampled k-bin, and transformed back (the [`crate::fft`] round trip is an
//! exact identity, so no extra scaling — one final `normalize()`).
//!
//! Outcome sampling follows the Born rule: a cell is drawn with probability
//! `|ψₖ|²` (equal-area cells, so the `dA` weight cancels) by
//! [`sample_position`]; [`sample_momentum`] samples the bins of `|FFT2(ψ)|²`
//! the same way (ratio form — immune to the FFT's normalization).
//!
//! # Determinism contract
//!
//! Sampling is driven by [`next_uniform`], one step of PCG32 (XSH-RR) seeded
//! by the caller's `u64`: the same seed always yields the same outcome and
//! successor state on a given platform and build, and replays identically.
//! The PCG integer path is exactly reproducible everywhere (integer
//! arithmetic, one multiply, one add); cross-platform agreement is limited
//! only by `exp`, which IEEE-754 recommends but does not require to be
//! correctly rounded — different libms differ by a few ulp, with no visible
//! physical consequence. Replaying a simulation on the same build replays
//! its measurements exactly; distinct seeds explore the distribution (see
//! `sample_distribution_matches_density_3_sigma`).

use crate::error::{CoreError, Result};
use crate::fft::{scratch2_len, transform2_forward, transform2_inverse};
use crate::observables::momentum_grid_2d;
use crate::wavefunction::Wavefunction2D;
use num_complex::Complex64;

/// One PCG-XSH-RR 32-bit step from a 64-bit state — good enough for an
/// educational simulation, deterministic in the seed (same seed, same
/// sequence on every build).
///
/// Returns `(uniform in (0, 1), next state)`. The `+0.5` over `2^32` range
/// trick keeps the result strictly inside the unit interval — it never
/// touches either boundary, so the binary search of [`sample_amplitudes`]
/// can never slip past the last index.
pub fn next_uniform(seed: u64) -> (f64, u64) {
    let state = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);
    let xorshifted = (((state >> 18) ^ state) >> 27) as u32;
    let rot = (state >> 59) as u32;
    let value = xorshifted.rotate_right(rot);
    ((value as f64 + 0.5) / 4294967296.0, state)
}

/// Builds the cumulative distribution of `|z_k|²` in a single pass (f64) and
/// inverts it at `u · total` with [`slice::partition_point`]: the returned
/// flat index is the first CDF entry strictly above the target, i.e. the
/// cell whose half-open interval `[c_{k-1}, c_k)` contains it.
///
/// # Errors
///
/// [`CoreError::NormDrift`] with `step: 0` and `norm` set to the **total
/// weight** when the total is zero or non-finite (a zero or poisoned
/// wavefunction has no probability distribution to sample).
fn sample_amplitudes(z: &[Complex64], seed: u64) -> Result<usize> {
    let mut total = 0.0;
    let mut cdf = Vec::with_capacity(z.len());
    for c in z {
        total += c.norm_sqr();
        cdf.push(total);
    }
    // NaN (poisoned ψ) fails `is_finite`, zero and negative weights fail
    // `<= 0.0` — either way there is no distribution to sample.
    if !total.is_finite() || total <= 0.0 {
        return Err(CoreError::NormDrift {
            step: 0,
            norm: total,
        });
    }
    let (u, _) = next_uniform(seed);
    let target = u * total;
    // u ∈ (0, 1) keeps `target` strictly below the final entry `total`, so
    // the index is in range by construction; the clamp is belt-and-braces
    // against any rounding at the extreme tail.
    Ok(cdf.partition_point(|&c| c <= target).min(z.len() - 1))
}

/// Samples the cell `(ix, iy)` with probability `|ψₖ|²` per equal-area cell
/// (the `dA` weight cancels) — a Born-rule position measurement.
///
/// # Errors
///
/// [`CoreError::NormDrift`] `{ step: 0, norm: total weight }` when the total
/// weight is zero or non-finite.
pub fn sample_position(wf: &Wavefunction2D, seed: u64) -> Result<(usize, usize)> {
    let k = sample_amplitudes(wf.psi(), seed)?;
    Ok((k % wf.grid().nx(), k / wf.grid().nx()))
}

/// Samples the bin `(i, j)` with probability `|φₖ|²` per bin, where
/// `φ = FFT2(ψ)` (ratio form — immune to the FFT's normalization
/// convention) — a Born-rule momentum measurement.
///
/// # Errors
///
/// [`CoreError::NormDrift`] `{ step: 0, norm: total weight }` when the total
/// weight is zero or non-finite.
pub fn sample_momentum(wf: &Wavefunction2D, seed: u64) -> Result<(usize, usize)> {
    let (nx, ny) = (wf.grid().nx(), wf.grid().ny());
    // ψ is only borrowed, so transform a scratch copy (per-call allocation —
    // measurement runs per user interaction, not per step).
    let mut phi = wf.psi().to_vec();
    let mut scratch = vec![Complex64::new(0.0, 0.0); scratch2_len(nx, ny)];
    transform2_forward(&mut phi, &mut scratch, nx, ny);
    let k = sample_amplitudes(&phi, seed)?;
    Ok((k % nx, k / nx))
}

/// Shared precondition of both collapses — validated **before** ψ is touched
/// (the propagator's validate-first law: an invalid call leaves the
/// wavefunction exactly as it was).
///
/// * `sigma` must be finite and `> 0` — otherwise [`CoreError::InvalidSigma`].
/// * `i < nx` and `j < ny` — otherwise [`CoreError::DimensionMismatch`]
///   encoding the axis bound and the offending index: `(expected: nx, got:
///   i)` for the x/kx axis, `(expected: ny, got: j)` for y/ky.
fn validate_collapse(sigma: f64, i: usize, j: usize, nx: usize, ny: usize) -> Result<()> {
    if !(sigma.is_finite() && sigma > 0.0) {
        return Err(CoreError::InvalidSigma { sigma });
    }
    if i >= nx {
        return Err(CoreError::DimensionMismatch {
            expected: nx,
            got: i,
        });
    }
    if j >= ny {
        return Err(CoreError::DimensionMismatch {
            expected: ny,
            got: j,
        });
    }
    Ok(())
}

/// `exp(-r² / denom)` with `denom = 2σ²` — the instrument Gaussian.
///
/// The `r² == 0` branch is not an optimization: for an absurdly small σ
/// (whose square underflows to 0), `0 / 0` would be `NaN` and poison the
/// very cell the measurement selected. With the branch, that limit is
/// instead the exact one: every cell but the center underflows to 0 and the
/// collapse reduces to the single sampled cell. Distant cells underflowing
/// to 0 is harmless — past ~37σ the Gaussian contributes `< 1e-100`.
fn gaussian_factor(r_squared: f64, denom: f64) -> f64 {
    if r_squared == 0.0 {
        1.0
    } else {
        (-(r_squared / denom)).exp()
    }
}

/// Collapses ψ onto the position outcome `(ix, iy)`: multiplies every cell by
/// the instrument Gaussian `exp(-r²/(2·sigma_inst²))` with `r` the physical
/// distance from the cell to `(x(ix), y(iy))` — over the WHOLE grid, no tail
/// cutoff — then calls [`Wavefunction2D::normalize`] (the projection
/// discards norm; the conditional post-measurement state must be renormalized).
///
/// `sigma_inst` is in physical (position) units and must be finite and `> 0`.
///
/// # Errors
///
/// [`CoreError::InvalidSigma`] for a non-finite or non-positive
/// `sigma_inst`, [`CoreError::DimensionMismatch`] for an index outside the
/// grid — both raised before ψ is modified.
pub fn collapse_position(
    wf: &mut Wavefunction2D,
    ix: usize,
    iy: usize,
    sigma_inst: f64,
) -> Result<()> {
    let grid = wf.grid();
    let (nx, ny) = (grid.nx(), grid.ny());
    validate_collapse(sigma_inst, ix, iy, nx, ny)?;
    let (xc, yc) = (grid.x(ix), grid.y(iy));
    let denom = 2.0 * sigma_inst * sigma_inst;
    // Copy the axis coordinates out so the grid borrow ends before psi_mut.
    let xs: Vec<f64> = (0..nx).map(|i| grid.x(i)).collect();
    let ys: Vec<f64> = (0..ny).map(|j| grid.y(j)).collect();
    for (k, c) in wf.psi_mut().iter_mut().enumerate() {
        let (dx, dy) = (xs[k % nx] - xc, ys[k / nx] - yc);
        *c *= gaussian_factor(dx * dx + dy * dy, denom);
    }
    wf.normalize();
    Ok(())
}

/// The k-space mirror of [`collapse_position`]: copies ψ, forward-transforms
/// to `φ = FFT2(ψ)`, multiplies each bin by
/// `exp(-((kx-kx₀)² + (ky-ky₀)²) / (2·sigma_k²))` with `(kx₀, ky₀)` the
/// wavenumbers of the chosen bins from [`momentum_grid_2d`],
/// inverse-transforms, writes the result back, and normalizes. The
/// [`crate::fft`] round trip is an exact identity (proven by its M1 tests),
/// so no extra scaling is needed — the final `normalize()` alone restores
/// `‖ψ‖ = 1`.
///
/// `sigma_k` is in wavenumber (k) units and must be finite and `> 0`.
///
/// # Errors
///
/// [`CoreError::InvalidSigma`] for a non-finite or non-positive `sigma_k`,
/// [`CoreError::DimensionMismatch`] for a bin index outside the grid — both
/// raised before ψ is modified.
pub fn collapse_momentum(wf: &mut Wavefunction2D, i: usize, j: usize, sigma_k: f64) -> Result<()> {
    let grid = wf.grid();
    let (nx, ny) = (grid.nx(), grid.ny());
    validate_collapse(sigma_k, i, j, nx, ny)?;
    let (kxg, kyg) = momentum_grid_2d(grid);
    let (kx0, ky0) = (kxg[i], kyg[j]);
    let denom = 2.0 * sigma_k * sigma_k;
    // Per-call scratch copy of ψ (measurement runs per user interaction,
    // not per step); validate-first has already run, so ψ is only touched
    // from here on.
    let mut phi = wf.psi().to_vec();
    let mut scratch = vec![Complex64::new(0.0, 0.0); scratch2_len(nx, ny)];
    transform2_forward(&mut phi, &mut scratch, nx, ny);
    for (k, c) in phi.iter_mut().enumerate() {
        let (dkx, dky) = (kxg[k % nx] - kx0, kyg[k / nx] - ky0);
        *c *= gaussian_factor(dkx * dkx + dky * dky, denom);
    }
    transform2_inverse(&mut phi, &mut scratch, nx, ny);
    wf.psi_mut().copy_from_slice(&phi);
    wf.normalize();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::Grid2D;
    use crate::observables::moments_2d;
    use crate::states::gaussian_2d;
    use crate::wavefunction::Wavefunction2D;
    use num_complex::Complex64;

    const NX: usize = 64;
    const NY: usize = 64;

    fn packet() -> Wavefunction2D {
        let g = Grid2D::new(NX, NY, -16.0, 16.0, -16.0, 16.0).unwrap();
        gaussian_2d(&g, 0.0, 0.0, 4.0, 0.0, 1.5, 1.5, 1.0, 1.0).unwrap()
    }

    #[test]
    fn pcg_is_deterministic_and_in_range() {
        let (u1, s1) = next_uniform(42);
        let (u2, _) = next_uniform(42);
        assert_eq!(u1.to_bits(), u2.to_bits());
        assert_ne!(s1, 0);
        assert!((0.0..1.0).contains(&u1));
        let mut s = 7u64;
        let mut all_ok = true;
        for _ in 0..10_000 {
            let (u, ns) = next_uniform(s);
            all_ok &= (0.0..1.0).contains(&u);
            s = ns;
        }
        assert!(all_ok);
    }

    #[test]
    fn sample_distribution_matches_density_3_sigma() {
        // (Review Focus 2) 10^4 mẫu: tỉ lệ mẫu trong đĩa 3σ khớp khối |psi|^2
        // trong đĩa đó (biên 3σ của nhị thức ~1.5%).
        let wf = packet();
        let grid = wf.grid();
        let sigma = 1.5;
        let p_disk: f64 = wf
            .psi()
            .iter()
            .enumerate()
            .map(|(k, c)| {
                let (x, y) = (grid.x(k % NX), grid.y(k / NX));
                if x * x + y * y < 9.0 * sigma * sigma {
                    c.norm_sqr()
                } else {
                    0.0
                }
            })
            .sum::<f64>()
            * grid.dx()
            * grid.dy();
        let mut inside = 0usize;
        for seed in 0..10_000u64 {
            let (i, j) = sample_position(&wf, seed).unwrap();
            let (x, y) = (grid.x(i), grid.y(j));
            if x * x + y * y < 9.0 * sigma * sigma {
                inside += 1;
            }
        }
        let ratio = inside as f64 / 10_000.0;
        assert!(
            (ratio - p_disk).abs() < 0.02,
            "sampled {ratio} vs density {p_disk}"
        );
    }

    #[test]
    fn sample_on_zero_wavefunction_errors() {
        let g = Grid2D::new(8, 8, -1.0, 1.0, -1.0, 1.0).unwrap();
        let wf = Wavefunction2D::new(g, vec![Complex64::new(0.0, 0.0); 64], 1.0, 1.0).unwrap();
        assert!(matches!(
            sample_position(&wf, 1),
            Err(CoreError::NormDrift { .. })
        ));
    }

    #[test]
    fn collapse_position_shrinks_and_keeps_norm() {
        let mut wf = packet();
        let grid = wf.grid();
        let sigma_inst = 3.0 * grid.dx();
        collapse_position(&mut wf, NX / 2, NY / 2, sigma_inst).unwrap();
        assert!((wf.norm() - 1.0).abs() < 1e-12, "norm = {}", wf.norm());
        let m = moments_2d(&wf);
        assert!(
            m.sigma_x < sigma_inst,
            "sx = {} < sigma_inst = {}",
            m.sigma_x,
            sigma_inst
        );
        assert!(m.sigma_y < sigma_inst);
    }

    #[test]
    fn collapse_momentum_localizes_around_chosen_k() {
        let mut wf = packet(); // kx = 4
        let grid = wf.grid();
        let dk = 2.0 * std::f64::consts::PI / (NX as f64 * grid.dx());
        let (kxg, kyg) = crate::observables::momentum_grid_2d(grid);
        let i0 = kxg
            .iter()
            .enumerate()
            .min_by(|a, b| (a.1 - 4.0).abs().partial_cmp(&(b.1 - 4.0).abs()).unwrap())
            .unwrap()
            .0;
        let j0 = kyg
            .iter()
            .enumerate()
            .min_by(|a, b| a.1.abs().partial_cmp(&b.1.abs()).unwrap())
            .unwrap()
            .0;
        collapse_momentum(&mut wf, i0, j0, 3.0 * dk).unwrap();
        assert!((wf.norm() - 1.0).abs() < 1e-12);
        let m = moments_2d(&wf);
        assert!((m.px - 4.0).abs() < 3.0 * dk, "<px> = {}", m.px);
        assert!(m.sigma_px < 3.0 * dk, "spx = {}", m.sigma_px);
    }

    #[test]
    fn collapse_rejects_bad_sigma_and_out_of_range_cells() {
        let mut wf = packet();
        assert!(matches!(
            collapse_position(&mut wf, 0, 0, 0.0),
            Err(CoreError::InvalidSigma { .. })
        ));
        assert!(matches!(
            collapse_position(&mut wf, NX, 0, 1.0),
            Err(CoreError::DimensionMismatch { .. })
        ));
    }
}
