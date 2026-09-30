import { expect, test } from '@playwright/test'

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
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await page.goto('/')

  // The render loop must produce more than 10 drawn frames within 5 s.
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__psiforge?.frames ?? 0),
      { timeout: 5_000 },
    )
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
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await page.goto('/')

  // The render loop must be alive before we start drawing.
  await expect
    .poll(
      async () =>
        page.evaluate(() => window.__psiforge?.frames ?? 0),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(10)

  // Select the brush ("Bút" / "Brush") via its stable test id.
  const brush = page.getByTestId('tool-brush')
  await expect(brush).toBeVisible()
  await brush.click()

  const before = await page.evaluate(() => window.__psiforge?.potentialVersion ?? 0)

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
