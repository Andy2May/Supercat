import { beforeEach, describe, expect, it } from 'vitest'

import {
  MARKER_LIFETIME_MS,
  MARKER_MAX_RADIUS,
  binToScreen,
  clearMarkers,
  drawMarkers,
  ringGeometry,
  spawnMarker,
} from '../src/ui/markers.js'

/**
 * Measurement markers (Task 14): an expanding white ring on the SimCanvas
 * overlay marks where a position/momentum outcome landed. The module is
 * deliberately pure-ish — geometry decisions live in `ringGeometry` (unit
 * boundaries below) and `binToScreen` (the fftshift-consistent momentum
 * bin -> screen mapping, Review Focus 1), while `drawMarkers` only renders.
 */

describe('ringGeometry (pure ring math, 3+ time checkpoints)', () => {
  it('t = 0: full alpha, zero radius', () => {
    const g = ringGeometry(0)
    expect(g).not.toBeNull()
    expect(g!.alpha).toBe(1)
    expect(g!.radius).toBe(0)
  })

  it('t = half-life: radius half of max, alpha half, radius/alpha complementary', () => {
    const g = ringGeometry(MARKER_LIFETIME_MS / 2)
    expect(g).not.toBeNull()
    expect(g!.radius).toBeCloseTo(MARKER_MAX_RADIUS / 2, 10)
    expect(g!.alpha).toBeCloseTo(0.5, 10)
  })

  it('t just before expiry: still alive with near-max radius / near-zero alpha', () => {
    const g = ringGeometry(MARKER_LIFETIME_MS - 1)
    expect(g).not.toBeNull()
    expect(g!.radius).toBeLessThanOrEqual(MARKER_MAX_RADIUS)
    expect(g!.alpha).toBeGreaterThan(0)
  })

  it('t >= lifetime: expired (null)', () => {
    expect(ringGeometry(MARKER_LIFETIME_MS)).toBeNull()
    expect(ringGeometry(MARKER_LIFETIME_MS + 5_000)).toBeNull()
  })

  it('radius is monotonic non-decreasing and alpha non-increasing across the life', () => {
    let lastRadius = -1
    let lastAlpha = 2
    for (let t = 0; t <= MARKER_LIFETIME_MS; t += 25) {
      const g = ringGeometry(t)
      if (g === null) break
      expect(g.radius).toBeGreaterThanOrEqual(lastRadius)
      expect(g.alpha).toBeLessThanOrEqual(lastAlpha)
      // The complementary pair stays on the unit diagonal (linear timing).
      expect(g.radius / MARKER_MAX_RADIUS + g.alpha).toBeCloseTo(1, 12)
      lastRadius = g.radius
      lastAlpha = g.alpha
    }
    expect(lastRadius).toBeGreaterThan(0) // the loop actually sampled geometry
  })
})

/** Recording 2D-context stub: every method call appends a tag. */
function stubCtx(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = []
  const ctx = {
    calls,
    setTransform: () => calls.push('setTransform'),
    clearRect: () => calls.push('clear'),
    beginPath: () => calls.push('begin'),
    arc: () => calls.push('arc'),
    stroke: () => calls.push('stroke'),
    set lineWidth(w: number) {
      calls.push(`width:${w}`)
    },
    set strokeStyle(s: string | CanvasGradient | CanvasPattern) {
      calls.push(`style:${String(s)}`)
    },
  } as unknown as CanvasRenderingContext2D & { calls: string[] }
  return ctx
}

describe('drawMarkers (live list management)', () => {
  beforeEach(() => {
    clearMarkers()
  })

  it('draws a live marker as a halo pass + ring pass and reports alive', () => {
    const now = 1_000
    spawnMarker(120, 80, now)
    const ctx = stubCtx()
    expect(drawMarkers(ctx, now + 100, 400, 400)).toBe(true)
    // Two strokes per ring: the dark halo then the white ring (preview style).
    expect(ctx.calls.filter((c) => c === 'arc')).toHaveLength(2)
    expect(ctx.calls).toContain('clear')
  })

  it('expired markers are pruned; the function returns false once none remain', () => {
    const born = 1_000
    spawnMarker(10, 10, born)
    const ctx = stubCtx()
    // Before expiry: alive.
    expect(drawMarkers(ctx, born + MARKER_LIFETIME_MS - 1, 400, 400)).toBe(true)
    // At/after expiry: dead, nothing drawn.
    expect(drawMarkers(ctx, born + MARKER_LIFETIME_MS, 400, 400)).toBe(false)
    expect(ctx.calls.filter((c) => c === 'arc')).toHaveLength(2) // only the first call drew
    // And the pruning persisted (stays dead on later calls).
    expect(drawMarkers(ctx, born + MARKER_LIFETIME_MS + 100, 400, 400)).toBe(false)
  })

  it('multiple markers age independently (staggered births)', () => {
    const t0 = 5_000
    spawnMarker(1, 1, t0)
    spawnMarker(2, 2, t0 + MARKER_LIFETIME_MS / 2)
    const ctx = stubCtx()
    // t0 + 300: marker1 age 300 (alive), marker2 age 0 (alive) -> 4 arcs.
    expect(drawMarkers(ctx, t0 + 300, 400, 400)).toBe(true)
    expect(ctx.calls.filter((c) => c === 'arc')).toHaveLength(4)
    // t0 + 700: marker1 expired, marker2 age 400 (alive) -> 2 arcs.
    ctx.calls.length = 0
    expect(drawMarkers(ctx, t0 + 700, 400, 400)).toBe(true)
    expect(ctx.calls.filter((c) => c === 'arc')).toHaveLength(2)
    // t0 + 1000: both expired -> dead, nothing drawn.
    ctx.calls.length = 0
    expect(drawMarkers(ctx, t0 + 1_000, 400, 400)).toBe(false)
    expect(ctx.calls.filter((c) => c === 'arc')).toHaveLength(0)
  })

  it('clearMarkers empties the list', () => {
    spawnMarker(0, 0, 0)
    clearMarkers()
    const ctx = stubCtx()
    expect(drawMarkers(ctx, 10, 400, 400)).toBe(false)
  })
})

