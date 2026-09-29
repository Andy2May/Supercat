//! Uniform 1D spatial grid.

use crate::error::{CoreError, Result};

/// Uniform 1D grid of `n` equally spaced points spanning `[xmin, xmax)`.
///
/// The first point sits at `xmin` and the spacing is `dx = (xmax - xmin) / n`,
/// so the last point sits at `xmax - dx`: the grid is right-open, matching the
/// periodic boundary conditions implied by FFT-based methods.
pub struct Grid1D {
    n: usize,
    xmin: f64,
    xmax: f64,
}

impl Grid1D {
    /// Creates a grid of `n` points spanning `[xmin, xmax)`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidGrid`] unless `n >= 2`, both bounds are
    /// finite, and `xmax > xmin`.
    pub fn new(n: usize, xmin: f64, xmax: f64) -> Result<Self> {
        if n < 2 || !xmin.is_finite() || !xmax.is_finite() || xmax <= xmin {
            return Err(CoreError::InvalidGrid { n, xmin, xmax });
        }
        Ok(Self { n, xmin, xmax })
    }

    /// Number of grid points.
    pub fn n(&self) -> usize {
        self.n
    }

    /// Grid spacing, `(xmax - xmin) / n`.
    pub fn dx(&self) -> f64 {
        (self.xmax - self.xmin) / self.n as f64
    }

    /// Position of point `i` for `i` in `0..n`: `xmin + i * dx`.
    pub fn x(&self, i: usize) -> f64 {
        self.xmin + i as f64 * self.dx()
    }

    /// Left edge of the grid (position of the first point).
    pub fn xmin(&self) -> f64 {
        self.xmin
    }

    /// Right edge of the span; the last grid point sits at `xmax - dx`.
    pub fn xmax(&self) -> f64 {
        self.xmax
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreError;

    const EPS: f64 = 1e-12;

    fn assert_approx_eq(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() < EPS,
            "actual={actual}, expected={expected}"
        );
    }

    #[test]
    fn first_point_is_xmin() {
        let g = Grid1D::new(4, -1.0, 3.0).unwrap();
        assert_approx_eq(g.x(0), -1.0);
    }

    #[test]
    fn last_point_is_xmax_minus_dx() {
        let g = Grid1D::new(4, -1.0, 3.0).unwrap();
        assert_approx_eq(g.x(3), 3.0 - g.dx());
    }

    #[test]
    fn dx_and_accessors_for_reference_grid() {
        let g = Grid1D::new(2048, -24.0, 24.0).unwrap();
        assert_eq!(g.n(), 2048);
        assert_approx_eq(g.xmin(), -24.0);
        assert_approx_eq(g.xmax(), 24.0);
        assert_approx_eq(g.dx(), 48.0 / 2048.0);
    }

    #[test]
    fn rejects_n_below_two() {
        assert!(matches!(
            Grid1D::new(0, 0.0, 1.0),
            Err(CoreError::InvalidGrid { n: 0, .. })
        ));
        assert!(matches!(
            Grid1D::new(1, 0.0, 1.0),
            Err(CoreError::InvalidGrid { n: 1, .. })
        ));
    }

    #[test]
    fn rejects_non_increasing_bounds() {
        assert!(matches!(
            Grid1D::new(8, 1.0, 1.0),
            Err(CoreError::InvalidGrid { .. })
        ));
        assert!(matches!(
            Grid1D::new(8, 2.0, 1.0),
            Err(CoreError::InvalidGrid { .. })
        ));
    }

    #[test]
    fn rejects_non_finite_bounds() {
        assert!(matches!(
            Grid1D::new(8, f64::NAN, 1.0),
            Err(CoreError::InvalidGrid { .. })
        ));
        assert!(matches!(
            Grid1D::new(8, 0.0, f64::NAN),
            Err(CoreError::InvalidGrid { .. })
        ));
        assert!(matches!(
            Grid1D::new(8, f64::NEG_INFINITY, 1.0),
            Err(CoreError::InvalidGrid { .. })
        ));
        assert!(matches!(
            Grid1D::new(8, 0.0, f64::INFINITY),
            Err(CoreError::InvalidGrid { .. })
        ));
    }
}
