// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte'
import { tick } from 'svelte'

import ToolRail from '../src/ui/ToolRail.svelte'
import { toolState } from '../src/sim/toolStore.svelte.js'
import { getLang, setLang } from '../src/i18n/index.js'
import { en as enDict } from '../src/i18n/en.js'
import { vi as viDict } from '../src/i18n/vi.js'
import type { Tool } from '../src/sim/tools.js'

/**
 * ToolRail (UI redesign T4): the left-rail tool grid + contextual params
 * block. Pinned by the task brief —
 *
 * - six buttons, testid `tool-<tool>`, `aria-pressed` tracking toolState.tool;
 * - contextual params: brush/barrier/well → `height-slider` only, packet →
 *   `k-slider` only, eraser/measure → neither; `compact` hides the block;
 * - sliders carry the store's historical min/max/step and bind toolState;
 * - per-tool icon stroke colors (physics palette; measure uses the accent);
 * - labels re-translate on a language flip (rail.tools header included).
 *
 * The suite runs in jsdom (pragma above) — the only file needing a DOM, so
 * the repo-wide node environment stays untouched. toolState is module-global
 * $state, so every test resets it (and the language) to keep order-independence.
 */

const TOOLS: readonly Tool[] = [
  'brush',
  'barrier',
  'well',
  'eraser',
  'packet',
  'measure',
]

/** Pinned icon stroke per tool (brief + mockup `ws-rail-l`). */
const ICON_COLORS: Array<[Tool, string]> = [
  ['brush', '#F2730D'],
  ['barrier', '#F2730D'],
  ['well', '#1F9EB8'],
  ['eraser', '#8b94a3'],
  ['packet', '#E6C040'],
  ['measure', 'var(--accent)'],
]

function button(tool: Tool): HTMLElement {
  return screen.getByTestId(`tool-${tool}`)
}

beforeEach(() => {
  toolState.tool = 'brush'
  toolState.height = 5
  toolState.kMag = 4
  setLang('en')
})

afterEach(() => {
  cleanup()
  toolState.tool = 'brush'
  toolState.height = 5
  toolState.kMag = 4
  setLang(getLang() === 'vi' ? 'en' : getLang())
})

// ------------------------------------------------------------------ buttons

describe('ToolRail tool grid', () => {
  it('renders six buttons whose aria-pressed tracks toolState.tool', () => {
    toolState.tool = 'well'
    render(ToolRail)

    for (const tool of TOOLS) {
      const pressed = button(tool).getAttribute('aria-pressed')
      expect(pressed, `${tool} has aria-pressed`).toBe(tool === 'well' ? 'true' : 'false')
    }
  })

  it('clicking a button selects that tool and un-presses the previous one', async () => {
    render(ToolRail)
    expect(button('brush').getAttribute('aria-pressed')).toBe('true')

    await fireEvent.click(button('packet'))

    expect(toolState.tool).toBe('packet')
    expect(button('packet').getAttribute('aria-pressed')).toBe('true')
    expect(button('brush').getAttribute('aria-pressed')).toBe('false')
  })

  it('marks the pressed button again after toolState.tool changes externally', async () => {
    render(ToolRail)

    toolState.tool = 'measure'
    await tick()

    expect(button('measure').getAttribute('aria-pressed')).toBe('true')
    expect(button('brush').getAttribute('aria-pressed')).toBe('false')
  })
})

// ---------------------------------------------------------- contextual params

