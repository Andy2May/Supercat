import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

/**
 * Design-token contract (UI redesign T2, spec §4). app.css is the single
 * source of the global custom properties every later component consumes, so
 * this suite pins the file itself rather than a rendered page:
 *
 * - the 10 tokens exist with their exact pinned values;
 * - the base is dark-only (`color-scheme: dark`, zero
 *   `prefers-color-scheme` branches — component files still hold their light
 *   branches until their own tasks land);
 * - the T1 fonts.css import stays the first line (fonts.spec.ts e2e depends
 *   on it) and the body font stack is the formal Space Grotesk one, not the
 *   T1 temporary;
 * - the pinned palette actually passes WCAG AA: ≥4.5:1 for every text/accent
 *   role the tokens declare.
 *
 * Whitespace is flattened before substring checks so formatting (indent
 * style, spaces inside rgba()) cannot mask a value mismatch.
 */
const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const css = readFileSync(join(webRoot, 'src/app.css'), 'utf8')
const flat = css.replace(/\s+/g, '')

const TOKENS = [
  ['--bg-0', '#0B0E14'],
  ['--bg-1', '#0D1118'],
  ['--bg-2', '#11151D'],
  ['--line', 'rgba(255,255,255,0.08)'],
  ['--line-strong', 'rgba(255,255,255,0.14)'],
  ['--text-1', '#E8ECF1'],
  ['--text-2', '#9AA5B5'],
  ['--text-3', '#76808F'],
  ['--accent', '#5FD4E6'],
  ['--accent-ink', '#07131A'],
] as const

it('pins all 10 design tokens with their exact values', () => {
  for (const [name, value] of TOKENS) {
    expect(flat, `${name} is declared exactly as pinned`).toContain(
      `${name}:${value};`,
    )
  }
})

it('is dark-only: color-scheme dark and no prefers-color-scheme branches', () => {
  expect(flat).toContain('color-scheme:dark')
  expect(css).not.toContain('prefers-color-scheme')
})

it('keeps the fonts.css import as the first line', () => {
  expect(css.split('\n')[0]?.trim()).toBe("@import './fonts.css';")
})

it('formalizes the body font stack to Space Grotesk', () => {
  expect(flat).toContain("font-family:'SpaceGrotesk',system-ui,sans-serif;")
})

/* --- WCAG contrast -----------------------------------------------------
   Relative luminance per WCAG 2.1 (https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html):
   linearize each sRGB channel, weight 0.2126/0.7152/0.0722, then
   ratio = (L_light + 0.05) / (L_dark + 0.05). */
function luminance(hex: string): number {
  const channel = (h: string) => {
    const c = parseInt(h, 16) / 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const [r, g, b] = [0, 2, 4].map((i) => channel(hex.slice(1 + i, 3 + i)))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)]
  const [light, dark] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (light + 0.05) / (dark + 0.05)
}

/** Read a 6-digit-hex token back out of the file so contrast is checked
 *  against what app.css actually ships, not a copy pasted into this test. */
function hexToken(name: string): string {
  const match = flat.match(new RegExp(`${name}:(#[0-9A-Fa-f]{6});`))
  expect(match, `${name} must be declared as a 6-digit hex`).toBeTruthy()
  return match![1]
}

it('meets WCAG AA (>=4.5:1) for text and accent roles on their grounds', () => {
  const bg0 = hexToken('--bg-0')
  const cases: Array<[string, string, string]> = [
    ['--text-1', hexToken('--text-1'), bg0],
    ['--text-2', hexToken('--text-2'), bg0],
    ['--text-3', hexToken('--text-3'), bg0],
    ['--accent', hexToken('--accent'), bg0],
    ['--accent-ink', hexToken('--accent-ink'), hexToken('--accent')],
  ]
  for (const [name, fg, bg] of cases) {
    expect(contrast(fg, bg), `${name} on ${bg} must reach 4.5:1`).toBeGreaterThanOrEqual(4.5)
  }
})
