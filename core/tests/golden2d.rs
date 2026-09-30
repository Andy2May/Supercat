//! Golden acceptance tests for the 2D core: the simulator vs the analytic
//! TDSE answers that survive dimension lifting unchanged.
//!
//! M1 pins two phenomena with closed forms: free Gaussian spreading along
//! each axis independently (a 2D free packet is the product of two 1D free
//! packets, so each axis follows the 1D law with its own `sigma_0`), and
//! norm conservation over a long run (Strang splitting is unitary in any
//! dimension; only the round-off floor grows, with the point count of the
//! norm sum). Every test prints its measured values (run with
//! `cargo test -p psiforge-core --test golden2d -- --nocapture`); a PASS is
//! only accepted after comparing those numbers against the analytic
//! expectation of the task brief.
//!
//! All tests use the unitless core convention `m = hbar = 1`. Moments are
//! computed test-locally with `dA = dx*dy` weights (the core's observables
//! module is 1D-only in M1), matching the 1D golden suite's style.

use psiforge_core::grid::Grid2D;
use psiforge_core::potential::Potential2D;
use psiforge_core::propagator::{Propagator, SplitOperator2D};
use psiforge_core::states::gaussian_2d;
use psiforge_core::wavefunction::Wavefunction2D;

/// Reference box for both tests: `[xmin, xmax) x [ymin, ymax)` symmetric
/// about the packet, sampled by an even point count per axis so the grid is
/// mirror-symmetric about 0 and `<x> = <y> = 0` holds by construction.
fn square_grid(n: usize) -> Grid2D {
    Grid2D::new(n, n, -20.0, 20.0, -20.0, 20.0).expect("reference grid is valid")
}

/// Propagates `wf` for `steps` steps, panicking with the failing step index
/// on any error (a mid-run norm-guard trip is a physics failure that must
/// fail the test, not be swallowed).
fn run_steps(prop: &mut SplitOperator2D, wf: &mut Wavefunction2D, v: &Potential2D, steps: usize) {
    for i in 0..steps {
        prop.step(wf, v)
            .unwrap_or_else(|e| panic!("step {i} failed: {e}"));
    }
}

/// Per-axis moments `(<x>, <x^2>, <y>, <y^2>)` of `|psi|^2`, integrated
/// with the cell area `dA = dx*dy` exactly as the core's norm does. The
/// wavefunction stays normalized (the propagator guards it), so no extra
/// renormalization of the weights is needed.
fn moments(wf: &Wavefunction2D) -> (f64, f64, f64, f64) {
    let grid = wf.grid();
    let d_area = grid.dx() * grid.dy();
    let (mut m_x, mut m_x2, mut m_y, mut m_y2) = (0.0, 0.0, 0.0, 0.0);
    for j in 0..grid.ny() {
        let y = grid.y(j);
        for i in 0..grid.nx() {
            let x = grid.x(i);
            let weight = wf.psi()[grid.index(i, j)].norm_sqr() * d_area;
            m_x += weight * x;
            m_x2 += weight * x * x;
            m_y += weight * y;
            m_y2 += weight * y * y;
        }
    }
    (m_x, m_x2, m_y, m_y2)
}

/// Analytic free-packet width `sigma(t) = sigma_0 * sqrt(1 + (t/(2 sigma_0^2))^2)`
/// with `m = hbar = 1` (standard free-particle result, e.g. Griffiths ch. 2;
/// the same law the 1D golden suite pins, applied per axis).
fn spread_width(sigma_0: f64, t: f64) -> f64 {
    let tau = 2.0 * sigma_0 * sigma_0; // characteristic time 2 m sigma_0^2 / hbar
    sigma_0 * (1.0 + (t / tau) * (t / tau)).sqrt()
}