/**
 * binToScreen (momentum outcome -> overlay pixel): the wasm outcome is an
 * fftfreq bin (i, j) — k = 0 at bin (0,0) — while the DISPLAYED k-space
 * texture is fftshift2d'd (k = 0 at the grid center). The marker must land
 * on the same pixel the collapsed bin lights up, i.e. the shifted bin's
 * CELL CENTER. Hand-computed on a 4x4 grid over a 400x400 canvas:
 *
 *   shifted(i, j) = ((i + 2) % 4, (j + 2) % 4)
 *   screen        = ((shiftedI + 0.5) / 4 * 400, (shiftedJ + 0.5) / 4 * 400)
 */
describe('binToScreen (fftshift-consistent mapping, 4x4 hand-computed)', () => {
  const nx = 4
  const ny = 4
  const w = 400
  const h = 400

  it('the k = 0 bin (0,0) maps to the screen center', () => {
    // shifted = (2, 2) -> ((2.5)/4*400, (2.5)/4*400) = (250, 250)
    expect(binToScreen(0, 0, nx, ny, w, h)).toEqual({ x: 250, y: 250 })
  })

  it('the most-negative bin (2,2) maps to the top-left cell center', () => {
    // shifted = (0, 0) -> (50, 50)
    expect(binToScreen(2, 2, nx, ny, w, h)).toEqual({ x: 50, y: 50 })
  })

  it('bin (1,1) (positive quadrant corner) maps to the bottom-right cell center', () => {
    // shifted = (3, 3) -> (350, 350)
    expect(binToScreen(1, 1, nx, ny, w, h)).toEqual({ x: 350, y: 350 })
  })

  it('mixed-sign corners (2,1) and (1,2) map to the off-diagonal cell centers', () => {
    // (2,1): shifted = (0, 3) -> (50, 350)
    expect(binToScreen(2, 1, nx, ny, w, h)).toEqual({ x: 50, y: 350 })
    // (1,2): shifted = (3, 0) -> (350, 50)
    expect(binToScreen(1, 2, nx, ny, w, h)).toEqual({ x: 350, y: 50 })
  })

  it('scales with canvas size and honors non-square grids (nx != ny)', () => {
    // 6x4 grid over a 300x200 canvas: bin (0,0) -> shifted (3, 2)
    // -> ((3.5)/6*300, (2.5)/4*200) = (175, 125)
    expect(binToScreen(0, 0, 6, 4, 300, 200)).toEqual({ x: 175, y: 125 })
  })

  it('is consistent with fftshift2d row/column indexing (spot check vs the ruling formula)', async () => {
    const { fftshift2d } = await import('../src/sim/fftshift.js')
    // A one-hot fftfreq source: bin (1, 3) of an 8x8 grid. After the shift
    // the hot texel sits at (shiftedI, shiftedJ) = (5, 7); binToScreen(1, 3)
    // must return that texel's cell center.
    const src = new Float32Array(64)
    src[3 * 8 + 1] = 1
    const shifted = fftshift2d(src, 8, 8)
    const s = binToScreen(1, 3, 8, 8, 800, 800)
    const cellI = Math.floor((s.x / 800) * 8)
    const cellJ = Math.floor((s.y / 800) * 8)
    let max = 0
    let maxIdx = -1
    for (let k = 0; k < 64; k++) {
      if (shifted[k] > max) {
        max = shifted[k]
        maxIdx = k
      }
    }
    expect(maxIdx).toBe(cellJ * 8 + cellI)
    expect(maxIdx).toBe(7 * 8 + 5)
  })
})
