/**
 * Always-on debug hook (ledger ruling). `window.__psiforge` is created once
 * when the render modules load and mutated in place on every drawn frame —
 * Playwright polls it and humans can poke it from the console. The cost is a
 * handful of property writes per frame, so it ships in every build.
 *
 * `frames` ticks inside `HeatmapRenderer.draw()`; the frame source (the
 * worker bridge in `simLoop.ts`) owns `t` / `norm` / `maxDensity` /
 * `potentialVersion`.
 */
export interface PsiforgeDebugState {
  frames: number
  t: number
  norm: number
  maxDensity: number
  potentialVersion: number
}

declare global {
  interface Window {
    __psiforge?: PsiforgeDebugState
  }
}

function createDebugState(): PsiforgeDebugState {
  const state: PsiforgeDebugState = {
    frames: 0,
    t: 0,
    norm: 0,
    maxDensity: 0,
    potentialVersion: 0,
  }
  if (typeof window !== 'undefined') {
    window.__psiforge = state
  }
  return state
}

/** Single shared instance — mutate, never replace, so identity stays stable. */
export const debugState: PsiforgeDebugState = createDebugState()