describe('ToolRail contextual params', () => {
  // [tool, expected slider] — brush/barrier/well are the V-tools (height),
  // packet edits |k|, eraser and measure take no parameters.
  const CASES: Array<[Tool, 'height' | 'kMag' | null]> = [
    ['brush', 'height'],
    ['barrier', 'height'],
    ['well', 'height'],
    ['packet', 'kMag'],
    ['eraser', null],
    ['measure', null],
  ]

  it('shows exactly the slider the active tool needs (none for eraser/measure)', async () => {
    const { container } = render(ToolRail)

    for (const [tool, param] of CASES) {
      toolState.tool = tool
      await tick()

      expect(
        screen.queryByTestId('height-slider') !== null,
        `${tool}: height slider`,
      ).toBe(param === 'height')
      expect(screen.queryByTestId('k-slider') !== null, `${tool}: k slider`).toBe(
        param === 'kMag',
      )
      // No tool shows both sliders at once.
      expect(container.querySelectorAll('input[type="range"]').length, tool).toBe(
        param === null ? 0 : 1,
      )
    }
  })

  it('compact={true} hides the params block entirely, whatever the tool', async () => {
    render(ToolRail, { props: { compact: true } })

    for (const tool of ['brush', 'packet'] as Tool[]) {
      toolState.tool = tool
      await tick()

      expect(screen.queryByTestId('height-slider'), tool).toBeNull()
      expect(screen.queryByTestId('k-slider'), tool).toBeNull()
    }
  })

  it('keeps the pinned min/max/step and mirrors the store values', async () => {
    const { container } = render(ToolRail)

    const height = screen.getByTestId('height-slider') as HTMLInputElement
    expect(height.min).toBe('0.5')
    expect(height.max).toBe('20')
    expect(height.step).toBe('0.5')

    toolState.height = 7.5
    await tick()
    expect(height.value).toBe('7.5')
    // The mono value readout beside the slider follows the store too.
    expect(container.querySelector('.value')?.textContent).toBe('7.5')

    toolState.tool = 'packet'
    await tick()
    const k = screen.getByTestId('k-slider') as HTMLInputElement
    expect(k.min).toBe('0')
    expect(k.max).toBe('15')
    expect(k.step).toBe('0.5')

    toolState.kMag = 12.5
    await tick()
    expect(k.value).toBe('12.5')
    expect(container.querySelector('.value')?.textContent).toBe('12.5')
  })

  it('slider input drives toolState (two-way bind)', async () => {
    render(ToolRail)

    await fireEvent.input(screen.getByTestId('height-slider'), {
      target: { value: '12' },
    })
    expect(toolState.height).toBe(12)

    toolState.tool = 'packet'
    await tick()
    await fireEvent.input(screen.getByTestId('k-slider'), {
      target: { value: '6.5' },
    })
    expect(toolState.kMag).toBe(6.5)
  })
})

// -------------------------------------------------------------------- icons

describe('ToolRail icons', () => {
  it('gives every button a 24-viewBox svg with its pinned stroke color', () => {
    render(ToolRail)

    for (const [tool, color] of ICON_COLORS) {
      const btn = button(tool)
      const svg = btn.querySelector('svg')
      expect(svg, `${tool} renders an inline svg`).toBeTruthy()
      expect(svg!.getAttribute('viewBox'), `${tool} viewBox`).toBe('0 0 24 24')
      expect(svg!.querySelector('path, circle'), `${tool} draws something`).toBeTruthy()
      // The stroke color rides a --icon custom property set on the button
      // (CSS maps it onto the svg), so var(--accent) works for measure.
      expect(btn.style.getPropertyValue('--icon').trim(), `${tool} stroke`).toBe(color)
    }
  })
})

// ------------------------------------------------------------------- i18n

describe('ToolRail labels', () => {
  it('translates via t() and re-translates on a language flip', async () => {
    setLang('en')
    render(ToolRail)

    expect(button('barrier').textContent).toContain(enDict['tool.barrier'])
    expect(button('measure').textContent).toContain(enDict['measure.positionTool'])
    expect(screen.getByText(enDict['rail.tools'])).toBeTruthy()

    setLang('vi')
    await tick()

    expect(button('barrier').textContent).toContain(viDict['tool.barrier'])
    expect(button('measure').textContent).toContain(viDict['measure.positionTool'])
    expect(screen.getByText(viDict['rail.tools'])).toBeTruthy()
    expect(screen.queryByText(enDict['rail.tools'])).toBeNull()
  })

  it('labels the active param row with its tool.* key', async () => {
    render(ToolRail)
    expect(screen.getByText(enDict['tool.height'])).toBeTruthy()

    toolState.tool = 'packet'
    await tick()
    expect(screen.getByText(enDict['tool.kMag'])).toBeTruthy()
    expect(screen.queryByText(enDict['tool.height'])).toBeNull()
  })
})
