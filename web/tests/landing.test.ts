// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import Landing from '../src/ui/Landing.svelte'
import SimCanvas from '../src/ui/SimCanvas.svelte'
import { hasWebGl2 } from '../src/sim/webglDetect.js'
import { getLang, setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'
import { LANDING_ORDER, type PresetId } from '../src/presets/index.js'
import { simStore } from '../src/sim/simStore.svelte.js'
import {
  debouncedPreset,
  landingStore,
  resetLandingStore,
} from '../src/sim/landingStore.svelte.js'

/**
 * Landing "theater" (UI redesign T9): a live sim background driven by the
 * film-strip selector, a hero, a glass nav and a blinking status line. Pinned
 * by the task brief —
 *
 * - the strip renders FIVE `preset-tile` anchors (data-preset + #/sim/<id>
 *   href) in LANDING_ORDER, numbered 01–04 with "—" for the sandbox;
 * - the status line composes `landing.status` with the CURRENT landing
 *   preset's localized title and re-translates on a language flip;
 * - hover/focus runs through the pure 150 ms `debouncedPreset` (one setter
 *   call with the LAST id when calls land inside the window, cancel drops a
 *   pending one);
 * - the landing OWNS its worker while mounted: init on mount (with the
 *   observables cadence OFF), destroy-then-init per debounce-landed switch,
 *   destroy on unmount (a pending debounce dies with it);
 * - without WebGL2 (mocked) NO SimCanvas and NO worker mount at all — the
 *   static gradient/grid fallback renders instead and everything else stays
 *   functional.
 *
 * Runs in jsdom (pragma above); the repo-wide node environment stays
 * untouched. `hasWebGl2` is module-mocked per test (Landing probes it once),
 * Worker is stubbed with a recording fake, and the module-global stores
 * (language + landingStore + simStore) are reset around every test.
 */

vi.mock('../src/sim/webglDetect.js', () => ({ hasWebGl2: vi.fn() }))

/** Recording Worker stand-in: messages + terminations are the assertions. */
class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  readonly messages: unknown[] = []
  terminated = false

  constructor() {
    FakeWorker.instances.push(this)
  }

  postMessage(msg: unknown): void {
    this.messages.push(msg)
  }

  terminate(): void {
    this.terminated = true
  }
}

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker as unknown as typeof Worker)
  vi.mocked(hasWebGl2).mockReturnValue(true)
  FakeWorker.instances = []
  setLang('en')
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.mocked(hasWebGl2).mockReset()
  simStore.destroy()
  resetLandingStore()
  setLang(getLang() === 'vi' ? 'en' : getLang())
})

/** The strip item for a preset (tiles carry the data-preset attribute). */
function tile(id: PresetId): HTMLElement {
  const el = document.querySelector(`[data-preset="${id}"]`)
  if (el === null) throw new Error(`no strip item for ${id}`)
  return el as HTMLElement
}

// ------------------------------------------------------------- debounce unit

describe('debouncedPreset (pure 150 ms debounce)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls the setter ONCE with the LAST id when five calls land < 150 ms apart', () => {
    const calls: PresetId[] = []
    const schedule = debouncedPreset((id) => calls.push(id))

    for (const id of LANDING_ORDER) {
      schedule(id)
      vi.advanceTimersByTime(60) // rapid sweep: gaps well under the window
    }
    expect(calls).toEqual([])

    vi.advanceTimersByTime(150)
    expect(calls).toEqual(['sandbox'])
  })

  it('fires once per settled call when calls land outside the window', () => {
    const calls: PresetId[] = []
    const schedule = debouncedPreset((id) => calls.push(id))

    schedule('double-slit')
    vi.advanceTimersByTime(150)
    schedule('tunneling')
    vi.advanceTimersByTime(150)
    expect(calls).toEqual(['double-slit', 'tunneling'])
  })

  it('cancel() drops a pending call', () => {
    const calls: PresetId[] = []
    const schedule = debouncedPreset((id) => calls.push(id))

    schedule('harmonic')
    schedule.cancel()
    vi.advanceTimersByTime(500)
    expect(calls).toEqual([])
  })
})

// --------------------------------------------------------- strip + hero DOM

