// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { usesStore } from '../src/sim/usesStore.svelte.js'

beforeEach(() => {
  usesStore.close()
})

describe('usesStore', () => {
  it('starts closed', () => {
    expect(usesStore.open).toBe(false)
  })

  it('openFrom(el) opens and records the opener', () => {
    const el = document.createElement('button')
    usesStore.openFrom(el)
    expect(usesStore.open).toBe(true)
    expect(usesStore.opener).toBe(el)
  })

  it('close() clears open; opener stays readable for the overlay destroy hook', () => {
    const el = document.createElement('button')
    usesStore.openFrom(el)
    usesStore.close()
    expect(usesStore.open).toBe(false)
    expect(usesStore.opener).toBe(el)
  })

  it('openFrom while already open: stays open, opener = the latest element', () => {
    const first = document.createElement('button')
    const second = document.createElement('button')
    usesStore.openFrom(first)
    usesStore.openFrom(second)
    expect(usesStore.open).toBe(true)
    expect(usesStore.opener).toBe(second)
  })
})
