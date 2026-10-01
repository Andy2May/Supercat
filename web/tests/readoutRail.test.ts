// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import ReadoutRail from '../src/ui/ReadoutRail.svelte'
import { simStore } from '../src/sim/simStore.svelte.js'
import { DEFAULTS } from '../src/sim/simParams.js'
import type { ObservablesFrame } from '../src/sim/protocol.js'
import { getLang, setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'

/**
 * ReadoutRail (UI redesign T6): the advanced-mode right rail consolidating
 * the old ObservablesBar (readouts + sparklines), ViewToggle (view segment
 * + contrast slider), and the header's export buttons. Pinned by the brief —
 *
 * - three sections, each headed by a rail.* micro-label, separated by
 *   hairlines (mockup ws-rail-r);
 * - READOUTS: the five numeric testids + energy-jump-note + three sparkline
 *   canvases, values mirroring the latest observablesHistory sample;
 * - F1 fold-in: the means chart draws on the fixed [-extent/2, +extent/2]
 *   range DERIVED from DEFAULTS.extent (the old hardcoded MEANS_RANGE = 20
 *   is gone). jsdom ships no 2d context, so the draw test stubs
 *   getContext and reads the range off the mapSeries spy — asserting the
 *   derivation at its real call site, not pixels;
 * - VIEW: a three-way segment (position / momentum / phase) carrying the
 *   ViewToggle testids AND their glossary Terms (momentumSpace / phase —
 *   the plain position label stays unwrapped); the momentum-view
 *   measurement trigger (measure-momentum, old ViewToggle else-branch)
 *   renders only while the momentum view is displayed and sends the
 *   worker a seeded measure-momentum message; view switches go through
 *   simStore.setView; the contrast slider keeps its binding and pinned
 *   min/max/step;
 * - EXPORT: Save / Load are entry points only — the two callback props
 *   fire; PNG export is NOT rendered here (the M2 spec keeps it in BOTH
 *   modes, so it lives in the always-mounted PlaybackBar — fix round R1;
 *   playbackBar.test.ts + export.spec.ts pin its home); the hidden file
 *   input hands the picked File to onImportFile and resets so re-picking
 *   the same file re-fires change;
 * - a language flip re-translates every label.
 *
 * Runs in jsdom (pragma above). simStore is the module-global singleton, so
 * every test resets the fields this component touches. The sparkline mock
 * wraps the REAL mapSeries (the component draws real polylines) and only
 * records its (values, lo, hi) args.
 */

const mocks = vi.hoisted(() => ({ mapSeries: vi.fn() }))
vi.mock('../src/sim/sparkline.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/sim/sparkline.js')>()
  mocks.mapSeries.mockImplementation(actual.mapSeries)
  return { ...actual, mapSeries: mocks.mapSeries }
})

/** An observables sample + timestamp, as receive() appends to the history. */
function sample(t: number, obs: ObservablesFrame): ObservablesFrame & { t: number } {
  return { t, ...obs }
}

/** Raw wire values chosen so every field is distinct (transposition trap). */
const RAW: ObservablesFrame = {
  x: 0.5,
  y: 1.5,
  sigmaX: 2.5,
  sigmaY: 3.5,
  px: 4.5,
  py: 5.5,
  sigmaPx: 6.5,
  sigmaPy: 7.5,
  kinetic: 8.5,
  potential: 9.5,
  energy: 10.5,
}

function props() {
  return {
    onSaveState: vi.fn(),
    onImportFile: vi.fn(),
  }
}

/**
 * jsdom's canvas has no 2d context (no `canvas` npm package): stub
 * getContext with a no-op recorder so the draw path runs end-to-end and the
 * mapSeries spy sees the chart ranges. Restored by restoreAllMocks below.
 */
