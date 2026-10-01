import { expect, test } from '@playwright/test'

/**
 * Landing + hash routing (Task 9). Playwright's Desktop Chrome runs with an
 * en-US locale, so `navigator.language` boots the app in English — the
 * assertions below match the English copy on purpose.
 *
 * Viewport 1280×800 (not the project's 720): the narration card assertions
 * below expect the panel OPEN, and NarrationPanel's R4 rule (UI redesign
 * T5) boots it open only while innerHeight >= 800 — at 720 it would be the
 * collapsed ⓘ stub instead.
 */
test.use({ viewport: { width: 1280, height: 800 } })
const EN = {
  'double-slit': 'Double slit',
  tunneling: 'Tunneling',
  'free-packet': 'Free wave packet',
  harmonic: 'Harmonic oscillator',
} as const

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

/** Polls the debug hook for the number of drawn frames (monotonic). */
function frames(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.frames ?? 0)
}

test('landing: five preset tiles in registry order, each linking to its sim', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/')

  // App title + tagline reuse the existing i18n keys.
  await expect(page.locator('h1')).toContainText('Psiforge')
  await expect(page.getByText('Quantum wave physics')).toBeVisible()

  // Five tiles, visible, in LANDING_ORDER.
  const tiles = page.getByTestId('preset-tile')
  await expect(tiles).toHaveCount(5)
  await expect(tiles.first()).toBeVisible()
  const order = await tiles.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.preset),
  )
  expect(order).toEqual([
    'double-slit',
    'tunneling',
    'free-packet',
    'harmonic',
    'sandbox',
  ])

  // Each tile is a hash link to its simulation.
  await expect(page.locator('[data-preset="tunneling"]')).toHaveAttribute(
    'href',
    '#/sim/tunneling',
  )
  await expect(page.locator('[data-preset="sandbox"]')).toHaveAttribute(
    'href',
    '#/sim/sandbox',
  )

  expect(pageErrors).toEqual([])
})

test('clicking the tunneling tile: sim boots, narration card shows, frames advance', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/')
  await page.locator('[data-preset="tunneling"]').click()

  await expect(page).toHaveURL(/#\/sim\/tunneling$/)
  const card = page.getByTestId('preset-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText(EN.tunneling)

  // The physics worker feeds the render loop for the new preset.
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  // Collapse hides the card; the info button re-opens it with the same
  // narration. Collapsing must not disturb the simulation.
  const before = await frames(page)
  await page.getByTestId('preset-card-toggle').click()
  await expect(page.getByTestId('preset-card')).toBeHidden()
  await expect(page.getByTestId('preset-info')).toBeVisible()
  await page.getByTestId('preset-info').click()
  await expect(page.getByTestId('preset-card')).toBeVisible()
  await expect(page.getByTestId('preset-card')).toContainText(EN.tunneling)
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(before)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('direct load of #/sim/harmonic boots that preset', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/harmonic')

  await expect(page.getByTestId('preset-card')).toContainText(EN.harmonic)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('back-link returns to landing; entering free-packet shows ITS card (stale-state trap)', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/harmonic')
  await expect(page.getByTestId('preset-card')).toContainText(EN.harmonic)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  // Back-link lands on '#/' and tears the simulation down: no further
  // frames may be drawn while the landing view is showing.
  await page.getByTestId('back-link').click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByTestId('preset-tile')).toHaveCount(5)
  await page.waitForTimeout(500)
  const atLanding = await frames(page)
  await page.waitForTimeout(600)
  expect(await frames(page)).toBe(atLanding)

  // Entering free-packet must show the FREE-PACKET narration — not the
  // harmonic card the previous visit left behind.
  await page.locator('[data-preset="free-packet"]').click()
  const card = page.getByTestId('preset-card')
  await expect(card).toContainText(EN['free-packet'])
  await expect(card).not.toContainText(EN.harmonic)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(atLanding)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('direct hash switch between presets keeps the loop alive (worker swap)', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/harmonic')
  await expect(page.getByTestId('preset-card')).toContainText(EN.harmonic)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  // Editing the hash in place (no landing hop, no page reload) makes the
  // app destroy() the worker and init() the next preset while the render
  // loop stays mounted. An advance in flight on the terminated worker must
  // not strand the loop (the store's epoch bump lets the loop reset).
  const before = await frames(page)
  await page.evaluate(() => {
    location.hash = '#/sim/tunneling'
  })
  await expect(page).toHaveURL(/#\/sim\/tunneling$/)
  await expect(page.getByTestId('preset-card')).toContainText(EN.tunneling)
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(before + 10)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('a garbage preset hash falls back to the double-slit simulation', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/nonsense')

  await expect(page.getByTestId('preset-card')).toContainText(EN['double-slit'])
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
