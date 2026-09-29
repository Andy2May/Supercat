//! Spatial potential energy sampled on a [`Grid1D`].

use crate::error::{CoreError, Result};
use crate::grid::Grid1D;

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
}
