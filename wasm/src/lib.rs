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

use js_sys::{Float32Array, Float64Array, Object, Reflect};
use psiforge_core::error::CoreError;
use psiforge_core::grid::Grid2D;
use psiforge_core::measurement::{
    collapse_momentum, collapse_position, sample_momentum, sample_position,
};
use psiforge_core::num_complex::Complex64;
use psiforge_core::observables::{momentum_grid_2d, observables_snapshot_2d};
use psiforge_core::potential::{Gap, Potential2D, harmonic2d, wall};
use psiforge_core::propagator::{Propagator, SplitOperator2D};
use psiforge_core::states::gaussian_2d;
use psiforge_core::wavefunction::Wavefunction2D;
use wasm_bindgen::JsCast;
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

/// Instrument resolution of a position measurement, in grid cells:
/// `sigma_inst = SIGMA_INST_CELLS * dx`, the width of the Gaussian
/// point-spread function [`Simulation2D::measure_position`] collapses the
/// wavefunction onto.
const SIGMA_INST_CELLS: f64 = 3.0;

/// Instrument resolution of a momentum measurement, in k bins:
/// `sigma_k = SIGMA_K_BINS * dk` with `dk = 2*pi / (nx*dx)` the bin spacing
/// of the **x-axis** wavenumber grid (the documented convention; the
/// reference grid has `dx = dy`, so both axes share the same spacing). This
/// is the width of the k-space Gaussian
/// [`Simulation2D::measure_momentum`] collapses onto.
const SIGMA_K_BINS: f64 = 3.0;

/// Builds `{ key: value, ... }` from the given pairs. Setting a property on
/// a fresh plain object cannot throw (it has no setters, is not frozen, and
/// is not a proxy), so the `Reflect::set` result is unwrapped with that
/// justification.
fn js_object(fields: &[(&str, JsValue)]) -> JsValue {
    let obj = Object::new();
    for (key, value) in fields {
        Reflect::set(&obj, &JsValue::from_str(key), value)
            .expect("setting a field of a fresh plain object cannot throw");
    }
    obj.into()
}

/// Reads `state[key]` as a finite number for
/// [`Simulation2D::deserialize_state`].
///
/// # Errors
///
/// "invalid state" mentioning the field when it is missing or not a number
/// (`undefined`, arrays, objects), when it is a non-finite number (NaN,
/// +/-infinity), or when reading it throws — `Reflect::get` on the
/// caller-supplied object runs arbitrary code, and a throwing getter or
/// proxy trap surfaces here as an error, never a panic.
fn state_number(state: &JsValue, key: &str) -> Result<f64, JsError> {
    let n = Reflect::get(state, &JsValue::from_str(key))
        .map_err(|_| JsError::new(&format!("invalid state: reading field '{key}' threw")))?
        .as_f64()
        .ok_or_else(|| {
            JsError::new(&format!(
                "invalid state: field '{key}' is missing or not a number"
            ))
        })?;
    if !n.is_finite() {
        return Err(JsError::new(&format!(
            "invalid state: field '{key}' is not finite"
        )));
    }
    Ok(n)
}

/// Largest grid axis a state may declare: `floor(sqrt(u32::MAX / 2))`, so
/// that with both `nx` and `ny` at the cap the sample-count products
/// `nx * ny` and `2 * nx * ny` still fit `usize` even on wasm32, where
/// `usize` is 32-bit (`2 * 46340^2 = 4294791200 < 2^32`). Still far beyond
/// any addressable grid — the reference grid is 64 x 64.
const MAX_GRID_AXIS: f64 = 46340.0;

/// Reads `state[key]` as a non-negative integer (`nx`, `ny`) for
/// [`Simulation2D::deserialize_state`].
///
/// # Errors
///
/// "invalid state" mentioning the field when it fails
/// [`state_number`]'s contract, or when it is negative, fractional, or
/// larger than [`MAX_GRID_AXIS`] (which keeps the sample-count arithmetic
/// that follows overflow-free on every target).
fn state_index(state: &JsValue, key: &str) -> Result<usize, JsError> {
    let n = state_number(state, key)?;
    if n.fract() != 0.0 || !(0.0..=MAX_GRID_AXIS).contains(&n) {
        return Err(JsError::new(&format!(
            "invalid state: field '{key}' must be an integer in [0, {MAX_GRID_AXIS}]"
        )));
    }
    Ok(n as usize)
}

