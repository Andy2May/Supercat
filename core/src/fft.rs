//! Thin [`rustfft`] wrappers shared across the crate.
//!
//! # Normalization
//!
//! rustfft computes *unnormalized* transforms: a forward pass followed by an
//! inverse pass scales the data by `n`. `transform_inverse` applies the
//! `1/n` factor itself, so a forward/inverse round trip is the identity —
//! the correctness anchor for the split-operator propagator: its step is a
//! product of unit-modulus phases in x and k space, hence exactly unitary
//! up to rounding.
//!
//! The 2D wrappers compose these 1D passes over a row-major buffer
//! (`buf[j*nx + i]`, x fastest): rows in place, columns staged through the
//! scratch tail. The inverse applies `1/n` once per pass, so the 2D round
//! trip is likewise the identity with no extra scaling.
//!
//! # Planning
//!
//! `FftPlanner` is neither `Send` nor cheap to rebuild per call, so the
//! wrappers keep one planner per thread; its internal cache plans each
//! (length, direction) pair exactly once — in practice when
//! [`SplitOperator`](crate::propagator::SplitOperator) is constructed.
//! `scratch_len` reports the scratch requirement for a length (and warms
//! that cache), so callers can preallocate once and reuse.

use num_complex::Complex64;
use rustfft::{Fft, FftPlanner};
use std::cell::RefCell;
use std::sync::Arc;

thread_local! {
    static PLANNER: RefCell<FftPlanner<f64>> = RefCell::new(FftPlanner::new());
}

/// In-place forward DFT of `buf` (length `n`), using `scratch` as work space.
///
/// `scratch.len()` must be at least [`scratch_len`]`(buf.len())`. The
/// transform is unnormalized.
pub(crate) fn transform_forward(buf: &mut [Complex64], scratch: &mut [Complex64]) {
    let fft = PLANNER.with_borrow_mut(|p| p.plan_fft_forward(buf.len()));
    fft.process_with_scratch(buf, scratch);
}

/// In-place inverse DFT of `buf` (length `n`), scaled by `1/n`.
///
/// The `1/n` makes forward → inverse an identity round trip. `scratch` must
/// be sized as for [`transform_forward`].
pub(crate) fn transform_inverse(buf: &mut [Complex64], scratch: &mut [Complex64]) {
    let fft = PLANNER.with_borrow_mut(|p| p.plan_fft_inverse(buf.len()));
    fft.process_with_scratch(buf, scratch);
    let scale = 1.0 / buf.len() as f64;
    for c in buf.iter_mut() {
        *c *= scale;
    }
}

/// Scratch length that satisfies both transform directions for length `n`.
///
/// For most lengths this is `n`, but lengths that need Bluestein's algorithm
/// (large primes) require more than `n` — always size scratch from this
/// function, never hard-code `n`.
pub(crate) fn scratch_len(n: usize) -> usize {
    let (fwd, inv): (Arc<dyn Fft<f64>>, Arc<dyn Fft<f64>>) =
        PLANNER.with_borrow_mut(|p| (p.plan_fft_forward(n), p.plan_fft_inverse(n)));
    fwd.get_inplace_scratch_len()
        .max(inv.get_inplace_scratch_len())
}

/// Angular wavenumbers of the DFT bins for `n` samples spaced `dx` apart —
/// the `numpy.fft.fftfreq` convention scaled by `2*pi`:
///
/// ```text
/// k_j = 2*pi / (n*dx) * j',    j' = j       for j <  n/2   (n even)
///                               j' = j - n   for j >= n/2   (n even)
/// ```
///
/// Bin 0 is the zero wavenumber and bins at and above `n/2` carry the
/// negative wavenumbers (bin `n/2` is the negative Nyquist `-pi/dx`). The
/// cutoff is `n.div_ceil(2)`, which equals `n/2` for even `n` as written
/// above; for odd `n` it is `ceil(n/2)`, extending the same
/// non-negative-first convention correctly.
pub(crate) fn k_grid(n: usize, dx: f64) -> Vec<f64> {
    let dk = 2.0 * std::f64::consts::PI / (n as f64 * dx);
    let cutoff = n.div_ceil(2);
    (0..n)
        .map(|j| {
            let jp = if j < cutoff {
                j as f64
            } else {
                j as f64 - n as f64
            };
            dk * jp
        })
        .collect()
}

