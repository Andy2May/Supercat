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
  sigmaMin: 0.5,
  sigmaMax: 6,
  kMax: 15,
} as const

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