describe('Landing strip and hero structure', () => {
  beforeEach(() => {
    // Structure tests run against the fallback page: cheaper than the canvas
    // path (no render loop) and it pins that the DOM is identical without
    // WebGL2 — exactly what the no-WebGL2 e2e relies on.
    vi.mocked(hasWebGl2).mockReturnValue(false)
  })

  it('renders five preset-tile links in registry order with their sim hrefs', () => {
    render(Landing)

    const tiles = screen.getAllByTestId('preset-tile')
    expect(tiles.map((el) => el.getAttribute('data-preset'))).toEqual(LANDING_ORDER)
    for (const el of tiles) {
      expect(el.tagName).toBe('A')
      expect(el.getAttribute('href')).toBe(`#/sim/${el.getAttribute('data-preset')}`)
    }
  })

  it('numbers the presets 01–04 and the sandbox "—"', () => {
    const { container } = render(Landing)

    const numbers = [...container.querySelectorAll('.exp .no')].map((el) => el.textContent)
    expect(numbers).toEqual(['01', '02', '03', '04', '—'])
  })

  it('renders the hero: kicker, two title lines, desc, both CTAs, hidden equation', () => {
    const { container } = render(Landing)

    // The hero's kicker, queried through the hero (the nav's "2D QUANTUM
    // LAB" brand tag is a second copy of the en string).
    const heroEl = screen.getByTestId('landing-hero')
    expect(heroEl.querySelector('.kicker')?.textContent).toBe(enDict['landing.kicker'])

    // The title is ONE key split('\n') into two lines separated by <br>.
    const heading = screen.getByRole('heading', { level: 1 })
    const [line1, line2] = enDict['landing.title'].split('\n')
    expect(heading.textContent).toBe(line1 + line2)
    expect(heading.querySelector('br')).toBeTruthy()

    expect(screen.getByText(enDict['landing.desc'])).toBeTruthy()
    expect(screen.getByText(enDict['landing.schrodinger']).getAttribute('aria-hidden')).toBe(
      'true',
    )

    const primary = screen.getByText(enDict['landing.ctaPrimary']).closest('a')
    expect(primary?.getAttribute('href')).toBe('#/sim/double-slit')
    const ghost = screen.getByText(enDict['landing.ctaFree']).closest('a')
    expect(ghost?.getAttribute('href')).toBe('#/sim/sandbox')
    expect(container).toBeTruthy()
  })

  it('renders the glass nav: SUPERCAT wordmark, GitHub pill, language toggle', async () => {
    const { container } = render(Landing)

    // The wordmark rides .mark b (the .mark lockup also carries the tag).
    const wordmark = container.querySelector('.mark b')
    expect(wordmark?.textContent).toBe('SUPERCAT')
    expect(wordmark?.querySelector('i')?.textContent).toBe('CAT')
    expect(container.querySelector('.mark .tag')?.textContent).toBe('2D QUANTUM LAB')

    const github = screen.getByText('GitHub')
    expect(github.getAttribute('href')).toBe('https://github.com/Andy2May/Supercat')
    expect(github.getAttribute('target')).toBe('_blank')
    expect(github.getAttribute('rel')).toBe('noopener')

    // The toggle offers the OTHER language (TopBar's flip-button contract).
    await fireEvent.click(screen.getByText(enDict['app.lang.switchToVi']))
    expect(getLang()).toBe('vi')
    expect(screen.getByText(viDict['app.lang.switchToEn'])).toBeTruthy()
  })
})

// ------------------------------------------------------------- status line

describe('Landing status line', () => {
  beforeEach(() => {
    vi.mocked(hasWebGl2).mockReturnValue(false)
  })

  it('composes landing.status with the current preset title (default double-slit)', () => {
    render(Landing)

    const status = screen.getByTestId('landing-status')
    expect(status.textContent).toContain(
      enDict['landing.status'].replace('{name}', enDict['preset.double-slit.title']),
    )
    // The static physics tag rides along.
    expect(status.textContent).toContain('|ψ|² · ħ = m = 1')
  })

  it('follows a debounce-landed hover switch and re-translates on a language flip', async () => {
    vi.useFakeTimers()
    render(Landing)

    await fireEvent.mouseEnter(tile('sandbox'))
    vi.advanceTimersByTime(150)
    await tick()

    const status = screen.getByTestId('landing-status')
    expect(status.textContent).toContain(
      enDict['landing.status'].replace('{name}', enDict['preset.sandbox.title']),
    )

    // Language flip re-translates the template AND the preset name.
    setLang('vi')
    await tick()
    expect(status.textContent).toContain(
      viDict['landing.status'].replace('{name}', viDict['preset.sandbox.title']),
    )
    vi.useRealTimers()
  })
})

