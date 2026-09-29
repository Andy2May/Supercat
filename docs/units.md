# Units in Psiforge Core

## The convention: unitless until you say otherwise

`psiforge-core` solves the 1D time-dependent Schrödinger equation

```text
i ħ ∂ψ/∂t = −(ħ² / 2m) ∂²ψ/∂x² + V(x) ψ
```

purely in **ratios**: the solver never asks what a "meter" or a "second" is.
By default everything runs in natural units with

- `m = 1`, `ħ = 1`,
- grid coordinates `x` in units of the domain length `L`,
- time steps `t` in units of `T = m·L²/ħ`.

The single dimensionless combination the physics depends on is `ħ·T/(m·L²)`,
so with `m = ħ = 1` and `x`, `t` measured in multiples of `L` and `T` the
equation is exact as written. Probabilities stay consistent because the norm
is the Riemann sum `‖ψ‖ = sqrt(Σᵢ |ψᵢ|² · dx)` — the `dx` weight makes the
sampled values carry units of `1/√L` and the norm dimensionless.

## Passing other values

`Wavefunction::new(grid, psi, m, hbar)` takes `m` and `hbar` as plain `f64`
values, so any consistent unit system works: express `m` in `E·T²/L²` and
`ħ` in `E·T`, matching whatever units your grid (`L`) and time steps (`T`)
use. The constructor only checks `m > 0` and `hbar > 0` (and finiteness);
consistency is the caller's responsibility.

## Worked example: electron in nanometers

For an electron on a grid in nanometers with time in femtoseconds and
energies in electron-volts (`L = nm`, `T = fs`, `E = eV`), pass

```text
ħ  = 6.582120×10⁻¹⁶ eV·s  = 0.658212 eV·fs
mₑ = 9.109384×10⁻³¹ kg    = 5.68563 eV·fs²/nm²
```

```rust
// grid in nm, psi normalized with the dx-weighted norm, time steps in fs
let wf = Wavefunction::new(grid, psi, 5.68563, 0.658212)?;
```

Sanity check: `ħ²/(2m) = 0.03810 eV·nm²` in this system — the textbook
electron value. Every energy the core reports is then directly in eV and
every time in fs.

Alternatively, keep the default `m = ħ = 1` and rescale the outputs: one
dimensionless energy unit is `ħ²/(m·L²)` and one time unit is `m·L²/ħ`, which
for the electron-nanometer case give `1 E-unit = 76.20 meV` and
`1 T-unit = 8.639 fs`.
