import { describe, expect, it } from 'vitest'

import {
  DEFAULTS,
  GRID_SIZES,
  computeSubsteps,
  nextFpsEma,
  parseGridParam,
  screenToGrid,
} from '../src/sim/simParams.js'

describe('computeSubsteps', () => {
  it('normal 60fps frame: computeSubsteps(1/60, 4, 0.005) = 13', () => {
    // speed * dtWall / dt = 4 * (1/60) / 0.005 = 13.33... -> rounds to 13
    expect(computeSubsteps(1 / 60, 4, 0.005)).toBe(13)
  })

  it('throttled tab (dtWall = 10s) caps at the default max of 64', () => {
    expect(computeSubsteps(10, 4, 0.005)).toBe(64)
  })

  it('dtWall = 0 yields 0 substeps', () => {
    expect(computeSubsteps(0, 4, 0.005)).toBe(0)
  })

  it('speed = 0 yields 0 substeps', () => {
    expect(computeSubsteps(1 / 60, 0, 0.005)).toBe(0)
  })

  it('honors a custom maxSubsteps cap', () => {
    // cap binds
    expect(computeSubsteps(10, 4, 0.005, 5)).toBe(5)
    // cap of 20 does not bind the 13-substep frame
    expect(computeSubsteps(1 / 60, 4, 0.005, 20)).toBe(13)
  })

  it('negative dtWall clamps to 0, never below', () => {
    expect(computeSubsteps(-1, 4, 0.005)).toBe(0)
  })
})

describe('screenToGrid', () => {
  it('canvas center maps to the origin (0, 0)', () => {
    expect(screenToGrid(400, 400, 800, 800, 40, 40)).toEqual({ x: 0, y: 0 })
  })

  it('corners map to the clamped extremes (+/-extent/2)', () => {
    // top-left corner
    expect(screenToGrid(0, 0, 800, 800, 40, 40)).toEqual({ x: -20, y: -20 })
    // bottom-right corner
    expect(screenToGrid(800, 800, 800, 800, 40, 40)).toEqual({ x: 20, y: 20 })
  })

  it('pixels outside the canvas clamp to the boundary', () => {
    expect(screenToGrid(-50, 900, 800, 800, 40, 40)).toEqual({ x: -20, y: 20 })
    expect(screenToGrid(5000, -5000, 800, 800, 40, 40)).toEqual({ x: 20, y: -20 })
  })

  it('scales x and y independently when width != height', () => {
    // width 800 -> 0.05 units/px ; height 400 -> 0.1 units/px
    // 10px right of center: x = +0.5 ; 10px below center: y = +1.0
    expect(screenToGrid(410, 210, 800, 400, 40, 40)).toEqual({ x: 0.5, y: 1.0 })
    // 10px above center: y = -1.0 (same y scale, mirrored)
    expect(screenToGrid(410, 190, 800, 400, 40, 40)).toEqual({ x: 0.5, y: -1.0 })
  })

  it('honors independent extents per axis', () => {
    // extentX 40 over 800px = 0.05/px ; extentY 20 over 800px = 0.025/px
    expect(screenToGrid(880, 880, 800, 800, 40, 20)).toEqual({ x: 20, y: 10 })
  })
})

describe('parseGridParam', () => {
  it('null (absent ?grid) defaults to 256', () => {
    expect(parseGridParam(null)).toBe(256)
  })

  it('accepts the three supported sizes verbatim', () => {
    expect(parseGridParam('128')).toBe(128)
    expect(parseGridParam('256')).toBe(256)
    // 512 stays available for strong machines (spec v1 §11).
    expect(parseGridParam('512')).toBe(512)
  })

  it('rejects anything else back to the 256 default', () => {
    expect(parseGridParam('1024')).toBe(256)
    expect(parseGridParam('64')).toBe(256)
    expect(parseGridParam('abc')).toBe(256)
    expect(parseGridParam('')).toBe(256)
    expect(parseGridParam('-512')).toBe(256)
  })

  it('GRID_SIZES matches the supported set', () => {
    expect(GRID_SIZES).toEqual([128, 256, 512])
  })
})

describe('nextFpsEma', () => {
  it('seeds from the first interval when no history exists', () => {
    // 16.67 ms per drawn frame -> ~60 fps instantaneous
    expect(nextFpsEma(0, 1000 / 60)).toBeCloseTo(60, 0)
  })

  it('blends a new sample with weight interval/1000 (1 s time constant)', () => {
    // 100 ms interval -> instantaneous 10 fps, weight 0.1
    // ema = 60 + (10 - 60) * 0.1 = 55
    expect(nextFpsEma(60, 100)).toBeCloseTo(55, 6)
  })

  it('caps the blend weight at 1 so a long gap cannot overshoot', () => {
    // 2 s gap -> weight clamps to 1 -> ema jumps to the instantaneous 0.5 fps
    expect(nextFpsEma(60, 2000)).toBeCloseTo(0.5, 6)
  })

  it('non-positive intervals leave the estimate untouched', () => {
    expect(nextFpsEma(60, 0)).toBe(60)
    expect(nextFpsEma(60, -5)).toBe(60)
  })

  it('converges towards a steady rate', () => {
    let ema = 0
    for (let i = 0; i < 200; i++) ema = nextFpsEma(ema, 20) // steady 50 fps
    expect(ema).toBeCloseTo(50, 3)
  })
})

describe('DEFAULTS', () => {
  it('matches the pinned simulation defaults', () => {
    expect(DEFAULTS).toEqual({
      extent: 40,
      dt: 0.005,
      speed: 1,
      m: 1,
      hbar: 1,
      sigmaMin: 0.5,
      sigmaMax: 6,
      kMax: 15,
    })
  })

  it('carries the unitless core convention m = hbar = 1', () => {
    expect(DEFAULTS.m).toBe(1)
    expect(DEFAULTS.hbar).toBe(1)
  })
})
