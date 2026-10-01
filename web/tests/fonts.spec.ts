import { expect, test } from '@playwright/test'

/**
 * Webfont probe (UI redesign T1). The self-hosted Space Grotesk + JetBrains
 * Mono subsets must cover Vietnamese diacritics — if the woff2 files or their
 * unicode-range blocks are broken, `document.fonts.check` stays false and the
 * app silently falls back to system fonts for ữ ộ ơ ẳ ế.
 *
 * Caveat discovered while writing this: `document.fonts.check` returns true
 * for a family with no matching @font-face at all (Chromium cannot rule out a
 * locally installed font). So the probe first `load()`s both families and
 * asserts the resolved face counts — the empty-array case is the real
 * "font not self-hosted" signal — and only then runs the check() assertions
 * on the now-loaded faces.
 */
const VI = 'ữ ộ ơ ẳ ế'

test('self-hosted Space Grotesk and JetBrains Mono load with Vietnamese coverage', async ({
  page,
}) => {
  await page.goto('/')

  const probe = await page.evaluate(async (text) => {
    await document.fonts.ready
    // Explicit load: @font-face is lazy, and nothing renders 600-weight mono
    // text yet, so without this the mono faces would never be fetched.
    const [spaceGrotesk, jetBrainsMono] = await Promise.all([
      document.fonts.load('600 16px "Space Grotesk"', text),
      document.fonts.load('600 16px "JetBrains Mono"', text),
    ])
    return {
      loadedFaces: [spaceGrotesk.length, jetBrainsMono.length],
      spaceGroteskReady: document.fonts.check('600 16px "Space Grotesk"', text),
      jetBrainsMonoReady: document.fonts.check('600 16px "JetBrains Mono"', text),
    }
  }, VI)

  // Two faces per family must load for this string: the space (U+0020) comes
  // from the latin subset, the diacritics from the vietnamese subset. Zero
  // means fonts.css is not imported; one means a subset file is missing.
  expect(probe.loadedFaces).toEqual([2, 2])

  // With the faces declared AND loaded, check() now verifies the string is
  // renderable without system-font fallback.
  expect(probe.spaceGroteskReady).toBe(true)
  expect(probe.jetBrainsMonoReady).toBe(true)
})
