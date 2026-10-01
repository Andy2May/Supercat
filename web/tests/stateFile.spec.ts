import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

/**
 * JSON state save/load e2e (Task 17; the buttons moved to the ReadoutRail's
 * "Xuất" block with the T8 UI redesign). Advanced-mode rail buttons: Save
 * asks the worker for `serialize_state()` and downloads
 * `psiforge-state-<YYYYMMDD-HHmmss>.json`; Load feeds a file back through
 * decodeState + the worker's deserialize (which restores t and frames the
 * state at once). A corrupt/version-gated file must show the NON-fatal
 * load-error banner while the simulation keeps running — no fatal banner,
 * no console errors. 512² state files (`?grid=512`) must additionally
 * surface the size note (spec §5.7 + risk row "khi mở/lưu") on Save AND
 * Load — without blocking either.
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

/** The store's session grid from the debug hook (mirrored per frame,
 * dropped frames included — see simLoop's grid mirror). */
function grid(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.grid ?? 0)
}

/** f32 array -> base64 (file payload crafting). */
function f32B64(values: Float32Array): string {
  return Buffer.from(values.buffer, values.byteOffset, values.byteLength).toString('base64')
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

  // No load error on the happy path, and the loop is unharmed. The
  // session grid never moved (same-grid file).
  await expect(page.getByTestId('load-error')).toBeHidden()
  expect(await grid(page)).toBe(256)
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('a rejected CROSS-GRID file rolls the session grid back — the old sim keeps rendering', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await bootAdvanced(page)
  expect(await grid(page)).toBe(256)

  // A file the codec ACCEPTS (finite scalars, right lengths, non-zero ψ)
  // but the worker must REJECT: grid 128 against the live 256 forces a
  // fresh-sim construction, and dt = 0 is an impossible scalar — wasm's
  // constructor refuses. This is exactly the trap of fix round 1: without
  // the rollback, the store would keep the dead 128 grid and drop every
  // frame of the still-running 256 sim forever.
  const nx = 128
  const psi = new Float32Array(2 * nx * nx)
  psi[0] = 1 // non-zero norm so decodeState lets it through
  const crossGrid = {
    version: 1,
    nx,
    ny: nx,
    extentX: 40,
    extentY: 40,
    dt: 0, // impossible: constructor requires dt > 0
    m: 1,
    hbar: 1,
    t: 1,
    potential: f32B64(new Float32Array(nx * nx)),
    psi: f32B64(psi),
  }

  await page.getByTestId('import-json-input').setInputFiles({
    name: 'psiforge-state-cross-grid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(crossGrid)),
  })

  // The rejection surfaces on the non-fatal banner (with the raw wasm
  // detail behind the localized headline), never as a fatal.
  const banner = page.getByTestId('load-error')
  await expect(banner).toBeVisible()
  await expect(page.getByTestId('error-banner')).toBeHidden()

  // The session grid is back to 256 — and the old simulation keeps
  // RENDERING (the draw counter moves; the grid guard would otherwise
  // drop every frame and freeze the canvas).
  await expect
    .poll(() => grid(page), { timeout: 5_000 })
    .toBe(256)
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

test('512² state files show the size note on Save AND Load — never blocking; default 256 stays silent', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Control at the DEFAULT grid first: Save and Load both stay silent.
  await bootAdvanced(page)
  expect(await grid(page)).toBe(256)
  const [defaultDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-json').click(),
  ])
  const defaultPath = await defaultDownload.path()
  expect(defaultPath).not.toBeNull()
  expect((JSON.parse(await readFile(defaultPath!, 'utf8')) as { nx: number }).nx).toBe(256)
  await expect(page.getByTestId('save-size-note')).toBeHidden()
  // Load direction at 256: let the decode land first — a hidden-check on a
  // not-yet-decoded file would pass vacuously.
  await page.getByTestId('import-json-input').setInputFiles(defaultPath!)
  await page.waitForTimeout(500)
  await expect(page.getByTestId('save-size-note')).toBeHidden()

  // Then the heavy grid (spec §5.7 + risk table: "cảnh báo nếu 512²"). The
  // ?grid=512 search param forces a FULL reload (hash-only gotos stay
  // same-document), so the store singleton re-reads it; advanced mode was
  // persisted to localStorage by the toggle above, so Save is already up.
  await page.goto('/?grid=512#/sim/double-slit')
  await expect(page.getByTestId('export-json')).toBeVisible()
  // 512² runs at only a few fps — a handful of frames proves the scene is
  // live before serializing it.
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(2)
  expect(await grid(page)).toBe(512)

  // Save: the download FIRES (the note is a warning, never a confirmation
  // that could block it)...
  const [bigDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('export-json').click(),
  ])
  const bigPath = await bigDownload.path()
  expect(bigPath).not.toBeNull()
  expect((JSON.parse(await readFile(bigPath!, 'utf8')) as { nx: number }).nx).toBe(512)

  // ...and the note is up: informational (role=status, not alert), with
  // the localized size wording, and dismissable.
  const note = page.getByTestId('save-size-note')
  await expect(note).toBeVisible()
  await expect(note).toHaveAttribute('role', 'status')
  await expect(note).toContainText(/MB|megabyte/i)
  await page.getByTestId('save-size-note-dismiss').click()
  await expect(note).toBeHidden()

  // Load direction (spec risk row "khi mở/lưu"): importing the 512² file
  // back re-raises the SAME note — the warning is about file weight, not
  // direction — while the load itself proceeds (same grid here, so no
  // load-error) and the loop keeps drawing.
  await page.getByTestId('import-json-input').setInputFiles(bigPath!)
  await expect(note).toBeVisible()
  await expect(page.getByTestId('load-error')).toBeHidden()
  const f1 = await frames(page)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(f1)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
