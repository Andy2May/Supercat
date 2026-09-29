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