/// Reads `state[key]` as a copied `Float32Array` (`psi`, `potential`) for
/// [`Simulation2D::deserialize_state`].
///
/// # Errors
///
/// "invalid state" mentioning the field when it is missing, not a
/// `Float32Array`, or its read throws (getter / proxy trap — same contract
/// as [`state_number`], never a panic).
fn state_f32_array(state: &JsValue, key: &str) -> Result<Vec<f32>, JsError> {
    let value = Reflect::get(state, &JsValue::from_str(key))
        .map_err(|_| JsError::new(&format!("invalid state: reading field '{key}' threw")))?;
    let array = value.dyn_ref::<Float32Array>().ok_or_else(|| {
        JsError::new(&format!(
            "invalid state: field '{key}' is missing or not a Float32Array"
        ))
    })?;
    Ok(array.to_vec())
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

    // ---- observables, measurement, state serialization (Task 5) ----

    /// All per-frame observables in one call: a `Float64Array` of exactly 11
    /// values in the documented order
    ///
    /// ```text
    /// [x, y, sigma_x, sigma_y, px, py, sigma_px, sigma_py, kinetic, potential, energy]
    /// ```
    ///
    /// i.e. `[<x>, <y>, sx, sy, <px>, <py>, spx, spy, <T>, <V>, <E>]`:
    /// position means and uncertainties (`dA = dx*dy` Riemann sums),
    /// momentum means and uncertainties (ratio form in k-space, immune to
    /// the FFT normalization), and the kinetic, potential, and total energy
    /// against the current sampled `V`. Everything comes from one core
    /// `observables_snapshot_2d` call — a **single** forward 2D FFT serves
    /// every momentum quantity (the per-bin momentum density that the same
    /// pass also produces is simply not shipped here; see
    /// [`momentum_density`](Self::momentum_density)).
    pub fn observables(&self) -> Float64Array {
        let snap = observables_snapshot_2d(&self.wf, &self.v);
        let m = &snap.moments;
        Float64Array::new_from_slice(&[
            m.x,
            m.y,
            m.sigma_x,
            m.sigma_y,
            m.px,
            m.py,
            m.sigma_px,
            m.sigma_py,
            snap.kinetic,
            snap.potential,
            snap.energy,
        ])
    }

    /// Momentum-space probability density `|phi(k)|^2` as `f32`: one value
    /// per DFT bin, row-major with `kx` fastest (flat bin `j*nx + i`), in
    /// **native fftfreq order** — not fftshifted; the renderer applies any
    /// shift itself. Scaled by `dA^2/(2*pi)^2` so that
    /// `sum density * dkx * dky = 1` exactly (discrete Parseval), with
    /// `dkx = 2*pi/(nx*dx)` and `dky = 2*pi/(ny*dy)`.
    ///
    /// Also computed through the single-FFT observables snapshot: the
    /// density is a free by-product of the same one FFT pass that feeds
    /// [`observables`](Self::observables).
    pub fn momentum_density(&self) -> Float32Array {
        let snap = observables_snapshot_2d(&self.wf, &self.v);
        Float32Array::new_from_slice(&snap.momentum_density)
    }

    /// Performs a Born-rule position measurement: samples the cell `(ix,
    /// iy)` with probability `|psi_k|^2` per equal-area cell, collapses the
    /// wavefunction onto the outcome by multiplying it with the instrument
    /// Gaussian of width `sigma_inst = SIGMA_INST_CELLS * dx`, renormalizes,
    /// and returns the object `{ix, iy, x, y}` — the integer cell indices
    /// plus their physical grid coordinates. Deterministic in `seed` (same
    /// seed, same outcome and successor state on every platform).
    ///
    /// # Errors
    ///
    /// `JsError` with the core's text when the total probability weight is
    /// zero or non-finite (e.g. the initial all-zero wavefunction) — raised
    /// by the sampler before anything is modified.
    pub fn measure_position(&mut self, seed: u64) -> Result<JsValue, JsError> {
        let (ix, iy) = sample_position(&self.wf, seed).map_err(core_to_js)?;
        let sigma_inst = SIGMA_INST_CELLS * self.grid.dx();
        collapse_position(&mut self.wf, ix, iy, sigma_inst).map_err(core_to_js)?;
        let (x, y) = (self.grid.x(ix), self.grid.y(iy));
        Ok(js_object(&[
            ("ix", JsValue::from(ix as u32)),
            ("iy", JsValue::from(iy as u32)),
            ("x", JsValue::from(x)),
            ("y", JsValue::from(y)),
        ]))
    }

    /// The k-space mirror of [`measure_position`](Self::measure_position):
    /// samples the DFT bin `(i, j)` with probability `|FFT2(psi)_k|^2` per
    /// bin (ratio form), collapses the wavefunction in momentum space with
    /// the k-space instrument Gaussian of width `sigma_k = SIGMA_K_BINS *
    /// dk` (`dk = 2*pi/(nx*dx)`, the x-axis bin spacing), renormalizes, and
    /// returns the object `{i, j, kx, ky}` — the integer bin indices plus
    /// those bins' wavenumbers from the core's fftfreq momentum grid
    /// (`kx = kx_grid[i]`, `ky = ky_grid[j]`; the momenta are `hbar*k`).
    /// Deterministic in `seed`.
    ///
    /// # Errors
    ///
    /// `JsError` with the core's text when the total probability weight is
    /// zero or non-finite — raised by the sampler before anything is
    /// modified.
    pub fn measure_momentum(&mut self, seed: u64) -> Result<JsValue, JsError> {
        let (i, j) = sample_momentum(&self.wf, seed).map_err(core_to_js)?;
        let dk = 2.0 * std::f64::consts::PI / (self.grid.nx() as f64 * self.grid.dx());
        let sigma_k = SIGMA_K_BINS * dk;
        collapse_momentum(&mut self.wf, i, j, sigma_k).map_err(core_to_js)?;
        let (kx_grid, ky_grid) = momentum_grid_2d(&self.grid);
        Ok(js_object(&[
            ("i", JsValue::from(i as u32)),
            ("j", JsValue::from(j as u32)),
            ("kx", JsValue::from(kx_grid[i])),
            ("ky", JsValue::from(ky_grid[j])),
        ]))
    }

    /// Serializes the whole scene state into a plain JS object
    ///
    /// ```text
    /// { nx, ny, extentX, extentY, dt, m, hbar, t,
    ///   potential: Float32Array (nx*ny), psi: Float32Array (2*nx*ny) }
    /// ```
    ///
    /// `potential` holds the current sampled `V` — paint ops included — and
    /// `psi` the wavefunction as interleaved `(re, im)` `f32` pairs, one
    /// pair per grid point, both in the row-major x-fastest order of
    /// [`density_phase`](Self::density_phase). The scalars let JS recreate a
    /// compatible simulation (`new Simulation2D(nx, ny, extentX, extentY,
    /// dt, m, hbar)`) before loading the state back through
    /// [`deserialize_state`](Self::deserialize_state).
    ///
    /// Pure: nothing in the simulation is modified. The `f32` transport
    /// quantizes the wavefunction to ~2^-23 relative per component; loading
    /// renormalizes to absorb the resulting norm drift (see
    /// [`deserialize_state`](Self::deserialize_state)).
    pub fn serialize_state(&self) -> JsValue {
        let mut psi = Vec::with_capacity(2 * self.wf.n_points());
        for &c in self.wf.psi() {
            psi.push(c.re as f32);
            psi.push(c.im as f32);
        }
        let potential: Vec<f32> = self.v.values().iter().map(|&x| x as f32).collect();
        js_object(&[
            ("nx", JsValue::from(self.grid.nx() as u32)),
            ("ny", JsValue::from(self.grid.ny() as u32)),
            (
                "extentX",
                JsValue::from(self.grid.xmax() - self.grid.xmin()),
            ),
            (
                "extentY",
                JsValue::from(self.grid.ymax() - self.grid.ymin()),
            ),
            ("dt", JsValue::from(self.dt)),
            ("m", JsValue::from(self.wf.m())),
            ("hbar", JsValue::from(self.wf.hbar())),
            ("t", JsValue::from(self.t)),
            ("potential", Float32Array::new_from_slice(&potential).into()),
            ("psi", Float32Array::new_from_slice(&psi).into()),
        ])
    }

    /// Restores a state object produced by
    /// [`serialize_state`](Self::serialize_state): validates everything
    /// first, and only then — atomically, with no partial mutation on
    /// failure — installs
    ///
    /// - `v` AND `base_v` from `potential`, so
    ///   [`restore_potential`](Self::restore_potential) keeps the loaded
    ///   potential (a load defines the new restore base),
    /// - `wf` from `psi` (deinterleaved `(re, im)` pairs), then
    ///   **renormalized**: the `f32` round trip leaves the squared norm
    ///   ~2e-9 off 1, which would trip the propagator's 1e-10 drift guard on
    ///   the very first post-load step,
    /// - the reset `snapshot` from the renormalized psi, so
    ///   [`reset_wave`](Self::reset_wave) returns to exactly the loaded
    ///   state,
    /// - `t`;
    ///
    /// and bumps `potential_version` by exactly 1. The grid, propagator,
    /// `dt`, `m`, and `hbar` of this simulation are NOT rebuilt: the caller
    /// must construct a matching simulation first (only `nx`/`ny` are
    /// enforced, because the sample arrays would not fit otherwise).
    ///
    /// # Errors
    ///
    /// A `JsError` whose message contains "dimension" for shape mismatches
    /// (`psi`/`potential` lengths against `2*nx*ny`/`nx*ny`, or a state grid
    /// other than this simulation's `nx x ny`) and "invalid" for a
    /// non-object argument, a field whose read throws (getter / proxy
    /// trap), missing or non-numeric/non-finite fields, and non-finite
    /// array samples. A rejected load leaves the simulation exactly as it
    /// was.
    pub fn deserialize_state(&mut self, state: &JsValue) -> Result<(), JsError> {
        if !state.is_object() {
            return Err(JsError::new(
                "invalid state: expected a state object from serialize_state",
            ));
        }
        // ---- validation: nothing mutates until every check has passed ----
        let (nx, ny) = (state_index(state, "nx")?, state_index(state, "ny")?);
        let psi = state_f32_array(state, "psi")?;
        if psi.len() != 2 * nx * ny {
            return Err(JsError::new(&format!(
                "dimension mismatch: psi has {} samples but 2*{nx}*{ny} = {} are required",
                psi.len(),
                2 * nx * ny
            )));
        }
        if nx != self.grid.nx() || ny != self.grid.ny() {
            return Err(JsError::new(&format!(
                "dimension mismatch: state grid is {nx}x{ny} but the simulation grid is {}x{}",
                self.grid.nx(),
                self.grid.ny()
            )));
        }
        let potential = state_f32_array(state, "potential")?;
        if potential.len() != nx * ny {
            return Err(JsError::new(&format!(
                "dimension mismatch: potential has {} samples but {nx}*{ny} = {} are required",
                potential.len(),
                nx * ny
            )));
        }
        // Informational scalars: not restored, but must be present and
        // finite so JS cannot round-trip a half-written state.
        for key in ["extentX", "extentY", "dt", "m", "hbar"] {
            state_number(state, key)?;
        }
        let t = state_number(state, "t")?;
        if psi.iter().any(|x| !x.is_finite()) {
            return Err(JsError::new(
                "invalid state: psi contains non-finite samples",
            ));
        }
        if potential.iter().any(|x| !x.is_finite()) {
            return Err(JsError::new(
                "invalid state: potential contains non-finite samples",
            ));
        }

        // ---- restore: every check passed, mutation is safe ----
        let potential_f64: Vec<f64> = potential.iter().map(|&x| x as f64).collect();
        let n = potential_f64.len();
        self.v = Potential2D::zeros(n);
        self.v.values_mut().copy_from_slice(&potential_f64);
        self.base_v = Potential2D::zeros(n);
        self.base_v.values_mut().copy_from_slice(&potential_f64);
        // psi.len() is validated even above, so the as_chunks remainder is
        // empty and every pair is a full (re, im) sample.
        let restored: Vec<Complex64> = psi
            .as_chunks::<2>()
            .0
            .iter()
            .map(|pair| Complex64::new(pair[0] as f64, pair[1] as f64))
            .collect();
        self.wf.psi_mut().copy_from_slice(&restored);
        // Renormalize (see doc comment), then snapshot the renormalized
        // state so reset_wave replays exactly what was loaded.
        self.wf.normalize();
        self.snapshot = self.wf.psi().to_vec();
        self.t = t;
        self.potential_version += 1;
        Ok(())
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

    // ---- observables, measurement, state serialization (Task 5) ----

    #[wasm_bindgen_test]
    fn observables_returns_11_documented_values() {
        let mut sim = sim();
        set_reference_packet(&mut sim);
        let obs = sim.observables().to_vec();
        assert_eq!(obs.len(), 11);
        assert!((obs[0] - 0.0).abs() < 1e-9, "<x> = {}", obs[0]); // x0 = 0
        assert!((obs[2] - 1.5).abs() < 1e-6, "sigma_x = {}", obs[2]); // sigma 1.5
        assert!((obs[4] - 2.0).abs() < 1e-9, "<px> = {}", obs[4]); // kx = 2
        assert!((obs[9] - 0.0).abs() < 1e-12, "<V> = {}", obs[9]); // V = 0
    }

    #[wasm_bindgen_test]
    fn momentum_density_parses_and_peaks_at_k() {
        let mut sim = sim();
        sim.set_gaussian(0.0, 0.0, 3.0, 0.0, 1.5, 1.5).unwrap();
        let d = sim.momentum_density().to_vec();
        assert_eq!(d.len(), NX * NY);
        let dk = 2.0 * std::f64::consts::PI / EXTENT_X;
        let total: f64 = d.iter().sum::<f32>() as f64 * dk * dk;
        assert!((total - 1.0).abs() < 1e-3, "sum = {total}");
    }

    #[wasm_bindgen_test]
    fn measure_position_collapses_and_keeps_norm() {
        // (Review Focus 2)
        let mut sim = sim();
        set_reference_packet(&mut sim);
        let before_sigma = sim.observables().to_vec()[2];
        let out = sim.measure_position(123).unwrap();
        let js: js_sys::Object = out.into();
        let ix = js_sys::Reflect::get(&js, &"ix".into())
            .unwrap()
            .as_f64()
            .unwrap() as usize;
        assert!(ix < NX);
        let norm = sim.norm();
        assert!((norm - 1.0).abs() < 1e-10, "norm = {norm}");
        let after_sigma = sim.observables().to_vec()[2];
        assert!(
            after_sigma < before_sigma,
            "sigma {after_sigma} < {before_sigma}"
        );
    }

    #[wasm_bindgen_test]
    fn measure_momentum_moves_p() {
        let mut sim = sim();
        set_reference_packet(&mut sim); // kx = 2
        sim.measure_momentum(7).unwrap();
        let obs = sim.observables().to_vec();
        assert!((sim.norm() - 1.0).abs() < 1e-10);
        // sau sập, |<px> - 2| nằm trong vài sigma_k
        assert!((obs[4] - 2.0).abs() < 0.5, "<px> = {}", obs[4]);
    }

    /// Channel-wise comparison of two `density_phase` buffers at f32
    /// quantization scale: rho at even indices, phi at odd ones.
    ///
    /// psi travels through a serialized state as `f32 (re, im)` pairs, so a
    /// restored state can differ from the pre-serialize f64 state by double
    /// rounding (f64 -> f32 -> f64 -> f32, ~2^-23 relative per component) —
    /// bit-exact equality is impossible by construction. Measured on the
    /// exact scenario below: 1771/4096 rho and 478/4096 phi values differ by
    /// 1-2 f32 ulps through the round trip, so each channel is gated at its
    /// quantization scale (rho values are O(1e-2), phi values O(1)).
    ///
    /// The gates stay tight enough to catch a re/im interleave swap (phi
    /// would jump by O(1) on most cells; rho is swap-invariant).
    fn assert_density_phase_close(actual: &[f32], expected: &[f32]) {
        assert_eq!(actual.len(), expected.len());
        for (k, (&a, &e)) in actual.iter().zip(expected).enumerate() {
            if k % 2 == 0 {
                assert!((a - e).abs() <= 1e-8, "rho[{k}]: {a} vs {e}");
            } else {
                assert!((a - e).abs() <= 1e-5, "phi[{k}]: {a} vs {e}");
            }
        }
    }

    #[wasm_bindgen_test]
    fn serialize_round_trip_restores_exact_state() {
        // Controller ruling (2026-09-30), deviating from the brief's
        // assert_eq! on density_phase: psi is transported as f32 (re, im)
        // per the ruling, which double-rounds and makes bit-exact equality
        // impossible (see assert_density_phase_close); deserialize
        // renormalizes, because a raw f32-restored state carries a ~2e-9
        // squared-norm drift that trips the propagator's 1e-10 guard on the
        // very first post-load step. The potential, t, and reset-snapshot
        // assertions stay exact.
        let mut sim = sim();
        sim.potential_wall(0.0, 1.25, 7.5, vec![-5.0, 5.0], vec![1.9, 1.9])
            .unwrap();
        set_reference_packet(&mut sim);
        sim.advance(25).unwrap();
        let state = sim.serialize_state();
        let psi_before = sim.density_phase().to_vec();
        let v_before = sim.read_potential_f32().to_vec();
        let t_before = sim.advance(0).unwrap();

        sim.advance(40).unwrap(); // chạy thêm cho khác đi
        sim.paint_disc(0.0, 0.0, 2.0, 3.0).unwrap();
        sim.deserialize_state(&state).unwrap();

        let after_load = sim.density_phase().to_vec();
        assert_density_phase_close(&after_load, &psi_before);
        assert_eq!(sim.read_potential_f32().to_vec(), v_before);
        assert_eq!(sim.advance(0).unwrap(), t_before);
        // Loading renormalizes: the norm is 1 again and the very next step
        // passes the propagator's guard.
        assert!(
            (sim.norm() - 1.0).abs() <= 1e-12,
            "norm = {} after load",
            sim.norm()
        );
        sim.advance(5).unwrap();
        // snapshot = psi lúc serialize (renormalized): reset replay lại đúng
        // các sample đã load — bit-exact, vì reset copy chính snapshot đó.
        sim.reset_wave();
        assert_eq!(sim.density_phase().to_vec(), after_load);
    }

    #[wasm_bindgen_test]
    fn deserialize_rejects_wrong_shapes_cleanly() {
        // (Review Focus 4)
        let mut sim = sim();
        let _valid_state = sim.serialize_state();
        // độ dài sai
        let bad = js_sys::Object::new();
        js_sys::Reflect::set(&bad, &"nx".into(), &wasm_bindgen::JsValue::from(NX)).unwrap();
        js_sys::Reflect::set(&bad, &"ny".into(), &wasm_bindgen::JsValue::from(NY)).unwrap();
        js_sys::Reflect::set(
            &bad,
            &"psi".into(),
            &js_sys::Float32Array::new_with_length(3).into(),
        )
        .unwrap();
        let err = sim.deserialize_state(&bad.into()).unwrap_err();
        assert!(format!("{err:?}").contains("dimension"), "{err:?}");
        // trạng thái sim không bị phá
        assert!((sim.norm() - 1.0).abs() < 1e-10 || sim.norm() == 0.0);
    }

    #[wasm_bindgen_test]
    fn deserialize_rejects_non_finite_and_missing_fields() {
        let mut sim = sim();
        set_reference_packet(&mut sim);

        // A non-finite scalar field.
        let bad = js_sys::Object::from(sim.serialize_state());
        js_sys::Reflect::set(&bad, &"t".into(), &wasm_bindgen::JsValue::from(f64::NAN)).unwrap();
        let err = sim.deserialize_state(&bad.into()).unwrap_err();
        assert!(format!("{err:?}").contains("invalid"), "{err:?}");

        // A missing array field.
        let bad = js_sys::Object::from(sim.serialize_state());
        js_sys::Reflect::set(&bad, &"psi".into(), &wasm_bindgen::JsValue::UNDEFINED).unwrap();
        let err = sim.deserialize_state(&bad.into()).unwrap_err();
        assert!(format!("{err:?}").contains("invalid"), "{err:?}");

        // Not an object at all.
        let err = sim
            .deserialize_state(&wasm_bindgen::JsValue::from(42.0))
            .unwrap_err();
        assert!(format!("{err:?}").contains("invalid"), "{err:?}");

        // A state from a different grid geometry is a dimension error.
        let bad = js_sys::Object::from(sim.serialize_state());
        js_sys::Reflect::set(&bad, &"nx".into(), &wasm_bindgen::JsValue::from(32u32)).unwrap();
        let err = sim.deserialize_state(&bad.into()).unwrap_err();
        assert!(format!("{err:?}").contains("dimension"), "{err:?}");

        // None of the rejected loads touched the simulation.
        assert_eq!(sim.potential_version(), 0);
        assert!((sim.norm() - 1.0).abs() < 1e-10);
    }

    #[wasm_bindgen_test]
    fn deserialize_bumps_version_once_and_loads_wall_as_restore_base() {
        let mut sim = sim();
        sim.potential_wall(0.0, 1.25, 7.5, vec![-5.0, 5.0], vec![1.9, 1.9])
            .unwrap();
        assert_eq!(sim.potential_version(), 1);
        let state = sim.serialize_state();
        sim.potential_zero();
        assert_eq!(sim.potential_version(), 2);
        sim.deserialize_state(&state).unwrap();
        assert_eq!(sim.potential_version(), 3, "exactly one bump per load");
        let v = sim.read_potential_f32().to_vec();
        assert!(v.contains(&7.5), "the wall came back");
        // base_v = the loaded potential too: restore_potential after a load
        // keeps the loaded wall instead of rolling back to pre-load setters.
        sim.restore_potential();
        assert_eq!(sim.potential_version(), 4);
        assert_eq!(sim.read_potential_f32().to_vec(), v);
    }

    #[wasm_bindgen_test]
    fn deserialize_maps_throwing_getters_to_errors_without_touching_state() {
        // Fix round 1 (finding 1): Reflect::get on the caller-supplied state
        // runs arbitrary JS — a throwing accessor (or a proxy trap) must
        // surface as a JsError mentioning "invalid", never as a wasm trap
        // from an .expect(). Both read paths are covered: a scalar field
        // (nx, via state_number) and an array field (psi, via
        // state_f32_array).
        let mut sim = sim();
        set_reference_packet(&mut sim);
        let before = sim.density_phase().to_vec();

        let bad = js_sys::eval("({ get nx() { throw new Error('boom'); } })")
            .expect("eval of an object literal is valid");
        let err = sim.deserialize_state(&bad).unwrap_err();
        let msg = format!("{err:?}");
        assert!(msg.contains("invalid"), "{msg}");

        let bad = js_sys::eval("({ nx: 64, ny: 64, get psi() { throw new Error('boom'); } })")
            .expect("eval of an object literal is valid");
        let err = sim.deserialize_state(&bad).unwrap_err();
        let msg = format!("{err:?}");
        assert!(msg.contains("invalid"), "{msg}");

        // Neither rejected load touched the simulation.
        assert_eq!(sim.potential_version(), 0);
        assert_eq!(sim.density_phase().to_vec(), before);
    }

    #[wasm_bindgen_test]
    fn deserialize_rejects_oversized_grid_axes_without_overflow() {
        // Fix round 1 (finding 2): usize is 32-bit on wasm32, so crafted
        // nx = ny = 50000 would make 2*nx*ny overflow (debug panic / release
        // wrap) under the old 1e8 axis cap. The MAX_GRID_AXIS cap must
        // reject them as "invalid" before any arithmetic, and the boundary
        // case nx = ny = 46340 must reach the ordinary "dimension" length
        // check with 2*nx*ny still inside u32.
        let mut sim = sim();
        set_reference_packet(&mut sim);
        let before = sim.density_phase().to_vec();

        let bad = js_sys::Object::new();
        js_sys::Reflect::set(&bad, &"nx".into(), &wasm_bindgen::JsValue::from(50000u32)).unwrap();
        js_sys::Reflect::set(&bad, &"ny".into(), &wasm_bindgen::JsValue::from(50000u32)).unwrap();
        js_sys::Reflect::set(
            &bad,
            &"psi".into(),
            &js_sys::Float32Array::new_with_length(3).into(),
        )
        .unwrap();
        let err = sim.deserialize_state(&bad.into()).unwrap_err();
        let msg = format!("{err:?}");
        assert!(msg.contains("invalid"), "{msg}");

        // Boundary: both axes at MAX_GRID_AXIS pass state_index, so the
        // psi-length product 2*46340*46340 is actually evaluated on wasm32
        // usize — it must compare cleanly into a "dimension" error.
        let bad = js_sys::Object::new();
        js_sys::Reflect::set(&bad, &"nx".into(), &wasm_bindgen::JsValue::from(46340u32)).unwrap();
        js_sys::Reflect::set(&bad, &"ny".into(), &wasm_bindgen::JsValue::from(46340u32)).unwrap();
        js_sys::Reflect::set(
            &bad,
            &"psi".into(),
            &js_sys::Float32Array::new_with_length(3).into(),
        )
        .unwrap();
        let err = sim.deserialize_state(&bad.into()).unwrap_err();
        let msg = format!("{err:?}");
        assert!(msg.contains("dimension"), "{msg}");

        // Neither rejected load touched the simulation.
        assert_eq!(sim.potential_version(), 0);
        assert_eq!(sim.density_phase().to_vec(), before);
    }
}
