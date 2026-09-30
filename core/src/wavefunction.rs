//! Complex-field quantum wavefunctions on [`Grid1D`] and [`Grid2D`].

use crate::error::{CoreError, Result};
use crate::grid::{Grid1D, Grid2D};
use num_complex::Complex64;

/// Complex-valued wavefunction ψ sampled on a uniform [`Grid1D`], carrying the
/// physical parameters mass `m` and reduced Planck constant `hbar`.
///
/// # Norm convention
///
/// The norm is the Riemann sum over the grid,
///
/// ```text
/// ‖ψ‖ = sqrt( Σᵢ |ψᵢ|² · dx )
/// ```
///
/// so inner products between wavefunctions on the same grid carry the `dx`
/// weight (`⟨φ|ψ⟩ = Σᵢ conj(φᵢ)·ψᵢ · dx`). All later stages of Psiforge —
/// observables and the propagator norm guard — assume this dx-weighted
/// convention.
///
/// # Units
///
/// The core is unitless by default: `m = ħ = 1`, with the grid and time steps
/// in whatever consistent units the caller chooses. See `docs/units.md` in the
/// repository root for the convention and a worked example in real units.
pub struct Wavefunction {
    grid: Grid1D,
    psi: Vec<Complex64>,
    m: f64,
    hbar: f64,
}

impl Wavefunction {
    /// Creates a wavefunction sampled on `grid` with mass `m` and `hbar`.
    ///
    /// # Errors
    ///
    /// Returns an error unless **all** of the following hold:
    ///
    /// - `psi.len() == grid.n()` — otherwise [`CoreError::DimensionMismatch`],
    /// - every real and imaginary part of `psi` is finite — otherwise
    ///   [`CoreError::NonFinite`] reports the first offending index,
    /// - `m > 0` and `hbar > 0`, both finite — otherwise
    ///   [`CoreError::InvalidMassOrHbar`].
    pub fn new(grid: Grid1D, psi: Vec<Complex64>, m: f64, hbar: f64) -> Result<Self> {
        if psi.len() != grid.n() {
            return Err(CoreError::DimensionMismatch {
                expected: grid.n(),
                got: psi.len(),
            });
        }
        if let Some(index) = psi
            .iter()
            .position(|c| !c.re.is_finite() || !c.im.is_finite())
        {
            return Err(CoreError::NonFinite {
                what: "wavefunction",
                index,
            });
        }
        if !(m.is_finite() && m > 0.0) || !(hbar.is_finite() && hbar > 0.0) {
            return Err(CoreError::InvalidMassOrHbar { m, hbar });
        }
        Ok(Self { grid, psi, m, hbar })
    }

    /// Number of grid points (equals `psi().len()`).
    pub fn n(&self) -> usize {
        self.psi.len()
    }

    /// The grid ψ is sampled on.
    pub fn grid(&self) -> &Grid1D {
        &self.grid
    }

    /// The sampled values ψᵢ, one per grid point.
    pub fn psi(&self) -> &[Complex64] {
        &self.psi
    }

    /// Mutable access to the sampled values, e.g. to apply a propagator in
    /// place. Callers must preserve finiteness; nothing re-validates here.
    pub fn psi_mut(&mut self) -> &mut [Complex64] {
        &mut self.psi
    }

    /// Particle mass in the caller's unit system (positive, finite).
    pub fn m(&self) -> f64 {
        self.m
    }

    /// Reduced Planck constant in the caller's unit system (positive, finite).
    pub fn hbar(&self) -> f64 {
        self.hbar
    }

    /// ‖ψ‖ = sqrt(Σᵢ |ψᵢ|² · dx) — Riemann sum with the grid's `dx` weight.
    pub fn norm(&self) -> f64 {
        let sum = self.psi.iter().map(|c| c.norm_sqr()).sum::<f64>();
        (sum * self.grid.dx()).sqrt()
    }

    /// Divides ψ by its norm in place so that afterwards `norm() == 1`.
    ///
    /// A no-op when the norm is zero (a zero wavefunction cannot be
    /// normalized); this keeps every element finite, preserving the invariant
    /// enforced by [`Wavefunction::new`].
    pub fn normalize(&mut self) {
        let norm = self.norm();
        if norm > 0.0 {
            for c in &mut self.psi {
                *c /= norm;
            }
        }
    }
}

