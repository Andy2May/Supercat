//! Golden acceptance tests: the simulator vs hand-derived analytic solutions
//! of the TDSE (spec 8.1).
//!
//! Each test pins a physical phenomenon with a closed-form answer: free
//! Gaussian spreading, harmonic-oscillator Ehrenfest motion, rectangular
//! barrier transmission, norm/energy conservation, the O(dt^2) convergence
//! order of the Strang splitting, and the FFT-implied periodic boundaries.
//! Every test prints its measured values (run with
//! `cargo test -p psiforge-core --test golden -- --nocapture`); a PASS is
//! only accepted after comparing those numbers against the analytic
//! expectation table of the task brief.
//!
//! All tests use the unitless core convention `m = hbar = 1`.

use std::f64::consts::{FRAC_1_SQRT_2, SQRT_2};

use psiforge_core::grid::Grid1D;
use psiforge_core::observables::{energy, expectation_x, norm_in_range, sigma_x};
use psiforge_core::potential::{Potential, barrier, harmonic};
use psiforge_core::propagator::{Propagator, SplitOperator};
use psiforge_core::states::gaussian;
use psiforge_core::wavefunction::Wavefunction;

/// Coherent-state setup shared by tests 2, 4 and 5: a Gaussian of the
/// harmonic ground-state width `sigma = sqrt(hbar/(2 m omega)) = 1/sqrt(2)`
/// displaced to `x0 = 3` (with `k0 = 0`) in the harmonic potential with
/// `m = omega = 1`, on the reference grid n = 2048 over [-20, 20).
///
/// Because the width matches the ground state this is a true coherent state:
/// it oscillates without spreading, and Ehrenfest's theorem for the harmonic
/// oscillator is exact (not just first-order): `<x>(t) = 3 cos(t)`.
fn coherent_setup() -> (Wavefunction, Potential) {
    let grid = Grid1D::new(2048, -20.0, 20.0).expect("reference grid is valid");
    let wf = gaussian(&grid, 3.0, 0.0, FRAC_1_SQRT_2, 1.0, 1.0)
        .expect("coherent state parameters are valid");
    let v = harmonic(&grid, 1.0, 1.0);
    (wf, v)
}

/// Propagates `wf` for `steps` steps, panicking with the failing step index
/// on any error (the norm guard failing mid-run is a physics failure that
/// must fail the test, not be swallowed).
fn run_steps(prop: &mut SplitOperator, wf: &mut Wavefunction, v: &Potential, steps: usize) {
    for i in 0..steps {
        prop.step(wf, v)
            .unwrap_or_else(|e| panic!("step {i} failed: {e}"));
    }
}

/// 1. Free Gaussian spreading.
///
/// A Gaussian packet with `k0 = 0`, `sigma_0 = 1` (m = hbar = 1) released in
/// V = 0 spreads as
///
/// ```text
/// sigma(t) = sigma_0 * sqrt(1 + (hbar t / (2 m sigma_0^2))^2)
/// ```
///
/// (standard free-packet result, e.g. Griffiths ch. 2). The characteristic
/// time `tau = 2 m sigma_0^2 / hbar = 2`, so after 2000 steps of dt = 1e-3
/// (t = 2) the width is `sigma(2) = sqrt(1 + 1) = sqrt(2)`. The Strang step
/// with V = 0 is the exact kinetic propagator (both half-kicks are trivial),
/// so the only deviations are grid discretization and FFT round-off.
#[test]
fn golden_free_gaussian_spreading() {
    let grid = Grid1D::new(2048, -20.0, 20.0).expect("reference grid is valid");
    let mut wf = gaussian(&grid, 0.0, 0.0, 1.0, 1.0, 1.0).expect("packet parameters are valid");
    let v = Potential::zeros(grid.n());
    let mut prop =
        SplitOperator::new(&grid, 1e-3, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut prop, &mut wf, &v, 2000);

    let measured = sigma_x(&wf);
    let analytic = SQRT_2; // sigma_0 * sqrt(1 + (t/tau)^2) with t = tau = 2
    let rel_err = (measured - analytic).abs() / analytic;
    println!(
        "spreading: sigma_x(2) = {measured:.8}  (analytic sqrt(2) = {analytic:.8}, \
         rel err = {rel_err:.3e})"
    );
    println!(
        "spreading: sigma_x(0) was 1.0 exactly, so measured growth factor = {factor:.8}",
        factor = measured
    );
    assert!(
        rel_err < 1e-2,
        "sigma_x = {measured}, analytic {analytic}, rel err {rel_err}"
    );

    // A k0 = 0 packet centered on x = 0 must not drift: <x> stays 0 by
    // symmetry (the grid [-20, 20) with even n is symmetric about 0).
    let xbar = expectation_x(&wf);
    println!("spreading: <x>(2) = {xbar:.3e}  (analytic 0)");
    assert!(xbar.abs() < 1e-6, "<x> = {xbar}, expected 0 within 1e-6");
}

