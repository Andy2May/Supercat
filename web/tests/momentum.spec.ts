import { expect, test } from '@playwright/test'

/**
 * Momentum-space view e2e (Task 12). Advanced mode mounts the
 * position/momentum segmented control; momentum view swaps the displayed
 * field to the fftshifted |phi(k)|^2 (V overlay hidden, caption shown) while
 * the worker keeps streaming position data — observables stay live and the
 * switch back is instant. No pixel assertions (visual check is Task 13's
 * neighborhood); DOM + debug-hook + console cleanliness carry the contract.
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

/**
 * Field-upload path counters (review fix R1): which buffer the render loop
 * last sent to the GPU — position densityPhase vs momentum scratch. The
 * display is view-keyed: while the view is momentum, the position counter
 * must not move (the pre-fix loop keyed the display to the 4-frame cadence
 * and strobed k-space/position³).
 */
function uploads(
  page: import('@playwright/test').Page,
): Promise<{ position: number; momentum: number }> {
  return page.evaluate(() => ({
    position: window.__psiforge?.fieldUploads.position ?? -1,
    momentum: window.__psiforge?.fieldUploads.momentum ?? -1,
  }))
}

/** Text content of a readout ('' until mounted). */
async function readout(
  page: import('@playwright/test').Page,
  testId: string,
): Promise<string> {
  const text = await page.getByTestId(testId).textContent()
  return text ?? ''
}

test('momentum view: caption shows, frames advance, obs stay live, switch back cleans up', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Fresh context boots in explore: the toggle must not exist for it.
  await page.goto('/#/sim/free-packet')
  const toggle = page.getByTestId('view-toggle')
  await expect(toggle).toBeHidden()
  await expect(page.getByTestId('momentum-caption')).toBeHidden()
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // Advanced mounts the segmented control (Task 7 gating). Crank playback
  // speed first: the σx·σpx liveness check below needs the free packet's
  // spreading to move fast enough to cross a display rounding bucket.
  await page.getByTestId('mode-toggle').click()
  await expect(toggle).toBeVisible()
  await page.getByTestId('speed-slider').fill('5')

  // Momentum: the k-space caption appears and drawing keeps going (the
  // worker attaches momentumDensity on the 4-frame cadence; the interleave
  // + scratch upload path must not stall the loop).
  await page.getByTestId('view-momentum').click()
  await expect(page.getByTestId('momentum-caption')).toBeVisible()
  const f1 = await frames(page)
  await page.waitForTimeout(1_200)
  expect(await frames(page)).toBeGreaterThan(f1)

  // Position charts keep flowing in momentum view: sigma-x-value (σx·σpx)
  // grows monotonically on free-packet, so at speed 5 it must cross a
  // 0.01 rounding bucket within seconds. A frozen readout would mean the
  // momentum frames broke the observables side-channel.
  const sigma1 = await readout(page, 'sigma-x-value')
  expect(sigma1).not.toBe('—')
  await expect
    .poll(async () => readout(page, 'sigma-x-value'), { timeout: 8_000 })
    .not.toBe(sigma1)

  // Upload-path regression guard (review fix R1): the display is view-keyed,
  // not cadence-keyed. Many frames (several 4-frame cadence periods) pass in
  // momentum view below — ZERO of them may upload the position field, while
  // the momentum scratch keeps refreshing.
  const u1 = await uploads(page)
  await page.waitForTimeout(1_200)
  const u2 = await uploads(page)
  expect(u2.position).toBe(u1.position)
  expect(u2.momentum).toBeGreaterThan(u1.momentum)

  // Switch back: caption goes away, drawing continues, and the position
  // field uploads resume (the view-keyed branch flips with the view).
  await page.getByTestId('view-position').click()
  await expect(page.getByTestId('momentum-caption')).toBeHidden()
  const f2 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f2)
  const u3 = await uploads(page)
  expect(u3.position).toBeGreaterThan(u2.position)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('phase color toggle: advanced+position only; hides in momentum, resumes after', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Fresh context boots in explore: the advanced control row (including
  // the phase toggle) is unmounted entirely.
  await page.goto('/#/sim/free-packet')
  await expect(page.getByTestId('phase-toggle')).toBeHidden()

  // Advanced + position view: the toggle is mounted, starts OFF, and flips
  // the stored flag on click. Frames keep advancing under the HSV colormap
  // (the mode-1 shader branch compiled and the loop is alive).
  await page.getByTestId('mode-toggle').click()
  const phase = page.getByTestId('phase-toggle')
  await expect(phase).toBeVisible()
  await expect(phase).toHaveAttribute('aria-pressed', 'false')
  await phase.click()
  await expect(phase).toHaveAttribute('aria-pressed', 'true')
  const f1 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f1)

  // Momentum view: phase is meaningless in k-space, so the button HIDES
  // (not merely disables) while the canvas renders density inferno and
  // drawing continues.
  await page.getByTestId('view-momentum').click()
  await expect(page.getByTestId('momentum-caption')).toBeVisible()
  await expect(phase).toBeHidden()
  const f2 = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBeGreaterThan(f2)

  // Back to position: the toggle reappears STILL PRESSED — the stored flag
  // survived the round-trip and the coloring resumes.
  await page.getByTestId('view-position').click()
  await expect(phase).toBeVisible()
  await expect(phase).toHaveAttribute('aria-pressed', 'true')

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('switching to explore while in momentum view snaps back to position', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/free-packet')
  await page.getByTestId('mode-toggle').click() // advanced
  await expect(page.getByTestId('view-toggle')).toBeVisible()
  await page.getByTestId('view-momentum').click()
  await expect(page.getByTestId('momentum-caption')).toBeVisible()

  // Explore flips the mode: the snapback effect must send the worker's
  // momentum flag off and drop the caption + toggle in one step.
  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('momentum-caption')).toBeHidden()
  await expect(page.getByTestId('view-toggle')).toBeHidden()

  // And back to advanced once more: the app re-mounts in POSITION view
  // (the snapback reset it), ready to toggle again.
  await page.getByTestId('mode-toggle').click()
  await expect(page.getByTestId('view-toggle')).toBeVisible()
  await expect(page.getByTestId('momentum-caption')).toBeHidden()
  await page.getByTestId('view-momentum').click()
  await expect(page.getByTestId('momentum-caption')).toBeVisible()

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