/// Complex-valued wavefunction ψ sampled on a uniform [`Grid2D`], carrying
/// the physical parameters mass `m` and reduced Planck constant `hbar`.
///
/// The samples are laid out row-major (x-fastest), matching
/// [`Grid2D::index`]: `psi()[grid.index(i, j)]` is ψ at the point
/// `(grid.x(i), grid.y(j))`.
///
/// # Norm convention
///
/// The norm is the Riemann sum over the grid with the area weight `dA = dx·dy`,
///
/// ```text
/// ‖ψ‖ = sqrt( Σₖ |ψₖ|² · dx·dy )
/// ```
///
/// the 2D analogue of the dx-weighted sum of [`Wavefunction`], so inner
/// products between wavefunctions on the same grid carry the `dA` weight
/// (`⟨φ|ψ⟩ = Σₖ conj(φₖ)·ψₖ · dx·dy`). All later 2D stages of Psiforge —
/// observables and the propagator norm guard — assume this dA-weighted
/// convention.
///
/// # Units
///
/// The core is unitless by default: `m = ħ = 1`, with the grid and time steps
/// in whatever consistent units the caller chooses. See `docs/units.md` in the
/// repository root for the convention and a worked example in real units.
pub struct Wavefunction2D {
    grid: Grid2D,
    psi: Vec<Complex64>,
    m: f64,
    hbar: f64,
}

impl Wavefunction2D {
    /// Creates a wavefunction sampled on `grid` with mass `m` and `hbar`.
    ///
    /// # Errors
    ///
    /// Returns an error unless **all** of the following hold:
    ///
    /// - `psi.len() == grid.nx() * grid.ny()` — otherwise
    ///   [`CoreError::DimensionMismatch`],
    /// - every real and imaginary part of `psi` is finite — otherwise
    ///   [`CoreError::NonFinite`] reports the first offending index,
    /// - `m > 0` and `hbar > 0`, both finite — otherwise
    ///   [`CoreError::InvalidMassOrHbar`].
    ///
    /// The rules are identical to [`Wavefunction::new`].
    pub fn new(grid: Grid2D, psi: Vec<Complex64>, m: f64, hbar: f64) -> Result<Self> {
        if psi.len() != grid.nx() * grid.ny() {
            return Err(CoreError::DimensionMismatch {
                expected: grid.nx() * grid.ny(),
                got: psi.len(),
            });
        }
        if let Some(index) = psi
            .iter()
            .position(|c| !c.re.is_finite() || !c.im.is_finite())
        {
            return Err(CoreError::NonFinite {
                what: "wavefunction",
                index,
            });
        }
        if !(m.is_finite() && m > 0.0) || !(hbar.is_finite() && hbar > 0.0) {
            return Err(CoreError::InvalidMassOrHbar { m, hbar });
        }
        Ok(Self { grid, psi, m, hbar })
    }

    /// Number of grid points (equals `psi().len()`).
    pub fn n_points(&self) -> usize {
        self.psi.len()
    }

    /// The grid ψ is sampled on.
    pub fn grid(&self) -> &Grid2D {
        &self.grid
    }

    /// The sampled values ψₖ, one per grid point, row-major (x-fastest).
    pub fn psi(&self) -> &[Complex64] {
        &self.psi
    }

    /// Mutable access to the sampled values, e.g. to apply a propagator in
    /// place. Callers must preserve finiteness; nothing re-validates here.
    pub fn psi_mut(&mut self) -> &mut [Complex64] {
        &mut self.psi
    }

    /// Particle mass in the caller's unit system (positive, finite).
    pub fn m(&self) -> f64 {
        self.m
    }

    /// Reduced Planck constant in the caller's unit system (positive, finite).
    pub fn hbar(&self) -> f64 {
        self.hbar
    }

    /// ‖ψ‖ = sqrt(Σₖ |ψₖ|² · dx·dy) — Riemann sum with the grid's `dA = dx·dy`
    /// area weight.
    pub fn norm(&self) -> f64 {
        let sum = self.psi.iter().map(|c| c.norm_sqr()).sum::<f64>();
        (sum * self.grid.dx() * self.grid.dy()).sqrt()
    }