/// 2. Coherent-state oscillation.
///
/// Ehrenfest's second theorem gives d^2<x>/dt^2 = -omega^2 <x> for the
/// harmonic oscillator, and for the HO this integrates exactly (no
/// approximation): `<x>(t) = 3 cos(t)` for a packet released at rest from
/// x0 = 3. Checked at t = 1.571 (~pi/2, <x> ~ 0) and t = 3.142 (~pi,
/// <x> ~ -3). A propagator with a wrong kinetic sign, wrong k-grid, or a
/// broken Strang order accumulates an O(1) phase error over a half period
/// and misses these windows.
#[test]
fn golden_coherent_state_oscillation() {
    let (mut wf, v) = coherent_setup();
    let mut prop =
        SplitOperator::new(wf.grid(), 1e-3, 1.0, 1.0).expect("propagator parameters are valid");

    for i in 1..=3142 {
        prop.step(&mut wf, &v)
            .unwrap_or_else(|e| panic!("step {i} failed: {e}"));
        if i == 1571 {
            // t = 1571 * 1e-3 = 1.571, near the first zero of <x>(t).
            let xbar = expectation_x(&wf);
            let analytic = 3.0 * (1571.0_f64 * 1e-3).cos();
            println!("coherent: <x>(1.571) = {xbar:.8}  (analytic 3cos(1.571) = {analytic:.8})");
            assert!(
                xbar.abs() < 0.01,
                "<x> at t~pi/2 = {xbar}, expected |<x>| < 0.01"
            );
        }
    }
    // t = 3142 * 1e-3 = 3.142, near the first full return to -x0.
    let xbar = expectation_x(&wf);
    let analytic = 3.0 * (3142.0_f64 * 1e-3).cos();
    println!("coherent: <x>(3.142) = {xbar:.8}  (analytic 3cos(3.142) = {analytic:.8})");
    assert!(
        (xbar + 3.0).abs() < 0.01,
        "<x> at t~pi = {xbar}, expected -3 within 0.01"
    );
}

/// Plane-wave transmission coefficient of a rectangular barrier of height
/// `v0` and width `a`, for energy `e` (m = hbar = 1). Standard result
/// (Griffiths, *Intro to QM*, rectangular barrier):
///
/// - `E < V0`: `T = 1 / (1 + V0^2 sinh^2(kappa_1 a) / (4 E (V0 - E)))`,
///   `kappa_1 = sqrt(2 m (V0 - E)) / hbar`
/// - `E > V0`: `T = 1 / (1 + V0^2 sin^2(kappa_2 a) / (4 E (E - V0)))`,
///   `kappa_2 = sqrt(2 m (E - V0)) / hbar`
/// - `E = V0` (|E - V0| < 1e-12): both branches degenerate to the limit
///   `T = 1 / (1 + m V0 a^2 / (2 hbar^2))`
fn barrier_transmission(e: f64, v0: f64, a: f64) -> f64 {
    if (e - v0).abs() < 1e-12 {
        return 1.0 / (1.0 + v0 * a * a / 2.0);
    }
    if e < v0 {
        let kappa1 = (2.0 * (v0 - e)).sqrt();
        let s = (kappa1 * a).sinh();
        1.0 / (1.0 + v0 * v0 * s * s / (4.0 * e * (v0 - e)))
    } else {
        let kappa2 = (2.0 * (e - v0)).sqrt();
        let s = (kappa2 * a).sin();
        1.0 / (1.0 + v0 * v0 * s * s / (4.0 * e * (e - v0)))
    }
}

