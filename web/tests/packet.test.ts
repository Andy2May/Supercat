import { describe, expect, it } from 'vitest'

import { DEFAULTS } from '../src/sim/simParams.js'
import { dragToPacket, MIN_PACKET_DRAG } from '../src/sim/packet.js'

describe('dragToPacket', () => {
  it('rightward drag: anchor is the center, momentum along the drag, sigma = length', () => {
    const packet = dragToPacket({ x: -10, y: 2 }, { x: -7, y: 2 }, 4)
    expect(packet).toEqual({
      x0: -10,
      y0: 2,
      kx: 4,
      ky: 0,
      sigma: 3,
    })
  })

  it('leftward drag: kx < 0, ky = 0', () => {
    const packet = dragToPacket({ x: 0, y: 0 }, { x: -2, y: 0 }, 6)
    expect(packet).not.toBeNull()
    expect(packet!.kx).toBe(-6)
    expect(packet!.ky).toBe(0)
    expect(packet!.sigma).toBe(2)
  })

  it('vertical drag maps to +y physics (no flip: screen-down = +y)', () => {
    const packet = dragToPacket({ x: 0, y: 0 }, { x: 0, y: 3 }, 4)
    expect(packet).not.toBeNull()
    expect(packet!.kx).toBe(0)
    expect(packet!.ky).toBe(4)
  })

  it('kMag sets |k| exactly on a diagonal drag (3-4-5)', () => {
    const packet = dragToPacket({ x: 0, y: 0 }, { x: 3, y: 4 }, 15)
    expect(packet).not.toBeNull()
    expect(packet!.kx).toBe(9)
    expect(packet!.ky).toBe(12)
    expect(Math.hypot(packet!.kx, packet!.ky)).toBe(15)
  })

  it('sigma clamps to [DEFAULTS.sigmaMin, DEFAULTS.sigmaMax]', () => {
    const short = dragToPacket({ x: 0, y: 0 }, { x: 0.2, y: 0 }, 4)
    expect(short!.sigma).toBe(DEFAULTS.sigmaMin)
    const long = dragToPacket({ x: 0, y: 0 }, { x: 10, y: 0 }, 4)
    expect(long!.sigma).toBe(DEFAULTS.sigmaMax)
  })

  it('kMag = 0 yields a stationary packet (still a valid drop)', () => {
    const packet = dragToPacket({ x: 1, y: 1 }, { x: 2, y: 1 }, 0)
    expect(packet).toEqual({ x0: 1, y0: 1, kx: 0, ky: 0, sigma: 1 })
  })

  it('drags shorter than the dead zone are rejected as accidental clicks', () => {
    // Below the default dead zone (~2 px converted to grid units).
    expect(dragToPacket({ x: 0, y: 0 }, { x: MIN_PACKET_DRAG / 2, y: 0 }, 4)).toBeNull()
    // Caller-supplied dead zone (SimCanvas converts 2 px via the canvas scale).
    expect(dragToPacket({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 4, 1)).toBeNull()
    // Exactly at the threshold is a deliberate drag, not a click.
    expect(dragToPacket({ x: 0, y: 0 }, { x: 1, y: 0 }, 4, 1)).not.toBeNull()
  })

  it('non-finite input yields null instead of a NaN packet', () => {
    expect(dragToPacket({ x: Number.NaN, y: 0 }, { x: 1, y: 0 }, 4)).toBeNull()
    expect(dragToPacket({ x: 0, y: 0 }, { x: Number.POSITIVE_INFINITY, y: 0 }, 4)).toBeNull()
  })
})