/// 1. Free Gaussian spreading, per axis.
///
/// A free 2D Hamiltonian `T = T_x + T_y` is separable, so a product packet
/// with `kx = ky = 0` spreads along each axis by the 1D law with that
/// axis's own `sigma_0`. Starting from `sigma_x = 1.5`, `sigma_y = 2.5` at
/// t = 0, after 1000 steps of `dt = 0.002` (t = 2):
///
/// ```text
/// sigma_x(2) = 1.5 * sqrt(1 + (2/4.5)^2)  = 1.6415
/// sigma_y(2) = 2.5 * sqrt(1 + (2/12.5)^2) = 2.5318
/// ```
///
/// (The task brief's parenthetical "sigma_y(2) ~ 2.6926" is an arithmetic
/// slip: that value comes from dropping one factor of sigma_0 in the
/// denominator, `(t/(2 sigma_0))^2`, which would also move sigma_x(2) off
/// the brief's own 1.6415. The formula above — identical to the 1D golden
/// suite's and Griffiths — is authoritative, and the analytic references
/// in this test are computed from it, not from a literal.)
///
/// With `V = 0` both potential half-kicks are trivial and the Strang step
/// is the exact kinetic propagator, so the residual is grid discretization
/// and FFT round-off — orders of magnitude below the 1e-6 relative gate.
/// The deliberately unequal `sigma_x != sigma_y` is the point of the test:
/// a swapped x/y axis, a wrong per-axis `k^2` in the 2D kinetic factor, or
/// a missing `dy` in the `dA` weight each misplaces one axis's width by
/// the other's answer and fails the 1e-6 gate.
#[test]
fn free_gaussian_spreads_per_axis() {
    let grid = square_grid(256);
    let mut wf = gaussian_2d(&grid, 0.0, 0.0, 0.0, 0.0, 1.5, 2.5, 1.0, 1.0)
        .expect("packet parameters are valid");
    let v = Potential2D::zeros(grid.nx() * grid.ny());
    let mut prop =
        SplitOperator2D::new(&grid, 0.002, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut prop, &mut wf, &v, 1000);

    let t = 1000.0_f64 * 0.002;
    let (x_bar, x2_bar, y_bar, y2_bar) = moments(&wf);
    let sigma_x_measured = (x2_bar - x_bar * x_bar).sqrt();
    let sigma_y_measured = (y2_bar - y_bar * y_bar).sqrt();
    let sigma_x_analytic = spread_width(1.5, t);
    let sigma_y_analytic = spread_width(2.5, t);
    let rel_x = (sigma_x_measured - sigma_x_analytic).abs() / sigma_x_analytic;
    let rel_y = (sigma_y_measured - sigma_y_analytic).abs() / sigma_y_analytic;

    println!(
        "spreading 2D: sigma_x(2) = {sigma_x_measured:.8}  (analytic {sigma_x_analytic:.8}, \
         rel err = {rel_x:.3e})"
    );
    println!(
        "spreading 2D: sigma_y(2) = {sigma_y_measured:.8}  (analytic {sigma_y_analytic:.8}, \
         rel err = {rel_y:.3e})"
    );
    println!("spreading 2D: <x>(2) = {x_bar:.3e}, <y>(2) = {y_bar:.3e}  (analytic 0 by symmetry)");
    assert!(
        rel_x <= 1e-6,
        "sigma_x = {sigma_x_measured}, analytic {sigma_x_analytic}, rel err {rel_x} exceeds 1e-6"
    );
    assert!(
        rel_y <= 1e-6,
        "sigma_y = {sigma_y_measured}, analytic {sigma_y_analytic}, rel err {rel_y} exceeds 1e-6"
    );
}

/// 2. Norm conservation in 2D.
///
/// Every Strang factor is unit-modulus in its representation regardless of
/// dimension, so the norm is preserved to FFT round-off over any number of
/// steps. What changes in 2D is the round-off floor of the norm sum: it
/// now accumulates over `n = nx*ny = 16384` points per step, so the gate
/// is 3e-12 over 5000 steps of `dt = 0.005` (t = 25) — the ratified 2D
/// floor scaling with point count, replacing the 1D suite's 1e-12 gate
/// over 2048 points. A free isotropic packet (`sigma_x = sigma_y = 1.5`,
/// `k = 0`) keeps the run purely kinetic: unitarity is the only thing
/// under test, and any phase or weighting bug also shows up here as drift.
#[test]
fn norm_conservation_2d() {
    let grid = square_grid(128);
    let mut wf = gaussian_2d(&grid, 0.0, 0.0, 0.0, 0.0, 1.5, 1.5, 1.0, 1.0)
        .expect("packet parameters are valid");
    let v = Potential2D::zeros(grid.nx() * grid.ny());
    let mut prop =
        SplitOperator2D::new(&grid, 0.005, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut prop, &mut wf, &v, 5000);

    let drift = (wf.norm() - 1.0).abs();
    println!("conservation 2D: |norm - 1| after 5000 steps (t = 25, 128^2 points) = {drift:.3e}");
    assert!(
        drift <= 3e-12,
        "|norm - 1| = {drift} after 5000 steps, gate is 3e-12"
    );
}
