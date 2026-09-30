/**
 * Ambient globals the e2e specs poll on the page. `__psiforge` mirrors the
 * always-on debug hook (src/render/debugHook.ts) and `__psiforgePerf` the
 * perf HUD sample (src/sim/simStore.svelte.ts). They are re-declared here —
 * rather than pulled in from those modules — because the plain-tsc tests
 * program must not load the runes-using `.svelte.ts` sources; those are
 * owned by svelte-check.
 */
import type { PsiforgeDebugState } from '../src/render/debugHook.js'

/** Structural mirror of `PerfStats` in src/sim/simStore.svelte.ts. */
interface PsiforgePerfStats {
  fps: number
  substeps: number
  workerMs: number
}

declare global {
  interface Window {
    __psiforge?: PsiforgeDebugState
    __psiforgePerf?: PsiforgePerfStats
    /** Row-brightness probe (src/render/debugHook.ts): register + read. */
    __psiforgeReadRow?: (yFrac: number) => number
  }
}
