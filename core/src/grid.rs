//! Uniform 1D and 2D spatial grids.

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

/// Uniform 2D grid of `nx × ny` equally spaced points spanning
/// `[xmin, xmax) × [ymin, ymax)`.
///
/// The first point sits at `(xmin, ymin)`, the spacing is
/// `dx = (xmax - xmin) / nx` and `dy = (ymax - ymin) / ny`, so the last point
/// sits at `(xmax - dx, ymax - dy)`: the grid is right-open in both axes,
/// matching the periodic boundary conditions implied by FFT-based methods.
pub struct Grid2D {
    nx: usize,
    ny: usize,
    xmin: f64,
    xmax: f64,
    ymin: f64,
    ymax: f64,
}

impl Grid2D {
    /// Creates a grid of `nx × ny` points spanning `[xmin, xmax) × [ymin, ymax)`.
    ///
    /// # Errors
    ///
    /// Returns [`CoreError::InvalidGrid2D`] unless `nx >= 2`, `ny >= 2`, all
    /// four bounds are finite, `xmax > xmin`, and `ymax > ymin`.
    pub fn new(nx: usize, ny: usize, xmin: f64, xmax: f64, ymin: f64, ymax: f64) -> Result<Self> {
        if nx < 2
            || ny < 2
            || !xmin.is_finite()
            || !xmax.is_finite()
            || !ymin.is_finite()
            || !ymax.is_finite()
            || xmax <= xmin
            || ymax <= ymin
        {
            return Err(CoreError::InvalidGrid2D {
                nx,
                ny,
                xmin,
                xmax,
                ymin,
                ymax,
            });
        }
        Ok(Self {
            nx,
            ny,
            xmin,
            xmax,
            ymin,
            ymax,
        })
    }

    /// Number of grid points along x.
    pub fn nx(&self) -> usize {
        self.nx
    }

    /// Number of grid points along y.
    pub fn ny(&self) -> usize {
        self.ny
    }

    /// Left edge of the grid (x-coordinate of the first point).
    pub fn xmin(&self) -> f64 {
        self.xmin
    }

    /// Right edge of the x span; the last grid point sits at `xmax - dx`.
    pub fn xmax(&self) -> f64 {
        self.xmax
    }

    /// Bottom edge of the grid (y-coordinate of the first point).
    pub fn ymin(&self) -> f64 {
        self.ymin
    }

    /// Top edge of the y span; the last grid point sits at `ymax - dy`.
    pub fn ymax(&self) -> f64 {
        self.ymax
    }

    /// Grid spacing along x, `(xmax - xmin) / nx`.
    pub fn dx(&self) -> f64 {
        (self.xmax - self.xmin) / self.nx as f64
    }

    /// Grid spacing along y, `(ymax - ymin) / ny`.
    pub fn dy(&self) -> f64 {
        (self.ymax - self.ymin) / self.ny as f64
    }

    /// x-coordinate of point `i` for `i` in `0..nx`: `xmin + i * dx`.
    pub fn x(&self, i: usize) -> f64 {
        self.xmin + i as f64 * self.dx()
    }

    /// y-coordinate of point `j` for `j` in `0..ny`: `ymin + j * dy`.
    pub fn y(&self, j: usize) -> f64 {
        self.ymin + j as f64 * self.dy()
    }

    /// Row-major (x-fastest) flattened index of point `(i, j)`: `j * nx + i`.
    pub fn index(&self, i: usize, j: usize) -> usize {
        j * self.nx + i
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

    mod grid2d {
        use super::*;

        #[test]
        fn first_point_is_xmin_and_ymin() {
            let g = Grid2D::new(4, 3, -1.0, 3.0, -2.0, 1.0).unwrap();
            assert_approx_eq(g.x(0), -1.0);
            assert_approx_eq(g.y(0), -2.0);
        }

        #[test]
        fn last_point_is_xmax_minus_dx() {
            let g = Grid2D::new(4, 3, -1.0, 3.0, -2.0, 1.0).unwrap();
            assert_approx_eq(g.x(3), 3.0 - g.dx());
        }

        #[test]
        fn y_and_dy_mirror_x() {
            let g = Grid2D::new(4, 3, -1.0, 3.0, -2.0, 1.0).unwrap();
            assert_approx_eq(g.dy(), 3.0 / 3.0);
            assert_approx_eq(g.y(0), -2.0);
            assert_approx_eq(g.y(2), 1.0 - g.dy());
        }

        #[test]
        fn accessors_for_reference_grid() {
            let g = Grid2D::new(128, 64, -24.0, 24.0, -12.0, 12.0).unwrap();
            assert_eq!(g.nx(), 128);
            assert_eq!(g.ny(), 64);
            assert_approx_eq(g.xmin(), -24.0);
            assert_approx_eq(g.xmax(), 24.0);
            assert_approx_eq(g.ymin(), -12.0);
            assert_approx_eq(g.ymax(), 12.0);
            assert_approx_eq(g.dx(), 48.0 / 128.0);
            assert_approx_eq(g.dy(), 24.0 / 64.0);
        }

        #[test]
        fn index_is_j_times_nx_plus_i() {
            let g = Grid2D::new(4, 5, 0.0, 1.0, 0.0, 1.0).unwrap();
            assert_eq!(g.index(2, 3), 3 * 4 + 2);
            assert_eq!(g.index(0, 0), 0);
        }

        #[test]
        fn rejects_nx_or_ny_below_two() {
            assert!(matches!(
                Grid2D::new(1, 4, 0.0, 1.0, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { nx: 1, .. })
            ));
            assert!(matches!(
                Grid2D::new(4, 1, 0.0, 1.0, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { ny: 1, .. })
            ));
        }

        #[test]
        fn rejects_non_increasing_bounds() {
            assert!(matches!(
                Grid2D::new(4, 4, 1.0, 1.0, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(4, 4, 2.0, 1.0, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(4, 4, 0.0, 1.0, 1.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(4, 4, 0.0, 1.0, 2.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
        }

        #[test]
        fn rejects_non_finite_bounds() {
            assert!(matches!(
                Grid2D::new(8, 8, f64::NAN, 1.0, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(8, 8, 0.0, f64::NAN, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(8, 8, 0.0, 1.0, f64::NAN, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(8, 8, 0.0, 1.0, 0.0, f64::NAN),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(8, 8, f64::NEG_INFINITY, 1.0, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(8, 8, 0.0, f64::INFINITY, 0.0, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(8, 8, 0.0, 1.0, f64::NEG_INFINITY, 1.0),
                Err(CoreError::InvalidGrid2D { .. })
            ));
            assert!(matches!(
                Grid2D::new(8, 8, 0.0, 1.0, 0.0, f64::INFINITY),
                Err(CoreError::InvalidGrid2D { .. })
            ));
        }
    }
}