/// In-place forward 2D DFT of the row-major buffer `buf[j*nx + i]` (i along
/// x, j along y), unnormalized.
///
/// The transform is separable: every row (contiguous, length `nx`) is
/// transformed in place, then every column (length `ny`, stride `nx`) is
/// staged through the tail of `scratch` and transformed back into place.
/// `scratch.len()` must be at least [`scratch2_len`]`(nx, ny)`.
#[allow(dead_code, reason = "first caller is the 2D propagator (next task)")]
pub(crate) fn transform2_forward(
    buf: &mut [Complex64],
    scratch: &mut [Complex64],
    nx: usize,
    ny: usize,
) {
    transform2_with(buf, scratch, nx, ny, transform_forward);
}

/// In-place inverse 2D DFT of the row-major buffer `buf[j*nx + i]`, scaled by
/// `1/(nx*ny)` so that a [`transform2_forward`] → `transform2_inverse` round
/// trip is the identity.
///
/// The scale comes for free: [`transform_inverse`] applies `1/n` per call,
/// and the column pass reuses it exactly as the row pass does, so the row
/// and column passes contribute `1/nx` and `1/ny` respectively — no extra
/// scaling here.
#[allow(dead_code, reason = "first caller is the 2D propagator (next task)")]
pub(crate) fn transform2_inverse(
    buf: &mut [Complex64],
    scratch: &mut [Complex64],
    nx: usize,
    ny: usize,
) {
    transform2_with(buf, scratch, nx, ny, transform_inverse);
}

/// One separable pass of the 2D transform: rows in place, columns staged
/// through the last `ny` slots of `scratch` (the leading part is the work
/// space handed to the 1D transform).
fn transform2_with(
    buf: &mut [Complex64],
    scratch: &mut [Complex64],
    nx: usize,
    ny: usize,
    transform: fn(&mut [Complex64], &mut [Complex64]),
) {
    debug_assert!(buf.len() == nx * ny);
    for row in buf.chunks_exact_mut(nx) {
        transform(row, scratch);
    }
    let (work, stage) = scratch.split_at_mut(scratch.len() - ny);
    for i in 0..nx {
        for j in 0..ny {
            stage[j] = buf[j * nx + i];
        }
        transform(stage, work);
        for j in 0..ny {
            buf[j * nx + i] = stage[j];
        }
    }
}

