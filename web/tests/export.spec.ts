import { stat } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

/**
 * PNG canvas export e2e (Task 16; moved to the ReadoutRail by the T8 UI
 * redesign). The export button lives in the advanced-only right rail's
 * "Xuất" block (it left the always-on playback bar with the redesign) and
 * queues a capture that the render loop fires inside its frame callback,
 * synchronously after draw() (the preserveDrawingBuffer:false backbuffer
 * is only readable in that same task). Each scenario waits for real wasm
 * frames first, so the captured bitmap is an actual heatmap, then asserts
 * the browser download: `psiforge-<YYYYMMDD-HHmmss>.png` (local time)
 * with real content (> 5 KB — an empty/cleared canvas PNG compresses to
 * well under that).
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

test('PNG export (advanced mode): download fires, timestamp name, real heatmap content', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/double-slit')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // The export button now lives in the advanced-only ReadoutRail: explore
  // must not render it, and entering advanced mounts it.
  await expect(page.getByTestId('export-png')).toBeHidden()
  await page.getByTestId('mode-toggle').click()

  const exportButton = page.getByTestId('export-png')
  await expect(exportButton).toBeVisible()
  // "Export PNG" / "Xuất ảnh PNG" — the label is i18n'd but names PNG in
  // both languages (and doubles as the aria-label).
  await expect(exportButton).toHaveText(/PNG/)
  await expect(exportButton).toHaveAccessibleName(/PNG/)

  // Click -> the next drawn frame captures -> a browser download starts.
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ])

  // Suggested filename comes from the anchor's download attribute:
  // psiforge-<YYYYMMDD-HHmmss>.png in LOCAL time.
  const name = download.suggestedFilename()
  expect(name).toMatch(/^psiforge-\d{8}-\d{6}\.png$/)

  // Saved artifact is a real heatmap (dpr-sized canvas, noise-ish inferno
  // pixels), not a cleared backbuffer: comfortably past 5 KB.
  const path = await download.path()
  expect(path).not.toBeNull()
  expect((await stat(path!)).size).toBeGreaterThan(5 * 1024)

  // The loop is unharmed by the capture: frames keep advancing.
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)

  // Mode-gating contract after the T8 move: explore unmounts the rail (and
  // the button with it); back in advanced it returns — never duplicated.
  await page.getByTestId('mode-toggle').click()
  await expect(exportButton).toBeHidden()
  await page.getByTestId('mode-toggle').click()
  await expect(exportButton).toBeVisible()

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('each click exports exactly one file: repeated clicks yield repeated downloads', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/double-slit')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // The export button is advanced-only since the T8 move.
  await page.getByTestId('mode-toggle').click()
  const exportButton = page.getByTestId('export-png')
  await expect(exportButton).toBeVisible()

  // Two clicks, two downloads — the capture queue is consumed once per
  // click, never collapsed.
  const [first] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ])
  const [second] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ])
  for (const download of [first, second]) {
    expect(download.suggestedFilename()).toMatch(/^psiforge-\d{8}-\d{6}\.png$/)
  }

  // No third download appears: the queue drained, nothing lingers. (1 s is
  // far beyond one 60 Hz frame gap.)
  const stray: string[] = []
  page.on('download', (download) => stray.push(download.suggestedFilename()))
  await page.waitForTimeout(1_000)
  expect(stray).toEqual([])

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
