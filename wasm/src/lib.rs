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
use psiforge_core::potential::{Gap, Potential2D, harmonic2d, wall};
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

/// Euclidean distance from the point `(px, py)` to the segment
/// `(x1, y1) -> (x2, y2)`: project orthogonally onto the segment direction,
/// clamp the parameter `t` to `[0, 1]` (beyond the ends the distance is to
/// the nearest endpoint, which is what rounds the brush stroke's caps), then
/// measure the distance to the clamped point.
fn point_segment_distance(px: f64, py: f64, x1: f64, y1: f64, x2: f64, y2: f64) -> f64 {
    let dx = x2 - x1;
    let dy = y2 - y1;
    let len2 = dx * dx + dy * dy;
    // Degenerate zero-length segment: distance to the single endpoint (t = 0).
    let t = if len2 == 0.0 {
        0.0
    } else {
        (((px - x1) * dx + (py - y1) * dy) / len2).clamp(0.0, 1.0)
    };
    let ex = px - (x1 + t * dx);
    let ey = py - (y1 + t * dy);
    (ex * ex + ey * ey).sqrt()
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
    /// The last potential installed by a setter (`potential_zero`,
    /// `potential_harmonic`, `potential_wall`) — the analytic background
    /// that [`restore_potential`](Self::restore_potential) rolls paint ops
    /// back to. Paint ops mutate `v` only, never `base_v`.
    base_v: Potential2D,
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
        let base_v = Potential2D::zeros(n);
        // The initial snapshot is the initial zero state, so `reset_wave` is
        // well-defined even before the first `set_gaussian`.
        let snapshot = wf.psi().to_vec();
        Ok(Simulation2D {
            grid,
            wf,
            v,
            base_v,
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

    // ---- potential setters, paint ops, restore (dirty flag: +1 version each) ----

    /// Sets `V = 0` everywhere (the free particle) and installs it as the
    /// restore base. Bumps `potential_version` by 1.
    pub fn potential_zero(&mut self) {
        let n = self.v.len();
        self.v = Potential2D::zeros(n);
        self.base_v = Potential2D::zeros(n);
        self.potential_version += 1;
    }

    /// Sets `V(x, y) = 1/2 m omega^2 (x^2 + y^2)` (core `harmonic2d`, with
    /// the simulation's `m`) and installs it as the restore base. The
    /// builder runs twice — it is a pure function of `(grid, m, omega)`, so
    /// both copies are identical. Bumps `potential_version` by 1.
    pub fn potential_harmonic(&mut self, omega: f64) {
        self.v = harmonic2d(&self.grid, self.wf.m(), omega);
        self.base_v = harmonic2d(&self.grid, self.wf.m(), omega);
        self.potential_version += 1;
    }

    /// Sets `V` to a vertical wall of `value` in the band
    /// `|x - x_center| < thickness / 2`, punched through by one gap per
    /// `(gap_centers[k], gap_widths[k])` pair (the band
    /// `|y - gap_centers[k]| < gap_widths[k] / 2` stays at `V = 0`), and
    /// installs it as the restore base. A double slit is a wall with two
    /// gaps. Bumps `potential_version` by 1.
    ///
    /// # Errors
    ///
    /// `JsError` mentioning "gap arrays" when the two parallel arrays have
    /// different lengths.
    pub fn potential_wall(
        &mut self,
        x_center: f64,
        thickness: f64,
        value: f64,
        gap_centers: Vec<f64>,
        gap_widths: Vec<f64>,
    ) -> Result<(), JsError> {
        if gap_centers.len() != gap_widths.len() {
            return Err(JsError::new(
                "gap arrays must have the same length (one width per gap center)",
            ));
        }
        let gaps: Vec<Gap> = gap_centers
            .into_iter()
            .zip(gap_widths)
            .map(|(center_y, width)| Gap { center_y, width })
            .collect();
        self.v = wall(&self.grid, x_center, thickness, value, &gaps);
        self.base_v = wall(&self.grid, x_center, thickness, value, &gaps);
        self.potential_version += 1;
        Ok(())
    }

    /// Rolls every paint op back: `v` <- `base_v`, the last potential
    /// installed by a setter. Does not touch the wavefunction. Bumps
    /// `potential_version` by 1 (the samples change, so caches must not).
    pub fn restore_potential(&mut self) {
        self.v.values_mut().copy_from_slice(self.base_v.values());
        self.potential_version += 1;
    }

    /// Brush disc: SETs `V[k] = value` (absolute, not added) at every grid
    /// point with `dist((x, y), (cx, cy)) < r` — the same half-open window
    /// convention as every core builder, so points exactly on the circle
    /// stay outside. Erasing is `paint_disc(.., 0.0)`. Paint never touches
    /// the restore base. Bumps `potential_version` by 1.
    ///
    /// # Errors
    ///
    /// `JsError` when `r` is not finite or `r <= 0`.
    pub fn paint_disc(&mut self, cx: f64, cy: f64, r: f64, value: f64) -> Result<(), JsError> {
        if !r.is_finite() || r <= 0.0 {
            return Err(JsError::new("r must be finite and > 0"));
        }
        // dist^2 < r^2 is equivalent to dist < r (both sides non-negative)
        // and skips a sqrt per grid point.
        let r2 = r * r;
        self.paint_where(
            |x, y| {
                let dx = x - cx;
                let dy = y - cy;
                dx * dx + dy * dy < r2
            },
            value,
        );
        Ok(())
    }

    /// Brush stroke: SETs `V[k] = value` (absolute, not added) at every
    /// grid point whose distance to the segment
    /// `(x1, y1) -> (x2, y2)` is `< thickness / 2` — a capsule of radius
    /// `thickness / 2` around the segment, with rounded caps (the clamped
    /// projection of [`point_segment_distance`]). Paint never touches the
    /// restore base. Bumps `potential_version` by 1.
    ///
    /// # Errors
    ///
    /// `JsError` when `thickness` is not finite or `thickness <= 0`.
    pub fn paint_segment(
        &mut self,
        x1: f64,
        y1: f64,
        x2: f64,
        y2: f64,
        thickness: f64,
        value: f64,
    ) -> Result<(), JsError> {
        if !thickness.is_finite() || thickness <= 0.0 {
            return Err(JsError::new("thickness must be finite and > 0"));
        }
        let half = thickness / 2.0;
        self.paint_where(
            |x, y| point_segment_distance(x, y, x1, y1, x2, y2) < half,
            value,
        );
        Ok(())
    }

    /// SETs `V[k] = value` at every grid point whose coordinates satisfy
    /// `inside`, leaving all other samples untouched, and bumps
    /// `potential_version` by exactly 1 — the shared body of both brush
    /// ops. In-place through [`Potential2D::values_mut`]; `base_v` is never
    /// touched, so [`restore_potential`](Self::restore_potential) stays
    /// meaningful.
    fn paint_where(&mut self, inside: impl Fn(f64, f64) -> bool, value: f64) {
        let vals = self.v.values_mut();
        for j in 0..self.grid.ny() {
            let y = self.grid.y(j);
            for i in 0..self.grid.nx() {
                if inside(self.grid.x(i), y) {
                    vals[self.grid.index(i, j)] = value;
                }
            }
        }
        self.potential_version += 1;
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
    /// by exactly 1 on every `V` mutation (the setters, the paint ops, and
    /// `restore_potential`), so a renderer can cache potential textures and
    /// re-upload only when the counter moves. `advance`, `set_gaussian`, and
    /// `reset_wave` never touch it.
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

    // ---- potential setters + paint ops (Task 14) ----

    /// Grid coordinates of flat index `k` (row-major, x-fastest), rebuilt
    /// from the reference-grid constants so the geometry assertions below
    /// recompute the shapes independently of the implementation.
    fn xy(k: usize) -> (f64, f64) {
        const DX: f64 = EXTENT_X / NX as f64;
        const DY: f64 = EXTENT_Y / NY as f64;
        (
            (k % NX) as f64 * DX - EXTENT_X / 2.0,
            (k / NX) as f64 * DY - EXTENT_Y / 2.0,
        )
    }

    /// Inclusive `(start, end)` runs of `value` in `values` — the same run
    /// helper shape as the core potential suite.
    fn runs(values: &[f32], value: f32) -> Vec<(usize, usize)> {
        let mut out = Vec::new();
        let mut start: Option<usize> = None;
        for (i, &v) in values.iter().enumerate() {
            if v == value {
                if start.is_none() {
                    start = Some(i);
                }
            } else if let Some(s) = start.take() {
                out.push((s, i - 1));
            }
        }
        if let Some(s) = start {
            out.push((s, values.len() - 1));
        }
        out
    }

    #[wasm_bindgen_test]
    fn paint_disc_sets_absolute_values_inside_half_open_disc() {
        // dx = dy = 0.625 (exact), so grid coordinates are multiples of
        // 0.625. Hand count of {(x, y) : x^2 + y^2 < 4}: columns |x| < 2 are
        // x in {0, +-0.625, +-1.25, +-1.875}; per column the y-count is
        // |x|=0 -> 7 (|y| <= 1.875), 0.625 -> 7 (1.875^2 < 4 - 0.625^2),
        // 1.25 -> 5 (1.25^2 < 4 - 1.25^2), 1.875 -> 3 (0.625^2 < 4 - 1.875^2
        // but 1.25^2 is not) -> 7 + 2*(7 + 5 + 3) = 37.
        let inside = {
            let mut sim = sim();
            sim.paint_disc(0.0, 0.0, 2.0, 5.0)
                .expect("r = 2 is finite and positive");
            assert_eq!(sim.potential_version(), 1, "one paint = one version bump");
            let v = sim.read_potential_f32().to_vec();
            let mut inside = 0;
            for (k, &val) in v.iter().enumerate() {
                let (x, y) = xy(k);
                if x * x + y * y < 4.0 {
                    inside += 1;
                    assert_eq!(val, 5.0, "inside point ({x}, {y})");
                } else {
                    assert_eq!(val, 0.0, "outside point ({x}, {y})");
                }
            }
            inside
        };
        assert_eq!(inside, 37, "hand-computed disc point count");

        // Half-open edge made observable: with r = 1.25 the four points
        // (0, +-1.25), (+-1.25, 0) sit exactly ON the circle and must stay
        // outside. Inside: center + 4 axis points at 0.625 + 4 diagonals at
        // (0.625, 0.625) -> 9.
        let inside = {
            let mut sim = sim();
            sim.paint_disc(0.0, 0.0, 1.25, 3.0)
                .expect("r = 1.25 is finite and positive");
            let v = sim.read_potential_f32().to_vec();
            let mut inside = 0;
            for (k, &val) in v.iter().enumerate() {
                let (x, y) = xy(k);
                if x * x + y * y < 1.5625 {
                    inside += 1;
                    assert_eq!(val, 3.0, "inside point ({x}, {y})");
                } else {
                    assert_eq!(val, 0.0, "outside point ({x}, {y})");
                }
            }
            inside
        };
        assert_eq!(inside, 9, "hand-computed disc point count");
    }

    #[wasm_bindgen_test]
    fn paint_sets_overwrites_harmonic_instead_of_adding() {
        // Decision-flag ruling: paint SETS the absolute value inside the
        // shape; it never adds. Painting 0 over a harmonic background (the
        // eraser workflow) leaves exactly 0 inside and the untouched
        // harmonic outside.
        let mut sim = sim();
        sim.potential_harmonic(1.0);
        assert_eq!(sim.potential_version(), 1);
        let harmonic = sim.read_potential_f32().to_vec();
        // Corner (x, y) = (-20, -20): V = 0.5 * (400 + 400) = 400; center 0.
        assert_eq!(harmonic[0], 400.0);
        assert_eq!(harmonic[32 * NX + 32], 0.0);

        sim.paint_disc(0.0, 0.0, 2.0, 0.0).expect("valid disc op");
        let erased = sim.read_potential_f32().to_vec();
        for (k, (&was, &now)) in harmonic.iter().zip(&erased).enumerate() {
            let (x, y) = xy(k);
            let expected: f32 = if x * x + y * y < 4.0 { 0.0 } else { was };
            assert_eq!(now, expected, "point ({x}, {y})");
        }
    }

    #[wasm_bindgen_test]
    fn paint_segment_creates_capsule_band_of_exact_point_count() {
        // Segment (-5, 0) -> (5, 0), thickness 2 (capsule radius 1). Hand
        // count: rows |y| < 1 are y in {0, +-0.625}. On y = 0 the capsule
        // covers x in (-6.25, 6.25): 19 points (-5.625 ..= 5.625, the last
        // 0.625 coming from each rounded cap). Each of y = +-0.625 covers
        // the same 19 points (cap corner sqrt(2) * 0.625 < 1). Total 3*19
        // = 57.
        let mut sim = sim();
        sim.paint_segment(-5.0, 0.0, 5.0, 0.0, 2.0, 7.0)
            .expect("thickness = 2 is finite and positive");
        assert_eq!(sim.potential_version(), 1);
        let v = sim.read_potential_f32().to_vec();
        let mut band = 0;
        for (k, &val) in v.iter().enumerate() {
            let (x, y) = xy(k);
            if val == 7.0 {
                band += 1;
            } else {
                assert_eq!(val, 0.0, "outside point ({x}, {y})");
            }
        }
        assert_eq!(band, 57, "hand-computed capsule point count");
        // Spot checks, flat indices from x(i) = -20 + 0.625 i:
        // axis interior, cap point, cap corner, first point past the cap,
        // and the nearest row above the band.
        let at = |x: f64, y: f64| -> usize {
            let i = ((x + 20.0) / 0.625) as usize;
            let j = ((y + 20.0) / 0.625) as usize;
            j * NX + i
        };
        assert_eq!(v[at(0.0, 0.0)], 7.0);
        assert_eq!(v[at(-5.625, 0.0)], 7.0);
        assert_eq!(v[at(5.625, 0.625)], 7.0);
        assert_eq!(v[at(-6.25, 0.0)], 0.0);
        assert_eq!(v[at(0.0, 1.25)], 0.0);
    }

    #[wasm_bindgen_test]
    fn potential_wall_with_two_gaps_shows_three_runs() {
        // Wall band |x| < 0.625 is exactly the column x = 0 (i = 32); gaps
        // centered at y = -+5.625 with width 1.875 open y in (-6.5625,
        // -4.6875) and (4.6875, 6.5625), i.e. rows j in {22, 23, 24} and
        // {40, 41, 42}. The x = 0 column therefore shows 3 runs of wall.
        let mut sim = sim();
        sim.potential_wall(0.0, 1.25, 7.5, vec![-5.625, 5.625], vec![1.875, 1.875])
            .expect("parallel gap arrays of equal length");
        assert_eq!(sim.potential_version(), 1);
        let v = sim.read_potential_f32().to_vec();
        let col: Vec<f32> = (0..NY).map(|j| v[j * NX + 32]).collect();
        assert_eq!(runs(&col, 7.5), vec![(0, 21), (25, 39), (43, 63)]);
        assert_eq!(col[23], 0.0, "inside the lower gap");
        assert_eq!(col[41], 0.0, "inside the upper gap");
        assert_eq!(col[22], 0.0);
        assert_eq!(col[24], 0.0);
    }

    #[wasm_bindgen_test]
    fn restore_potential_returns_to_the_last_set_background() {
        let mut sim = sim();
        sim.potential_harmonic(1.0);
        assert_eq!(sim.potential_version(), 1);
        let harmonic = sim.read_potential_f32().to_vec();

        sim.paint_disc(0.0, 0.0, 2.0, 5.0).expect("valid disc op");
        assert_eq!(sim.potential_version(), 2);
        assert_ne!(sim.read_potential_f32().to_vec(), harmonic);
        sim.restore_potential();
        assert_eq!(sim.potential_version(), 3);
        assert_eq!(sim.read_potential_f32().to_vec(), harmonic);

        // The base survives further painting and a second restore.
        sim.paint_segment(-5.0, 0.0, 5.0, 0.0, 2.0, 9.0)
            .expect("valid segment op");
        assert_eq!(sim.potential_version(), 4);
        sim.restore_potential();
        assert_eq!(sim.potential_version(), 5);
        assert_eq!(sim.read_potential_f32().to_vec(), harmonic);
    }

    #[wasm_bindgen_test]
    fn potential_zero_clears_both_v_and_base() {
        let mut sim = sim();
        sim.potential_harmonic(1.0);
        sim.potential_zero();
        assert_eq!(sim.potential_version(), 2);
        let v = sim.read_potential_f32().to_vec();
        assert!(v.iter().all(|&x| x == 0.0));
        // base_v was cleared too: restoring keeps the zeros.
        sim.restore_potential();
        assert_eq!(sim.read_potential_f32().to_vec(), v);
    }

    #[wasm_bindgen_test]
    fn every_potential_op_bumps_version_exactly_once_and_others_never() {
        let mut sim = sim();
        set_reference_packet(&mut sim);
        assert_eq!(sim.potential_version(), 0);
        sim.advance(10).expect("valid state stays valid");
        assert_eq!(sim.potential_version(), 0, "advance never bumps version");
        sim.reset_wave();
        assert_eq!(sim.potential_version(), 0, "reset_wave never bumps version");
        sim.set_gaussian(0.0, 0.0, 0.0, 0.0, 1.5, 1.5)
            .expect("packet parameters are valid");
        assert_eq!(
            sim.potential_version(),
            0,
            "set_gaussian never bumps version"
        );

        sim.potential_zero();
        assert_eq!(sim.potential_version(), 1);
        sim.potential_harmonic(1.0);
        assert_eq!(sim.potential_version(), 2);
        sim.potential_wall(0.0, 1.25, 5.0, vec![], vec![])
            .expect("empty gap arrays are parallel");
        assert_eq!(sim.potential_version(), 3);
        sim.paint_disc(0.0, 0.0, 2.0, 5.0).expect("valid disc op");
        assert_eq!(sim.potential_version(), 4);
        sim.paint_segment(0.0, 0.0, 1.0, 1.0, 1.0, 5.0)
            .expect("valid segment op");
        assert_eq!(sim.potential_version(), 5);
        sim.restore_potential();
        assert_eq!(sim.potential_version(), 6);
        sim.advance(10).expect("valid state stays valid");
        assert_eq!(sim.potential_version(), 6);
    }

    #[wasm_bindgen_test]
    fn invalid_paint_and_wall_arguments_error_without_bumping_version() {
        let mut sim = sim();

        let err = sim.paint_disc(0.0, 0.0, 0.0, 5.0).unwrap_err();
        assert!(format!("{err:?}").contains('r'), "message should mention r");
        let err = sim.paint_disc(0.0, 0.0, f64::NAN, 5.0).unwrap_err();
        assert!(format!("{err:?}").contains('r'));
        let err = sim
            .paint_segment(0.0, 0.0, 1.0, 0.0, -1.0, 5.0)
            .unwrap_err();
        assert!(
            format!("{err:?}").contains("thickness"),
            "message should mention thickness"
        );
        let err = sim
            .paint_segment(0.0, 0.0, 1.0, 0.0, f64::INFINITY, 5.0)
            .unwrap_err();
        assert!(format!("{err:?}").contains("thickness"));
        let err = sim
            .potential_wall(0.0, 1.0, 5.0, vec![0.0], vec![])
            .unwrap_err();
        let msg = format!("{err:?}");
        assert!(
            msg.contains("gap arrays"),
            "message should mention gap arrays: {msg}"
        );
        assert_eq!(
            sim.potential_version(),
            0,
            "rejected ops must not touch the version"
        );
    }

    /// Decision-flag ruling "paint while running": painting a tall wall in
    /// front of a moving packet between two `advance` batches takes effect
    /// on the very next step, blocks the packet, and leaves the norm intact.
    #[wasm_bindgen_test]
    fn painting_a_wall_while_running_blocks_the_packet() {
        // Dedicated 64 x 64 box spanning [-10, 10)^2 (dx = 0.3125, so the
        // Nyquist wavenumber is ~10): the packet's momentum spread stays an
        // order of magnitude inside the resolvable band, which the coarse
        // [-20, 20) reference grid cannot offer for this collision speed.
        let mut sim = Simulation2D::new(NX, NY, 20.0, 20.0, DT, M, HBAR)
            .expect("dedicated box parameters are valid");
        // Packet at x = -5 moving right with kx = 4 (E = 8), sigma = 1.
        sim.set_gaussian(-5.0, 0.0, 4.0, 0.0, 1.0, 1.0)
            .expect("packet parameters are valid");
        sim.advance(50).expect("valid state stays valid");
        assert_eq!(sim.potential_version(), 0, "advance alone keeps version 0");
        // After t = 0.25 the center sits at x ~ -4. A full-height wall of
        // value 100 (>> E = 8) painted across x in (-0.78125, 0.78125) — the
        // 5 columns i = 30..=34 — stands ~3 sigma ahead of the packet. A
        // free packet would put ~35% of its probability past this wall by
        // t = 1.25; a blocked one must leave ~nothing there.
        sim.paint_segment(0.0, -10.0, 0.0, 10.0, 1.5625, 100.0)
            .expect("valid segment op");
        assert_eq!(sim.potential_version(), 1);
        sim.advance(200).expect("valid state stays valid");
        assert_eq!(
            sim.potential_version(),
            1,
            "advance alone keeps the version"
        );

        let drift = (sim.norm() - 1.0).abs();
        assert!(
            drift <= 1e-10,
            "|norm - 1| = {drift} after painting mid-run"
        );

        // Total probability strictly right of the wall (x > 0.78125, i.e.
        // flat columns i >= 35) must be negligible: the packet was blocked.
        let v = sim.density_phase().to_vec();
        let d_area = (20.0 / NX as f64) * (20.0 / NY as f64);
        let right: f64 = v
            .chunks(2)
            .enumerate()
            .filter(|&(k, _)| k % NX >= 35)
            .map(|(_, pair)| pair[0] as f64)
            .sum::<f64>()
            * d_area;
        assert!(
            right < 1e-3,
            "total rho right of the wall = {right}, gate is 1e-3"
        );
    }
}
