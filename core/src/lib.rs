//! Psiforge physics core: quantum wave-dynamics simulation.
//!
//! This crate implements the time-dependent Schrödinger equation (TDSE) on
//! uniform grids and holds all physics and numerics for Psiforge, with no I/O
//! dependencies. Grids, wavefunctions, propagators, and observables are added
//! in later milestones.

pub mod error;
pub mod fft;
pub mod grid;
pub mod potential;
pub mod propagator;
pub mod states;
pub mod wavefunction;
