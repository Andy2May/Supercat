//! Golden acceptance tests for the 2D core: the simulator vs the analytic
//! TDSE answers that survive dimension lifting unchanged.
//!
//! M1 pins five phenomena with closed forms: free Gaussian spreading along
//! each axis independently (a 2D free packet is the product of two 1D free
//! packets, so each axis follows the 1D law with its own `sigma_0`); norm
//! conservation over a long run (Strang splitting is unitary in any
//! dimension; only the round-off floor grows, with the point count of the
//! norm sum); the circular orbit of a coherent state in the harmonic
//! potential (Ehrenfest's theorem is exact for the oscillator, and the
//! packet never spreads); total-energy conservation of that orbit; and the
//! O(dt^2) convergence order of the Strang step. Every test prints its
//! measured values (run with
//! `cargo test -p psiforge-core --test golden2d -- --nocapture`); a PASS is
//! only accepted after comparing those numbers against the analytic
//! expectation of the task brief.
//!
//! All tests use the unitless core convention `m = hbar = 1`. Moments are
//! computed test-locally with `dA = dx*dy` weights (the core's observables
//! module is 1D-only in M1), matching the 1D golden suite's style.

use num_complex::Complex64;
use psiforge_core::grid::Grid2D;
use psiforge_core::potential::{Potential2D, harmonic2d};
use psiforge_core::propagator::{Propagator, SplitOperator2D};
use psiforge_core::states::gaussian_2d;
use psiforge_core::wavefunction::Wavefunction2D;
use std::f64::consts::{FRAC_1_SQRT_2, FRAC_PI_2, PI};

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

/// Ground-state width of the harmonic oscillator with `m = omega = hbar = 1`:
/// `sigma = sqrt(hbar/(2 m omega)) = 1/sqrt(2)`. A Gaussian of this width in
/// the harmonic potential is a true coherent state: it never spreads, and
/// Ehrenfest's theorem for the oscillator is exact, so the packet center
/// follows the classical orbit.
const COHERENT_SIGMA: f64 = FRAC_1_SQRT_2;

/// Coherent-state setup shared by the orbit and dt-scaling tests: a packet
/// of the ground-state width released at `(3, 0)` with tangential carrier
/// wavevector `(kx, ky) = (0, -3)`. With `m = omega = hbar = 1` the
/// tangential launch condition `|p| = m * omega * r` makes the classical
/// orbit the circle of radius 3,
///
/// ```text
/// <x>(t) = 3 cos t,   <y>(t) = -3 sin t,
/// ```
///
/// so the packet sits at `(0, -3)` at `t = pi/2` and at `(-3, 0)` at
/// `t = pi`. A wrong 2D k-grid, a transposed axis, or a sign slip in one
/// kinetic factor turns the circle into an ellipse or a spiral and misses
/// those points by O(1).
fn coherent_orbit_setup(n: usize) -> (Wavefunction2D, Potential2D) {
    let grid = square_grid(n);
    let wf = gaussian_2d(
        &grid,
        3.0,
        0.0,
        0.0,
        -3.0,
        COHERENT_SIGMA,
        COHERENT_SIGMA,
        1.0,
        1.0,
    )
    .expect("coherent state parameters are valid");
    let v = harmonic2d(&grid, 1.0, 1.0);
    (wf, v)
}

/// fftfreq-convention k-grid axis: `k_j = 2*pi/(n*d) * j'` with `j' = j` for
/// `j < n/2` and `j' = j - n` for `j >= n/2` (for even `n` the Nyquist bin
/// `j = n/2` carries `-n/2`) — the same convention the core's kinetic phase
/// table uses, pinned by its unit test.
fn k_axis(n: usize, d: f64) -> Vec<f64> {
    let dk = 2.0 * PI / (n as f64 * d);
    (0..n)
        .map(|j| {
            let j_signed = if j < n / 2 {
                j as f64
            } else {
                j as f64 - n as f64
            };
            dk * j_signed
        })
        .collect()
}

