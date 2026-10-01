import { expect, test } from '@playwright/test'

/**
 * Every scenario enters a simulation directly by hash (Task 9): '/' is the
 * preset landing now, so the smoke suite must boot a scene via
 * '#/sim/double-slit' (the M1 default) to reach the simulator at all.
 */

/** The propagator step (DEFAULTS.dt): one `step` click must add exactly this. */
const DT = 0.005

/** Attaches the no-error collectors every smoke scenario asserts at the end. */
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

/**
 * Smoke: the app mounts, the physics worker feeds WebGL2 frames, and the
 * always-on debug hook (`window.__psiforge`, updated on every draw) proves
 * the rAF loop is alive. Real wasm physics must show `t > 0` and a unit norm
 * (the propagator conserves norm to ~1e-12); pausing must freeze the loop.
 * No console errors and no uncaught page errors are tolerated.
 */
test('worker physics renders: t/norm advance, pause freezes frames, no errors', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/double-slit')

  // The render loop must produce more than 10 drawn frames within 5 s.
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // After ~2 s at speed 1 the wavefunction has advanced hundreds of
  // propagator steps: t moves, norm stays 1, |psi|^2 stays populated.
  await page.waitForTimeout(2_000)
  const hook = await page.evaluate(() => window.__psiforge)
  expect(hook).toBeDefined()
  expect(hook!.t).toBeGreaterThan(0)
  expect(Math.abs(hook!.norm - 1)).toBeLessThanOrEqual(1e-6)
  expect(hook!.maxDensity).toBeGreaterThan(0)

  // Pause freezes the loop: no further frames are drawn. Sample twice with
  // a gap — one advance may already be in flight when the button is clicked,
  // so let the drain land before pinning the count.
  await page.click('[data-testid="play-pause"]')
  await page.waitForTimeout(500)
  const frozenAt = await page.evaluate(() => window.__psiforge?.frames ?? 0)
  await page.waitForTimeout(600)
  expect(await page.evaluate(() => window.__psiforge?.frames ?? 0)).toBe(
    frozenAt,
  )

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('brush drag paints the potential: potentialVersion increases, no errors', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/double-slit')

  // The render loop must be alive before we start drawing.
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // Select the brush ("Bút" / "Brush") via its stable test id.
  const brush = page.getByTestId('tool-brush')
  await expect(brush).toBeVisible()
  await brush.click()

  const before = await page.evaluate(() => window.__psiforge?.potentialVersion ?? 0)

  // The 608px canvas + open narration card exceed the 720px project
  // viewport: scroll the canvas fully into view before taking its box, or
  // the mid-canvas drag below aims below the fold (T18 R1 — the card's
  // wrap-around line tipped a previously 2px margin).
  await page.getByTestId('sim-canvas').scrollIntoViewIfNeeded()
  // Drag horizontally across the middle of the WebGL canvas (the overlay
  // canvas above it is pointer-events: none, so the sim canvas is the target).
  const box = await page.getByTestId('sim-canvas').boundingBox()
  expect(box).not.toBeNull()
  const y = box!.y + box!.height / 2
  await page.mouse.move(box!.x + box!.width * 0.3, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box!.x + box!.width * (0.3 + (0.4 * i) / 10), y, {
      steps: 2,
    })
  }
  await page.mouse.up()

  // Every paint-segment bumps potential_version by exactly 1; the debug
  // hook mirrors it on the next drawn frame.
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__psiforge?.potentialVersion ?? 0),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(before)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('playback bar: step advances t by exactly dt, reset returns t to 0', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/double-slit')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // Pause, then let any in-flight advance drain before pinning t.
  await page.click('[data-testid="play-pause"]')
  await page.waitForTimeout(500)
  const tPaused = await page.evaluate(() => window.__psiforge?.t ?? 0)
  expect(tPaused).toBeGreaterThan(0)

  // One step: exactly one propagator step (dt) beyond the paused time.
  await page.click('[data-testid="step"]')
  await expect
    .poll(() => page.evaluate(() => window.__psiforge?.t ?? 0), { timeout: 5_000 })
    .toBeGreaterThan(tPaused)
  const tStepped = await page.evaluate(() => window.__psiforge?.t ?? 0)
  expect(tStepped - tPaused).toBeCloseTo(DT, 10)

  // Reset: psi -> the last snapshot, t = 0 — framed immediately even though
  // the simulation stays paused (reset-wave always posts a frame).
  await page.click('[data-testid="reset"]')
  await expect
    .poll(() => page.evaluate(() => window.__psiforge?.t ?? -1), { timeout: 5_000 })
    .toBe(0)
  const hook = await page.evaluate(() => window.__psiforge)
  expect(Math.abs(hook!.norm - 1)).toBeLessThanOrEqual(1e-6)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('fatal banner halts the loop; "Reset & run again" restarts it', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // ?debugFatal=1: the store fakes a fatal ~1 s after boot (test-only param).
  await page.goto('/?debugFatal=1#/sim/double-slit')

  const banner = page.getByTestId('error-banner')
  await expect(banner).toBeVisible({ timeout: 10_000 })

  // The loop is dead: frames freeze (sample twice with a drain gap).
  await page.waitForTimeout(500)
  const frozenAt = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBe(frozenAt)

  // Play is disabled until the reset (ledger UX fix).
  await expect(page.getByTestId('play-pause')).toBeDisabled()

  // Recovery: reset-wave + resume — the banner clears and frames move again.
  await page.getByTestId('fatal-reset').click()
  await expect(banner).toBeHidden()
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(frozenAt)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('packet tool: a drag drops a fresh gaussian (t resets, |psi|^2 repopulates)', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/double-slit')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // Let the default scene advance so t is clearly past zero before the drop.
  await expect
    .poll(() => page.evaluate(() => window.__psiforge?.t ?? 0), { timeout: 5_000 })
    .toBeGreaterThan(0.5)

  // Slow playback to 0.1x through the (bound) speed slider: after the drop
  // auto-resumes from t = 0, the resumed sim re-advances only ~0.005/s of
  // wall time per 100 ms — the reset stays observable for seconds.
  await page.$eval(
    '[data-testid="speed-slider"]',
    (el: HTMLInputElement) => {
      el.value = '0.1'
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
  )

  // Select the packet tool and drag on the canvas: press = center, drag =
  // aim. The drag spans ~35% of the canvas (>> the 2 px dead zone).
  await page.getByTestId('tool-packet').click()
  // Same fold guard as the brush test: mid-canvas aim needs the canvas in
  // view at the 720px project viewport.
  await page.getByTestId('sim-canvas').scrollIntoViewIfNeeded()
  const box = await page.getByTestId('sim-canvas').boundingBox()
  expect(box).not.toBeNull()
  const y = box!.y + box!.height / 2
  await page.mouse.move(box!.x + box!.width * 0.25, y)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.6, y, { steps: 5 })
  await page.mouse.up()

  // set-gaussian resets t = 0 (worker semantics) and frames the state at
  // once; the sim auto-resumes, so t may already be re-advancing a little.
  await expect
    .poll(() => page.evaluate(() => window.__psiforge?.t ?? -1), { timeout: 5_000 })
    .toBeLessThan(0.2)
  const tAfterDrop = await page.evaluate(() => window.__psiforge?.t ?? -1)
  expect(tAfterDrop).toBeGreaterThanOrEqual(0)

  // Re-advancing at 0.1x: half a second of wall time adds <= 0.15 sim time.
  await page.waitForTimeout(500)
  const tLater = await page.evaluate(() => window.__psiforge?.t ?? -1)
  expect(tLater).toBeGreaterThanOrEqual(tAfterDrop)
  expect(tLater - tAfterDrop).toBeLessThan(0.15)

  // The dropped packet is a real, normalized wavefunction.
  const hook = await page.evaluate(() => window.__psiforge)
  expect(hook!.maxDensity).toBeGreaterThan(0)
  expect(Math.abs(hook!.norm - 1)).toBeLessThanOrEqual(1e-6)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

/**
 * 720px viewport probe (UI redesign T8): the bench frame must fit the
 * short project viewport — the square stage caps itself by the stagewrap's
 * HEIGHT (container-query sizing in App.svelte), so the canvas is fully
 * on screen with no page scrolling, and NarrationPanel's R4 rule keeps
 * the briefing collapsed (innerHeight 720 < 800 → the ⓘ stub).
 */
test('720px viewport: canvas fits without scrolling; narration starts collapsed', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/#/sim/double-slit')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // R4: 720 < 800 → the panel boots as the collapsed ⓘ stub.
  await expect(page.getByTestId('preset-card')).toBeHidden()
  await expect(page.getByTestId('preset-info')).toBeVisible()

  // The whole canvas box sits inside the viewport — nothing to scroll to.
  const box = await page.getByTestId('sim-canvas').boundingBox()
  expect(box).not.toBeNull()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(1280)
  expect(box!.y + box!.height).toBeLessThanOrEqual(720)

  // And the sim-time overlay rides the stage's top-left corner.
  await expect(page.getByTestId('t-label')).toBeVisible()
  await expect(page.getByTestId('t-label')).toHaveText(/^\|ψ\|² · t = \d+\.\d$/)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

/**
 * Y-orientation trap (ledger ruling "Y no-flip"): input space and display
 * space share one y axis — a barrier drawn in the TOP quarter of the canvas
 * must brighten the TOP quarter of the drawn image. The row probe
 * (`window.__psiforgeReadRow`, cached inside renderer.draw via readPixels —
 * the default framebuffer is only readable in-frame) compares mean
 * brightness at symmetric screen rows; if anyone flips the quad's v_uv
 * wiring or the texture upload, the barrier lands at 75% and this goes red.
 */
test('canvas y-axis points up: a barrier drawn in the top quarter stays on screen top', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/double-slit')
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(10)

  // Register both probe rows first: __psiforgeReadRow returns -1 until a
  // draw has run after the registration (values are cached per draw).
  await page.evaluate(() => {
    window.__psiforgeReadRow?.(0.25)
    window.__psiforgeReadRow?.(0.75)
  })
  await expect
    .poll(
      () => page.evaluate(() => window.__psiforgeReadRow?.(0.25) ?? -1),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(0)
  await expect
    .poll(
      () => page.evaluate(() => window.__psiforgeReadRow?.(0.75) ?? -1),
      { timeout: 5_000 },
    )
    .toBeGreaterThanOrEqual(0)

  // Draw a horizontal barrier across the top quarter of the canvas.
  await page.getByTestId('tool-barrier').click()
  const box = await page.getByTestId('sim-canvas').boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.move(box!.x + box!.width * 0.4, box!.y + box!.height * 0.25)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width * 0.6, box!.y + box!.height * 0.25, {
    steps: 4,
  })
  await page.mouse.up()

  // Let a worker frame ship the new potential and the renderer draw it.
  await page.waitForTimeout(500)

  // The strip at 25% height must be brighter than the mirror strip at 75%
  // (the default scene is y-symmetric, so without the barrier they match).
  const top = await page.evaluate(() => window.__psiforgeReadRow?.(0.25) ?? -1)
  const bottom = await page.evaluate(() => window.__psiforgeReadRow?.(0.75) ?? -1)
  expect(top).toBeGreaterThan(0)
  expect(top).toBeGreaterThan(bottom)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
