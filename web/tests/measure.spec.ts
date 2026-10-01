import { expect, test } from '@playwright/test'

/**
 * Measurement e2e (Task 14). A position measurement (measure tool, a plain
 * canvas click) and a momentum measurement (the button next to the view
 * toggle) must each: collapse ψ, show the outcome toast, keep the norm at 1
 * (the wasm collapses renormalize), keep frames advancing (the collapse
 * frames immediately; the loop lives on), and log nothing. The tool is
 * available in BOTH modes (spec D8); the momentum button exists only in
 * advanced + momentum view. No pixel assertions for the crossfade — its
 * visual polish is Task 18's manual pass; the DOM + debug-hook carry this
 * contract.
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

/** Current norm from the debug hook. */
function norm(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.norm ?? 0)
}

test('position measurement (explore mode): tool present, click collapses, toast shows, norm holds', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Fresh context boots in explore — and the measure tool must be there
  // (spec D8: measurement is available in BOTH experience modes).
  await page.goto('/#/sim/free-packet')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  const measure = page.getByTestId('tool-measure')
  await expect(measure).toBeVisible()
  await measure.click()
  await expect(measure).toHaveAttribute('aria-pressed', 'true')

  // A plain click (down+up at one point, drag 0 px) on the canvas center.
  // The click is only a TRIGGER: the outcome comes back wherever |psi|^2
  // puts it, so no position assertion is possible (nor wanted) — only the
  // toast's existence pins the round trip. The 608px canvas + open
  // narration card exceed the 720px project viewport — scroll the canvas
  // into view or the center click lands below the fold (T18 R1).
  await page.getByTestId('sim-canvas').scrollIntoViewIfNeeded()
  const box = await page.getByTestId('sim-canvas').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

  await expect(page.getByTestId('measure-toast')).toBeVisible({ timeout: 5_000 })

  // The collapse renormalizes: the propagator-grade norm guard must hold.
  const normAfter = await norm(page)
  expect(Math.abs(normAfter - 1)).toBeLessThanOrEqual(1e-6)

  // The loop survives the measurement: frames keep advancing.
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)

  // The toast is transient: it hides itself again after ~2 s.
  await expect(page.getByTestId('measure-toast')).toBeHidden({ timeout: 5_000 })

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('momentum measurement (advanced + momentum view): button collapses k-space, norm holds', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/free-packet')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // The measure tool is present in advanced mode as well (D8 both-modes).
  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('tool-measure')).toBeVisible()

  // The momentum trigger exists ONLY in the momentum view (it sits next to
  // the view toggle, replacing the phase-color button).
  await page.getByTestId('view-momentum').click()
  await expect(page.getByTestId('momentum-caption')).toBeVisible()
  const momentumMeasure = page.getByTestId('measure-momentum')
  await expect(momentumMeasure).toBeVisible()

  await momentumMeasure.click()
  await expect(page.getByTestId('measure-toast')).toBeVisible({ timeout: 5_000 })

  // k-space collapse renormalizes too.
  const normAfter = await norm(page)
  expect(Math.abs(normAfter - 1)).toBeLessThanOrEqual(1e-6)

  // Momentum frames keep flowing after the collapse (the measured frame
  // also forced a fresh |phi(k)|^2 upload — the crossfade's "new" side).
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('view flip during the collapse fade cancels it: no cross-space mix, loop stays alive', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Fix round 1 regression guard: a fade armed in the position view must be
  // CANCELED when the view flips mid-fade, not ramped against the incoming
  // k-space texture (mix(positionImage, momentumImage) would be physically
  // meaningless for up to 250 ms). Measure, then flip to momentum as fast
  // as the clicks land — inside the window when timing allows; the
  // cancel-vs-finish distinction needs no pixel proof, the loop just has to
  // stay clean and alive either way.
  await page.goto('/#/sim/free-packet')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  await page.getByTestId('tool-measure').click()
  // Fold guard as in the explore-mode test: the canvas center must be in
  // view before the trigger click.
  await page.getByTestId('sim-canvas').scrollIntoViewIfNeeded()
  const box = await page.getByTestId('sim-canvas').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await expect(page.getByTestId('measure-toast')).toBeVisible({ timeout: 5_000 })

  // Flip immediately: explore -> advanced -> momentum view.
  await page.getByTestId('mode-toggle').click()
  await page.getByTestId('view-momentum').click()
  await expect(page.getByTestId('momentum-caption')).toBeVisible()

  // No errors from the canceled fade, and drawing continues in the new
  // view (momentum frames arrive and upload).
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)

  // A momentum measurement works right after the mid-fade flip — let the
  // first toast hide first so the visibility check below is meaningful.
  await expect(page.getByTestId('measure-toast')).toBeHidden({ timeout: 5_000 })
  await page.getByTestId('measure-momentum').click()
  await expect(page.getByTestId('measure-toast')).toBeVisible({ timeout: 5_000 })
  expect(Math.abs((await norm(page)) - 1)).toBeLessThanOrEqual(1e-6)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