/// `|psi_tilde(kx_i, ky_j)|^2` of the direct 2D DFT
///
/// ```text
/// psi_tilde(i, j) = sum_m sum_n psi(x_m, y_n) * exp(-i (kx_i x_m + ky_j y_n))
/// ```
///
/// row-major at `grid.index(i, j)` like every other 2D array in the crate.
/// The core's FFT is `pub(crate)`, so the tests compute momentum-space
/// quantities by the transform's defining double sum. The kernel is
/// separable, so the sum is evaluated as an x-pass then a y-pass — values
/// identical to the naive O(n^4) quadruple loop at O(n^3) cost (at 64^2
/// that is 2 * 64^3 ~ 5e5 complex multiply-adds, instant next to the 10^4
/// propagation steps of the energy test).
fn dft2_magnitude_squared(wf: &Wavefunction2D) -> Vec<f64> {
    let grid = wf.grid();
    let (nx, ny) = (grid.nx(), grid.ny());
    let kx = k_axis(nx, grid.dx());
    let ky = k_axis(ny, grid.dy());
    // Twiddle tables `ex[i][m] = exp(-i kx_i x_m)` and `ey[j][n] =
    // exp(-i ky_j y_n)`. Only the product of twiddles enters the transform,
    // so the `xmin`/`ymin` offsets are dropped without changing |psi_tilde|^2.
    let ex: Vec<Vec<Complex64>> = kx
        .iter()
        .map(|&ki| (0..nx).map(|m| Complex64::cis(-(ki * grid.x(m)))).collect())
        .collect();
    let ey: Vec<Vec<Complex64>> = ky
        .iter()
        .map(|&kj| (0..ny).map(|n| Complex64::cis(-(kj * grid.y(n)))).collect())
        .collect();
    // x-pass: `a[i][n] = sum_m ex[i][m] * psi(m, n)` (psi is row-major,
    // x-fastest: `grid.index(m, n) = n*nx + m`), stored i-major.
    let mut a = vec![Complex64::new(0.0, 0.0); nx * ny];
    for n in 0..ny {
        for i in 0..nx {
            let mut acc = Complex64::new(0.0, 0.0);
            for (m, &twiddle) in ex[i].iter().enumerate() {
                acc += twiddle * wf.psi()[grid.index(m, n)];
            }
            a[i * ny + n] = acc;
        }
    }
    // y-pass: `t(i, j) = sum_n ey[j][n] * a(i, n)`.
    let mut out = vec![0.0; nx * ny];
    for j in 0..ny {
        for i in 0..nx {
            let mut acc = Complex64::new(0.0, 0.0);
            for n in 0..ny {
                acc += ey[j][n] * a[i * ny + n];
            }
            out[grid.index(i, j)] = acc.norm_sqr();
        }
    }
    out
}

/// `<V> = sum_k V_k |psi_k|^2 dA` — the position-space Riemann sum with the
/// same `dA = dx*dy` weight as the core's norm.
fn potential_expectation(wf: &Wavefunction2D, v: &Potential2D) -> f64 {
    let grid = wf.grid();
    let d_area = grid.dx() * grid.dy();
    wf.psi()
        .iter()
        .zip(v.values())
        .map(|(c, &vk)| vk * c.norm_sqr() * d_area)
        .sum()
}

/// `<T> = [sum_k |psi~_k|^2 (kx^2 + ky^2)/(2m)] / [sum_k |psi~_k|^2]` —
/// the kinetic expectation in direct-DFT ratio form, immune to the test
/// DFT's overall normalization (any constant cancels between numerator and
/// denominator; with the packet normalized the denominator is `nx*ny/dA`).
fn kinetic_expectation(wf: &Wavefunction2D) -> f64 {
    let grid = wf.grid();
    let kx = k_axis(grid.nx(), grid.dx());
    let ky = k_axis(grid.ny(), grid.dy());
    let mags = dft2_magnitude_squared(wf);
    let (mut numerator, mut denominator) = (0.0, 0.0);
    for j in 0..grid.ny() {
        for i in 0..grid.nx() {
            let k_squared = kx[i] * kx[i] + ky[j] * ky[j];
            let weight = mags[grid.index(i, j)];
            numerator += weight * k_squared;
            denominator += weight;
        }
    }
    numerator / (2.0 * wf.m() * denominator)
}

