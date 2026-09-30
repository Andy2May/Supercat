//! WebAssembly bindings for the Psiforge 2D quantum simulation core.
//!
//! The whole 2D core is exposed through a single [`Simulation2D`] class: the
//! browser creates one per scene, calls
//! [`set_gaussian`](Simulation2D::set_gaussian) to drop in a packet, and then
//! alternates [`advance`](Simulation2D::advance) (physics) with
//! [`density_phase`](Simulation2D::density_phase) (rendering). Every
//! `CoreError` crosses the boundary as a `JsError` carrying the core's
//! `Display` text verbatim, so the JS console sees the same diagnostics as a
//! native caller.
//!
//! # Buffer layout
//!
//! [`density_phase`](Simulation2D::density_phase) returns one interleaved
//! `(rho, phi) = (|psi|^2, arg psi)` pair per grid point in `f32`, row-major
//! with x fastest (flat index `j*nx + i`): exactly the texel layout of a
//! WebGL `RG32F` texture of width `nx` and height `ny`, ready for
//! `texImage2D` without a shuffle.
//!
//! # Units
//!
//! The unitless core convention (`m = hbar = 1` by default) carries over
//! unchanged; see `docs/units.md` in the repository root.

use js_sys::Float32Array;
use psiforge_core::error::CoreError;
use psiforge_core::grid::Grid2D;
use psiforge_core::num_complex::Complex64;
use psiforge_core::potential::Potential2D;
use psiforge_core::propagator::{Propagator, SplitOperator2D};
use psiforge_core::states::gaussian_2d;
use psiforge_core::wavefunction::Wavefunction2D;
use wasm_bindgen::prelude::*;

/// Maps every [`CoreError`] to a `JsError` carrying the core's `Display`
/// text verbatim.
fn core_to_js(err: CoreError) -> JsError {
    JsError::new(&err.to_string())
}

/// Rebuilds an owned copy of `grid`. `Grid2D` is not `Clone`; rebuilding
/// through the validated accessors cannot fail for a live grid.
fn clone_grid(grid: &Grid2D) -> Result<Grid2D, CoreError> {
    Grid2D::new(
        grid.nx(),
        grid.ny(),
        grid.xmin(),
        grid.xmax(),
        grid.ymin(),
        grid.ymax(),
    )
}

/// One running 2D quantum simulation, exported to JS as a single class.
///
/// The struct owns the whole core state — grid, wavefunction, sampled
/// potential, propagator, simulation time `t`, and the last
/// [`set_gaussian`](Self::set_gaussian) snapshot that
/// [`reset_wave`](Self::reset_wave) restores. See the [crate
/// docs](crate) for the buffer layout of the rendering getters.
#[wasm_bindgen]
pub struct Simulation2D {
    grid: Grid2D,
    wf: Wavefunction2D,
    v: Potential2D,
    prop: SplitOperator2D,
    t: f64,
    /// Time step of `prop`; the core does not expose it back out, and
    /// `advance` needs it to integrate simulation time.
    dt: f64,
    snapshot: Vec<Complex64>,
    potential_version: u32,
}

#[wasm_bindgen]
impl Simulation2D {
    /// Creates a simulation on a `nx x ny` grid spanning
    /// `[-extent_x/2, extent_x/2) x [-extent_y/2, extent_y/2)` with the free
    /// potential `V = 0` and an all-zero wavefunction.
    ///
    /// # Errors
    ///
    /// Every core precondition surfaces as a `JsError` with the core's
    /// `Display` text: grid bounds (`nx >= 2`, `ny >= 2`, finite, positive
    /// extents), `dt > 0` finite, `m > 0` and `hbar > 0` finite.
    #[wasm_bindgen(constructor)]
    pub fn new(
        nx: usize,
        ny: usize,
        extent_x: f64,
        extent_y: f64,
        dt: f64,
        m: f64,
        hbar: f64,
    ) -> Result<Simulation2D, JsError> {
        let grid = Grid2D::new(
            nx,
            ny,
            -extent_x / 2.0,
            extent_x / 2.0,
            -extent_y / 2.0,
            extent_y / 2.0,
        )
        .map_err(core_to_js)?;
        let wf_grid = clone_grid(&grid).map_err(core_to_js)?;
        let n = nx * ny;
        let wf = Wavefunction2D::new(wf_grid, vec![Complex64::new(0.0, 0.0); n], m, hbar)
            .map_err(core_to_js)?;
        let prop = SplitOperator2D::new(&grid, dt, m, hbar).map_err(core_to_js)?;
        let v = Potential2D::zeros(n);
        // The initial snapshot is the initial zero state, so `reset_wave` is
        // well-defined even before the first `set_gaussian`.
        let snapshot = wf.psi().to_vec();
        Ok(Simulation2D {
            grid,
            wf,
            v,
            prop,
            t: 0.0,
            dt,
            snapshot,
            potential_version: 0,
        })
    }