/// 3. Barrier transmission vs the momentum-averaged analytic value.
///
/// Because the TDSE is linear, each plane-wave component e^{ikx} of the
/// packet scatters independently, so the exact transmitted probability is
/// the momentum-distribution average of the plane-wave coefficient:
///
/// ```text
/// Tbar = sum_j w(k_j) * T(E(k_j)),   E(k) = hbar^2 k^2 / (2 m)
/// ```
///
/// with `w` the packet's Gaussian momentum distribution (mu = k0,
/// sigma_k = 1/(2 sigma) = 0.25) discretized over [k0 - 4 sigma_k,
/// k0 + 4 sigma_k]. At t = 13 the transmitted packet has crossed the
/// barrier region (centroid ~ +8.4) and the reflected one has moved back
/// (centroid ~ -8.4), so `norm_in_range(wf, 0.5, 24)` measures the
/// transmitted probability: everything to the right of the barrier window.
#[test]
fn golden_barrier_transmission() {
    let grid = Grid1D::new(2048, -24.0, 24.0).expect("reference grid is valid");
    let k0 = SQRT_2; // E0 = hbar^2 k0^2 / 2m = 1, below V0 = 1.5
    let sigma = 2.0;
    let sigma_k = 1.0 / (2.0 * sigma); // 0.25 for a minimum-uncertainty packet
    let mut wf = gaussian(&grid, -10.0, k0, sigma, 1.0, 1.0).expect("packet parameters are valid");
    let v = barrier(&grid, 0.0, 1.0, 1.5);
    let mut prop =
        SplitOperator::new(&grid, 0.005, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut prop, &mut wf, &v, 2600);

    let t_sim = norm_in_range(&wf, 0.5, 24.0);
    let reflected = norm_in_range(&wf, -24.0, -0.5);
    let near_barrier = 1.0 - t_sim - reflected;

    // Momentum-averaged analytic transmission: 401-point k-grid spanning
    // +/-4 sigma_k, Gaussian weights renormalized over the span (the cut
    // tails hold ~6e-5 of the mass).
    let nk = 401;
    let k_lo = k0 - 4.0 * sigma_k;
    let k_hi = k0 + 4.0 * sigma_k;
    let dk = (k_hi - k_lo) / (nk - 1) as f64;
    let mut weight_sum = 0.0;
    let mut weighted_t = 0.0;
    for j in 0..nk {
        let k = k_lo + j as f64 * dk;
        let e = k * k / 2.0; // E(k) = hbar^2 k^2 / (2 m)
        let w = (-((k - k0) * (k - k0)) / (2.0 * sigma_k * sigma_k)).exp();
        weight_sum += w;
        weighted_t += w * barrier_transmission(e, 1.5, 1.0);
    }
    let t_bar = weighted_t / weight_sum;
    let t_on_axis = barrier_transmission(1.0, 1.5, 1.0);

    println!("barrier: T_sim = {t_sim:.6}");
    println!("barrier: reflected = {reflected:.6}, near-barrier remainder = {near_barrier:.6}");
    println!("barrier: Tbar (momentum-averaged) = {t_bar:.6}  (on-axis T(E0=1) = {t_on_axis:.6})");
    println!(
        "barrier: |T_sim - Tbar| = {diff:.6}",
        diff = (t_sim - t_bar).abs()
    );
    assert!(
        (t_sim - t_bar).abs() < 0.01,
        "T_sim = {t_sim}, Tbar = {t_bar}, difference {} exceeds 0.01",
        (t_sim - t_bar).abs()
    );
}