// ---------------------------------------------------------- worker ownership

describe('Landing owns its sim worker while mounted', () => {
  it('inits the landing preset on mount with the observables cadence OFF', async () => {
    render(Landing)
    await tick()

    expect(FakeWorker.instances).toHaveLength(1)
    expect(simStore.running).toBe(true) // double-slit autoplays
    const cadence = lastCadence(FakeWorker.instances[0])
    expect(cadence?.on).toBe(false)
  })

  it('a debounce-landed hover swaps the worker: destroy the old, init the new', async () => {
    vi.useFakeTimers()
    render(Landing)
    await tick()
    const first = FakeWorker.instances[0]
    const epochBefore = simStore.epoch

    await fireEvent.focus(tile('tunneling'))
    vi.advanceTimersByTime(150)
    await tick()

    expect(first.terminated).toBe(true)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(simStore.epoch).toBeGreaterThan(epochBefore)
    expect(simStore.running).toBe(true) // tunneling autoplays
    vi.useRealTimers()
  })

  it('unmount terminates the worker and cancels a pending debounce', async () => {
    vi.useFakeTimers()
    render(Landing)
    await tick()

    // A pending (not yet landed) switch must never fire after unmount.
    await fireEvent.mouseEnter(tile('harmonic'))
    cleanup()

    expect(FakeWorker.instances[0].terminated).toBe(true)
    expect(landingStore.preset).toBe('double-slit')
    vi.useRealTimers()
  })
})

/** Latest `set-observables-cadence` message a fake worker received. */
function lastCadence(worker: FakeWorker): { on: boolean } | undefined {
  const hits = worker.messages.filter(
    (m) => (m as { type: string }).type === 'set-observables-cadence',
  )
  return hits.length > 0 ? (hits[hits.length - 1] as { on: boolean }) : undefined
}

// -------------------------------------------------------------- WebGL2 gate

describe('Landing without WebGL2', () => {
  it('renders the static fallback and mounts NO SimCanvas and NO worker', async () => {
    vi.mocked(hasWebGl2).mockReturnValue(false)
    const { container } = render(Landing)
    await tick()

    expect(container.querySelector('[data-testid="sim-canvas"]')).toBeNull()
    expect(container.querySelector('[data-testid="landing-fallback"]')).toBeTruthy()
    // No worker may ever be created while the fallback is showing.
    expect(FakeWorker.instances).toEqual([])
    // The page stays fully functional: tiles + hero + status.
    expect(screen.getAllByTestId('preset-tile')).toHaveLength(5)
    expect(screen.getByTestId('landing-hero')).toBeTruthy()
    expect(screen.getByTestId('landing-status')).toBeTruthy()
  })
})

// --------------------------------------------------------- SimCanvas variant

describe('SimCanvas variant prop', () => {
  // jsdom has no WebGL2: startSimLoop throws inside SimCanvas's guarded
  // effect (caught + handed to onRenderFailed), so silence the expected
  // console.error from that path.
  let errorSpy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    errorSpy.mockRestore()
  })

  it("landing variant: full-bleed stage class, no t-label, no overlay canvas", async () => {
    const { container } = render(SimCanvas, { props: { variant: 'landing' } })
    await tick()

    expect(container.querySelector('.stage.landing')).toBeTruthy()
    expect(container.querySelector('[data-testid="t-label"]')).toBeNull()
    expect(container.querySelector('canvas.overlay')).toBeNull()
  })

  it('app variant (default): square stage, t-label and overlay present', async () => {
    const { container } = render(SimCanvas)
    await tick()

    expect(container.querySelector('.stage.landing')).toBeNull()
    expect(container.querySelector('[data-testid="t-label"]')).toBeTruthy()
    expect(container.querySelector('canvas.overlay')).toBeTruthy()
  })
})
