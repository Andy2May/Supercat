import { describe, expect, it } from 'vitest'

import {
  decodeState,
  encodeState,
  STATE_VERSION,
  StateFileError,
  type RawState,
  type SavedState,
} from '../src/sim/stateFile.js'

/**
 * JSON state file codec (Task 17.1) — pure module, node-tested. The b64
 * layer must round-trip f32 arrays BIT-EXACTLY (negative floats and ±0
 * included — Object.is distinguishes the zeros, so bit-level survival is
 * what these assertions pin), refuse NaN at ENCODE time (a NaN that
 * round-trips silently would poison the propagator's norm guard on load),
 * and the decoder must guard the file version, the array lengths against
 * the file's own nx/ny, and any non-finite scalar/sample inside.
 */

const NX = 4
const NY = 4

function makeRaw(overrides: Partial<RawState> = {}): RawState {
  const potential = new Float32Array(NX * NY)
  for (let i = 0; i < potential.length; i++) {
    potential[i] = -3.25 + i * 0.5 // negative + positive mix
  }
  const psi = new Float32Array(2 * NX * NY)
  for (let i = 0; i < psi.length; i++) {
    psi[i] = (i % 2 === 0 ? 1 : -1) * (0.001 * i + 0.5)
  }
  return {
    nx: NX,
    ny: NY,
    extentX: 40,
    extentY: 40,
    dt: 0.005,
    m: 1,
    hbar: 1,
    t: 1.25,
    potential,
    psi,
    ...overrides,
  }
}

/** Object.is per element: distinguishes +0/-0 (bit-exactness) like toBe. */
function expectSameBits(actual: Float32Array, expected: Float32Array): void {
  expect(actual.length).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(Object.is(actual[i], expected[i]), `index ${i}`).toBe(true)
  }
}

describe('encodeState', () => {
  it('stamps the version and b64-encodes both arrays as strings', () => {
    const raw = makeRaw()
    const saved = encodeState(raw)

    expect(saved.version).toBe(STATE_VERSION)
    expect(saved.version).toBe(1)
    expect(saved.nx).toBe(raw.nx)
    expect(saved.ny).toBe(raw.ny)
    expect(saved.extentX).toBe(raw.extentX)
    expect(saved.extentY).toBe(raw.extentY)
    expect(saved.dt).toBe(raw.dt)
    expect(saved.m).toBe(raw.m)
    expect(saved.hbar).toBe(raw.hbar)
    expect(saved.t).toBe(raw.t)
    expect(typeof saved.potential).toBe('string')
    expect(typeof saved.psi).toBe('string')
    expect(saved.potential.length).toBeGreaterThan(0)
    // psi is twice the samples -> roughly twice the base64 length.
    expect(saved.psi.length).toBeGreaterThan(saved.potential.length)
  })

  it('THROWS on NaN inside the arrays (never round-trips silently)', () => {
    const badPotential = makeRaw().potential
    badPotential[5] = Number.NaN
    expect(() => encodeState(makeRaw({ potential: badPotential }))).toThrow(StateFileError)

    const badPsi = makeRaw().psi
    badPsi[7] = Number.NaN
    expect(() => encodeState(makeRaw({ psi: badPsi }))).toThrow(StateFileError)
  })

  it('THROWS on ±Infinity inside the arrays', () => {
    const infPotential = makeRaw().potential
    infPotential[0] = Number.POSITIVE_INFINITY
    expect(() => encodeState(makeRaw({ potential: infPotential }))).toThrow(StateFileError)

    const negInfPsi = makeRaw().psi
    negInfPsi[1] = Number.NEGATIVE_INFINITY
    expect(() => encodeState(makeRaw({ psi: negInfPsi }))).toThrow(StateFileError)
  })

  it('THROWS on a non-finite scalar', () => {
    expect(() => encodeState(makeRaw({ t: Number.NaN }))).toThrow(StateFileError)
    expect(() => encodeState(makeRaw({ dt: Number.POSITIVE_INFINITY }))).toThrow(StateFileError)
  })
})

