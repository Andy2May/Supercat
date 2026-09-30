import { describe, expect, it } from 'vitest'

import {
  BRUSH_THICKNESS,
  ERASER_RADIUS,
  ERASER_STEP,
  strokeToOp,
  strokeToOps,
  type Pt,
} from '../src/sim/tools.js'

/** Horizontal drag of length 5, physics units (extent 40 grid). */
const from: Pt = { x: -2, y: 1 }
const to: Pt = { x: 3, y: 1 }
const height = 7.5

describe('strokeToOp single-op tools', () => {
  it('brush -> paint-segment, value +height, thickness 0.6, exact endpoints', () => {
    expect(strokeToOp('brush', height, from, to)).toEqual({
      type: 'paint-segment',
      x1: -2,
      y1: 1,
      x2: 3,
      y2: 1,
      thickness: BRUSH_THICKNESS,
      value: height,
    })
    expect(BRUSH_THICKNESS).toBe(0.6)
  })

  it('barrier -> one paint-segment with +height and exact endpoints', () => {
    expect(strokeToOp('barrier', height, from, to)).toEqual({
      type: 'paint-segment',
      x1: -2,
      y1: 1,
      x2: 3,
      y2: 1,
      thickness: BRUSH_THICKNESS,
      value: height,
    })
  })

  it('well -> one paint-segment with −height', () => {
    expect(strokeToOp('well', height, from, to)).toEqual({
      type: 'paint-segment',
      x1: -2,
      y1: 1,
      x2: 3,
      y2: 1,
      thickness: BRUSH_THICKNESS,
      value: -height,
    })
  })

  it('eraser short drag -> paint-disc value 0, r 0.5, landing on the pointer', () => {
    expect(strokeToOp('eraser', height, { x: 0, y: 0 }, { x: 0.2, y: 0 })).toEqual({
      type: 'paint-disc',
      cx: 0.2,
      cy: 0,
      r: ERASER_RADIUS,
      value: 0,
    })
    expect(ERASER_RADIUS).toBe(0.5)
  })

  it('eraser degenerate click (from == to) still erases one disc', () => {
    expect(strokeToOp('eraser', height, { x: 4, y: -3 }, { x: 4, y: -3 })).toEqual({
      type: 'paint-disc',
      cx: 4,
      cy: -3,
      r: ERASER_RADIUS,
      value: 0,
    })
  })

  it('packet -> null (Task 16 wires it)', () => {
    expect(strokeToOp('packet', height, from, to)).toBeNull()
  })

  it('measure -> null (a click trigger, never a paint op — Task 14)', () => {
    expect(strokeToOp('measure', height, from, to)).toBeNull()
    expect(strokeToOps('measure', height, from, to)).toEqual([])
  })

  it('eraser height is ignored — the eraser always writes 0', () => {
    const op = strokeToOp('eraser', 20, { x: 0, y: 0 }, { x: 0.1, y: 0 })
    expect(op).not.toBeNull()
    expect(op).toMatchObject({ type: 'paint-disc', value: 0 })
  })
})

describe('eraser sub-step sampling along a drag', () => {
  it('a long drag advances exactly one step (0.8·r) per strokeToOp call', () => {
    const op = strokeToOp('eraser', height, { x: 0, y: 0 }, { x: 5, y: 0 })
    expect(op).toMatchObject({ type: 'paint-disc', cy: 0, r: 0.5, value: 0 })
    expect(op).not.toBeNull()
    const cx = (op as { cx: number }).cx
    expect(Math.abs(cx - ERASER_STEP)).toBeLessThan(1e-12)
    expect(ERASER_STEP).toBeCloseTo(0.4, 12)
  })

  it('strokeToOps walks the whole drag with overlapping discs ending at `to`', () => {
    const ops = strokeToOps('eraser', height, { x: 0, y: 0 }, { x: 2, y: 0 })
    expect(ops.length).toBeGreaterThanOrEqual(Math.ceil(2 / ERASER_STEP))
    const centers = ops.map((op) => (op.type === 'paint-disc' ? op.cx : NaN))
    expect(centers.every((cx) => Number.isFinite(cx))).toBe(true)
    // Last sample lands exactly on the release point.
    expect(centers[centers.length - 1]).toBeCloseTo(2, 12)
    for (let i = 1; i < centers.length; i++) {
      const spacing = centers[i] - centers[i - 1]
      // One step apart (≤ step + FP noise) and always overlapping (2r = 1.0).
      expect(spacing).toBeLessThanOrEqual(ERASER_STEP + 1e-9)
      expect(spacing).toBeGreaterThan(0)
      expect(spacing).toBeLessThan(2 * ERASER_RADIUS)
    }
  })

  it('strokeToOps on a short eraser drag yields the single pointer disc', () => {
    const ops = strokeToOps('eraser', height, { x: 1, y: 1 }, { x: 1.1, y: 1 })
    expect(ops).toEqual([
      { type: 'paint-disc', cx: 1.1, cy: 1, r: ERASER_RADIUS, value: 0 },
    ])
  })
})

describe('strokeToOps batch wrapper', () => {
  it('brush wraps the one segment op', () => {
    expect(strokeToOps('brush', 3, from, to)).toEqual([strokeToOp('brush', 3, from, to)])
  })

  it('packet yields no ops', () => {
    expect(strokeToOps('packet', 3, from, to)).toEqual([])
  })
})
