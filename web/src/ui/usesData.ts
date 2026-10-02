/**
 * Uses overlay card registry (spec 2026-10-02, section 6.1): which application
 * cards exist, which group renders them, and which preset honestly
 * demonstrates each phenomenon ("watch"). Structure only: every piece of copy
 * lives in the i18n `uses.*` keys, keyed by card id, so the parity test keeps
 * both languages in lockstep. The watch map is a product decision pinned by
 * tests/usesData.test.ts; a chip without an honest preset gets no `watch`.
 */
import type { PresetId } from '../presets/index.js'

export type UsesCardId =
  | 'flash'
  | 'stm'
  | 'chips'
  | 'gps'
  | 'chemistry'
  | 'sun'
  | 'qcompute'
  | 'qsensing'

export type UsesGroup = 'today' | 'tomorrow'

export interface UsesCard {
  id: UsesCardId
  group: UsesGroup
  watch?: PresetId
}

export const USES_CARDS: UsesCard[] = [
  { id: 'flash', group: 'today', watch: 'tunneling' },
  { id: 'stm', group: 'today', watch: 'tunneling' },
  { id: 'chips', group: 'today', watch: 'sandbox' },
  { id: 'gps', group: 'today' },
  { id: 'chemistry', group: 'today' },
  { id: 'sun', group: 'today', watch: 'tunneling' },
  { id: 'qcompute', group: 'tomorrow', watch: 'double-slit' },
  { id: 'qsensing', group: 'tomorrow' },
]
