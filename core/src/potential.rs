//! Spatial potential energy sampled on a [`Grid1D`] or a
//! [`Grid2D`](crate::grid::Grid2D).

use crate::error::{CoreError, Result};
use crate::grid::{Grid1D, Grid2D};

/// Potential energy `V(x)` sampled on a grid: one `f64` per grid point, so
/// `values.len()` equals the grid's `n`. `V = 0` everywhere is the free
/// particle.
///
/// Potentials are stored as plain sampled arrays rather than analytic
/// closures: the analytic forms below ([`harmonic`], [`finite_well`],
/// [`barrier`], [`well_chain`]) are just builders that fill a `Vec<f64>`
/// once, and hand-drawn potentials in later milestones are arrays too.
/// Mixing two potentials (e.g. an analytic background plus a hand-drawn
/// perturbation) is the elementwise [`Potential::add`].
pub struct Potential {
    values: Vec<f64>,
}

impl Potential {
    /// The free-particle potential: `n` zero samples.
    pub fn zeros(n: usize) -> Self {
        Self {
            values: vec![0.0; n],
        }
    }

    /// The sampled values, one per grid point.
    pub fn values(&self) -> &[f64] {
        &self.values
    }

    /// Number of samples (equals the grid's `n`).
    pub fn len(&self) -> usize {
        self.values.len()
    }

    /// Whether there are no samples.
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// Elementwise sum `self + other` — how two sampled potentials compose
    /// (e.g. an analytic background plus a hand-drawn perturbation).
    ///
    /// # Errors
    ///
    /// [`CoreError::DimensionMismatch`] when the two potentials have
    /// different lengths, i.e. they live on different grids.
    pub fn add(&self, other: &Potential) -> Result<Potential> {
        if self.len() != other.len() {
            return Err(CoreError::DimensionMismatch {
                expected: self.len(),
                got: other.len(),
            });
        }
        let values = self
            .values
            .iter()
            .zip(&other.values)
            .map(|(a, b)| a + b)
            .collect();
        Ok(Potential { values })
    }
}

/// Harmonic oscillator potential, `V(x_i) = 1/2 * m * omega^2 * x_i^2`.
pub fn harmonic(grid: &Grid1D, m: f64, omega: f64) -> Potential {
    let values = (0..grid.n())
        .map(|i| {
            let x = grid.x(i);
            0.5 * m * omega * omega * x * x
        })
        .collect();
    Potential { values }
}

/// Rectangular-window convention used by every windowed builder
/// ([`finite_well`], [`barrier`], [`well_chain`]): `x` is *inside* the
/// window exactly when `|x - center| < width / 2`. The interval is
/// half-open — a point exactly on the boundary is *outside*.
fn inside_window(x: f64, center: f64, width: f64) -> bool {
    (x - center).abs() < width / 2.0
}

/// Finite square well: `V = -depth` inside the window (`|x - center| <
/// width / 2`), `V = 0` outside.
pub fn finite_well(grid: &Grid1D, center: f64, width: f64, depth: f64) -> Potential {
    let values = (0..grid.n())
        .map(|i| {
            if inside_window(grid.x(i), center, width) {
                -depth
            } else {
                0.0
            }
        })
        .collect();
    Potential { values }
}

/// Potential barrier: `V = +height` inside the window (`|x - center| <
/// width / 2`), `V = 0` outside.
pub fn barrier(grid: &Grid1D, center: f64, width: f64, height: f64) -> Potential {
    let values = (0..grid.n())
        .map(|i| {
            if inside_window(grid.x(i), center, width) {
                height
            } else {
                0.0
            }
        })
        .collect();
    Potential { values }
}

