# Units in Psiforge

A short reference for reading the numbers Psiforge shows — slider values,
readouts, and the momentum view — and for calling `psiforge-core` with
real-world units. The core solves the time-dependent Schrödinger equation

```text
i ħ ∂ψ/∂t = −(ħ² / 2m) ∇²ψ + V(x, y) ψ
```

on uniform grids (the app runs the 2D solver) purely in **ratios**: the
solver never asks what a "meter" or a "second" is.

## Natural units: ħ = m = 1

By default everything runs with `m = 1`, `ħ = 1`, positions on a domain of
side `L` (the app uses a 40 × 40 box: x, y ∈ [−20, 20]), and time in steps
of `T = m·L²/ħ`. What that means when reading numbers:

- Position readouts ⟨x⟩, ⟨y⟩ and measurement outcomes are in domain units
  (±20 at the walls of the default box).
- One unit of energy is `ħ²/(m·L²)`; one unit of time is `m·L²/ħ`.
- Probabilities stay consistent: the norm is the Riemann sum
  `‖ψ‖ = sqrt(Σ |ψᵢ|² · dA)` with `dA = dx·dy`, so a normalized `|ψ|²` is
  exactly probability per unit area.

## Energy: E ≈ k²/2 and barrier heights

A Gaussian packet with wavenumbers `kx, ky` carries kinetic energy
`E ≈ (kx² + ky²)/2`. A drag sets the direction, the **Momentum |k|** slider
sets the magnitude, so `E ≈ |k|²/2` — e.g. |k| = 6 gives E ≈ 18.

The **Height** slider for drawn barriers and wells is a potential value V in
the same energy units, so compare it directly with E:

- V well below E (height 5 against E ≈ 18): a speed bump — the packet
  mostly rolls over it, with partial reflection.
- V above E: a true barrier — classically the particle cannot cross, and
  what leaks through is the tunneling tail (the Tunneling preset: E ≈ 18
  against a barrier 24 high).

## Grid resolution: 256², 512² — simulation detail, not screen size

The notation means *points per side*: 256² is a 256 × 256 grid of simulated
points, 512² is 512 × 512. A finer grid resolves sharper drawn barriers and
finer interference fringes in the same 40 × 40 box — it never changes the
picture's size; the canvas is just the window. Doubling the side quadruples
the point count (4× compute per step): 256² is the default, 512²
(`?grid=512`) is for strong machines.

## Time step, substeps, and the speed slider

The propagator advances in fixed steps of `dt = 0.005` time units. The
**Speed** slider (0.1–5) sets simulated seconds per wall-clock second: each
rendered frame takes `round(speed × frameTime / dt)` substeps (capped at
64) — at speed 1 and 60 fps that is about 3 substeps per frame. Higher
speed means more physics computed per frame, not a coarser simulation.

## The momentum (k-space) view

The k-axes follow the `numpy.fft.fftfreq` convention scaled by 2π:
`k_j = 2π/(n·dx) · j'`, with `j' = j` below `n/2` and `j' = j − n` above —
bin 0 is the zero wavenumber. The display is fftshift-ed, so **k = 0 sits
at the center** and |k| grows outward along both axes. k is the wavenumber;
a bin's momentum is `p = ħ·k` (numerically equal, since ħ = 1). The |k|
slider tops out at 15, inside the range every grid size resolves.

## Passing other values (core API)

`Wavefunction::new` and `Wavefunction2D::new` take `(grid, psi, m, hbar)`
with `m` and `hbar` as plain `f64`, so any consistent unit system works:
express `m` in `E·T²/L²` and `ħ` in `E·T`, matching your grid (`L`) and
time steps (`T`). Only `m > 0`, `hbar > 0`, and finiteness are checked;
consistency is the caller's responsibility.

For an electron in nanometers, femtoseconds, electron-volts
(`L = nm`, `T = fs`, `E = eV`):

```text
ħ  = 0.658212 eV·fs          mₑ = 5.68563 eV·fs²/nm²
```

```rust
// grid in nm, psi normalized with the dA-weighted norm, time steps in fs
let wf = Wavefunction::new(grid, psi, 5.68563, 0.658212)?;
```

Sanity check: `ħ²/(2m) = 0.03810 eV·nm²` — the textbook electron value.
Staying in natural units instead, rescale outputs by `ħ²/(m·L²)` per energy
unit and `m·L²/ħ` per time unit (electron-nm: 1 E-unit = 76.20 meV,
1 T-unit = 8.638 fs).
