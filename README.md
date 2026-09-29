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