function stubCanvas2d(): void {
  const ctx = {
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
}

beforeEach(() => {
  setLang('en')
  simStore.view = 'position'
  simStore.phaseColor = false
  simStore.contrast = 2.5
  simStore.fatal = undefined
  simStore.observablesHistory = []
  mocks.mapSeries.mockClear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  setLang('en')
  simStore.view = 'position'
  simStore.phaseColor = false
  simStore.contrast = 2.5
  simStore.fatal = undefined
  simStore.observablesHistory = []
})

// ----------------------------------------------------- F1: means range

describe('means chart range (F1 fold-in)', () => {
  it('draws the means chart on the fixed ±DEFAULTS.extent/2 range (20 for extent 40)', async () => {
    stubCanvas2d()
    simStore.observablesHistory = [sample(1, RAW), sample(2, RAW)]
    render(ReadoutRail, { props: props() })
    await tick()

    expect(DEFAULTS.extent).toBe(40)
    const range = DEFAULTS.extent / 2
    // mapSeries(values, lo, hi): the means chart (drawn first) must hand the
    // derived ±extent/2 range, never a re-hardcoded ±20.
    expect(mocks.mapSeries).toHaveBeenNthCalledWith(1, expect.anything(), -range, range)
    expect(mocks.mapSeries).toHaveBeenNthCalledWith(2, expect.anything(), -range, range)
  })
})

// ---------------------------------------------------------- section layout

describe('ReadoutRail section layout', () => {
  it('renders three sections headed by the rail.* micro-labels, hairline-separated', () => {
    const { container } = render(ReadoutRail, { props: props() })

    expect(screen.getByText(enDict['rail.readouts'])).toBeTruthy()
    expect(screen.getByText(enDict['rail.view'])).toBeTruthy()
    expect(screen.getByText(enDict['rail.export'])).toBeTruthy()
    expect(
      container.querySelectorAll('hr.hairline'),
      'two hairlines between three sections',
    ).toHaveLength(2)
  })
})

// ---------------------------------------------------------------- readouts

describe('ReadoutRail readouts', () => {
  it('shows em-dashes until the first observables frame lands', () => {
    render(ReadoutRail, { props: props() })

    for (const id of ['x-mean-value', 'y-mean-value', 'sigma-x-value', 'sigma-y-value', 'energy-value']) {
      expect(screen.getByTestId(id).textContent, id).toBe('—')
    }
  })

  it('mirrors the latest history sample (means, sigma products, energy)', () => {
    simStore.observablesHistory = [
      sample(1, { ...RAW, x: -9, energy: -1 }),
      sample(2, RAW),
    ]
    render(ReadoutRail, { props: props() })

    expect(screen.getByTestId('x-mean-value').textContent).toBe(RAW.x.toFixed(2))
    expect(screen.getByTestId('y-mean-value').textContent).toBe(RAW.y.toFixed(2))
    expect(screen.getByTestId('sigma-x-value').textContent).toBe((RAW.sigmaX * RAW.sigmaPx).toFixed(2))
    expect(screen.getByTestId('sigma-y-value').textContent).toBe((RAW.sigmaY * RAW.sigmaPy).toFixed(2))
    expect(screen.getByTestId('energy-value').textContent).toBe(RAW.energy.toFixed(2))
  })

  it('renders exactly three sparkline canvases with their chart aria-labels', () => {
    simStore.observablesHistory = [sample(1, RAW), sample(2, RAW)]
    const { container } = render(ReadoutRail, { props: props() })

    const canvases = container.querySelectorAll('canvas')
    expect(canvases).toHaveLength(3)
    const labels = Array.from(canvases).map((c) => c.getAttribute('aria-label'))
    expect(labels).toEqual([
      enDict['obs.chart.means'],
      enDict['obs.chart.sigma'],
      enDict['obs.chart.energy'],
    ])
  })

  it('carries the observables-bar testid and the energy-jump note over', () => {
    render(ReadoutRail, { props: props() })

    const bar = screen.getByTestId('observables-bar')
    expect(bar.getAttribute('aria-label')).toBe(enDict['obs.barLabel'])
    expect(screen.getByTestId('energy-jump-note').textContent).toContain(
      enDict['obs.energyJumpNote'],
    )
  })
})

// ------------------------------------------------------------- view segment

describe('ReadoutRail view segment', () => {
  it('renders the three ViewToggle testids as one group with translated labels', () => {
    render(ReadoutRail, { props: props() })

    const group = screen.getByTestId('view-toggle')
    expect(group.getAttribute('role')).toBe('group')
    expect(group.getAttribute('aria-label')).toBe(enDict['view.toggleLabel'])

    expect(screen.getByTestId('view-position').textContent).toContain(enDict['view.position'])
    expect(screen.getByTestId('view-momentum').textContent).toContain(enDict['view.momentum'])
    expect(screen.getByTestId('phase-toggle').textContent).toContain(enDict['view.phaseColor'])
  })

  it('keeps the glossary Terms on the momentum and phase labels (ViewToggle carry-over)', () => {
    render(ReadoutRail, { props: props() })

    // The Term renders the label inline plus a .term tip span; the plain
    // position label stays unwrapped (ViewToggle never wrapped it either).
    const momentumTerm = screen.getByTestId('view-momentum').querySelector('.term')
    expect(momentumTerm).toBeTruthy()
    expect(momentumTerm?.textContent).toContain(enDict['view.momentum'])
    expect(momentumTerm?.querySelector('.tip[role="tooltip"]')).toBeTruthy()

    const phaseTerm = screen.getByTestId('phase-toggle').querySelector('.term')
    expect(phaseTerm).toBeTruthy()
    expect(phaseTerm?.textContent).toContain(enDict['view.phaseColor'])
    expect(phaseTerm?.querySelector('.tip[role="tooltip"]')).toBeTruthy()

    expect(screen.getByTestId('view-position').querySelector('.term')).toBeNull()
  })

  it('boots with exactly the position segment pressed', () => {
    render(ReadoutRail, { props: props() })

    expect(screen.getByTestId('view-position').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('view-momentum').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByTestId('phase-toggle').getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking momentum switches simStore.view and moves the press', async () => {
    render(ReadoutRail, { props: props() })

    await fireEvent.click(screen.getByTestId('view-momentum'))

    expect(simStore.view).toBe('momentum')
    expect(screen.getByTestId('view-momentum').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('view-position').getAttribute('aria-pressed')).toBe('false')
  })

  it('clicking position returns to the position view', async () => {
    simStore.view = 'momentum'
    render(ReadoutRail, { props: props() })

    await fireEvent.click(screen.getByTestId('view-position'))

    expect(simStore.view).toBe('position')
    expect(screen.getByTestId('view-position').getAttribute('aria-pressed')).toBe('true')
  })

  it('the phase segment selects position view + phaseColor (exactly one pressed)', async () => {
    render(ReadoutRail, { props: props() })

    await fireEvent.click(screen.getByTestId('phase-toggle'))

    expect(simStore.view).toBe('position')
    expect(simStore.phaseColor).toBe(true)
    expect(screen.getByTestId('phase-toggle').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('view-position').getAttribute('aria-pressed')).toBe('false')

    // Leaving phase for the plain position view clears the flag — the two
    // segments are mutually exclusive display modes.
    await fireEvent.click(screen.getByTestId('view-position'))
    expect(simStore.phaseColor).toBe(false)
    expect(screen.getByTestId('view-position').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('phase-toggle').getAttribute('aria-pressed')).toBe('false')
  })

  it('picks up an external view flip (reactive press state)', async () => {
    render(ReadoutRail, { props: props() })

    simStore.view = 'momentum'
    await tick()

    expect(screen.getByTestId('view-momentum').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByTestId('view-position').getAttribute('aria-pressed')).toBe('false')
  })
})

// -------------------------------------------------------- momentum measure

describe('ReadoutRail momentum measurement trigger', () => {
  it('is absent in the position view (old ViewToggle visibility contract)', () => {
    render(ReadoutRail, { props: props() })
    expect(screen.queryByTestId('measure-momentum')).toBeNull()
  })

  it('appears once the momentum view is selected, with its tool label', async () => {
    render(ReadoutRail, { props: props() })

    await fireEvent.click(screen.getByTestId('view-momentum'))

    const trigger = screen.getByTestId('measure-momentum')
    expect(trigger.textContent).toContain(enDict['measure.momentumTool'])
  })

  it('a click sends the worker one measure-momentum message with a fresh 48-bit seed', async () => {
    const sendSpy = vi.spyOn(simStore, 'send')
    simStore.view = 'momentum'
    render(ReadoutRail, { props: props() })

    await fireEvent.click(screen.getByTestId('measure-momentum'))

    expect(sendSpy).toHaveBeenCalledTimes(1)
    const msg = sendSpy.mock.calls[0][0] as { type: string; seed: number }
    expect(msg.type).toBe('measure-momentum')
    expect(Number.isInteger(msg.seed)).toBe(true)
    expect(msg.seed).toBeGreaterThanOrEqual(0)
    expect(msg.seed).toBeLessThan(2 ** 48)
  })

  it('never pokes a dead sim: a fatal banner swallows the click', async () => {
    const sendSpy = vi.spyOn(simStore, 'send')
    simStore.view = 'momentum'
    simStore.fatal = 'debugFatal (test param)'
    render(ReadoutRail, { props: props() })

    await fireEvent.click(screen.getByTestId('measure-momentum'))

    expect(sendSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------- contrast

describe('ReadoutRail contrast slider', () => {
  it('keeps the pinned min/max/step and mirrors simStore.contrast', async () => {
    render(ReadoutRail, { props: props() })

    const slider = screen.getByTestId('contrast-slider') as HTMLInputElement
    expect(slider.min).toBe('0.5')
    expect(slider.max).toBe('2.5')
    expect(slider.step).toBe('0.05')
    expect(slider.value).toBe('2.5')

    simStore.contrast = 1.25
    await tick()
    expect(slider.value).toBe('1.25')
    // The mono readout beside the track follows the store (2 decimals).
    expect(screen.getByTestId('contrast-slider-value').textContent).toBe('1.25')
  })

  it('slider input drives simStore.contrast (two-way bind)', async () => {
    render(ReadoutRail, { props: props() })

    await fireEvent.input(screen.getByTestId('contrast-slider'), {
      target: { value: '0.75' },
    })
    expect(simStore.contrast).toBe(0.75)
  })

  it('labels the row with the view.contrast key', () => {
    render(ReadoutRail, { props: props() })
    expect(screen.getByText(enDict['view.contrast'])).toBeTruthy()
  })
})

// ------------------------------------------------------------------ export

describe('ReadoutRail export block', () => {
  it('does not render the PNG export button — the PlaybackBar owns it (no duplicate testid)', () => {
    render(ReadoutRail, { props: props() })

    expect(screen.queryByTestId('export-png')).toBeNull()
  })

  it('clicking Save fires onSaveState only', async () => {
    const p = props()
    render(ReadoutRail, { props: p })

    await fireEvent.click(screen.getByTestId('export-json'))

    expect(p.onSaveState).toHaveBeenCalledTimes(1)
    expect(p.onImportFile).not.toHaveBeenCalled()
  })

  it('clicking Load clicks the hidden file input (which accepts JSON)', async () => {
    render(ReadoutRail, { props: props() })

    const input = screen.getByTestId('import-json-input') as HTMLInputElement
    expect(input.type).toBe('file')
    expect(input.accept).toBe('.json,application/json')
    expect(input.hidden).toBe(true)

    const clickSpy = vi.spyOn(input, 'click')
    await fireEvent.click(screen.getByTestId('import-json'))
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('a file change hands the picked File to onImportFile and resets the input', async () => {
    const p = props()
    render(ReadoutRail, { props: p })

    const input = screen.getByTestId('import-json-input') as HTMLInputElement
    const file = new File(['{}'], 'state.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { value: [file] })

    await fireEvent.change(input)

    expect(p.onImportFile).toHaveBeenCalledTimes(1)
    expect(p.onImportFile).toHaveBeenCalledWith(file)
    // Reset so picking the SAME file again still fires a change event.
    expect(input.value).toBe('')
  })

  it('a change with no file is a silent no-op', async () => {
    const p = props()
    render(ReadoutRail, { props: p })

    const input = screen.getByTestId('import-json-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [] })

    await fireEvent.change(input)

    expect(p.onImportFile).not.toHaveBeenCalled()
  })

  it('labels the two buttons with the export/import keys', () => {
    render(ReadoutRail, { props: props() })

    expect(screen.getByTestId('export-json').textContent).toContain(enDict['export.json'])
    expect(screen.getByTestId('import-json').textContent).toContain(enDict['import.json'])
  })
})

// --------------------------------------------------------------------- i18n

describe('ReadoutRail translations', () => {
  it('re-translates every section label on a language flip', async () => {
    render(ReadoutRail, { props: props() })
    expect(screen.getByText(enDict['rail.readouts'])).toBeTruthy()

    setLang('vi')
    await tick()

    for (const key of ['rail.readouts', 'rail.view', 'rail.export']) {
      expect(screen.getByText(viDict[key]), key).toBeTruthy()
      expect(screen.queryByText(enDict[key]), key).toBeNull()
    }
    expect(screen.getByTestId('view-position').textContent).toContain(viDict['view.position'])
    expect(screen.getByTestId('phase-toggle').textContent).toContain(viDict['view.phaseColor'])
    expect(screen.getByTestId('import-json').textContent).toContain(viDict['import.json'])
    expect(screen.getByText(viDict['view.contrast'])).toBeTruthy()
    expect(screen.getByTestId('energy-jump-note').textContent).toContain(
      viDict['obs.energyJumpNote'],
    )
  })
})