    /// Places a normalized anisotropic Gaussian packet centered at
    /// `(x0, y0)` with momentum `(kx, ky)` and widths `(sigma_x, sigma_y)`,
    /// stores it as the reset snapshot, and resets `t = 0`.
    ///
    /// # Errors
    ///
    /// `JsError` carrying the core's text: non-positive or non-finite
    /// `sigma_x`/`sigma_y`, non-finite `x0`/`y0`/`kx`/`ky`.
    pub fn set_gaussian(
        &mut self,
        x0: f64,
        y0: f64,
        kx: f64,
        ky: f64,
        sigma_x: f64,
        sigma_y: f64,
    ) -> Result<(), JsError> {
        let wf = gaussian_2d(
            &self.grid,
            x0,
            y0,
            kx,
            ky,
            sigma_x,
            sigma_y,
            self.wf.m(),
            self.wf.hbar(),
        )
        .map_err(core_to_js)?;
        self.snapshot = wf.psi().to_vec();
        self.wf = wf;
        self.t = 0.0;
        Ok(())
    }

    /// Restores the wavefunction from the last snapshot and resets `t = 0`.
    pub fn reset_wave(&mut self) {
        self.wf.psi_mut().copy_from_slice(&self.snapshot);
        self.t = 0.0;
    }

    /// Runs `substeps` propagator steps and returns the simulation time `t`
    /// afterwards. `advance(0)` is the time getter.
    ///
    /// # Errors
    ///
    /// The first failing step returns immediately as a `JsError` with the
    /// core's text — a `NormDrift` trip is fatal and is never swallowed.
    pub fn advance(&mut self, substeps: u32) -> Result<f64, JsError> {
        for _ in 0..substeps {
            self.prop.step(&mut self.wf, &self.v).map_err(core_to_js)?;
            self.t += self.dt;
        }
        Ok(self.t)
    }

    /// Interleaved `(rho, phi)` pairs per grid point in `f32`, row-major
    /// with x fastest (`j*nx + i`): the texel layout of a WebGL `RG32F`
    /// texture of width `nx`, height `ny`.
    pub fn density_phase(&self) -> Float32Array {
        let mut data = Vec::with_capacity(2 * self.wf.n_points());
        for &c in self.wf.psi() {
            data.push(c.norm_sqr() as f32);
            data.push(c.arg() as f32);
        }
        Float32Array::new_from_slice(&data)
    }

    /// Current norm of the wavefunction (1 for every state the propagator
    /// has accepted).
    pub fn norm(&self) -> f64 {
        self.wf.norm()
    }

    /// Revision counter of the sampled potential: starts at 0 and increments
    /// by 1 each time `V` changes, so a renderer can cache potential
    /// textures. No mutation path exists yet in this milestone.
    pub fn potential_version(&self) -> u32 {
        self.potential_version
    }

    /// `f32` copy of the sampled potential, one value per grid point in the
    /// same row-major order as [`density_phase`](Self::density_phase).
    pub fn read_potential_f32(&self) -> Float32Array {
        let data: Vec<f32> = self.v.values().iter().map(|&x| x as f32).collect();
        Float32Array::new_from_slice(&data)
    }
}

#[cfg(test)]
mod tests {
    use crate::Simulation2D;
    use wasm_bindgen_test::wasm_bindgen_test;

    /// Reference simulation: 64 x 64 grid spanning [-20, 20) x [-20, 20)
    /// (extents 40 x 40), `dt = 0.005`, unitless `m = hbar = 1` — the same
    /// box convention as the native `golden2d` suite.
    const NX: usize = 64;
    const NY: usize = 64;
    const EXTENT_X: f64 = 40.0;
    const EXTENT_Y: f64 = 40.0;
    const DT: f64 = 0.005;
    const M: f64 = 1.0;
    const HBAR: f64 = 1.0;

    fn sim() -> Simulation2D {
        Simulation2D::new(NX, NY, EXTENT_X, EXTENT_Y, DT, M, HBAR)
            .expect("reference simulation parameters are valid")
    }

