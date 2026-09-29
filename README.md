# Psiforge

Psiforge is an open-source quantum mechanics simulation platform that combines
two roles in one project:

1. An **interactive educational sandbox** that runs in the browser — open a
   link and experiment immediately, no installation, no account.
2. A **research computing library** exposed through a Python API — backed by
   the exact same physics core as the web app.

Version 1 focuses on one physics area: **wave dynamics** — the time-dependent
Schrödinger equation (TDSE) on uniform 1D/2D grids. Correct physics comes
first, pretty visuals immediately after; correctness is never sacrificed for
effects.

## Repository layout (planned)

Monorepo with four components — "one core, three facades":

```
psiforge/
├── core/      Rust crate — all physics and numerics, no I/O dependencies
├── wasm/      Rust crate — thin binding of core to JavaScript (wasm-bindgen)
├── python/    Rust crate — binding of core to Python (pyo3), wheels on PyPI
└── web/       TypeScript + Vite + WebGL2 — rendering and interaction only
```

Currently only `core/` (the `psiforge-core` crate) exists; the other
components arrive in later milestones.

## Quickstart

The physics lives in the `psiforge-core` crate. Until it is published, depend
on it by path (or by git URL once the repository is public):

```toml
[dependencies]
psiforge-core = { path = "core" }
```

Then build a simulation the way every Psiforge run does: a grid, a Gaussian
initial state, a potential, and a split-operator propagator. This example
prepares a coherent state (ground-state width `1/√2`, displaced to `x0 = 3`)
in a harmonic potential and propagates it for 100 steps:

```rust
use psiforge_core::error::CoreError;
use psiforge_core::grid::Grid1D;
use psiforge_core::observables::{expectation_x, sigma_x};
use psiforge_core::potential::harmonic;
use psiforge_core::propagator::{Propagator, SplitOperator};
use psiforge_core::states::gaussian;

fn main() -> Result<(), CoreError> {
    let grid = Grid1D::new(2048, -20.0, 20.0)?;
    let mut wf = gaussian(&grid, 3.0, 0.0, std::f64::consts::FRAC_1_SQRT_2, 1.0, 1.0)?;
    let v = harmonic(&grid, 1.0, 1.0);
    let mut prop = SplitOperator::new(&grid, 1e-3, 1.0, 1.0)?;

    for _ in 0..100 {
        prop.step(&mut wf, &v)?;
    }
    println!("sigma_x = {:.6}", sigma_x(&wf));
    println!("<x>     = {:.6}", expectation_x(&wf));
    Ok(())
}
```

The numbers to expect: a coherent state does not spread, so `sigma_x` stays
at the ground-state width `1/√2 ≈ 0.7071`, and Ehrenfest's theorem is exact
for the harmonic oscillator, so `<x>(t) = 3 cos(t)` — at `t = 0.1` that is
about `2.985`. All quantities are unitless here (`m = ħ = 1`); see
[`docs/units.md`](docs/units.md) for running the same code in nanometers,
femtoseconds, and electron-volts.

## Development

Requires a stable Rust toolchain.

```bash
cargo build                # build the workspace
cargo test -p psiforge-core  # run the core test suite
```

CI runs `cargo fmt --all --check`, `cargo clippy --all-targets -- -D
warnings`, and `cargo test --all` on every pull request.

## License

[MIT](LICENSE)