    /// Divides ψ by its norm in place so that afterwards `norm() == 1`.
    ///
    /// A no-op when the norm is zero (a zero wavefunction cannot be
    /// normalized); this keeps every element finite, preserving the invariant
    /// enforced by [`Wavefunction2D::new`].
    pub fn normalize(&mut self) {
        let norm = self.norm();
        if norm > 0.0 {
            for c in &mut self.psi {
                *c /= norm;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::CoreError;
    use crate::grid::Grid1D;

    const EPS: f64 = 1e-15;

    fn ones(n: usize) -> Vec<Complex64> {
        vec![Complex64::new(1.0, 0.0); n]
    }

    #[test]
    fn rejects_length_mismatch() {
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        assert!(matches!(
            Wavefunction::new(grid, ones(7), 1.0, 1.0),
            Err(CoreError::DimensionMismatch {
                expected: 8,
                got: 7
            })
        ));
    }

    #[test]
    fn rejects_nan_real_part() {
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        let mut psi = ones(8);
        psi[3] = Complex64::new(f64::NAN, 0.0);
        assert!(matches!(
            Wavefunction::new(grid, psi, 1.0, 1.0),
            Err(CoreError::NonFinite { index: 3, .. })
        ));
    }

    #[test]
    fn rejects_non_finite_imaginary_part() {
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        let mut psi = ones(8);
        psi[5] = Complex64::new(0.0, f64::INFINITY);
        assert!(matches!(
            Wavefunction::new(grid, psi, 1.0, 1.0),
            Err(CoreError::NonFinite { .. })
        ));
    }

    #[test]
    fn rejects_non_positive_mass() {
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        assert!(matches!(
            Wavefunction::new(grid, ones(8), 0.0, 1.0),
            Err(CoreError::InvalidMassOrHbar { m: 0.0, hbar: 1.0 })
        ));
    }

    #[test]
    fn rejects_negative_hbar() {
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        assert!(matches!(
            Wavefunction::new(grid, ones(8), 1.0, -1.0),
            Err(CoreError::InvalidMassOrHbar { m: 1.0, hbar: -1.0 })
        ));
    }

    #[test]
    fn normalize_constant_vector_gives_unit_norm() {
        // Grid n = 8 over [0, 8): dx = 1, L = xmax - xmin = 8.
        // Hand computation: sum |c|^2 * dx = 8 |c|^2 dx = |c|^2 L = 1
        // => c = 1 / sqrt(L) = 1 / sqrt(8).
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        let mut wf = Wavefunction::new(grid, ones(8), 1.0, 1.0).unwrap();

        // Before normalizing: ||psi|| = sqrt(8 * 1 * 1) = sqrt(L).
        assert!((wf.norm() - 8.0_f64.sqrt()).abs() < EPS);

        wf.normalize();
        assert!((wf.norm() - 1.0).abs() < EPS, "norm = {}", wf.norm());

        let expected = 1.0 / 8.0_f64.sqrt();
        for (i, c) in wf.psi().iter().enumerate() {
            assert!(
                (c.re - expected).abs() < EPS,
                "element {i}: re = {}, expected {expected}",
                c.re
            );
            assert_eq!(c.im, 0.0, "element {i}: im = {}", c.im);
        }
    }

    #[test]
    fn accessors_expose_fields_and_grid() {
        let grid = Grid1D::new(8, 0.0, 8.0).unwrap();
        let mut wf = Wavefunction::new(grid, ones(8), 2.5, 0.7).unwrap();

        assert_eq!(wf.n(), 8);
        assert_eq!(wf.psi().len(), 8);
        assert_eq!(wf.psi()[0], Complex64::new(1.0, 0.0));
        assert!((wf.m() - 2.5).abs() < 1e-12);
        assert!((wf.hbar() - 0.7).abs() < 1e-12);
        assert!((wf.grid().dx() - 1.0).abs() < 1e-12);

        wf.psi_mut()[2] = Complex64::new(0.0, 1.0);
        assert_eq!(wf.psi()[2], Complex64::new(0.0, 1.0));
    }

    mod wavefunction2d {
        use super::*;
        use crate::grid::Grid2D;

        #[test]
        fn rejects_length_mismatch() {
            let grid = Grid2D::new(8, 4, 0.0, 8.0, 0.0, 4.0).unwrap();
            assert!(matches!(
                Wavefunction2D::new(grid, ones(31), 1.0, 1.0),
                Err(CoreError::DimensionMismatch {
                    expected: 32,
                    got: 31
                })
            ));
        }

        #[test]
        fn rejects_nan_real_part() {
            let grid = Grid2D::new(8, 4, 0.0, 8.0, 0.0, 4.0).unwrap();
            let mut psi = ones(32);
            psi[3] = Complex64::new(f64::NAN, 0.0);
            assert!(matches!(
                Wavefunction2D::new(grid, psi, 1.0, 1.0),
                Err(CoreError::NonFinite { index: 3, .. })
            ));
        }

        #[test]
        fn rejects_non_finite_imaginary_part() {
            let grid = Grid2D::new(8, 4, 0.0, 8.0, 0.0, 4.0).unwrap();
            let mut psi = ones(32);
            psi[5] = Complex64::new(0.0, f64::INFINITY);
            assert!(matches!(
                Wavefunction2D::new(grid, psi, 1.0, 1.0),
                Err(CoreError::NonFinite { .. })
            ));
        }

        #[test]
        fn rejects_non_positive_mass() {
            let grid = Grid2D::new(8, 4, 0.0, 8.0, 0.0, 4.0).unwrap();
            assert!(matches!(
                Wavefunction2D::new(grid, ones(32), 0.0, 1.0),
                Err(CoreError::InvalidMassOrHbar { m: 0.0, hbar: 1.0 })
            ));
        }

        #[test]
        fn rejects_negative_hbar() {
            let grid = Grid2D::new(8, 4, 0.0, 8.0, 0.0, 4.0).unwrap();
            assert!(matches!(
                Wavefunction2D::new(grid, ones(32), 1.0, -1.0),
                Err(CoreError::InvalidMassOrHbar { m: 1.0, hbar: -1.0 })
            ));
        }

        #[test]
        fn normalize_constant_vector_gives_unit_norm() {
            // Grid 8×4 over [0, 8) × [0, 4): dx = dy = 1, so dA = 1 and the
            // 32 points tile area A = 8 × 4 = 32.
            // Hand computation: Σ|c|²·dA = 32·|c|² = |c|²·A, so with c = 1
            // the norm before normalizing is √32 = 4√2 and afterwards every
            // element equals 1/√32.
            let grid = Grid2D::new(8, 4, 0.0, 8.0, 0.0, 4.0).unwrap();
            let mut wf = Wavefunction2D::new(grid, ones(32), 1.0, 1.0).unwrap();

            // Before normalizing: ||psi|| = sqrt(32 * 1 * 1) = sqrt(A).
            assert!((wf.norm() - 32.0_f64.sqrt()).abs() < EPS);

            wf.normalize();
            assert!((wf.norm() - 1.0).abs() < EPS, "norm = {}", wf.norm());

            let expected = 1.0 / 32.0_f64.sqrt();
            for (i, c) in wf.psi().iter().enumerate() {
                assert!(
                    (c.re - expected).abs() < EPS,
                    "element {i}: re = {}, expected {expected}",
                    c.re
                );
                assert_eq!(c.im, 0.0, "element {i}: im = {}", c.im);
            }
        }

        #[test]
        fn norm_carries_da_weight_on_non_unit_spacing() {
            // Grid 8×4 over [0, 4) × [0, 2): dx = dy = 0.5, so dA = 0.25 and
            // the 32 points tile area A = 4 × 2 = 8.
            // Hand computation: Σ|c|²·dA = 32·|c|²·0.25 = |c|²·A, so with
            // c = 1 the norm is √8 — an unweighted sqrt(Σ|ψₖ|²) would give
            // √32 instead, which pins the dA weighting (all other 2D tests
            // use dx = dy = 1 where the two conventions coincide).
            let grid = Grid2D::new(8, 4, 0.0, 4.0, 0.0, 2.0).unwrap();
            let mut wf = Wavefunction2D::new(grid, ones(32), 1.0, 1.0).unwrap();

            // Before normalizing: ||psi|| = sqrt(32 * 0.5 * 0.5) = sqrt(A).
            assert!(
                (wf.norm() - 8.0_f64.sqrt()).abs() < EPS,
                "norm = {}",
                wf.norm()
            );

            wf.normalize();
            assert!((wf.norm() - 1.0).abs() < EPS, "norm = {}", wf.norm());

            let expected = 1.0 / 8.0_f64.sqrt();
            for (i, c) in wf.psi().iter().enumerate() {
                assert!(
                    (c.re - expected).abs() < EPS,
                    "element {i}: re = {}, expected {expected}",
                    c.re
                );
                assert_eq!(c.im, 0.0, "element {i}: im = {}", c.im);
            }
        }

        #[test]
        fn accessors_expose_fields_and_grid() {
            let grid = Grid2D::new(8, 4, 0.0, 8.0, 0.0, 4.0).unwrap();
            let mut wf = Wavefunction2D::new(grid, ones(32), 2.5, 0.7).unwrap();

            assert_eq!(wf.n_points(), 32);
            assert_eq!(wf.psi().len(), 32);
            assert_eq!(wf.psi()[0], Complex64::new(1.0, 0.0));
            assert!((wf.m() - 2.5).abs() < 1e-12);
            assert!((wf.hbar() - 0.7).abs() < 1e-12);
            assert_eq!(wf.grid().nx(), 8);
            assert_eq!(wf.grid().ny(), 4);
            assert!((wf.grid().dx() - 1.0).abs() < 1e-12);
            assert!((wf.grid().dy() - 1.0).abs() < 1e-12);

            // psi is laid out row-major like Grid2D::index: (i, j) -> j*nx + i.
            let k = wf.grid().index(2, 3);
            wf.psi_mut()[k] = Complex64::new(0.0, 1.0);
            assert_eq!(wf.psi()[k], Complex64::new(0.0, 1.0));
        }
    }
}
