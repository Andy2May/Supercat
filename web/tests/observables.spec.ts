import { expect, test } from '@playwright/test'

/**
 * Observables strip e2e (Task 11). Advanced mode mounts the ObservablesBar;
 * the worker streams obs blocks (~15 Hz), so readouts populate and move
 * while the sim runs. Explore must not render the bar at all.
 *
 * Liveness is asserted through the ⟨x⟩ readout, not E: on free-packet
 * (V = 0) the split-step propagator is exact free evolution, so E is
 * conserved to ~1e-15 — a 2-decimal E readout correctly holds still while
 * everything else moves. energy-value is instead asserted to be a live,
 * finite number.
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

/** Polls the debug hook until the render loop has drawn `n` frames. */
function frames(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.frames ?? 0)
}

/** Text content of a readout inside the bar ('' until mounted). */
async function readout(
  page: import('@playwright/test').Page,
  testId: string,
): Promise<string> {
  const text = await page.getByTestId(testId).textContent()
  return text ?? ''
}

test('advanced mode shows the observables bar with live data; explore hides it', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Fresh context boots in explore (no persisted mode).
  await page.goto('/#/sim/free-packet')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  const bar = page.getByTestId('observables-bar')
  await expect(bar).toBeHidden()

  // Toggle advanced: the bar mounts and the worker flips its cadence on —
  // the first frame after the flag carries obs (no 4-frame dead delay).
  await page.getByTestId('mode-toggle').click()
  await expect(bar).toBeVisible()
  await expect
    .poll(() => readout(page, 'energy-value'), { timeout: 5_000 })
    .not.toBe('—')
  await expect
    .poll(() => readout(page, 'x-mean-value'), { timeout: 5_000 })
    .not.toBe('—')

  // Live data: readouts move while the sim runs. ⟨x⟩ drifts at kx·t; E is
  // conserved on this preset (exact free evolution), so it must simply stay
  // a finite number.
  const x1 = await readout(page, 'x-mean-value')
  const e1 = await readout(page, 'energy-value')
  expect(Number.isFinite(Number(x1))).toBe(true)
  expect(Number.isFinite(Number(e1))).toBe(true)

  await page.waitForTimeout(1_500)

  const x2 = await readout(page, 'x-mean-value')
  const e2 = await readout(page, 'energy-value')
  expect(x2).not.toBe(x1)
  expect(Number.isFinite(Number(e2))).toBe(true)

  // The jump note is rendered (it is the physics disclaimer for E).
  await expect(page.getByTestId('energy-jump-note')).toBeVisible()

  // Back to explore: the bar unmounts entirely.
  await page.getByTestId('mode-toggle').click()
  await expect(bar).toBeHidden()

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('a reload straight into advanced mode boots the strip with data', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Persisted advanced mode (Task 7 storage): the app must boot the bar
  // without anyone toggling — SimStore.init ships the cadence flag itself.
  await page.addInitScript(() => {
    window.localStorage.setItem('psiforge.mode', 'advanced')
  })
  await page.goto('/#/sim/free-packet')

  await expect(page.getByTestId('observables-bar')).toBeVisible()
  await expect
    .poll(() => readout(page, 'energy-value'), { timeout: 5_000 })
    .not.toBe('—')

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