/// 3. Coherent-state circular orbit.
///
/// Ehrenfest's theorem for the harmonic oscillator is exact for a coherent
/// state: the center obeys the classical equations, so the packet released
/// at `(3, 0)` with tangential momentum `(0, -3)` (see
/// [`coherent_orbit_setup`]) rides the circle of radius 3 and must sit at
/// `(0, -3)` at `t = pi/2` and `(-3, 0)` at `t = pi`, with the width frozen
/// at `sigma = 1/sqrt(2)` (checked by construction: the ground-state width
/// is the orbit's fixed point).
///
/// Time grid: the gates pin the exact quarter-/half-period targets, so the
/// step must land exactly on them — `dt = (pi/2)/1571 = 0.00099949` (the
/// brief's "0.001" to three decimals) with 1571 steps to `t = pi/2` and
/// 3142 to `t = pi`. With `dt = 0.001` exactly no integer step count
/// reaches `pi/2`: 1571 steps overshoot by `1.571 - pi/2 = 2.04e-4`, and
/// the *analytically correct* center would then sit at `<x> =
/// 3 cos(1.571) = -6.1e-4`, six hundred times the 1e-6 gate — a time-grid
/// artifact, not a propagator error. Landing on the target exactly leaves
/// the measured error equal to the propagator's own splitting error, which
/// for a quadratic Hamiltonian is a pure metaplectic orbit distortion: each
/// Strang step rotates phase space by `theta = 2 arcsin(dt/2) = dt(1 +
/// dt^2/24 + ...)` instead of `dt` and squeezes it by `r =
/// sqrt(1 - dt^2/4)`, so the predicted residuals are
/// `|<x>(pi/2)| = 3 sin(N (theta - dt)) ~ 3 (pi/2) dt^2 / 24 ~ 2.0e-7`,
/// `|<y>(pi/2) + 3| = 3/r - 3 ~ 3 dt^2 / 8 ~ 3.7e-7`,
/// `|<y>(pi)| = 3 sin(2 N (theta - dt)) / r ~ 3.9e-7`, and
/// `|<x>(pi) + 3| ~ 6 (theta - dt)^2 ~ 3e-14` — all inside the 1e-6 gate.
#[test]
fn coherent_state_circular_orbit() {
    let (mut wf, v) = coherent_orbit_setup(256);
    let steps_to_half_period = 1571usize;
    let dt = FRAC_PI_2 / steps_to_half_period as f64;
    let mut prop =
        SplitOperator2D::new(wf.grid(), dt, 1.0, 1.0).expect("propagator parameters are valid");

    run_steps(&mut prop, &mut wf, &v, steps_to_half_period); // t = pi/2: (0, -3)
    let (x_half, _, y_half, _) = moments(&wf);
    println!(
        "orbit 2D: t = pi/2: <x> = {x_half:+.3e} (gate |<x>| <= 1e-6), \
         <y> = {y_half:+.8} (gate |<y> + 3| <= 1e-6, deviation {:+.3e})",
        y_half + 3.0
    );
    assert!(
        x_half.abs() <= 1e-6,
        "<x> at t = pi/2 = {x_half}, gate is |<x>| <= 1e-6"
    );
    assert!(
        (y_half + 3.0).abs() <= 1e-6,
        "<y> at t = pi/2 = {y_half}, gate is |<y> + 3| <= 1e-6"
    );

    run_steps(&mut prop, &mut wf, &v, steps_to_half_period); // t = pi: (-3, 0)
    let (x_full, _, y_full, _) = moments(&wf);
    println!(
        "orbit 2D: t = pi:   <x> = {x_full:+.8} (gate |<x> + 3| <= 1e-6, deviation {:+.3e}), \
         <y> = {y_full:+.3e} (gate |<y>| <= 1e-6)",
        x_full + 3.0
    );
    assert!(
        (x_full + 3.0).abs() <= 1e-6,
        "<x> at t = pi = {x_full}, gate is |<x> + 3| <= 1e-6"
    );
    assert!(
        y_full.abs() <= 1e-6,
        "<y> at t = pi = {y_full}, gate is |<y>| <= 1e-6"
    );
}

