/**
 * Preset registry (M2): the five launch scenes as typed data — no behavior
 * beyond mapping a preset's potential onto its worker wire message.
 *
 * Physics values are pinned by the spec (§5.1 + the M1 default scene) and
 * asserted byte-for-byte in `tests/presets.test.ts`; changing a number here
 * is a product decision, not a refactor.
 */
import type { MainToWorker } from '../sim/protocol.js'

export type PresetId = 'double-slit' | 'tunneling' | 'free-packet' | 'harmonic' | 'sandbox'

export type PresetPotential =
  | { type: 'zero' }
  | { type: 'harmonic'; omega: number }
  | {
      type: 'wall'
      xCenter: number
      thickness: number
      value: number
      gapCenters: number[]
      gapWidths: number[]
    }

export interface PresetConfig {
  id: PresetId
  /** Grid edge count — 256 for every launch preset. */
  grid: number
  potential: PresetPotential
  /** Initial gaussian; the scene starts as the zero wavefunction when absent. */
  packet?: {
    x0: number
    y0: number
    kx: number
    ky: number
    sigmaX: number
    sigmaY: number
  }
  autoplay: boolean
  /** i18n key convention: `preset.<id>.title`. */
  titleKey: string
}

export const PRESETS: Record<PresetId, PresetConfig> = {
  // The M1 "wow moment", verbatim: wall thickness 0.6 (~4 cells at 256²,
  // the ledgered minimum so near-Nyquist components cannot pierce the
  // pillars), gaps at y=±3 of width 1.2.
  'double-slit': {
    id: 'double-slit',
    grid: 256,
    potential: {
      type: 'wall',
      xCenter: 0,
      thickness: 0.6,
      value: 30,
      gapCenters: [-3, 3],
      gapWidths: [1.2, 1.2],
    },
    packet: { x0: -10, y0: 0, kx: 6, ky: 0, sigmaX: 1.5, sigmaY: 1.5 },
    autoplay: true,
    titleKey: 'preset.double-slit.title',
  },
  // Sealed barrier — no gaps (~6-7 cells thick at 256²): E≈18 < V0=24, so
  // only the evanescent tail crosses (tunneling proper).
  tunneling: {
    id: 'tunneling',
    grid: 256,
    potential: {
      type: 'wall',
      xCenter: 0,
      thickness: 1.0,
      value: 24,
      gapCenters: [],
      gapWidths: [],
    },
    packet: { x0: -10, y0: 0, kx: 6, ky: 0, sigmaX: 1.5, sigmaY: 1.5 },
    autoplay: true,
    titleKey: 'preset.tunneling.title',
  },
  'free-packet': {
    id: 'free-packet',
    grid: 256,
    potential: { type: 'zero' },
    packet: { x0: 0, y0: 0, kx: 3, ky: 2, sigmaX: 2, sigmaY: 2 },
    autoplay: true,
    titleKey: 'preset.free-packet.title',
  },
  // Coherent-state elliptical orbit: offset packet with tangential momentum.
  // sigma = 1/sqrt(2) is the HO ground-state width for m = omega = hbar = 1,
  // making this a true coherent state: the width never breathes (physics
  // audit 2026-10-01, finding 3 — the old 1.2 throbbed 1.2 <-> 0.417 twice
  // per orbit while the narration promised it barely spreads).
  harmonic: {
    id: 'harmonic',
    grid: 256,
    potential: { type: 'harmonic', omega: 1 },
    packet: { x0: -6, y0: 0, kx: 0, ky: 3, sigmaX: Math.SQRT1_2, sigmaY: Math.SQRT1_2 },
    autoplay: true,
    titleKey: 'preset.harmonic.title',
  },
  // A still blob at the origin — the user paints the physics themselves.
  sandbox: {
    id: 'sandbox',
    grid: 256,
    potential: { type: 'zero' },
    packet: { x0: 0, y0: 0, kx: 0, ky: 0, sigmaX: 3, sigmaY: 3 },
    autoplay: false,
    titleKey: 'preset.sandbox.title',
  },
}

/** Landing-page card order (spec): the M1 hero scene first, sandbox last. */
export const LANDING_ORDER: PresetId[] = [
  'double-slit',
  'tunneling',
  'free-packet',
  'harmonic',
  'sandbox',
]

/** Maps a preset potential onto its `potential-*` worker message. */
export function potentialMessage(potential: PresetPotential): MainToWorker {
  switch (potential.type) {
    case 'zero':
      return { type: 'potential-zero' }
    case 'harmonic':
      return { type: 'potential-harmonic', omega: potential.omega }
    case 'wall':
      return {
        type: 'potential-wall',
        xCenter: potential.xCenter,
        thickness: potential.thickness,
        value: potential.value,
        gapCenters: potential.gapCenters,
        gapWidths: potential.gapWidths,
      }
  }
}