describe('decodeState', () => {
  it('round-trips a saved state bit-exactly (negative floats and ±0 survive)', () => {
    const raw = makeRaw()
    // Pin the signed zeros explicitly: f32 -0 must come back as -0.
    raw.potential[0] = 0
    raw.potential[1] = -0
    raw.psi[0] = -0
    raw.psi[1] = 0

    const decoded = decodeState(JSON.parse(JSON.stringify(encodeState(raw))))

    expect(decoded.nx).toBe(raw.nx)
    expect(decoded.ny).toBe(raw.ny)
    expect(decoded.extentX).toBe(raw.extentX)
    expect(decoded.extentY).toBe(raw.extentY)
    expect(decoded.dt).toBe(raw.dt)
    expect(decoded.m).toBe(raw.m)
    expect(decoded.hbar).toBe(raw.hbar)
    expect(decoded.t).toBe(raw.t)
    expect(decoded.potential).toBeInstanceOf(Float32Array)
    expect(decoded.psi).toBeInstanceOf(Float32Array)
    expectSameBits(decoded.potential, raw.potential)
    expectSameBits(decoded.psi, raw.psi)
  })

  it('exercises the chunked b64 path (arrays larger than one 0x8000-byte chunk)', () => {
    // 128x128: potential alone is 65536 bytes = two 32768-byte chunks.
    const nx = 128
    const ny = 128
    const potential = new Float32Array(nx * ny)
    const psi = new Float32Array(2 * nx * ny)
    for (let i = 0; i < potential.length; i++) potential[i] = -1 + i * 1e-4
    for (let i = 0; i < psi.length; i++) psi[i] = Math.sin(i * 0.01)

    const raw = makeRaw({ nx, ny, potential, psi })
    const decoded = decodeState(encodeState(raw))
    expectSameBits(decoded.potential, potential)
    expectSameBits(decoded.psi, psi)
  })

  it('rejects version 2 with reason "version" (message names it)', () => {
    const saved: SavedState = { ...encodeState(makeRaw()), version: 2 }
    let error: unknown
    try {
      decodeState(saved)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(StateFileError)
    const stateError = error as StateFileError
    expect(stateError.reason).toBe('version')
    expect(stateError.message.toLowerCase()).toContain('version')
  })

  it('rejects wrong array lengths with reason "shape" (message says dimension)', () => {
    // psi one f32 short for its own nx/ny.
    const shortPsi = new Float32Array(2 * NX * NY - 1)
    const saved = encodeState(makeRaw())
    const bad: SavedState = { ...saved, psi: encodeState(makeRaw({ psi: shortPsi })).psi }
    let error: unknown
    try {
      decodeState(bad)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(StateFileError)
    const stateError = error as StateFileError
    expect(stateError.reason).toBe('shape')
    expect(stateError.message.toLowerCase()).toContain('dimension')

    // Potential too long fails the same way.
    const longPotential = encodeState(
      makeRaw({ potential: new Float32Array(NX * NY + 1) }),
    ).potential
    expect(() => decodeState({ ...saved, potential: longPotential })).toThrow(StateFileError)
  })

  it('rejects garbage payloads with reason "corrupt"', () => {
    for (const garbage of [null, 42, 'hello', [], true]) {
      let error: unknown
      try {
        decodeState(garbage)
      } catch (e) {
        error = e
      }
      expect(error, String(JSON.stringify(garbage))).toBeInstanceOf(StateFileError)
      expect((error as StateFileError).reason).toBe('corrupt')
    }

    // Missing fields.
    expect(() => decodeState({})).toThrow(StateFileError)
    // Non-b64 in the array fields.
    expect(() => decodeState({ ...encodeState(makeRaw()), potential: 'not!!b64??' })).toThrow(
      StateFileError,
    )
    // Non-finite scalar smuggled in (JSON.stringify keeps Infinity here).
    expect(() => decodeState({ ...encodeState(makeRaw()), t: Number.POSITIVE_INFINITY })).toThrow(
      StateFileError,
    )
  })

  it('rejects NaN smuggled INSIDE a decoded array (crafted b64), reason corrupt', () => {
    const saved = encodeState(makeRaw())
    // encodeState refuses NaN, so craft the payload by hand: the chunked
    // binary-string + btoa pipeline itself, fed bytes of a NaN-filled f32
    // array (the all-ones-exponent bit pattern survives base64 fine).
    const nanBytes = new Float32Array(NX * NY)
    nanBytes.fill(Number.NaN)
    const bytes = new Uint8Array(nanBytes.buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const crafted = { ...saved, potential: btoa(binary) }

    let error: unknown
    try {
      decodeState(crafted)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(StateFileError)
    expect((error as StateFileError).reason).toBe('corrupt')
  })
})

describe('encode -> decode identity (non-NaN path)', () => {
  it('is bit-exact through a full JSON file round-trip', () => {
    const raw = makeRaw({
      extentX: 20.5,
      extentY: 30.25,
      dt: 0.0025,
      m: 0.5,
      hbar: 1.0545718,
      t: 123.456,
    })
    // Sprinkle extremes: subnormals, huge magnitudes, tiny fractions.
    raw.psi[0] = 1e-42
    raw.psi[1] = 3.4e38
    raw.psi[2] = -2.5e-30
    raw.potential[3] = 1e-40

    const file = JSON.stringify(encodeState(raw))
    const decoded = decodeState(JSON.parse(file))
    expectSameBits(decoded.potential, raw.potential)
    expectSameBits(decoded.psi, raw.psi)
    expect(decoded.hbar).toBeCloseTo(raw.hbar, 12)
  })
})
