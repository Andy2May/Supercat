import { describe, expect, it } from 'vitest'

import { fftshift2d, interleaveScalarToRG } from '../src/sim/fftshift.js'

/**
 * fftshift2d (Task 12): the wasm `momentum_density()` comes in native
 * fftfreq order (k = 0 at bin 0); the momentum view needs k = 0 centered.
 * The ruling formula is
 *   dest[j*nx+i] = src[((j + ny/2) mod ny)*nx + ((i + nx/2) mod nx)]
 * (n even — every grid the app builds is). Tests below pin the formula
 * axis-by-axis with non-square grids so an nx/ny mixup cannot pass.
 */
describe('fftshift2d', () => {
  it('4x4 numbered 0..15 matches the hand-computed table', () => {
    const src = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    // dest[j][i] = src[(j+2)%4][(i+2)%4]:
    //   row0 <- src row2 rolled right 2: 10 11  8  9
    //   row1 <- src row3 rolled right 2: 14 15 12 13
    //   row2 <- src row0 rolled right 2:  2  3  0  1
    //   row3 <- src row1 rolled right 2:  6  7  4  5
    // k = 0 (src bin 0) lands at dest (2, 2) — the center of the grid.
    const expected = new Float32Array([10, 11, 8, 9, 14, 15, 12, 13, 2, 3, 0, 1, 6, 7, 4, 5])
    expect(Array.from(fftshift2d(src, 4, 4))).toEqual(Array.from(expected))
  })

  it('mod wraps on BOTH axes independently (non-square 6x4 catches nx/ny swaps)', () => {
    // nx = 6, ny = 4: halfX = 3, halfY = 2. Probe four corners + center-ish
    // bins through the ruling formula, hand-evaluated:
    const nx = 6
    const ny = 4
    const src = new Float32Array(nx * ny)
    for (let k = 0; k < src.length; k++) src[k] = k

    const dest = fftshift2d(src, nx, ny)
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const ruling = src[((j + ny / 2) % ny) * nx + ((i + nx / 2) % nx)]
        expect(dest[j * nx + i], `dest[${j}][${i}]`).toBe(ruling)
      }
    }
    // And the two axes shift by DIFFERENT halves (3 vs 2 columns/rows): a
    // swapped-axes implementation cannot reproduce this value.
    expect(dest[0]).toBe(src[2 * nx + 3]) // (0,0) <- src(2,3) = 15
    expect(dest[0]).toBe(15)
  })

  it('1xN edge case: a single row shifts only along x (y maps to itself)', () => {
    const src = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7])
    expect(Array.from(fftshift2d(src, 8, 1))).toEqual([4, 5, 6, 7, 0, 1, 2, 3])
  })

  it('round-trip: shift(shift(x)) === x on even grids (4x4 and 6x4)', () => {
    for (const [nx, ny] of [
      [4, 4],
      [6, 4],
      [2, 8],
    ] as const) {
      const src = new Float32Array(nx * ny)
      for (let k = 0; k < src.length; k++) src[k] = k * 0.25 - 3
      const twice = fftshift2d(fftshift2d(src, nx, ny), nx, ny)
      expect(Array.from(twice), `${nx}x${ny}`).toEqual(Array.from(src))
    }
  })

  it('returns a fresh array (never the source buffer — the worker transfers it)', () => {
    const src = new Float32Array([1, 2, 3, 4])
    const dest = fftshift2d(src, 2, 2)
    expect(dest).not.toBe(src)
    expect(src).toEqual(new Float32Array([1, 2, 3, 4])) // source untouched
  })
})

/**
 * The momentum density is one scalar per bin; uploadField wants the RG32F
 * (value, phase) interleaved layout. interleaveScalarToRG fills a reused
 * scratch buffer with (src[i], 0) pairs — zero phase channel.
 */
describe('interleaveScalarToRG', () => {
  it('writes (v, 0) pairs into the destination and returns it', () => {
    const src = new Float32Array([0.5, 1.5, 2.5])
    const dest = new Float32Array(6).fill(9) // stale garbage must be overwritten
    interleaveScalarToRG(src, dest)
    expect(Array.from(dest)).toEqual([0.5, 0, 1.5, 0, 2.5, 0])
  })

  it('overwrites the phase slot too (no stale phase leaks between frames)', () => {
    const dest = new Float32Array(4).fill(7)
    interleaveScalarToRG(new Float32Array([1, 2]), dest)
    expect(Array.from(dest)).toEqual([1, 0, 2, 0])
  })
})
