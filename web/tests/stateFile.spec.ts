import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

/**
 * JSON state save/load e2e (Task 17). Advanced-mode header buttons: Save
 * asks the worker for `serialize_state()` and downloads
 * `psiforge-state-<YYYYMMDD-HHmmss>.json`; Load feeds a file back through
 * decodeState + the worker's deserialize (which restores t and frames the
 * state at once). A corrupt/version-gated file must show the NON-fatal
 * load-error banner while the simulation keeps running — no fatal banner,
 * no console errors.
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

/** Drawn-frame counter from the always-on debug hook. */
function frames(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.frames ?? 0)
}

/** Current simulation time from the debug hook. */
function simTime(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.t ?? 0)
}

/** Boots a running sim in ADVANCED mode (fresh contexts start in explore)
 * and waits for real wasm frames. */
async function bootAdvanced(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/#/sim/free-packet')
  await page.getByTestId('mode-toggle').click()
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)
}

test('advanced: Save downloads a state JSON; Load restores the saved t', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await bootAdvanced(page)

  // Buttons are advanced-only; both must be reachable with names.
  const exportButton = page.getByTestId('export-json')
  const importButton = page.getByTestId('import-json')
  await expect(exportButton).toBeVisible()
  await expect(importButton).toBeVisible()
  await expect(exportButton).toHaveAccessibleName(/state|trạng thái/i)
  await expect(importButton).toHaveAccessibleName(/state|trạng thái/i)

  // Save: capture the sim time the file will hold, then click and collect
  // the browser download.
  const tSaved = await simTime(page)
  expect(tSaved).toBeGreaterThan(0)
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ])
  const name = download.suggestedFilename()
  expect(name).toMatch(/^psiforge-state-\d{8}-\d{6}\.json$/)

  // The artifact is a valid v1 state file with b64 arrays of the right
  // lengths for the running grid (256 unless ?grid= overrides it).
  const path = await download.path()
  expect(path).not.toBeNull()
  const file = JSON.parse(await readFile(path!, 'utf8')) as {
    version: number
    nx: number
    ny: number
    t: number
    potential: string
    psi: string
  }
  expect(file.version).toBe(1)
  expect(file.nx).toBe(file.ny)
  expect(file.nx).toBeGreaterThanOrEqual(128)
  expect(file.potential.length).toBeGreaterThan(0)
  expect(file.psi.length).toBeGreaterThan(file.potential.length)
  expect(Math.abs(file.t - tSaved)).toBeLessThan(0.5) // serialized near the click

  // Run on: t grows well past the saved value...
  await page.waitForTimeout(2_000)
  const tAfter = await simTime(page)
  expect(tAfter).toBeGreaterThan(tSaved + 0.5)

  // ...then Load the file back: t falls to (near) the saved value again —
  // the debug hook's t comes from worker frames, so polling it catches the
  // restore even though playback keeps advancing from there.
  await page.getByTestId('import-json-input').setInputFiles(path!)
  await expect
    .poll(() => simTime(page), { timeout: 5_000 })
    .toBeLessThan(tAfter)
  const tRestored = await simTime(page)
  expect(Math.abs(tRestored - tSaved)).toBeLessThan(0.5)

  // No load error on the happy path, and the loop is unharmed.
  await expect(page.getByTestId('load-error')).toBeHidden()
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('a version-2 file shows the load-error banner but never stops the simulation', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await bootAdvanced(page)

  // Grab a genuine file first, then bump its version: an honest test of the
  // guard against a well-formed but future-versioned file.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-json').click(),
  ])
  const path = await download.path()
  expect(path).not.toBeNull()
  const future = JSON.parse(await readFile(path!, 'utf8')) as Record<string, unknown>
  future.version = 2

  await page
    .getByTestId('import-json-input')
    .setInputFiles({ name: 'psiforge-state-future.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(future)) })

  // The NON-fatal banner appears (role=alert), with no fatal banner and no
  // reset button — the run state is untouched.
  const banner = page.getByTestId('load-error')
  await expect(banner).toBeVisible()
  await expect(banner).toHaveAttribute('role', 'alert')
  await expect(page.getByTestId('error-banner')).toBeHidden()

  // The simulation KEEPS RUNNING through the rejection: frames advance and
  // t keeps growing from wherever it was.
  const t1 = await simTime(page)
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)
  expect(await simTime(page)).toBeGreaterThan(t1)

  // Dismiss works, and the banner stays gone.
  await page.getByTestId('load-error-dismiss').click()
  await expect(banner).toBeHidden()

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
