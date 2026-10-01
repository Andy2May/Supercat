import { expect, test } from '@playwright/test'

/**
 * V₀ legend (Task 18, spec 7.1): a pointer-transparent DOM overlay on the
 * sim canvas naming the potential overlay's colors and its live scale —
 * the M1 review finding that the orange wall read as a UI element. Visible
 * only where V is non-zero somewhere; the zero-potential scenes
 * (free-packet, sandbox) stay legendless until the user draws.
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

test('V legend: double-slit shows the scale (V₀ ≈ 30), free-packet hides it', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Double-slit boots with the V=30 wall: the first worker frame ships the
  // potential, the render loop uploads it and mirrors max |V| on the store
  // — the legend follows the upload, not a per-frame update.
  await page.goto('/#/sim/double-slit')
  const legend = page.getByTestId('v-legend')
  await expect(legend).toBeVisible({ timeout: 10_000 })
  // The wall pins the scale at 30; "V₀" is language-independent.
  await expect(legend).toContainText('V₀')
  await expect(legend).toContainText('30')

  // Free-packet boots with V ≡ 0 (the worker ships the zero potential on
  // its first frame too): prove the scene is alive, then pin the absence.
  await page.goto('/#/sim/free-packet')
  await expect
    .poll(() => page.evaluate(() => window.__psiforge?.frames ?? 0), {
      timeout: 5_000,
    })
    .toBeGreaterThan(10)
  await expect(page.getByTestId('v-legend')).toBeHidden()

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
