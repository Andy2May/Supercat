import { describe, expect, it } from 'vitest'

import { USES_CARDS } from '../src/ui/usesData.js'
import { en } from '../src/i18n/en.js'
import { vi } from '../src/i18n/vi.js'

describe('USES_CARDS', () => {
  it('carries 8 cards in registry order: 6 today then 2 tomorrow', () => {
    expect(USES_CARDS.map((c) => c.id)).toEqual([
      'flash', 'stm', 'chips', 'gps', 'chemistry', 'sun', 'qcompute', 'qsensing',
    ])
    expect(USES_CARDS.filter((c) => c.group === 'today')).toHaveLength(6)
    expect(USES_CARDS.filter((c) => c.group === 'tomorrow')).toHaveLength(2)
  })

  it('gives exactly 5 cards a watch preset, with the honest map (spec 4.4)', () => {
    expect(
      USES_CARDS.filter((c) => c.watch !== undefined).map((c) => [c.id, c.watch]),
    ).toEqual([
      ['flash', 'tunneling'],
      ['stm', 'tunneling'],
      ['chips', 'sandbox'],
      ['sun', 'tunneling'],
      ['qcompute', 'double-slit'],
    ])
  })

  it('has every uses.* key in BOTH dictionaries (9 UI keys + 3 per card)', () => {
    const uiKeys = [
      'uses.open', 'uses.hook', 'uses.title', 'uses.intro',
      'uses.groupToday', 'uses.groupTomorrow', 'uses.watch', 'uses.close',
    ]
    for (const dict of [en, vi]) {
      for (const key of uiKeys) expect(dict[key], `${dict === en ? 'en' : 'vi'} ${key}`).toBeDefined()
      for (const card of USES_CARDS)
        for (const part of ['title', 'easy', 'physics'])
          expect(dict[`uses.${card.id}.${part}`]).toBeDefined()
    }
  })

  it('parameterizes the watch template on {name}', () => {
    expect(en['uses.watch']).toContain('{name}')
    expect(vi['uses.watch']).toContain('{name}')
  })
})
