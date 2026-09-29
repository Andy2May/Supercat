//! Crate-wide error type for the Psiforge core.

/// Errors returned by the Psiforge core modules.
///
/// All variants are declared here up front (including ones later milestones
/// construct) so the enum is defined once and stays stable.
#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error(
        "invalid grid: n={n}, xmin={xmin}, xmax={xmax} (need n >= 2 and xmax > xmin, all finite)"
    )]
    InvalidGrid { n: usize, xmin: f64, xmax: f64 },
    #[error("dimension mismatch: expected {expected} points, got {got}")]
    DimensionMismatch { expected: usize, got: usize },
    #[error("non-finite value in {what} at index {index}")]
    NonFinite { what: &'static str, index: usize },
    #[error("mass and hbar must be positive, got m={m}, hbar={hbar}")]
    InvalidMassOrHbar { m: f64, hbar: f64 },
    #[error("norm drifted from 1: {norm} at step {step}")]
    NormDrift { step: u64, norm: f64 },
}

/// Convenient result alias used throughout the crate.
pub type Result<T> = std::result::Result<T, CoreError>;
