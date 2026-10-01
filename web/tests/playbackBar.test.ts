// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import PlaybackBar from '../src/ui/PlaybackBar.svelte'
import { simStore } from '../src/sim/simStore.svelte.js'
import { DEFAULTS } from '../src/sim/simParams.js'
import { setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'

/**
 * PlaybackBar (UI redesign T7): the in-place restyle of the transport bar
 * under the canvas (mockup `ws-play`). Behavior is pinned by the brief —
 *
 * - six testids survive (`play-pause`, `step`, `reset`, `restore-potential`,
 *   `speed-slider`, `export-png` — the PNG button stays until T8 moves it)
 *   plus the toolbar role/aria-label and the export button's aria-label;
 * - the play/pause label AND icon flip with `simStore.running`, and ONLY
 *   that button carries the `primary` class (accent fill);
 * - step/reset/restore-potential carry small inline svg icons; export-png
 *   keeps its bare label (T8 removes the button entirely);
 * - halted (fatal) disables play + step ONLY;
 * - handlers unchanged: play-pause toggles `running`, step pauses then sends
 *   `advance substeps:1`, reset calls `resetWave`, restore-potential sends
 *   its message, export-png calls `requestCapture`;
 * - the speed slider keeps min/max/step 0.1/5/0.1, two-way binding, and the
 *   toFixed(1) mono readout;
 * - labels re-translate on a language flip.
 *
 * Runs in jsdom (pragma above). simStore is the module-global singleton, so
 * every test resets the fields this bar touches.
 */

const TESTIDS = [
  'play-pause',
  'step',
  'reset',
  'restore-potential',
  'speed-slider',
  'export-png',
] as const

function play(): HTMLButtonElement {
  return screen.getByTestId('play-pause') as HTMLButtonElement
}

/**
 * simStore.speed's FIELD type is the literal `1` (DEFAULTS is `as const` and
 * the store initializes from it), so writing any other speed from TS needs a
 * widened view of the store — at runtime it is an ordinary number the slider
 * binds both ways.
 */
function setSpeed(value: number): void {
  ;(simStore as { speed: number }).speed = value
}

beforeEach(() => {
  setLang('en')
  simStore.running = false
  simStore.fatal = undefined
  simStore.speed = DEFAULTS.speed
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setLang('en')
  simStore.running = false
  simStore.fatal = undefined
  simStore.speed = DEFAULTS.speed
})

// ------------------------------------------------------------ testids / a11y

describe('PlaybackBar structure', () => {
  it('renders a toolbar with all six testids and their aria-labels', () => {
    render(PlaybackBar)

    const bar = screen.getByRole('toolbar')
    expect(bar.getAttribute('aria-label')).toBe(enDict['playback.barLabel'])

    for (const id of TESTIDS) {
      expect(screen.getByTestId(id), id).toBeTruthy()
    }
    // The export button's accessible name mirrors its visible text.
    expect(
      screen.getByTestId('export-png').getAttribute('aria-label'),
    ).toBe(enDict['export.png'])
  })

  it('carries the primary class on the play-pause button and nowhere else', () => {
    render(PlaybackBar)

    expect(play().classList.contains('primary')).toBe(true)
    for (const id of ['step', 'reset', 'restore-potential', 'export-png']) {
      expect(
        screen.getByTestId(id).classList.contains('primary'),
        id,
      ).toBe(false)
    }
  })

  it('gives step/reset/restore-potential inline icons, export-png none', () => {
    render(PlaybackBar)

    for (const id of ['step', 'reset', 'restore-potential']) {
      const svg = screen.getByTestId(id).querySelector('svg')
      expect(svg, `${id} renders an inline svg`).toBeTruthy()
      expect(svg!.getAttribute('viewBox')).toBe('0 0 24 24')
      expect(svg!.querySelector('path, rect'), `${id} draws something`).toBeTruthy()
    }
    // T8 removes this button — no icon investment in the meantime.
    expect(screen.getByTestId('export-png').querySelector('svg')).toBeNull()
  })
})

// --------------------------------------------------- play/pause label + icon

describe('play/pause flip', () => {
  it('shows the play label + triangle when paused, pause label + two bars when running', async () => {
    render(PlaybackBar)
    const btn = play()

    // Paused: "Play" with a single filled triangle.
    expect(btn.textContent).toContain(enDict['app.play'])
    expect(btn.querySelectorAll('svg rect').length).toBe(0)
    expect(btn.querySelector('svg path')).toBeTruthy()

    simStore.running = true
    await tick()

    // Running: "Pause" with two rounded bars.
    expect(btn.textContent).toContain(enDict['app.pause'])
    expect(btn.querySelectorAll('svg rect').length).toBe(2)
    expect(btn.querySelector('svg path')).toBeNull()

    simStore.running = false
    await tick()
    expect(btn.textContent).toContain(enDict['app.play'])
    expect(btn.querySelectorAll('svg rect').length).toBe(0)
  })
})

// ------------------------------------------------------------------- halted

describe('fatal halts play and step only', () => {
  it('disables play + step while fatal; reset/restore/export stay enabled', async () => {
    simStore.fatal = 'boom'
    render(PlaybackBar)

    expect(play().disabled).toBe(true)
    expect((screen.getByTestId('step') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('reset') as HTMLButtonElement).disabled).toBe(false)
    expect(
      (screen.getByTestId('restore-potential') as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(
      (screen.getByTestId('export-png') as HTMLButtonElement).disabled,
    ).toBe(false)

    // Recovery: clearing the fatal re-enables both.
    simStore.fatal = undefined
    await tick()
    expect(play().disabled).toBe(false)
    expect((screen.getByTestId('step') as HTMLButtonElement).disabled).toBe(false)
  })
})

// ----------------------------------------------------------------- handlers

describe('PlaybackBar handlers', () => {
  it('play-pause toggles simStore.running', async () => {
    render(PlaybackBar)
    expect(simStore.running).toBe(false)

    await fireEvent.click(play())
    expect(simStore.running).toBe(true)

    await fireEvent.click(play())
    expect(simStore.running).toBe(false)
  })

  it('step pauses first, then sends exactly one advance substep', async () => {
    const send = vi.spyOn(simStore, 'send')
    simStore.running = true
    render(PlaybackBar)

    await fireEvent.click(screen.getByTestId('step'))

    // Paused (the step must not ride a running loop)...
    expect(simStore.running).toBe(false)
    // ...and exactly one propagator step went to the worker.
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: 'advance', substeps: 1 })
  })

  it('reset calls resetWave', async () => {
    const resetWave = vi.spyOn(simStore, 'resetWave')
    render(PlaybackBar)

    await fireEvent.click(screen.getByTestId('reset'))
    expect(resetWave).toHaveBeenCalledTimes(1)
  })

  it('restore-potential sends its worker message', async () => {
    const send = vi.spyOn(simStore, 'send')
    render(PlaybackBar)

    await fireEvent.click(screen.getByTestId('restore-potential'))
    expect(send).toHaveBeenCalledWith({ type: 'restore-potential' })
  })

  it('export-png queues a capture', async () => {
    const requestCapture = vi.spyOn(simStore, 'requestCapture')
    render(PlaybackBar)

    await fireEvent.click(screen.getByTestId('export-png'))
    expect(requestCapture).toHaveBeenCalledTimes(1)
  })
})

// -------------------------------------------------------------- speed slider

describe('speed slider', () => {
  it('keeps the pinned min/max/step and two-way binding with toFixed(1) readout', async () => {
    setSpeed(2)
    const { container } = render(PlaybackBar)

    const slider = screen.getByTestId('speed-slider') as HTMLInputElement
    expect(slider.min).toBe('0.1')
    expect(slider.max).toBe('5')
    expect(slider.step).toBe('0.1')
    expect(slider.value).toBe('2')
    expect(container.querySelector('.slider .value')?.textContent).toBe('2.0')
    expect(screen.getByText(enDict['playback.speed'])).toBeTruthy()

    // External store change -> slider + mono readout follow.
    setSpeed(3.2)
    await tick()
    expect(slider.value).toBe('3.2')
    expect(container.querySelector('.slider .value')?.textContent).toBe('3.2')

    // Slider input -> store (two-way).
    await fireEvent.input(slider, { target: { value: '4.5' } })
    expect(simStore.speed).toBe(4.5)
    expect(container.querySelector('.slider .value')?.textContent).toBe('4.5')
  })
})

// --------------------------------------------------------------------- i18n

describe('PlaybackBar labels', () => {
  it('re-translates every label on a language flip', async () => {
    setLang('vi')
    render(PlaybackBar)

    const bar = screen.getByRole('toolbar')
    expect(bar.getAttribute('aria-label')).toBe(viDict['playback.barLabel'])
    expect(play().textContent).toContain(viDict['app.play'])
    expect(screen.getByTestId('step').textContent).toContain(viDict['playback.step'])
    expect(screen.getByTestId('reset').textContent).toContain(viDict['playback.reset'])
    expect(screen.getByTestId('restore-potential').textContent).toContain(
      viDict['playback.restorePotential'],
    )
    expect(screen.getByTestId('export-png').textContent).toContain(
      viDict['export.png'],
    )
    expect(screen.getByText(viDict['playback.speed'])).toBeTruthy()

    // The running-state label re-translates too.
    simStore.running = true
    await tick()
    expect(play().textContent).toContain(viDict['app.pause'])

    setLang('en')
    await tick()
    expect(play().textContent).toContain(enDict['app.pause'])
    expect(screen.getByTestId('step').textContent).toContain(enDict['playback.step'])
    expect(screen.queryByText(viDict['playback.speed'])).toBeNull()
  })
})