    /// Reference packet from the task brief: `(x0, y0, kx, ky, sigma_x,
    /// sigma_y) = (0, 0, 2, -1, 1.5, 1.5)`.
    fn set_reference_packet(sim: &mut Simulation2D) {
        sim.set_gaussian(0.0, 0.0, 2.0, -1.0, 1.5, 1.5)
            .expect("packet parameters are valid");
    }

    #[wasm_bindgen_test]
    fn set_gaussian_normalizes_and_resets_time() {
        let mut sim = sim();
        set_reference_packet(&mut sim);
        assert!((sim.norm() - 1.0).abs() <= 1e-10, "norm = {}", sim.norm());
        let t = sim.advance(0).expect("advance(0) cannot fail");
        assert_eq!(t, 0.0);
    }

    #[wasm_bindgen_test]
    fn advance_steps_time_and_conserves_norm() {
        let mut sim = sim();
        set_reference_packet(&mut sim);
        let t = sim.advance(10).expect("valid state stays valid");
        assert!((t - 10.0 * DT).abs() <= 1e-15, "t = {t}");
        assert!((sim.norm() - 1.0).abs() <= 1e-10, "norm = {}", sim.norm());
    }

    #[wasm_bindgen_test]
    fn density_phase_is_interleaved_row_major_and_sums_to_one() {
        let mut sim = sim();
        set_reference_packet(&mut sim);
        let arr = sim.density_phase();
        assert_eq!(arr.length(), (2 * NX * NY) as u32);
        let v = arr.to_vec();
        let d_area = (EXTENT_X / NX as f64) * (EXTENT_Y / NY as f64);
        // rho lives at even indices of the interleaved [rho, phi] pairs.
        let sum: f32 = v.iter().step_by(2).sum();
        assert!(
            (sum as f64 * d_area - 1.0).abs() <= 1e-4,
            "sum rho*dA = {}",
            sum as f64 * d_area
        );
    }

    #[wasm_bindgen_test]
    fn constructor_rejects_degenerate_grid() {
        let Err(err) = Simulation2D::new(1, NY, EXTENT_X, EXTENT_Y, DT, M, HBAR) else {
            panic!("nx=1 must be rejected");
        };
        // JsError has no Display; its Debug forwards to the JS value's
        // string form ("Error: <message>").
        let msg = format!("{err:?}");
        assert!(msg.contains("grid"), "message should mention grid: {msg}");
    }

    #[wasm_bindgen_test]
    fn set_gaussian_rejects_zero_sigma() {
        let mut sim = sim();
        let Err(err) = sim.set_gaussian(0.0, 0.0, 0.0, 0.0, 0.0, 1.5) else {
            panic!("sigma_x = 0 must be rejected");
        };
        let msg = format!("{err:?}");
        assert!(msg.contains("sigma"), "message should mention sigma: {msg}");
    }

    /// Golden-minimal cross-run (spec section 7): the native `golden2d`
    /// norm-conservation law must hold identically on the WASM build.
    #[wasm_bindgen_test]
    fn golden_norm_conservation_on_wasm() {
        let mut sim = sim();
        sim.set_gaussian(0.0, 0.0, 0.0, 0.0, 1.5, 1.5)
            .expect("packet parameters are valid");
        sim.advance(1000).expect("valid state stays valid");
        let drift = (sim.norm() - 1.0).abs();
        assert!(
            drift <= 1e-12,
            "|norm - 1| = {drift} after 1000 steps, gate is 1e-12"
        );
    }

    #[wasm_bindgen_test]
    fn reset_wave_restores_snapshot_and_time() {
        let mut sim = sim();
        set_reference_packet(&mut sim);
        let before = sim.density_phase().to_vec();
        sim.advance(50).expect("valid state stays valid");
        sim.reset_wave();
        let after = sim.density_phase().to_vec();
        assert_eq!(before, after);
        let t = sim.advance(0).expect("advance(0) cannot fail");
        assert_eq!(t, 0.0);
    }

    #[wasm_bindgen_test]
    fn initial_potential_is_zero_at_version_zero() {
        let sim = sim();
        assert_eq!(sim.potential_version(), 0);
        let v = sim.read_potential_f32();
        assert_eq!(v.length(), (NX * NY) as u32);
        assert!(v.to_vec().iter().all(|&x| x == 0.0));
    }
}
