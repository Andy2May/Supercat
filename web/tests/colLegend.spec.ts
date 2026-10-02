import { expect, test } from '@playwright/test'

/**
 * Field colormap legend e2e: the on-canvas chip at the stage's bottom-right
 * naming what the wave-field colors mean — the inferno density ramp (low →
 * high |ψ|²), the HSV phase wheel (−π → +π, brightness still density), and
 * the momentum-space ramp (|ψ(k)|²). Companion to the V legend (bottom-left,
 * potential overlay); same pointer-transparent DOM-overlay pattern, but
 * present in BOTH experience modes — explore is where the colors need
 * naming most, and explore has no rail to host a legend.
 *
 * Language-independent assertions only, per repo convention: the low/high
 * labels are translated copy pinned in i18n.test.ts; the captions and
 * −π/+π are mono symbols shared by both dictionaries.
 */

/** Attaches the no-error collectors every scenario asserts at the end. */
function expectNoErrors(page: import('@playwright/test').Page): {
  consoleErrors: string[]
  pageErrors: string[]
} {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  return { consoleErrors, pageErrors }
}

test('colormap legend: never on landing, density in explore, follows view in advanced', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  const legend = page.getByTestId('col-legend')

  // The landing's decorative backdrop mounts the same SimCanvas in the
  // 'landing' variant: no readouts, no legends — a chip there would name
  // colors nothing is reading.
  await page.goto('/')
  await expect(page.getByTestId('sim-canvas').first()).toBeVisible({ timeout: 10_000 })
  await expect(legend).toHaveCount(0)

  // Explore boots the density ramp with no view controls in sight: the
  // legend must be there on its own, caption |ψ|² (NOT the k-space caption
  // — the strings share no substring). Free-packet keeps the V legend
  // hidden (V ≡ 0), so the colormap chip stands alone bottom-right.
  await page.goto('/#/sim/free-packet')
  await expect(legend).toBeVisible({ timeout: 10_000 })
  await expect(legend).toContainText('|ψ|²')
  await expect(legend).not.toContainText('|ψ(k)|²')
  await expect(legend).not.toContainText('−π')
  await expect(page.getByTestId('v-legend')).toBeHidden()
  // The strip is a real gradient chip, not a flat placeholder.
  await expect(page.getByTestId('col-strip')).toHaveCSS(
    'background-image',
    /linear-gradient/,
  )

  // Advanced + phase: the hue wheel variant names the branch-cut ends
  // (both red at −π and +π) and keeps the brightness = density reading.
  await page.getByTestId('mode-toggle').click()
  await page.getByTestId('phase-toggle').click()
  await expect(page.getByTestId('phase-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expect(legend).toContainText('−π')
  await expect(legend).toContainText('+π')
  // (No '|ψ|²' containment flip here: the phase note itself carries the
  // '|ψ|²' symbol — '−π' present + '|ψ(k)|²' absent is the discriminator.)

  // Explore flip with the flag still on underneath: the canvas falls back
  // to inferno via the effective-mode predicate, and the legend must follow
  // the CANVAS, not the stored flag — a wheel chip over an inferno canvas
  // would be the exact lie this legend exists to prevent.
  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('phase-toggle')).toBeHidden()
  await expect(legend).toContainText('|ψ|²')
  await expect(legend).not.toContainText('−π')

  // Back in advanced the flag resumes; the momentum view swaps the caption
  // to |ψ(k)|². ('|ψ|²' is not a substring of '|ψ(k)|²' — after ψ comes (
  // — so the two containText checks discriminate cleanly.)
  await page.getByTestId('mode-toggle').click()
  await page.getByTestId('phase-toggle').click()
  await expect(legend).toContainText('−π')
  await page.getByTestId('view-momentum').click()
  await expect(page.getByTestId('momentum-caption')).toBeVisible()
  await expect(legend).toContainText('|ψ(k)|²')
  await expect(legend).not.toContainText('|ψ|²')

  // Plain position (the segment cell clears the stored flag): density
  // variant again, wheel gone — the full round trip.
  await page.getByTestId('view-position').click()
  await expect(legend).toContainText('|ψ|²')
  await expect(legend).not.toContainText('−π')

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
