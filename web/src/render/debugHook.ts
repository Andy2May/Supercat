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
  /**
   * Row-brightness probes for the e2e y-orientation trap: screen fraction
   * (0 = canvas top) -> mean brightness [0, 1] of that row in the last
   * drawn frame. A key's presence (inserted by `window.__psiforgeReadRow`)
   * asks `HeatmapRenderer.draw()` to sample the row via readPixels — the
   * default framebuffer is only readable in-frame, so values are cached
   * here per draw instead of read on demand. `-1` until the first draw
   * after registration. Empty in normal use: zero readPixels cost.
   */
  rowBrightness: Map<number, number>
}

declare global {
  interface Window {
    __psiforge?: PsiforgeDebugState
    /** Row-brightness probe (see PsiforgeDebugState.rowBrightness). */
    __psiforgeReadRow?: (yFrac: number) => number
  }
}

function createDebugState(): PsiforgeDebugState {
  const state: PsiforgeDebugState = {
    frames: 0,
    t: 0,
    norm: 0,
    maxDensity: 0,
    potentialVersion: 0,
    rowBrightness: new Map(),
  }
  if (typeof window !== 'undefined') {
    window.__psiforge = state
    // Register-on-call + read-cached: the first call for a fraction returns
    // -1 (the renderer samples it at the end of the next draw); later calls
    // return that draw's cached mean brightness.
    window.__psiforgeReadRow = (yFrac: number): number => {
      if (!state.rowBrightness.has(yFrac)) {
        state.rowBrightness.set(yFrac, -1)
      }
      return state.rowBrightness.get(yFrac) ?? -1
    }
  }
  return state
}

/** Single shared instance — mutate, never replace, so identity stays stable. */
export const debugState: PsiforgeDebugState = createDebugState()