/// A chain of `count` identical [`finite_well`]-shaped wells (each of the
/// given `width` and `depth`) placed evenly with center-to-center spacing
/// `period`, the first centered at `xmin + period / 2`, so well `k` is
/// centered at `xmin + (k + 1/2) * period`.
///
/// Overlapping windows (when `period < width`) union like physical wells
/// would: a point inside any well gets `V = -depth`, not a doubled depth.
pub fn well_chain(grid: &Grid1D, count: usize, width: f64, depth: f64, period: f64) -> Potential {
    let mut values = Vec::with_capacity(grid.n());
    for i in 0..grid.n() {
        let x = grid.x(i);
        let inside_any = (0..count).any(|k| {
            let center = grid.xmin() + (k as f64 + 0.5) * period;
            inside_window(x, center, width)
        });
        values.push(if inside_any { -depth } else { 0.0 });
    }
    Potential { values }
}

/// Potential energy `V(x, y)` sampled on a 2D grid: one `f64` per grid
/// point, so `values.len()` equals the grid's `nx * ny`. `V = 0` everywhere
/// is the free particle.
///
/// The samples are laid out row-major (x-fastest), matching
/// [`Grid2D::index`](crate::grid::Grid2D::index): `values()[grid.index(i, j)]`
/// is `V` at the point `(grid.x(i), grid.y(j))`.
///
/// Like the 1D [`Potential`], potentials are stored as plain sampled arrays
/// rather than analytic closures: the analytic 2D builders below
/// ([`harmonic2d`], [`finite_well2d`], [`wall`]) just fill a `Vec<f64>`
/// once, and hand-drawn potentials in later milestones are arrays too.
/// Mixing two potentials (e.g. an analytic background plus a hand-drawn
/// perturbation) is the elementwise [`Potential2D::add`].
pub struct Potential2D {
    values: Vec<f64>,
}

impl Potential2D {
    /// The free-particle potential: `n` zero samples, one per grid point
    /// (`n = nx * ny` on a 2D grid).
    pub fn zeros(n: usize) -> Self {
        Self {
            values: vec![0.0; n],
        }
    }

    /// Wraps raw sampled values, no validation. Test support only: the
    /// analytic builders above cover the standard shapes, but tests that
    /// need arbitrary injected samples (e.g. the propagator's
    /// NaN-poisoned-potential guard test) still assemble their `Vec<f64>`
    /// by hand.
    #[cfg(test)]
    pub(crate) fn from_values(values: Vec<f64>) -> Self {
        Self { values }
    }

    /// The sampled values, one per grid point, row-major (x-fastest).
    pub fn values(&self) -> &[f64] {
        &self.values
    }

    /// Mutable access to the raw samples, no validation — the hand-drawn
    /// path: the wasm paint ops edit `V` in place (set absolute values
    /// inside a brush shape) instead of rebuilding through the analytic
    /// builders. Callers keep the row-major layout and sample count intact.
    pub fn values_mut(&mut self) -> &mut [f64] {
        &mut self.values
    }

    /// Number of samples (equals the grid's `nx * ny`).
    pub fn len(&self) -> usize {
        self.values.len()
    }

    /// Whether there are no samples.
    pub fn is_empty(&self) -> bool {
        self.values.is_empty()
    }

    /// Elementwise sum `self + other` — how two sampled potentials compose
    /// (e.g. an analytic background plus a hand-drawn perturbation).
    ///
    /// # Errors
    ///
    /// [`CoreError::DimensionMismatch`] when the two potentials have
    /// different lengths, i.e. they live on different grids. Same law as
    /// [`Potential::add`].
    pub fn add(&self, other: &Potential2D) -> Result<Potential2D> {
        if self.len() != other.len() {
            return Err(CoreError::DimensionMismatch {
                expected: self.len(),
                got: other.len(),
            });
        }
        let values = self
            .values
            .iter()
            .zip(&other.values)
            .map(|(a, b)| a + b)
            .collect();
        Ok(Potential2D { values })
    }
}

/// 2D harmonic oscillator potential, radial in the plane:
/// `V(x_i, y_j) = 1/2 * m * omega^2 * (x_i^2 + y_j^2)`. The 2D counterpart
/// of the 1D [`harmonic`].
pub fn harmonic2d(grid: &Grid2D, m: f64, omega: f64) -> Potential2D {
    let mut values = Vec::with_capacity(grid.nx() * grid.ny());
    for j in 0..grid.ny() {
        let y = grid.y(j);
        for i in 0..grid.nx() {
            let x = grid.x(i);
            values.push(0.5 * m * omega * omega * (x * x + y * y));
        }
    }
    Potential2D { values }
}