/// Scratch length that satisfies both 2D transform directions for an
/// `nx * ny` buffer: the work space of the longer 1D pass plus `ny` slots to
/// stage one column.
#[allow(dead_code, reason = "first caller is the 2D propagator (next task)")]
pub(crate) fn scratch2_len(nx: usize, ny: usize) -> usize {
    scratch_len(nx).max(scratch_len(ny)) + ny
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    const EPS: f64 = 1e-12;

    fn zeros(n: usize) -> Vec<Complex64> {
        vec![Complex64::new(0.0, 0.0); n]
    }

    /// e^{i·angle} assembled from cos/sin.
    fn cis(angle: f64) -> Complex64 {
        Complex64::new(angle.cos(), angle.sin())
    }

    /// Direct unnormalized 1D DFT, the O(n²) textbook sum.
    fn dft1_direct(x: &[Complex64]) -> Vec<Complex64> {
        let n = x.len();
        (0..n)
            .map(|q| {
                let mut acc = Complex64::new(0.0, 0.0);
                for (k, &v) in x.iter().enumerate() {
                    acc += v * cis(-2.0 * PI * q as f64 * k as f64 / n as f64);
                }
                acc
            })
            .collect()
    }

    #[test]
    fn round_trip_16x12_sin_cos_data_is_identity() {
        let (nx, ny) = (16, 12);
        let original: Vec<Complex64> = (0..nx * ny)
            .map(|k| {
                let i = (k % nx) as f64;
                let j = (k / nx) as f64;
                Complex64::new(
                    (0.7 * i + 0.3 * j).cos() + 0.2 * (1.3 * j).sin(),
                    (0.5 * i - 0.4 * j).sin() + 0.1 * (1.1 * i + 0.9 * j).cos(),
                )
            })
            .collect();
        let mut buf = original.clone();
        let mut scratch = zeros(scratch2_len(nx, ny));

        transform2_forward(&mut buf, &mut scratch, nx, ny);
        transform2_inverse(&mut buf, &mut scratch, nx, ny);

        for (k, (got, want)) in buf.iter().zip(&original).enumerate() {
            assert!(
                (got - want).norm() <= EPS,
                "element {k}: got {got}, want {want}"
            );
        }
    }

    #[test]
    fn forward_matches_direct_dft_on_6x4() {
        // Non-square on purpose: with nx != ny, swapping the row and column
        // roles (or the qx/qy bin indexing) transforms samples against the
        // wrong twiddle exponents and misses by O(1), far past tolerance.
        let (nx, ny) = (6, 4);
        let f: Vec<Complex64> = (0..nx * ny)
            .map(|k| {
                let i = (k % nx) as f64;
                let j = (k / nx) as f64;
                Complex64::new(0.9 * i - 0.4 * j, (0.6 * i + 0.2 * j).sin())
            })
            .collect();
        let mut buf = f.clone();
        let mut scratch = zeros(scratch2_len(nx, ny));

        transform2_forward(&mut buf, &mut scratch, nx, ny);

        // F(qx, qy) = Σⱼ Σᵢ f(i,j)·exp(−2πi(qx·i/nx + qy·j/ny)), unnormalized,
        // stored row-major at qy*nx + qx like the input.
        let tol = EPS * (nx * ny) as f64;
        for qy in 0..ny {
            for qx in 0..nx {
                let mut want = Complex64::new(0.0, 0.0);
                for j in 0..ny {
                    for i in 0..nx {
                        let angle = -2.0
                            * PI
                            * (qx as f64 * i as f64 / nx as f64 + qy as f64 * j as f64 / ny as f64);
                        want += f[j * nx + i] * cis(angle);
                    }
                }
                let got = buf[qy * nx + qx];
                assert!(
                    (got - want).norm() <= tol,
                    "bin (qx={qx}, qy={qy}): got {got}, direct DFT {want}"
                );
            }
        }
    }

    #[test]
    fn separable_input_factorizes_into_1d_dfts() {
        // F of the outer product f(i)·g(j) is the outer product of the 1D
        // DFTs: F(qx, qy) = Fx(qx)·Fy(qy) — this only holds when the row
        // pass sees exactly f and the column pass exactly g.
        let (nx, ny) = (8, 5);
        let f: Vec<Complex64> = (0..nx)
            .map(|i| Complex64::new((0.3 * i as f64).cos(), (0.8 * i as f64).sin()))
            .collect();
        let g: Vec<Complex64> = (0..ny)
            .map(|j| Complex64::new(1.0 / (1.0 + j as f64), (0.6 * j as f64).sin()))
            .collect();
        let mut buf: Vec<Complex64> = (0..nx * ny).map(|k| f[k % nx] * g[k / nx]).collect();
        let mut scratch = zeros(scratch2_len(nx, ny));

        transform2_forward(&mut buf, &mut scratch, nx, ny);

        let fx = dft1_direct(&f);
        let gy = dft1_direct(&g);
        for qy in 0..ny {
            for qx in 0..nx {
                let got = buf[qy * nx + qx];
                let want = fx[qx] * gy[qy];
                assert!(
                    (got - want).norm() <= EPS,
                    "bin (qx={qx}, qy={qy}): got {got}, want {want}"
                );
            }
        }
    }
}
