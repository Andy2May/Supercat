import { expect, test } from '@playwright/test'

/**
 * Uses overlay (spec 2026-10-02): the real-world applications dialog opened
 * from the two entry points (top-bar chip, briefing hook), with the honest
 * "see it" chips that navigate to the preset demonstrating each phenomenon.
 * English wording: Playwright boots en-US, deterministic like vLegend.spec.
 *
 * Viewport note (720px default): the briefing panel mounts COLLAPSED below
 * 800px innerHeight (R4 rule), so the hook test expands it via preset-info
 * first; and after the watch chip navigates, the NEW preset's briefing is
 * collapsed again, so the landing scene is asserted through the h1 label
 * instead of the open card.
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

test('uses overlay: top-bar chip opens, Esc closes; groups and cards render', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await page.goto('/#/sim/double-slit')

  await expect(page.getByTestId('uses-overlay')).toHaveCount(0)
  await page.getByTestId('uses-open').click()

  const overlay = page.getByTestId('uses-overlay')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText('What this equation does for you')
  await expect(overlay).toContainText('IN USE TODAY')
  await expect(overlay).toContainText('TOMORROW')
  await expect(page.getByTestId('uses-card-flash')).toContainText('Flash memory')
  await expect(page.getByTestId('uses-card-qcompute')).toContainText('Quantum computers')

  await page.keyboard.press('Escape')
  await expect(page.getByTestId('uses-overlay')).toHaveCount(0)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('uses overlay: briefing hook opens it; see-it navigates to the preset', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)
  await page.goto('/#/sim/double-slit')

  // 720px tall: expand the collapsed briefing, then use its hook.
  await page.getByTestId('preset-info').click()
  await page.getByTestId('uses-hook').click()
  await expect(page.getByTestId('uses-overlay')).toBeVisible()

  await page.getByTestId('uses-watch-flash').click()
  await expect(page).toHaveURL(/#\/sim\/tunneling$/)
  await expect(page.getByTestId('uses-overlay')).toHaveCount(0)
  // The new preset's briefing remounts collapsed at 720px: the scene heading
  // names it instead of the open card.
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tunneling')

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
