# AGENTS.md for Supercat (repo `psiforge`)

2D quantum wave-dynamics sandbox: pure-Rust physics core compiled to WASM,
driven by a Svelte 5 web app. Product name is **Supercat**; the crates
intentionally keep their historical `psiforge-*` names (see README).

## Layout

- `core/` (`psiforge-core`): all physics (grid, wavefunction, potential,
  FFT, split-operator propagator, observables, Born-rule measurement).
  Pure Rust; correctness pinned by golden tests.
- `wasm/` (`psiforge-wasm`): thin wasm-bindgen bridge (single `lib.rs`,
  `Simulation2D`). No physics logic here.
- `web/`: Svelte 5 + Vite + TypeScript app.
  - `src/sim/`: worker (`physics.worker.ts`), wire contract
    (`protocol.ts`), runes stores (`simStore.svelte.ts`, `modeStore`, ...),
    sim params.
  - `src/render/`: WebGL2 renderer + `shaders.ts` (GLSL).
  - `src/ui/`: Svelte components; `src/i18n/`: vi/en dictionaries;
    `src/presets/`: scene presets.
- `docs/superpowers/`: design specs, implementation plans, physics audit
  reports; `docs/units.md`: unit conventions.

## Commands

Rust (repo root; all three are CI gates):

```bash
cargo fmt --all --check && cargo clippy --all-targets -- -D warnings && cargo test --all
wasm-pack test --node wasm
```

Web (in `web/`). A fresh checkout needs one-time `npm ci` +
`npm run build:wasm`: `node_modules/` and `src/wasm/` are gitignored.

```bash
npm run dev        # vite dev server on :5173
npm run test       # vitest unit (jsdom, component + pure TS)
npm run test:e2e   # Playwright (Chromium, boots en-US locale)
npm run check      # svelte-check + tsc (all three tsconfigs)
npm run build      # production build
```

Full local gate before committing web changes: vitest + playwright +
`npm run check` + build, all green.

## Architecture rules

- **Layering:** physics lives only in `core/`; `wasm/` bridges; the web
  worker owns the wasm instance; main thread and worker talk through typed
  messages declared in `web/src/sim/protocol.ts` (change the contract
  there first, both sides, and the worker tests in
  `web/tests/physicsWorker.test.ts` drive the real dispatcher via the
  `loadWasm` seam).
- **Renderer colors are single-sourced:** overlay/colormap colors are
  module constants in `web/src/render/shaders.ts` (`V_LEGEND_HEX`,
  `INFERNO_C1..3`, gradient-CSS builders) interpolated into the GLSL.
  Never hand-copy a shader color into a Svelte component; import it, so
  on-canvas legends cannot drift from what is painted.
- **View/mode predicates:** whether the canvas paints phase hues or
  momentum space is decided by `effectiveView`/`effectiveColorMode` in
  `simStore.svelte.ts` (stored flags can outlive the mode they apply in).
  UI that mirrors the canvas (e.g. legends) must derive from these, not
  from raw store flags.
- **i18n:** `vi.ts`/`en.ts` must keep identical key sets (parity is
  unit-tested). Language-independent math symbols (−π/+π, |ψ|², max|V|)
  are hardcoded mono in components, not keys. E2e asserts English wording;
  deterministic because the app derives language from
  `navigator.language` and Playwright boots en-US.
- **Svelte 5 runes** everywhere (`$state`/`$derived`/`$effect`), stores as
  `*.svelte.ts` classes; language re-translation uses the
  `lang.subscribe`-into-`$state` mirror pattern.

## Conventions & gotchas

- **Never write em dashes (—, U+2014)** in any text: UI strings, docs,
  README, commit messages, code comments. Rephrase with a colon, comma,
  semicolon, parentheses, or a separate sentence. The app's title
  separator is `·`. Exception: a lone `—` used as an empty-value
  placeholder in readouts is a symbol, not prose, and stays. (User ruling
  2026-10-02; older code comments predate the rule and get fixed on
  touch.)
- TDD pin-first: write the failing pin/test, then implement. Playwright
  specs assert language-independent strings (testids, math symbols) or
  English copy, never Vietnamese.
- CSS: the app does NOT use border-box globally (tooltip sizing math must
  subtract padding+border chrome).
- Workspace UI stays serious/technical; the landing page carries the cat
  brand voice. Real meme photo assets live in `web/public/`; do not
  replace them with drawn icons.
- `main` pushes trigger the GitHub Pages deploy workflow; do not merge or
  push without explicit user approval. Never commit files at repo root you
  did not create (user keeps personal files there, e.g. `Cat_Meme.png`).
- Windows dev: `cargo` is only on PATH via `~/.bashrc`; stale vite dev
  servers lock worktrees, so shut them down before removing a worktree.
- `svelte-check` on this checkout may report 2 pre-existing errors inside
  `node_modules/esrap` types (present on a clean HEAD); project-code
  diagnostics are what matter.

## Read before touching sensitive areas

- Physics copy (narration, glossary, legend wording, README physics
  claims): `docs/superpowers/audits/2026-10-01-wave-dynamics.md`, the
  audit that corrected the wording; keep new copy consistent with it.
- Simulation units/normalization: `docs/units.md`.
- Web app orientation/Y-axis and frame pipeline: header comments in
  `web/src/render/shaders.ts` and `web/src/render/simLoop.ts`.