/// 2D finite square well: `V = -depth` inside the rectangle
/// `|x - cx| < wx / 2` AND `|y - cy| < wy / 2`, `V = 0` outside. Both axes
/// use the same half-open [`inside_window`] convention as the 1D builders,
/// so a point exactly on any rectangle edge is *outside*. (Named
/// `finite_well2d` to avoid clashing with the 1D [`finite_well`] in this
/// module.)
pub fn finite_well2d(grid: &Grid2D, cx: f64, cy: f64, wx: f64, wy: f64, depth: f64) -> Potential2D {
    let mut values = Vec::with_capacity(grid.nx() * grid.ny());
    for j in 0..grid.ny() {
        let in_y = inside_window(grid.y(j), cy, wy);
        for i in 0..grid.nx() {
            values.push(if in_y && inside_window(grid.x(i), cx, wx) {
                -depth
            } else {
                0.0
            });
        }
    }
    Potential2D { values }
}

/// A horizontal gap punched through a [`wall`]: the band
/// `|y - center_y| < width / 2` (the same half-open window convention as
/// every other builder — a point exactly on the band edge is *not* in the
/// gap) is left at `V = 0`, letting particles pass.
pub struct Gap {
    /// y-coordinate of the gap's center.
    pub center_y: f64,
    /// Full vertical extent of the gap; the open band spans
    /// `(center_y - width/2, center_y + width/2)`.
    pub width: f64,
}