/// 4. Norm and energy conservation (spec 8.1 gates).
///
/// Strang splitting is unitary (every factor is unit-modulus in its
/// representation), so the norm is preserved to FFT round-off over any
/// number of steps. Energy is only preserved up to the O(dt^2) splitting
/// error, so run B uses the small dt = 1e-5: for a coherent state the
/// split-step energy oscillates with relative amplitude ~ (omega dt)^2/12
/// ~ 8e-12, comfortably inside the 1e-10 gate.
///
/// Norm gate — documented adjustment per the task brief's fallback
/// procedure ("reduce the run until the gate is met, do not loosen the
/// tolerance"): the measured round-off walk of the norm is *systematic* at
/// ~1.16e-16 per step (about half an ulp of the norm sum), linear in the
/// step count and independent of dt, so over the plan's original 1e4 steps
/// it reaches ~1.16e-12 — 16% above the spec-8.1 gate of 1e-12 through
/// pure IEEE-754 accumulation, not a unitarity error (the per-step norm
/// guard at 1e-10 never trips, and the free-spreading test above shows
/// the physics exact to 1e-13 where no accumulation is involved). The
/// spec tolerance is kept untouched and asserted at 5000 steps (measured
/// ~5.8e-13); the run then continues to 1e4 steps and prints that value
/// for the record.
#[test]
fn golden_norm_and_energy_conservation() {
    // Run A: norm conservation at the working step size. dt = 1e-3, run to
    // t = 10 (three oscillator periods), asserting at the halfway point.
    let (mut wf, v) = coherent_setup();
    let mut prop =
        SplitOperator::new(wf.grid(), 1e-3, 1.0, 1.0).expect("propagator parameters are valid");
    let mut drift_at_5000 = 0.0;
    for i in 1..=10_000 {
        prop.step(&mut wf, &v)
            .unwrap_or_else(|e| panic!("step {i} failed: {e}"));
        if i == 5000 {
            drift_at_5000 = (wf.norm() - 1.0).abs();
            println!("conservation: |norm - 1| at 5000 steps = {drift_at_5000:.3e}");
        }
    }
    let drift_at_10000 = (wf.norm() - 1.0).abs();
    println!(
        "conservation: |norm - 1| at 1e4 steps = {drift_at_10000:.3e} \
         (linear round-off walk, see the test doc comment)"
    );
    assert!(
        drift_at_5000 <= 1e-12,
        "|norm - 1| at 5000 steps = {drift_at_5000}, gate is 1e-12"
    );

    // Run B: energy conservation at dt = 1e-5 over 10^4 steps (t = 0.1).
    let (mut wf, v) = coherent_setup();
    let e0 = energy(&wf, &v);
    let mut prop =
        SplitOperator::new(wf.grid(), 1e-5, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut prop, &mut wf, &v, 10_000);
    let et = energy(&wf, &v);
    let rel_drift = (et - e0).abs() / e0;
    // E(0) of the coherent state: <T> = sigma_p^2/2 = 0.25,
    // <V> = (x0^2 + sigma^2)/2 = 4.75, total 5.0 exactly.
    println!(
        "conservation: E(0) = {e0:.10} (analytic 5.0), E(0.1) = {et:.10}, \
         rel drift = {rel_drift:.3e}"
    );
    assert!(
        rel_drift <= 1e-10,
        "E(0) = {e0}, E(0.1) = {et}, relative drift {rel_drift} exceeds 1e-10"
    );
}

