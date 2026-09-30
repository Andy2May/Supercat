//! Crate-wide error type for the Psiforge core.

/// Errors returned by the Psiforge core modules.
///
/// Each variant encodes one validated precondition of one constructor or
/// step routine. The set grows with the crate: variants are added when a new
/// builder validates its own inputs (e.g. [`CoreError::InvalidSigma`] for
/// [`states::gaussian`](crate::states::gaussian) and
/// [`CoreError::InvalidTimeStep`] for
/// [`SplitOperator::new`](crate::propagator::SplitOperator::new)), not
/// promised up front.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error(
        "invalid grid: n={n}, xmin={xmin}, xmax={xmax} (need n >= 2 and xmax > xmin, all finite)"
    )]
    InvalidGrid { n: usize, xmin: f64, xmax: f64 },
    #[error(
        "invalid 2D grid: nx={nx}, ny={ny}, xmin={xmin}, xmax={xmax}, ymin={ymin}, ymax={ymax} \
         (need nx >= 2, ny >= 2, xmax > xmin, ymax > ymin, all finite)"
    )]
    InvalidGrid2D {
        nx: usize,
        ny: usize,
        xmin: f64,
        xmax: f64,
        ymin: f64,
        ymax: f64,
    },
    #[error("dimension mismatch: expected {expected} points, got {got}")]
    DimensionMismatch { expected: usize, got: usize },
    #[error("non-finite value in {what} at index {index}")]
    NonFinite { what: &'static str, index: usize },
    #[error("mass and hbar must be positive, got m={m}, hbar={hbar}")]
    InvalidMassOrHbar { m: f64, hbar: f64 },
    #[error("gaussian sigma must be positive and finite, got {sigma}")]
    InvalidSigma { sigma: f64 },
    #[error("time step must be positive and finite, got dt={dt}")]
    InvalidTimeStep { dt: f64 },
    /// Per-step norm-guard failure: `norm` is the SQUARED norm
    /// `‖ψ‖² = Σ |ψᵢ|²·dx` (not ‖ψ‖), so the guard target is 1 either way,
    /// but a printed value of 4 means ‖ψ‖ = 2.
    #[error("squared norm drifted from 1: {norm} at step {step}")]
    NormDrift { step: u64, norm: f64 },
}

/// Convenient result alias used throughout the crate.
pub type Result<T> = std::result::Result<T, CoreError>;

#[cfg(test)]
mod tests {
    use super::CoreError;

    #[test]
    fn invalid_grid_2d_message_lists_both_axes() {
        let err = CoreError::InvalidGrid2D {
            nx: 1,
            ny: 1,
            xmin: f64::NAN,
            xmax: 1.0,
            ymin: 0.0,
            ymax: 1.0,
        };
        let msg = err.to_string();
        assert!(msg.contains("nx"), "message should mention nx: {msg}");
        assert!(msg.contains("ny"), "message should mention ny: {msg}");
    }
}