/// A vertical wall of potential `value`: `V = value` where
/// `|x - x_center| < thickness / 2` AND the point does not fall inside any
/// of the `gaps` (each `|y - gap.center_y| < gap.width / 2`); `V = 0`
/// elsewhere. Slits for the double-slit experiment are a wall with two
/// [`Gap`]s.
pub fn wall(grid: &Grid2D, x_center: f64, thickness: f64, value: f64, gaps: &[Gap]) -> Potential2D {
    let mut values = Vec::with_capacity(grid.nx() * grid.ny());
    for j in 0..grid.ny() {
        let y = grid.y(j);
        let in_gap = gaps.iter().any(|g| inside_window(y, g.center_y, g.width));
        for i in 0..grid.nx() {
            values.push(
                if !in_gap && inside_window(grid.x(i), x_center, thickness) {
                    value
                } else {
                    0.0
                },
            );
        }
    }
    Potential2D { values }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreError;
    use crate::grid::Grid1D;

    /// Inclusive `(start, end)` index ranges of the maximal contiguous runs of
    /// `value` in `values`.
    fn runs(values: &[f64], value: f64) -> Vec<(usize, usize)> {
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

    #[test]
    fn zeros_is_free_particle_potential() {
        let v = Potential::zeros(2048);
        assert_eq!(v.len(), 2048);
        assert!(!v.is_empty());
        assert!(v.values().iter().all(|&x| x == 0.0));
        let empty = Potential::zeros(0);
        assert!(empty.is_empty());
        assert_eq!(empty.len(), 0);
    }

    #[test]
    fn harmonic_matches_half_x_squared_for_unit_mass_and_frequency() {
        let grid = Grid1D::new(2048, -24.0, 24.0).unwrap();
        let v = harmonic(&grid, 1.0, 1.0);
        assert_eq!(v.len(), grid.n());
        for &i in &[0usize, 1, 597, 1024, 2047] {
            let expected = 0.5 * grid.x(i) * grid.x(i);
            assert!(
                (v.values()[i] - expected).abs() < 1e-12,
                "V[{i}] = {}, expected {expected}",
                v.values()[i]
            );
        }
    }

    #[test]
    fn harmonic_scales_with_mass_and_omega() {
        let grid = Grid1D::new(2048, -24.0, 24.0).unwrap();
        let v = harmonic(&grid, 2.0, 3.0);
        let i = 597; // x = -10.0078125
        let expected = 0.5 * 2.0 * 3.0 * 3.0 * grid.x(i) * grid.x(i);
        assert!(
            (v.values()[i] - expected).abs() < 1e-12,
            "V[{i}] = {}, expected {expected}",
            v.values()[i]
        );
    }

    #[test]
    fn barrier_window_is_half_open_on_reference_domain() {
        // n = 6144 on [-24, 24] gives dx = 1/128 (exact in binary), so
        // x(3008) = -0.5 and x(3136) = +0.5 sit exactly on the window edges
        // while x(3009) = -0.4921875 and x(3135) = +0.4921875 are the
        // nearest inside points (the ~±0.49 of the brief).
        let grid = Grid1D::new(6144, -24.0, 24.0).unwrap();
        let v = barrier(&grid, 0.0, 1.0, 1.5);
        assert_eq!(v.len(), grid.n());
        assert_eq!(v.values()[3009], 1.5);
        assert_eq!(v.values()[3135], 1.5);
        // Exactly on the edge -> outside (half-open window).
        assert_eq!(v.values()[3008], 0.0);
        assert_eq!(v.values()[3136], 0.0);
        assert_eq!(v.values()[0], 0.0);
        // Indices 3009..=3135: width 1 minus one excluded edge point per side.
        assert_eq!(v.values().iter().filter(|&&x| x == 1.5).count(), 127);
    }

    #[test]
    fn finite_well_is_minus_depth_inside_half_open_window() {
        let grid = Grid1D::new(6144, -24.0, 24.0).unwrap();
        let v = finite_well(&grid, 0.0, 1.0, 2.0);
        assert_eq!(v.values()[3009], -2.0);
        assert_eq!(v.values()[3135], -2.0);
        assert_eq!(v.values()[3008], 0.0);
        assert_eq!(v.values()[0], 0.0);
    }

    #[test]
    fn well_chain_places_count_wells_evenly_from_xmin_plus_half_period() {
        // dx = 3/128 (exact): centers -22, -18, -14, -10, -6 are exact grid
        // multiples; wells of width 2 hold 85 points each.
        let grid = Grid1D::new(2048, -24.0, 24.0).unwrap();
        let v = well_chain(&grid, 5, 2.0, 5.0, 4.0);
        assert_eq!(v.len(), grid.n());
        assert!(v.values().iter().all(|&x| x == 0.0 || x == -5.0));

        let found = runs(v.values(), -5.0);
        assert_eq!(found.len(), 5, "runs: {found:?}");

        let dx = grid.dx();
        for (k, &(start, end)) in found.iter().enumerate() {
            let expected_center = grid.xmin() + (k as f64 + 0.5) * 4.0;
            let midpoint = 0.5 * (grid.x(start) + grid.x(end));
            assert!(
                (midpoint - expected_center).abs() <= dx,
                "well {k}: midpoint {midpoint}, expected center {expected_center}"
            );
        }
        let lengths: Vec<usize> = found.iter().map(|&(s, e)| e - s + 1).collect();
        assert!(
            lengths.iter().all(|&l| l == lengths[0]),
            "wells must be identical: {lengths:?}"
        );
        assert_eq!(lengths[0], 85);
    }

    #[test]
    fn add_is_elementwise() {
        // Grid points are the integers 0..=7. The barrier window (3, 5)
        // contains only x = 4: x = 3 and x = 5 sit exactly on the edges.
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        let h = harmonic(&grid, 1.0, 1.0);
        let b = barrier(&grid, 4.0, 2.0, 1.5);
        let sum = h.add(&b).expect("same grid, lengths match");
        let expected = [0.0, 0.5, 2.0, 4.5, 9.5, 12.5, 18.0, 24.5];
        assert_eq!(sum.values(), expected.as_slice());
    }

    #[test]
    fn add_rejects_length_mismatch() {
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        let short = Potential::zeros(4);
        let v = harmonic(&grid, 1.0, 1.0);
        assert!(matches!(
            short.add(&v),
            Err(CoreError::DimensionMismatch {
                expected: 4,
                got: 8
            })
        ));
    }

    mod potential2d {
        use super::*;
        use crate::grid::Grid2D;

        /// Reference 2D test grid: 512 × 512 points on `[-16, 16)^2`, so
        /// `dx = dy = 0.0625 = 1/16` (exact in binary). Index landmarks used
        /// throughout: `x(i) = -16 + i/16`, so `x(248) = -0.5`,
        /// `x(249) = -0.4375`, `x(263) = +0.4375`, `x(264) = +0.5` — and the
        /// same for `y(j)`.
        fn reference_grid() -> Grid2D {
            Grid2D::new(512, 512, -16.0, 16.0, -16.0, 16.0).expect("reference grid is valid")
        }

        #[test]
        fn zeros_is_free_particle_potential() {
            // One sample per grid point: n = nx * ny = 8 * 4 = 32.
            let v = Potential2D::zeros(32);
            assert_eq!(v.len(), 32);
            assert!(!v.is_empty());
            assert!(v.values().iter().all(|&x| x == 0.0));
            let empty = Potential2D::zeros(0);
            assert!(empty.is_empty());
            assert_eq!(empty.len(), 0);
        }

        #[test]
        fn add_is_elementwise() {
            // Hand-assembled samples (not every test potential is an
            // analytic shape): `a` holds the harmonic and `b` the barrier
            // samples of the 1D elementwise test, as an 8-point 2D potential
            // would store them.
            let a = Potential2D {
                values: vec![0.0, 0.5, 2.0, 4.5, 9.5, 12.5, 18.0, 24.5],
            };
            let b = Potential2D {
                values: vec![0.0, 0.0, 0.0, 0.0, 1.5, 0.0, 0.0, 0.0],
            };
            let sum = a.add(&b).expect("same grid, lengths match");
            let expected = [0.0, 0.5, 2.0, 4.5, 11.0, 12.5, 18.0, 24.5];
            assert_eq!(sum.values(), expected.as_slice());
            // `add` consumes neither operand.
            assert_eq!(a.len(), 8);
            assert_eq!(b.values()[4], 1.5);
        }

        #[test]
        fn add_rejects_length_mismatch() {
            let a = Potential2D {
                values: vec![0.0; 8],
            };
            let b = Potential2D {
                values: vec![0.0; 4],
            };
            assert!(matches!(
                a.add(&b),
                Err(CoreError::DimensionMismatch {
                    expected: 8,
                    got: 4
                })
            ));
        }

        #[test]
        fn harmonic2d_matches_half_r_squared_at_sample_points() {
            let grid = reference_grid();
            let v = harmonic2d(&grid, 1.0, 1.0);
            assert_eq!(v.len(), 512 * 512);
            for &(i, j) in &[(0, 0), (1, 2), (100, 200), (256, 256), (511, 511)] {
                let (x, y) = (grid.x(i), grid.y(j));
                let expected = 0.5 * (x * x + y * y);
                let got = v.values()[grid.index(i, j)];
                assert!(
                    (got - expected).abs() < 1e-12,
                    "V[({i}, {j})] = {got}, expected {expected}"
                );
            }
        }

        #[test]
        fn harmonic2d_scales_with_mass_and_omega() {
            let grid = reference_grid();
            let v = harmonic2d(&grid, 2.0, 3.0);
            let (i, j) = (100, 200); // (x, y) = (-9.375, -3.5)
            let (x, y) = (grid.x(i), grid.y(j));
            let expected = 0.5 * 2.0 * 3.0 * 3.0 * (x * x + y * y);
            assert!(
                (v.values()[grid.index(i, j)] - expected).abs() < 1e-12,
                "V[({i}, {j})] = {}, expected {expected}",
                v.values()[grid.index(i, j)]
            );
        }

        #[test]
        fn finite_well2d_is_minus_depth_inside_half_open_rectangle() {
            // Window (-0.5, 0.5) × (-0.5, 0.5): x(248) = -0.5 and
            // x(264) = +0.5 sit exactly on the edges (outside), while
            // x(249) = -0.4375 and x(263) = +0.4375 are the nearest inside
            // points — and the same for y.
            let grid = reference_grid();
            let v = finite_well2d(&grid, 0.0, 0.0, 1.0, 1.0, 2.5);
            assert_eq!(v.len(), 512 * 512);
            // Near-inside points on both axes carry the full depth.
            assert_eq!(v.values()[grid.index(249, 256)], -2.5);
            assert_eq!(v.values()[grid.index(263, 256)], -2.5);
            assert_eq!(v.values()[grid.index(256, 249)], -2.5);
            assert_eq!(v.values()[grid.index(256, 263)], -2.5);
            assert_eq!(v.values()[grid.index(249, 249)], -2.5);
            // Exactly on an edge -> outside (half-open window).
            assert_eq!(v.values()[grid.index(248, 256)], 0.0);
            assert_eq!(v.values()[grid.index(264, 256)], 0.0);
            assert_eq!(v.values()[grid.index(256, 248)], 0.0);
            assert_eq!(v.values()[grid.index(256, 264)], 0.0);
            assert_eq!(v.values()[grid.index(248, 248)], 0.0);
            assert_eq!(v.values()[grid.index(0, 0)], 0.0);
            // Hand count: 15 x-points (249..=263) × 15 y-points = 225 inside.
            assert_eq!(v.values().iter().filter(|&&x| x == -2.5).count(), 225);
            assert!(v.values().iter().all(|&x| x == 0.0 || x == -2.5));
        }

        #[test]
        fn finite_well2d_counts_off_center_rectangle_points() {
            // Window (0, 2) × (-2.5, -1.5): x(257) = 0.0625 .. x(287) = 1.9375
            // (31 points, x(256) = 0 and x(288) = 2 sit on the edges), and
            // y(217) = -2.4375 .. y(231) = -1.5625 (15 points, y(216) = -2.5
            // and y(232) = -1.5 on the edges). Hand count: 31 × 15 = 465.
            let grid = reference_grid();
            let v = finite_well2d(&grid, 1.0, -2.0, 2.0, 1.0, 1.0);
            assert_eq!(v.values()[grid.index(257, 224)], -1.0);
            assert_eq!(v.values()[grid.index(287, 231)], -1.0);
            // Exactly on the x edge, y inside -> outside.
            assert_eq!(v.values()[grid.index(256, 224)], 0.0);
            assert_eq!(v.values()[grid.index(288, 224)], 0.0);
            // Exactly on the y edge, x inside -> outside.
            assert_eq!(v.values()[grid.index(257, 216)], 0.0);
            assert_eq!(v.values()[grid.index(257, 232)], 0.0);
            assert_eq!(v.values().iter().filter(|&&x| x == -1.0).count(), 465);
        }

        #[test]
        fn wall_without_gaps_is_one_contiguous_run_per_row() {
            // Wall band (-0.5, 0.5) in x, full height, no gaps: every row
            // holds exactly one run of 15 points (249..=263).
            let grid = reference_grid();
            let v = wall(&grid, 0.0, 1.0, 7.5, &[]);
            assert_eq!(v.len(), 512 * 512);
            assert!(v.values().iter().all(|&x| x == 0.0 || x == 7.5));
            for j in 0..grid.ny() {
                let row = &v.values()[j * grid.nx()..(j + 1) * grid.nx()];
                assert_eq!(runs(row, 7.5), vec![(249, 263)], "row {j}");
                // Exactly on the band edges -> outside (half-open window).
                assert_eq!(row[248], 0.0);
                assert_eq!(row[264], 0.0);
            }
            // Hand count: 15 x-points × 512 rows.
            assert_eq!(v.values().iter().filter(|&&x| x == 7.5).count(), 15 * 512);
        }

        #[test]
        fn wall_with_two_gaps_splits_into_three_runs() {
            // Gaps (-4.5, -3.5) and (3.5, 4.5) in y: j 185..=199 and
            // j 313..=327 fall inside (15 rows each), while y(184) = -4.5,
            // y(200) = -3.5, y(312) = 3.5, y(328) = 4.5 sit exactly on the
            // gap edges and keep the wall.
            let grid = reference_grid();
            let gaps = [
                Gap {
                    center_y: -4.0,
                    width: 1.0,
                },
                Gap {
                    center_y: 4.0,
                    width: 1.0,
                },
            ];
            let v = wall(&grid, 0.0, 1.0, 3.0, &gaps);

            // The column at x = 0 crosses both gaps: 3 runs of wall.
            let col: Vec<f64> = (0..grid.ny())
                .map(|j| v.values()[grid.index(256, j)])
                .collect();
            assert_eq!(runs(&col, 3.0), vec![(0, 184), (200, 312), (328, 511)]);

            // Half-open gap windows: points exactly on a gap edge are NOT in
            // the gap, so the wall stands there; mid-gap points are 0.
            assert_eq!(v.values()[grid.index(256, 184)], 3.0);
            assert_eq!(v.values()[grid.index(256, 200)], 3.0);
            assert_eq!(v.values()[grid.index(256, 312)], 3.0);
            assert_eq!(v.values()[grid.index(256, 328)], 3.0);
            assert_eq!(v.values()[grid.index(256, 192)], 0.0);
            assert_eq!(v.values()[grid.index(256, 320)], 0.0);

            // Full-array partition, counted by hand: each gap removes
            // 15 x-points × 15 y-points = 225 wall samples, so of the
            // 15 × 512 = 7680 band samples, 7680 - 2 × 225 = 7230 remain.
            let mut removed_per_gap = [0usize; 2];
            let mut standing = 0usize;
            for j in 0..grid.ny() {
                for i in 0..grid.nx() {
                    let inside_band = (grid.x(i) - 0.0).abs() < 0.5;
                    let gap_hit = gaps
                        .iter()
                        .position(|g| (grid.y(j) - g.center_y).abs() < g.width / 2.0);
                    let k = grid.index(i, j);
                    match (inside_band, gap_hit) {
                        (false, _) => assert_eq!(v.values()[k], 0.0, "({i}, {j})"),
                        (true, None) => {
                            assert_eq!(v.values()[k], 3.0, "({i}, {j})");
                            standing += 1;
                        }
                        (true, Some(g)) => {
                            assert_eq!(v.values()[k], 0.0, "({i}, {j})");
                            removed_per_gap[g] += 1;
                        }
                    }
                }
            }
            assert_eq!(removed_per_gap, [225, 225]);
            assert_eq!(standing, 7230);
        }

        #[test]
        fn add_composes_two_builder_potentials() {
            // Harmonic background plus a well: inside the window the sum is
            // ½(x² + y²) - depth, outside just ½(x² + y²).
            let grid = reference_grid();
            let h = harmonic2d(&grid, 1.0, 1.0);
            let w = finite_well2d(&grid, 0.0, 0.0, 2.0, 2.0, 1.0);
            let sum = h.add(&w).expect("same grid, lengths match");
            assert_eq!(sum.len(), 512 * 512);
            for &(i, j) in &[(0, 0), (249, 249), (256, 256), (271, 271), (300, 400)] {
                let (x, y) = (grid.x(i), grid.y(j));
                let harmonic = 0.5 * (x * x + y * y);
                // Well window is (-1, 1) × (-1, 1): x(240) = -1 and
                // x(272) = +1 sit on the edges, so 241..=271 is inside.
                let inside = (x - 0.0).abs() < 1.0 && (y - 0.0).abs() < 1.0;
                let expected = if inside { harmonic - 1.0 } else { harmonic };
                let got = sum.values()[grid.index(i, j)];
                assert!(
                    (got - expected).abs() < 1e-12,
                    "sum[({i}, {j})] = {got}, expected {expected}"
                );
            }
            // `add` consumes neither operand.
            assert_eq!(w.values()[grid.index(256, 256)], -1.0);
            assert_eq!(h.len(), 512 * 512);
        }
    }
}
