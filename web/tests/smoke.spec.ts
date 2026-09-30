import { expect, test } from '@playwright/test'

/**
 * Smoke: the app mounts, WebGL2 renders, and the always-on debug hook
 * (`window.__psiforge`, updated on every draw) proves the rAF loop is alive.
 * No console errors and no uncaught page errors are tolerated.
 */
test('heatmap renders: debug hook advances with positive density and no errors', async ({
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

  const hook = await page.evaluate(() => window.__psiforge)
  expect(hook).toBeDefined()
  expect(hook!.maxDensity).toBeGreaterThan(0)
  expect(hook!.t).toBeGreaterThan(0)
  expect(hook!.norm).toBeGreaterThan(0)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
