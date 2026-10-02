import { describe, expect, it } from 'vitest'

import { ModeStore, modeStore, type Mode } from '../src/sim/modeStore.svelte.js'

/**
 * Map-backed localStorage stand-in. The store takes storage through its
 * constructor seam, so node-env vitest (no DOM) still exercises the full
 * persistence path; production defaults to `window.localStorage`.
 */
function mockStorage(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

/** Every store gets fresh storage: ModeStore reads once at construction. */
function freshStore(seed: Record<string, string> = {}): ModeStore {
  return new ModeStore(mockStorage(seed))
}

describe('ModeStore', () => {
  it('defaults to explore with empty storage', () => {
    expect(freshStore().mode).toBe<Mode>('explore')
  })

  it('toggle() flips to advanced and persists supercat.mode', () => {
    const storage = mockStorage()
    const store = new ModeStore(storage)
    store.toggle()
    expect(store.mode).toBe<Mode>('advanced')
    expect(storage.getItem('supercat.mode')).toBe('advanced')
  })

  it('toggle() again returns to explore', () => {
    const store = freshStore()
    store.toggle()
    store.toggle()
    expect(store.mode).toBe<Mode>('explore')
  })

  it('a fresh instance reads the persisted mode back (post-reload)', () => {
    freshStore().toggle()
    // Same storage content, brand-new construction.
    const reloaded = new ModeStore(mockStorage({ 'supercat.mode': 'advanced' }))
    expect(reloaded.mode).toBe<Mode>('advanced')
  })

  it('a legacy psiforge.mode key still seeds the mode (pre-rebrand install)', () => {
    const reloaded = new ModeStore(mockStorage({ 'psiforge.mode': 'advanced' }))
    expect(reloaded.mode).toBe<Mode>('advanced')
  })

  it('a garbage persisted value falls back to explore', () => {
    const store = new ModeStore(mockStorage({ 'supercat.mode': 'quantum-flux' }))
    expect(store.mode).toBe<Mode>('explore')
  })

  it('constructs without any storage at all (node env) and still toggles', () => {
    const store = new ModeStore(undefined)
    expect(store.mode).toBe<Mode>('explore')
    store.toggle()
    expect(store.mode).toBe<Mode>('advanced')
  })

  it('a throwing setItem never breaks the in-memory toggle', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
    }
    const store = new ModeStore(broken)
    expect(() => store.toggle()).not.toThrow()
    expect(store.mode).toBe<Mode>('advanced')
  })

  it('a throwing getItem falls back to explore', () => {
    const hostile = {
      getItem: () => {
        throw new Error('security error')
      },
      setItem: () => {},
    }
    expect(new ModeStore(hostile).mode).toBe<Mode>('explore')
  })
})

describe('modeStore singleton', () => {
  it('is exported and usable without a DOM (node env default)', () => {
    expect(modeStore).toBeInstanceOf(ModeStore)
    // The module-level construction against a storage-less environment must
    // not have thrown; the toggle still works in memory (no persistence).
    const before = modeStore.mode
    expect(() => modeStore.toggle()).not.toThrow()
    expect(modeStore.mode).not.toBe(before)
  })
})
