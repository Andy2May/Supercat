//! Psiforge physics core: quantum wave-dynamics simulation.
//!
//! This crate implements the time-dependent Schrödinger equation (TDSE) on
//! uniform grids and holds all physics and numerics for Psiforge, with no I/O
//! dependencies: grids, wavefunctions, canonical states, potentials,
//! propagators, and observables.

pub mod error;
pub mod fft;
pub mod grid;
pub mod observables;
pub mod potential;
pub mod propagator;
pub mod states;
pub mod wavefunction;
