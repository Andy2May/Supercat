// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import NarrationPanel from '../src/ui/NarrationPanel.svelte'
import { getLang, setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'

/**
 * NarrationPanel (UI redesign T5): the preset narration card for the left
 * rail — PresetCard restyled and relocated. Behavior pinned by the brief —
 *
 * - the three PresetCard testids survive the move: `preset-card` (open
 *   panel), `preset-card-toggle` (collapse), `preset-info` (the ⓘ that
 *   reopens, aria-labeled with preset.card.show);
 * - R4 viewport rule: open on mount iff window.innerHeight >= 800, read at
 *   mount time only — App keys the panel on the preset id, so every preset
 *   entry remounts it fresh and nothing is remembered between visits;
 * - the panel heading is the rail.briefing micro-label; the preset title
 *   and every '\n'-separated line of preset.<id>.card render;
 * - a language flip re-translates heading, title, lines and both controls.
 *
 * Runs in jsdom (pragma above) — the repo-wide node environment stays
 * untouched. jsdom's own innerHeight is 768 (< 800), so every test pins the
 * viewport height via vi.stubGlobal before mount; unstubAllGlobals restores
 * it after. The language store is module-global, so each test resets it.
 */

/** Boundary value: exactly 800 counts as tall (the rule is >= 800). */
const TALL = 800

beforeEach(() => {
  setLang('en')
  vi.stubGlobal('innerHeight', TALL)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  setLang(getLang() === 'vi' ? 'en' : getLang())
})

/** The '\n'-separated narration lines a dictionary carries for a preset. */
function linesOf(dict: Record<string, string>, id: string): string[] {
  return dict[`preset.${id}.card`].split('\n')
}

/** The rendered narration body: one <p> per dictionary line, in order. */
function renderedLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll('p')].map((p) => p.textContent ?? '')
}

// ------------------------------------------------------ R4 viewport rule

describe('NarrationPanel initial open state (R4)', () => {
  it.each([800, 1080])('mounts open when innerHeight is %i (>= 800)', (height) => {
    vi.stubGlobal('innerHeight', height)
    render(NarrationPanel, { props: { id: 'double-slit' } })

    expect(screen.getByTestId('preset-card')).toBeTruthy()
    expect(screen.queryByTestId('preset-info')).toBeNull()
  })

  it.each([768, 799])('mounts collapsed when innerHeight is %i (< 800)', (height) => {
    vi.stubGlobal('innerHeight', height)
    render(NarrationPanel, { props: { id: 'double-slit' } })

    expect(screen.queryByTestId('preset-card')).toBeNull()
    expect(screen.getByTestId('preset-info')).toBeTruthy()
  })

  it('reads the viewport at mount only — a remount forgets the collapse', async () => {
    render(NarrationPanel, { props: { id: 'double-slit' } })
    await fireEvent.click(screen.getByTestId('preset-card-toggle'))
    expect(screen.queryByTestId('preset-card')).toBeNull()
    cleanup() // App.svelte keys the panel on the preset id: entries remount

    render(NarrationPanel, { props: { id: 'double-slit' } })
    expect(screen.getByTestId('preset-card')).toBeTruthy()
  })
})

// ---------------------------------------------------------------- content

describe('NarrationPanel content', () => {
  it('heads the panel with the rail.briefing micro-label', () => {
    render(NarrationPanel, { props: { id: 'double-slit' } })
    expect(screen.getByText(enDict['rail.briefing'])).toBeTruthy()
  })

  it('renders the preset title and every dictionary line as its own paragraph', () => {
    const { container } = render(NarrationPanel, { props: { id: 'double-slit' } })

    expect(screen.getByText(enDict['preset.double-slit.title'])).toBeTruthy()
    expect(renderedLines(container), 'one <p> per \\n line, in order').toEqual(
      linesOf(enDict, 'double-slit'),
    )
  })

  it('narrates whichever preset the id prop names', () => {
    const { container } = render(NarrationPanel, { props: { id: 'tunneling' } })

    expect(screen.getByText(enDict['preset.tunneling.title'])).toBeTruthy()
    expect(renderedLines(container)).toEqual(linesOf(enDict, 'tunneling'))
  })
})

// -------------------------------------------------------- collapse/reopen

describe('NarrationPanel collapse and reopen', () => {
  it('toggle collapses to the ⓘ, ⓘ (labeled preset.card.show) reopens', async () => {
    render(NarrationPanel, { props: { id: 'double-slit' } })

    const toggle = screen.getByTestId('preset-card-toggle')
    expect(toggle.textContent).toContain(enDict['preset.card.collapse'])

    await fireEvent.click(toggle)
    expect(screen.queryByTestId('preset-card')).toBeNull()
    expect(screen.queryByTestId('preset-card-toggle')).toBeNull()

    const reopen = screen.getByTestId('preset-info')
    expect(reopen.getAttribute('aria-label')).toBe(enDict['preset.card.show'])

    await fireEvent.click(reopen)
    expect(screen.getByTestId('preset-card')).toBeTruthy()
    expect(screen.getByTestId('preset-card-toggle').textContent).toContain(
      enDict['preset.card.collapse'],
    )
  })
})

// -------------------------------------------------------------------- i18n

describe('NarrationPanel translations', () => {
  it('re-translates heading, title, lines and both controls on a flip', async () => {
    const { container } = render(NarrationPanel, { props: { id: 'double-slit' } })
    expect(screen.getByText(enDict['rail.briefing'])).toBeTruthy()

    setLang('vi')
    await tick()

    expect(screen.getByText(viDict['rail.briefing'])).toBeTruthy()
    expect(screen.queryByText(enDict['rail.briefing'])).toBeNull()
    expect(screen.getByText(viDict['preset.double-slit.title'])).toBeTruthy()
    expect(renderedLines(container)).toEqual(linesOf(viDict, 'double-slit'))

    expect(screen.getByTestId('preset-card-toggle').textContent).toContain(
      viDict['preset.card.collapse'],
    )
    await fireEvent.click(screen.getByTestId('preset-card-toggle'))
    expect(screen.getByTestId('preset-info').getAttribute('aria-label')).toBe(
      viDict['preset.card.show'],
    )
  })
})
