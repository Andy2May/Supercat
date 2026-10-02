import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { en } from '../src/i18n/en.js'
import { vi } from '../src/i18n/vi.js'

/**
 * Em dash ban (AGENTS.md, user ruling 2026-10-02): no U+2014 in user-facing
 * copy, and none at all on the uses-feature source. Scope follows the repo's
 * "fix on touch" practice: the dictionaries are scanned by VALUE (their old
 * comment blocks keep their pre-ruling dashes until touched), while the new
 * modules and tests are scanned whole. Born from the final review of the
 * uses overlay (one slipped into a doc comment).
 */

/** Whole-file scans: new surface, expected clean everywhere. */
const FILES = [
  '../src/ui/usesData.ts',
  '../src/ui/UsesOverlay.svelte',
  '../src/sim/usesStore.svelte.ts',
  'usesData.test.ts',
  'usesStore.test.ts',
  'usesOverlay.test.ts',
]

describe('no em dash on the uses surface', () => {
  it.each(FILES)('%s contains no U+2014', (rel) => {
    const path = fileURLToPath(new URL(rel, import.meta.url))
    const text = readFileSync(path, 'utf8')
    expect(text.includes('\u2014'), `${rel} contains an em dash`).toBe(false)
  })

  it.each([
    ['en', en],
    ['vi', vi],
  ] as const)('%s dictionary values contain no U+2014', (name, dict) => {
    const offenders = Object.entries(dict)
      .filter(([value]) => value.includes('\u2014'))
      .map(([, value]) => value)
    expect(offenders, `${name} has em dashes in copy`).toEqual([])
  })
})
