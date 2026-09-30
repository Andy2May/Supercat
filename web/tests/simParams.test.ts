import { describe, expect, it } from 'vitest'

import { DEFAULTS, computeSubsteps, screenToGrid } from '../src/sim/simParams.js'

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

describe('DEFAULTS', () => {
  it('matches the pinned simulation defaults', () => {
    expect(DEFAULTS).toEqual({
      extent: 40,
      dt: 0.005,
      speed: 4,
      sigmaMin: 0.5,
      sigmaMax: 6,
      kMax: 15,
    })
  })
})
