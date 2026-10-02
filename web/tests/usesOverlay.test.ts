// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import UsesOverlay from '../src/ui/UsesOverlay.svelte'
import { usesStore } from '../src/sim/usesStore.svelte.js'
import { getLang, setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'
import { USES_CARDS } from '../src/ui/usesData.js'

beforeEach(() => {
  setLang('en')
  location.hash = ''
})

afterEach(() => {
  cleanup()
  usesStore.close()
  setLang(getLang() === 'vi' ? 'en' : getLang())
  location.hash = ''
})

describe('UsesOverlay structure', () => {
  it('renders a labelled modal dialog with heading, intro and both group labels', () => {
    render(UsesOverlay)

    const dialog = screen.getByTestId('uses-overlay')
    expect(dialog.getAttribute('role')).toBe('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBe('uses-title-heading')
    expect(screen.getByText(enDict['uses.title']).id).toBe('uses-title-heading')
    expect(screen.getByText(enDict['uses.intro'])).toBeTruthy()
    expect(screen.getByText(enDict['uses.groupToday'])).toBeTruthy()
    expect(screen.getByText(enDict['uses.groupTomorrow'])).toBeTruthy()
  })

  it('renders all 8 cards, each with title, easy copy, physics line and label', () => {
    const { container } = render(UsesOverlay)

    for (const card of USES_CARDS) {
      const el = screen.getByTestId(`uses-card-${card.id}`)
      expect(el.textContent).not.toContain(enDict['uses.appLabel'])
      expect(el.textContent).toContain(enDict[`uses.${card.id}.title`])
      expect(el.textContent).toContain(enDict[`uses.${card.id}.easy`])
      expect(el.textContent).toContain(enDict[`uses.${card.id}.physics`])
    }
    expect(container.textContent).not.toContain(enDict['uses.physicsLabel'])
  })
})

describe('UsesOverlay watch chips', () => {
  it('renders chips on exactly the 5 honest cards, with the right href and label', () => {
    render(UsesOverlay)

    for (const card of USES_CARDS.filter((c) => c.watch !== undefined)) {
      const chip = screen.getByTestId(`uses-watch-${card.id}`) as HTMLAnchorElement
      expect(chip.tagName).toBe('A')
      expect(chip.getAttribute('href')).toBe(`#/sim/${card.watch}`)
      expect(chip.textContent).toBe(
        enDict['uses.watch'].replace('{name}', enDict[`preset.${card.watch}.title`]),
      )
    }
    expect(screen.queryByTestId('uses-watch-gps')).toBeNull()
    expect(screen.queryByTestId('uses-watch-chemistry')).toBeNull()
    expect(screen.queryByTestId('uses-watch-qsensing')).toBeNull()
  })
})

describe('UsesOverlay close paths', () => {
  it('Escape keydown and backdrop click both close the store', () => {
    render(UsesOverlay)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(usesStore.open).toBe(false)

    cleanup()
    render(UsesOverlay)
    fireEvent.click(screen.getByTestId('uses-backdrop'))
    expect(usesStore.open).toBe(false)
  })

  it('clicking a watch chip navigates the hash AND closes the store', () => {
    render(UsesOverlay)
    fireEvent.click(screen.getByTestId('uses-watch-flash'))
    expect(location.hash).toBe('#/sim/tunneling')
    expect(usesStore.open).toBe(false)
  })
})

describe('UsesOverlay focus management', () => {
  it('mounts focused on the close button; Shift+Tab wraps to the last focusable', () => {
    render(UsesOverlay)
    expect(document.activeElement).toBe(screen.getByTestId('uses-close'))

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(screen.getByTestId('uses-watch-qcompute'))
  })

  it('unmount restores focus to the recorded opener', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    usesStore.openFrom(opener)

    const view = render(UsesOverlay)
    view.unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

describe('UsesOverlay translations', () => {
  it('re-translates the heading and copy when the language flips while open', async () => {
    render(UsesOverlay)
    expect(screen.getByText(enDict['uses.title'])).toBeTruthy()

    setLang('vi')
    await tick()

    expect(screen.getByText(viDict['uses.title'])).toBeTruthy()
    expect(screen.queryByText(enDict['uses.title'])).toBeNull()
    expect(screen.getByTestId('uses-card-flash').textContent).toContain(
      viDict['uses.flash.title'],
    )
  })
})