/// 5. Convergence order in dt (pins Strang's O(dt^2)).
///
/// The coherent-state center under a quadratic Hamiltonian follows the
/// classical Strang/leapfrog orbit exactly (the split step is a metaplectic
/// map): it rotates by an angle `theta = arccos(1 - (omega dt)^2 / 2)` per
/// step, i.e. an effective frequency `omega * (1 + (omega dt)^2 / 24)`, so
/// the deviation of `<x>` from the exact oscillator scales as dt^2 and
/// halving dt must quarter it. A first-order splitting would give a ratio
/// of 2 and fail.
///
/// The error is measured against the analytic Ehrenfest law
/// `<x>(t) = 3 cos(t)` evaluated at the runs' actual final time
/// `t = 3142 * 1e-3 = 6284 * 5e-4 = 3.142` — not against the
/// `-3 = 3 cos(pi)` shorthand. Both runs stop a fixed, dt-independent
/// `3.142 - pi = 4.07e-4` short of pi, and at that turning point of the
/// cosine the offset dominates the O(dt^2) phase error by three orders of
/// magnitude: measured against -3 the errors are ~2.49e-7 for both step
/// sizes (ratio 1.0005) for any second-order integrator. Referencing
/// `3 cos(3.142)` isolates exactly the splitting error this test pins
/// (controller-ratified adjustment; see the task-8 report).
#[test]
fn golden_dt_scaling_order() {
    let (mut wf, v) = coherent_setup();
    let mut coarse =
        SplitOperator::new(wf.grid(), 1e-3, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut coarse, &mut wf, &v, 3142);
    let x_coarse = expectation_x(&wf);

    let (mut wf, v) = coherent_setup();
    let mut fine =
        SplitOperator::new(wf.grid(), 5e-4, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut fine, &mut wf, &v, 6284);
    let x_fine = expectation_x(&wf);

    // Analytic reference at the actual common final time of both runs,
    // 3142 * 1e-3 == 6284 * 5e-4 (computed from the run, not a magic
    // literal: it is deliberately not pi).
    let t_final = 3142.0_f64 * 1e-3;
    let reference = 3.0 * t_final.cos();
    let err_coarse = (x_coarse - reference).abs();
    let err_fine = (x_fine - reference).abs();
    let ratio = err_coarse / err_fine;
    println!(
        "dt order: <x>(dt=1e-3, 3142 steps) = {x_coarse:.12}, \
         err vs 3cos(3.142) = {err_coarse:.6e}"
    );
    println!(
        "dt order: <x>(dt=5e-4, 6284 steps) = {x_fine:.12}, \
         err vs 3cos(3.142) = {err_fine:.6e}"
    );
    println!("dt order: err ratio = {ratio:.4} (O(dt^2) expects ~4)");
    assert!(
        (2.5..5.5).contains(&ratio),
        "err ratio {ratio} outside (2.5, 5.5); splitting is not O(dt^2)"
    );
}

/// 6. The FFT makes the boundaries periodic (documented behavior).
///
/// A free packet with k0 = 8 travels at group velocity v = hbar k0 / m = 8;
/// after t = 3 its centroid would sit at x = 24, past xmax = 20, so under
/// the FFT's periodic boundary conditions it re-enters the domain from the
/// left at ~ -16. This test documents that wrap-around: the probability on
/// [-20, -15) is large. FFT periodic BC — the web layer must detect this
/// and warn; see spec 3.2.
#[test]
fn golden_boundary_is_periodic() {
    let grid = Grid1D::new(2048, -20.0, 20.0).expect("reference grid is valid");
    let mut wf = gaussian(&grid, 0.0, 8.0, 1.0, 1.0, 1.0).expect("packet parameters are valid");
    let v = Potential::zeros(grid.n());
    let mut prop =
        SplitOperator::new(&grid, 1e-3, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut prop, &mut wf, &v, 3000);

    let wrapped = norm_in_range(&wf, -20.0, -15.0);
    let xbar = expectation_x(&wf);
    println!(
        "periodic: wrapped norm on [-20,-15) = {wrapped:.6}, <x> = {xbar:.4} \
         (unwrapped centroid would be +24)"
    );
    assert!(
        wrapped > 1e-3,
        "wrapped norm {wrapped} on [-20,-15); packet did not wrap (expected ~0.7)"
    );
}
