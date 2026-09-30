import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

import { LANDING_ORDER, PRESETS } from '../src/presets/index.js'

/**
 * Thumbnail capture (Task 10): one PNG per preset into web/public/thumbs/
 * (Vite serves public/ at the root, so the landing tiles' `thumbs/<id>.png`
 * resolve). Quality polish is Task 18 — this only guarantees real, live
 * shots: every capture waits for 90 drawn frames (~1.5 s of wall time at
 * speed 1), by which point the preset's potential texture has long shipped
 * (it rides the first frame after init) and the scene is mid-story.
 *
 * The ids come straight from LANDING_ORDER (via ../src/presets/index.js —
 * Playwright's loader maps the .js specifier onto the .ts source), so the
 * set of thumbnails can never drift from the landing grid.
 */

/** Output root, resolved off this spec so CWD cannot misplace the files. */
const THUMBS_DIR = fileURLToPath(new URL('../public/thumbs/', import.meta.url))

/** Polls the debug hook for the number of drawn frames (monotonic). */
function frames(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.frames ?? 0)
}

test.beforeAll(async () => {
  await mkdir(THUMBS_DIR, { recursive: true })
})

for (const id of LANDING_ORDER) {
  test(`thumbnail: ${id}`, async ({ page }) => {
    await page.goto(`/#/sim/${id}`)

    // Sandbox boots paused (autoplay false) and drawing is frame-driven —
    // a paused sim posts no frames beyond the initial set-gaussian one, so
    // the 90-frame gate would never pass. Press play: the still σ3 blob
    // then shows mid-motion, gently spreading from t = 0.
    if (!PRESETS[id].autoplay) {
      await page.getByTestId('play-pause').click()
    }

    // Clean shot: collapse the narration card first. Collapsing never
    // disturbs the simulation (landing.spec.ts pins that behavior).
    await page.getByTestId('preset-card-toggle').click()
    await expect(page.getByTestId('preset-card')).toBeHidden()

    await expect
      .poll(() => frames(page), { timeout: 15_000 })
      .toBeGreaterThanOrEqual(90)

    // The drawn field is real (not an empty/black canvas)...
    expect(
      await page.evaluate(() => window.__psiforge?.maxDensity ?? 0),
    ).toBeGreaterThan(0)

    // ...and only the sim canvas is captured — no header, toolbar, or bar.
    const shot = await page.getByTestId('sim-canvas').screenshot({
      path: `${THUMBS_DIR}/${id}.png`,
    })
    // Rough non-black proxy (Task 10 brief): a structured 608x608 heatmap
    // compresses far above this; a dead frame would not.
    expect(shot.length).toBeGreaterThan(10_000)
  })
}
