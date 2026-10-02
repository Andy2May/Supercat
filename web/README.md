# Supercat web

Browser UI for the Supercat 2D quantum simulator: Vite + Svelte 5 +
TypeScript, with the simulation itself running in a Web Worker backed by the
`wasm/` crate (wasm-bindgen output lands in `src/wasm/`, generated — not
committed).

## Commands

- `npm run dev` — dev server
- `npm run build` — production build
- `npm run test` — vitest unit tests (pure TS modules, node environment)
- `npm run check` — svelte-check + tsc

UI strings go through `src/i18n` (`vi`/`en` dictionaries); simulation timing
and coordinate mapping live in `src/sim/simParams.ts`; the main/worker wire
contract is `src/sim/protocol.ts`.
