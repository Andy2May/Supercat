// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import TopBar from '../src/ui/TopBar.svelte'
import { modeStore } from '../src/sim/modeStore.svelte.js'
import { getLang, setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'

/**
 * TopBar (UI redesign T8): the full-width workspace bar — back link,
 * PSI·FORGE wordmark, the scene label, the segmented mode control and the
 * language toggle. Pinned by the task brief —
 *
 * - `back-link` stays an anchor to '#/' labeled app.backToLanding;
 * - the wordmark is plain text "PSIFORGE" with "PSI" carried by its own
 *   element (accent styling);
 * - the scene label composes `scene.label` with the preset's title param;
 * - the segmented mode control keeps the e2e contract EXACTLY: one button
 *   `mode-toggle` whose click flips the mode and whose label names the
 *   TARGET mode; the current mode is a NON-interactive segment beside it
 *   (aria-current), highlighted as the pressed one;
 * - the language button flips the store and every derived label
 *   re-translates (scene label + both mode segments included).
 *
 * Runs in jsdom (pragma above). modeStore and the language store are
 * module-global, so every test resets both for order-independence.
 */

/** `scene.label` with its `{name}` filled from a dictionary's preset title. */
function sceneOf(dict: Record<string, string>, id: string): string {
  return dict['scene.label'].replace('{name}', dict[`preset.${id}.title`])
}

beforeEach(() => {
  modeStore.mode = 'explore'
  setLang('en')
})

afterEach(() => {
  cleanup()
  modeStore.mode = 'explore'
  setLang(getLang() === 'vi' ? 'en' : getLang())
})

// ------------------------------------------------------------ back + wordmark

describe('TopBar chrome', () => {
  it('renders back-link as an anchor to the landing hash with its label', () => {
    render(TopBar, { props: { id: 'double-slit' } })

    const back = screen.getByTestId('back-link')
    expect(back.tagName).toBe('A')
    expect(back.getAttribute('href')).toBe('#/')
    expect(back.textContent).toContain(enDict['app.backToLanding'])
  })

  it('renders the PSIFORGE wordmark with FORGE on its own accent element', () => {
    const { container } = render(TopBar, { props: { id: 'double-slit' } })

    // getByText cannot match the span (its text is split by the <i>), so
    // pin it through the class — the container-query idiom toolRail.test.ts
    // uses for its .value readouts.
    const mark = container.querySelector('.mark')
    expect(mark?.textContent).toBe('PSIFORGE')
    // "FORGE" rides the <i> so CSS can accent it (mockup pattern
    // PSI<i>FORGE</i>); "PSI" stays in the base text color.
    expect(mark?.querySelector('i')?.textContent).toBe('FORGE')
  })

  it('renders the scene label as the view heading (h1)', () => {
    render(TopBar, { props: { id: 'double-slit' } })

    const heading = screen.getByText(sceneOf(enDict, 'double-slit'))
    expect(heading.tagName).toBe('H1')
  })
})

// -------------------------------------------------------------- scene label

describe('TopBar scene label', () => {
  it('composes scene.label with the preset title of the id prop', () => {
    render(TopBar, { props: { id: 'double-slit' } })
    expect(screen.getByText(sceneOf(enDict, 'double-slit'))).toBeTruthy()

    cleanup()
    render(TopBar, { props: { id: 'harmonic' } })
    expect(screen.getByText(sceneOf(enDict, 'harmonic'))).toBeTruthy()
  })
})

// ------------------------------------------------------------ mode segment

describe('TopBar mode segment', () => {
  it('labels the mode-toggle button with the TARGET mode; the current mode is a non-interactive segment', () => {
    render(TopBar, { props: { id: 'double-slit' } })

    // Explore active: exactly one mode-toggle, and it names advanced.
    const toggle = screen.getByTestId('mode-toggle')
    expect(toggle.textContent).toBe(enDict['mode.advanced'])
    expect(toggle.tagName).toBe('BUTTON')

    // The pressed segment: current mode name, not a button, aria-current.
    const current = screen.getByText(enDict['mode.explore'])
    expect(current.tagName).not.toBe('BUTTON')
    expect(current.getAttribute('aria-current')).toBe('true')
  })

  it('clicking mode-toggle flips the store and re-derives both segments', async () => {
    render(TopBar, { props: { id: 'double-slit' } })

    await fireEvent.click(screen.getByTestId('mode-toggle'))
    expect(modeStore.mode).toBe('advanced')

    // The button now names explore; advanced is the pressed segment.
    expect(screen.getByTestId('mode-toggle').textContent).toBe(enDict['mode.explore'])
    expect(screen.getByText(enDict['mode.advanced']).getAttribute('aria-current')).toBe('true')

    // An external mode change re-derives the segment too.
    modeStore.mode = 'explore'
    await tick()
    expect(screen.getByTestId('mode-toggle').textContent).toBe(enDict['mode.advanced'])
  })

  it('titles the toggle with the full switchHint sentence for the target mode', () => {
    render(TopBar, { props: { id: 'double-slit' } })

    expect(screen.getByTestId('mode-toggle').getAttribute('title')).toBe(
      enDict['mode.switchHint'].replace('{mode}', enDict['mode.advanced']),
    )
  })
})

// ---------------------------------------------------------------- language

describe('TopBar language toggle', () => {
  it('flips the language; scene label, mode segment and back label re-translate', async () => {
    render(TopBar, { props: { id: 'double-slit' } })

    // English active: the button offers Vietnamese.
    await fireEvent.click(screen.getByText(enDict['app.lang.switchToVi']))
    expect(getLang()).toBe('vi')

    expect(screen.getByText(sceneOf(viDict, 'double-slit'))).toBeTruthy()
    expect(screen.queryByText(sceneOf(enDict, 'double-slit'))).toBeNull()
    expect(screen.getByTestId('mode-toggle').textContent).toBe(viDict['mode.advanced'])
    expect(screen.getByText(viDict['mode.explore'])).toBeTruthy()
    expect(screen.getByTestId('back-link').textContent).toContain(viDict['app.backToLanding'])

    // And back: the button now offers English.
    await fireEvent.click(screen.getByText(viDict['app.lang.switchToEn']))
    expect(getLang()).toBe('en')
    expect(screen.getByTestId('mode-toggle').textContent).toBe(enDict['mode.advanced'])
  })
})