/// 4. Energy conservation of the displaced coherent state.
///
/// `E = <V> + <T>` with `<V> = sum V |psi|^2 dA` and `<T>` from the
/// test-local direct DFT in ratio form (the core's FFT is `pub(crate)`).
/// For the coherent state at `(2, 0)` with `k = 0` and `sigma = 1/sqrt(2)`
/// the analytic total is `E = <V> + <T> = 2.5 + 0.5 = 3.0` — printed for
/// the record as a construction cross-check.
///
/// Physics of the gate: the Strang step is unitary, so the *shadow*
/// Hamiltonian is conserved exactly; the true energy oscillates around it
/// with relative amplitude O(dt^2) (backward error analysis; the 1D golden
/// suite measured the same oscillation and dropped to `dt = 1e-5` to sit
/// under this very 1e-10 gate). The step below therefore uses `dt = 1e-5`:
/// at the brief's literal `dt = 0.01` a *correct* core measures
/// `dE/<E> = 4.267e-6` (characterization run of this task, matching the
/// metaplectic prediction `(dt^2/6) sin^2(N theta) = 4.27e-6` to three
/// significant figures — the squeeze `r = sqrt(1 - dt^2/4)` of the split
/// step makes the displaced center's `<x^2 + p^2>` breathe as
/// `3 - (dt^2/2) sin^2(N theta)`), four orders above the gate. The ratified
/// tolerance is untouched; only the step size is pinned to what the gate
/// physically demands (runtime valve unaffected: 10^4 steps at 64^2 either
/// way; see the task-13 report for the dt = 0.01 characterization run).
#[test]
fn energy_conservation_2d() {
    let grid = Grid2D::new(64, 64, -16.0, 16.0, -16.0, 16.0).expect("reference grid is valid");
    let mut wf = gaussian_2d(
        &grid,
        2.0,
        0.0,
        0.0,
        0.0,
        COHERENT_SIGMA,
        COHERENT_SIGMA,
        1.0,
        1.0,
    )
    .expect("coherent state parameters are valid");
    let v = harmonic2d(&grid, 1.0, 1.0);

    let (v_initial, t_initial) = (potential_expectation(&wf, &v), kinetic_expectation(&wf));
    let e_initial = v_initial + t_initial;
    let mut prop =
        SplitOperator2D::new(&grid, 1e-5, 1.0, 1.0).expect("propagator parameters are valid");
    run_steps(&mut prop, &mut wf, &v, 10_000); // t = 0.1

    let (v_final, t_final) = (potential_expectation(&wf, &v), kinetic_expectation(&wf));
    let e_final = v_final + t_final;
    let rel_drift = (e_final - e_initial).abs() / e_initial;
    println!(
        "energy 2D: E(0)   = {e_initial:.12}  (<V> = {v_initial:.12}, <T> = {t_initial:.12}; \
         analytic 3.0)"
    );
    println!(
        "energy 2D: E(0.1) = {e_final:.12}  (<V> = {v_final:.12}, <T> = {t_final:.12}), \
         dE/<E> = {rel_drift:.3e} (gate 1e-10)"
    );
    assert!(
        rel_drift <= 1e-10,
        "E(0) = {e_initial}, E(0.1) = {e_final}, relative drift {rel_drift} exceeds 1e-10"
    );
}

