//! Psiforge physics core: quantum wave-dynamics simulation.
//!
//! This crate implements the time-dependent Schrödinger equation (TDSE) on
//! uniform grids and holds all physics and numerics for Psiforge, with no I/O
//! dependencies.
//!
//! # Modules
//!
//! - [`grid`] — the uniform 1D spatial grid [`Grid1D`](grid::Grid1D);
//! - [`wavefunction`] — complex ψ sampled on a grid, with the dx-weighted
//!   Riemann-sum norm ([`Wavefunction`](wavefunction::Wavefunction));
//! - [`states`] — canonical initial states, currently the Gaussian packet
//!   [`gaussian`](states::gaussian);
//! - [`potential`] — potentials as sampled arrays with analytic builders
//!   (harmonic, finite well, barrier, well chain), elementwise
//!   [`add`](potential::Potential::add), and [`zeros`](potential::Potential::zeros);
//! - [`fft`] — the [`rustfft`] wrappers (normalized round trip, thread-local
//!   planner cache, FFT-bin wavenumbers) the propagator and observables share;
//! - [`propagator`] — [`SplitOperator`](propagator::SplitOperator), a
//!   second-order Strang-splitting TDSE propagator guarded by a per-step norm
//!   check, behind the [`Propagator`](propagator::Propagator) trait;
//! - [`observables`] — ⟨x⟩, σ_x, ⟨p⟩, σ_p, kinetic/potential/total energy,
//!   the momentum grid, and window probabilities
//!   ([`norm_in_range`](observables::norm_in_range));
//! - [`error`] — the crate-wide [`CoreError`](error::CoreError) and the
//!   [`Result`](error::Result) alias.
//!
//! # Units
//!
//! The core is unitless by default (`m = ħ = 1`); any consistent unit system
//! works. See `docs/units.md` in the repository root.
//!
//! # Example
//!
//! A coherent state (ground-state width `1/√2`, displaced to `x0 = 3`) in a
//! harmonic potential, propagated 100 steps. A coherent state does not
//! spread, so σ_x stays at `1/√2`, and Ehrenfest's theorem is exact for the
//! harmonic oscillator, so ⟨x⟩(t) = 3 cos(t):
//!
//! ```
//! use psiforge_core::error::CoreError;
//! use psiforge_core::grid::Grid1D;
//! use psiforge_core::observables::{expectation_x, sigma_x};
//! use psiforge_core::potential::harmonic;
//! use psiforge_core::propagator::{Propagator, SplitOperator};
//! use psiforge_core::states::gaussian;
//!
//! fn main() -> Result<(), CoreError> {
//!     let grid = Grid1D::new(1024, -20.0, 20.0)?;
//!     let mut wf = gaussian(
//!         &grid,
//!         3.0,
//!         0.0,
//!         std::f64::consts::FRAC_1_SQRT_2,
//!         1.0,
//!         1.0,
//!     )?;
//!     let v = harmonic(&grid, 1.0, 1.0);
//!     let mut prop = SplitOperator::new(&grid, 1e-3, 1.0, 1.0)?;
//!
//!     for _ in 0..100 {
//!         prop.step(&mut wf, &v)?;
//!     }
//!     assert!((sigma_x(&wf) - std::f64::consts::FRAC_1_SQRT_2).abs() < 1e-6);
//!     assert!((expectation_x(&wf) - 3.0 * 0.1_f64.cos()).abs() < 1e-6);
//!     Ok(())
//! }
//! ```

pub mod error;
pub mod fft;
pub mod grid;
pub mod observables;
pub mod potential;
pub mod propagator;
pub mod states;
pub mod wavefunction;
