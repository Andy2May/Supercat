/**
 * Pure simulation-parameter helpers: the timing and coordinate-mapping logic
 * the UI needs, kept out of Svelte components so it is unit-testable in a
 * plain node environment.
 */

/** Pinned UI defaults shared across the app (grid extent, step, playback). */
export const DEFAULTS = {
  extent: 40,
  dt: 0.005,
  speed: 4,
  /** Unitless core convention (`docs/units.md`): m = hbar = 1. */
  m: 1,
  hbar: 1,
  sigmaMin: 0.5,
  sigmaMax: 6,
  kMax: 15,
} as const

/** Grid sizes the `?grid=` URL param may select (M1 perf gate targets 512). */
export const GRID_SIZES = [128, 256, 512] as const

export type GridSize = (typeof GRID_SIZES)[number]

/**
 * Parses the `?grid=` param: one of {@link GRID_SIZES} verbatim, anything
 * else (missing, unsupported, malformed) falls back to the 512 default.
 */
export function parseGridParam(value: string | null): GridSize {
  const n = value === null ? Number.NaN : Number(value)
  return (GRID_SIZES as readonly number[]).includes(n) ? (n as GridSize) : 512
}

/**
 * Advances a 1-second-EMA fps estimate with one new frame interval.
 *
 * `weight = clamp(intervalMs/1000, 0..1)` gives an exponential moving average
 * with a 1 s time constant (a 16.7 ms sample nudges the estimate by ~1.7%,
 * a 1 s gap replaces it). A zero/unset estimate seeds with the instantaneous
 * rate; non-positive intervals (clock jitter) leave it untouched.
 */
export function nextFpsEma(previous: number, intervalMs: number): number {
  if (!(intervalMs > 0)) return previous
  const instantaneous = 1000 / intervalMs
  if (!(previous > 0)) return instantaneous
  const weight = Math.min(1, intervalMs / 1000)
  return previous + (instantaneous - previous) * weight
}

/**
 * Converts a wall-clock frame delta into a number of propagator substeps.
 *
 * `substeps = round(speed * dtWallSeconds / dt)`, clamped to
 * `[0, maxSubsteps]`: the cap keeps a throttled background tab from burning
 * the whole budget in one frame when it wakes up.
 */
export function computeSubsteps(
  dtWallSeconds: number,
  speed: number,
  dt: number,
  maxSubsteps = 64,
): number {
  return Math.min(maxSubsteps, Math.max(0, Math.round((speed * dtWallSeconds) / dt)))
}

/**
 * Maps a canvas pixel to physical grid coordinates with the canvas center as
 * the origin, clamped to `[-extent/2, extent/2]` per axis.
 *
 * x and y scale independently (`extentX/width` and `extentY/height`), so a
 * non-square canvas over a square domain stays isotropic in physical units.
 * y grows downward, matching both screen pixels and the row-major
 * `j*nx + i` buffer layout the renderer draws — no flip anywhere.
 */
export function screenToGrid(
  px: number,
  py: number,
  width: number,
  height: number,
  extentX: number,
  extentY: number,
): { x: number; y: number } {
  const x = ((px - width / 2) / width) * extentX
  const y = ((py - height / 2) / height) * extentY
  return {
    x: Math.min(extentX / 2, Math.max(-extentX / 2, x)),
    y: Math.min(extentY / 2, Math.max(-extentY / 2, y)),
  }
}