/// 5. Convergence order in dt (pins Strang's O(dt^2)).
///
/// Same coherent setup as the orbit test on a 128^2 grid, propagated to
/// `t = pi/2` at two step sizes; the error `e(dt) = |<y>(pi/2) - (-3)|`
/// must scale as `dt^2`, so halving dt must quarter it: the ratio
/// `e(2 dt)/e(dt)` sits in `(2.5, 5.5)` for any second-order integrator
/// (a first-order splitting gives 2 and fails).
///
/// The error itself is the metaplectic orbit distortion of the split step
/// (see the orbit test): `<y>` follows `-(3/r) sin(N theta)` with the
/// squeeze `r = sqrt(1 - dt^2/4)`, so at the top of the orbit
/// `e(dt) = 3/r - 3 ~ 3 dt^2 / 8` — genuinely O(dt^2), ~1.5e-6 at
/// `dt ~ 2e-3`, four orders above the FFT round-off floor (~1e-13 over
/// ~1600 steps).
///
/// Time grid: like the orbit test, both runs must land *exactly* on
/// `t = pi/2` or the fixed per-run landing offset (at `<y>`'s extremum,
/// `3 delta_t^2/2` per offset `delta_t`) pollutes the ratio: with the
/// brief's literal `dt = 0.002`/`0.001`, 786 and 1571 steps overshoot
/// `pi/2` by different amounts (1.2e-3 vs 2.0e-4) and a *correct* core
/// measures a ratio near 8, outside the window. The runs therefore use
/// `dt = (pi/2)/1572` and `dt = (pi/2)/786` — the brief's "0.001" and
/// "0.002" to three decimals, in exactly 2:1 relation, both landing on
/// `pi/2` exactly (1572 = 2 * 786 steps).
#[test]
fn dt_scaling_order_2d() {
    let steps_fine = 1572usize;
    let steps_coarse = 786usize;
    assert_eq!(steps_fine, 2 * steps_coarse, "dt ratio must be exactly 2");
    let dt_fine = FRAC_PI_2 / steps_fine as f64;
    let dt_coarse = FRAC_PI_2 / steps_coarse as f64;

    let (mut wf, v) = coherent_orbit_setup(128);
    let mut coarse =
        SplitOperator2D::new(wf.grid(), dt_coarse, 1.0, 1.0).expect("propagator parameters valid");
    run_steps(&mut coarse, &mut wf, &v, steps_coarse);
    let (_, _, y_coarse, _) = moments(&wf);
    let err_coarse = (y_coarse + 3.0).abs();

    let (mut wf, v) = coherent_orbit_setup(128);
    let mut fine =
        SplitOperator2D::new(wf.grid(), dt_fine, 1.0, 1.0).expect("propagator parameters valid");
    run_steps(&mut fine, &mut wf, &v, steps_fine);
    let (_, _, y_fine, _) = moments(&wf);
    let err_fine = (y_fine + 3.0).abs();

    let ratio = err_coarse / err_fine;
    println!(
        "dt order 2D: dt = {dt_coarse:.8} ({steps_coarse} steps): <y>(pi/2) = {y_coarse:+.10}, \
         err = {err_coarse:.6e}"
    );
    println!(
        "dt order 2D: dt = {dt_fine:.8} ({steps_fine} steps): <y>(pi/2) = {y_fine:+.10}, \
         err = {err_fine:.6e}"
    );
    println!("dt order 2d: err(2 dt)/err(dt) = {ratio:.4}  (window (2.5, 5.5); O(dt^2) pins 4)");
    assert!(
        ratio > 2.5 && ratio < 5.5,
        "error ratio e(2 dt)/e(dt) = {ratio} (e_coarse = {err_coarse}, e_fine = {err_fine}), \
         outside the O(dt^2) window (2.5, 5.5)"
    );
}
