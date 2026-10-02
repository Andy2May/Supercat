import { expect, test } from '@playwright/test'

/**
 * Landing "theater" + hash routing (UI redesign T9), plus the branded
 * document shell assertions (T10: title/OG meta/favicon). Playwright's
 * Desktop Chrome runs with an en-US locale, so `navigator.language` boots
 * the app in English — the assertions below match the English copy on
 * purpose (the shell meta, unlike the app copy, is static Vietnamese).
 *
 * Viewport 1280×800: the film strip is the vertical right rail only while
 * innerWidth >= 1024, and NarrationPanel's R4 rule boots the card open only
 * while innerHeight >= 800.
 *
 * The landing runs a REAL physics worker as its background (ruling 1: the
 * landing owns init/destroy while mounted), so the debug hook's `frames`
 * counter advances on the landing too — the worker-handover tests below use
 * exactly that to pin the destroy-then-init handover in both directions:
 *
 *   landing -> sim: a hovered SANDBOX background (autoplay off, t frozen)
 *   must give way to a RUNNING sim (t > 0) — a leaked landing worker would
 *   stay frozen, a killed fresh init would never draw;
 *   sim -> landing: the back-link must boot the landing's own background
 *   (frames keep advancing) — a cleanup racing the init would freeze it.
 */
test.use({ viewport: { width: 1280, height: 800 } })
const EN = {
  'double-slit': 'Double slit',
  tunneling: 'Tunneling',
  'free-packet': 'Free wave packet',
  harmonic: 'Harmonic oscillator',
  sandbox: 'Free play',
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

/** Polls the debug hook for the latest frame's sim time. */
function simTime(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => window.__psiforge?.t ?? 0)
}

test('document shell: vi lang, branded title, OG/Twitter meta, favicon resolves', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/')

  // The document is Vietnamese by default; the title is the one static
  // brand string (user ruling 2026-10-02: same in every locale, · separator).
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('vi')
  await expect(page).toHaveTitle(/Supercat/)
  expect(await page.title()).toBe('Supercat · 2D Quantum Lab')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    'Supercat · 2D Quantum Lab',
  )

  // Open Graph card + mirrored Twitter card.
  const ogImage = page.locator('meta[property="og:image"]')
  await expect(ogImage).toHaveCount(1)
  await expect(ogImage).toHaveAttribute('content', /\/og\.png$/)
  await expect(page.locator('meta[property="og:title"]')).toHaveCount(1)
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'website')
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  )
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
    'content',
    /\/og\.png$/,
  )

  // The favicon link points at the cat PNG and the dev server serves it.
  const icon = page.locator('link[rel="icon"]')
  await expect(icon).toHaveCount(1)
  await expect(icon).toHaveAttribute('href', '/favicon.png')
  const iconResponse = await page.request.get('/favicon.png')
  expect(iconResponse.status()).toBe(200)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('theater landing: five preset tiles in registry order, hero + nav + strip + status', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/')

  // Five tiles, in LANDING_ORDER, each a hash link to its simulation.
  const tiles = page.getByTestId('preset-tile')
  await expect(tiles).toHaveCount(5)
  const order = await tiles.evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.preset),
  )
  expect(order).toEqual(['double-slit', 'tunneling', 'free-packet', 'harmonic', 'sandbox'])
  await expect(page.locator('[data-preset="tunneling"]')).toHaveAttribute(
    'href',
    '#/sim/tunneling',
  )
  await expect(page.locator('[data-preset="sandbox"]')).toHaveAttribute('href', '#/sim/sandbox')

  // The composition: hero (kicker + two title lines + CTAs), glass nav,
  // strip, status line — and the live background canvas behind it all.
  await expect(page.getByTestId('landing-hero')).toBeVisible()
  const heading = page.getByTestId('landing-hero').getByRole('heading', { level: 1 })
  await expect(heading).toContainText("Don't ask if the cat's alive.")
  await expect(heading).toContainText('Ask for the probability.')
  await expect(page.getByTestId('landing-nav')).toBeVisible()
  await expect(page.getByTestId('landing-strip')).toBeVisible()
  const status = page.getByTestId('landing-status')
  await expect(status).toBeVisible()
  await expect(status).toContainText(`NOW SHOWING · ${EN['double-slit']}`)
  await expect(status).toContainText('|ψ|² · ħ = m = 1')
  await expect(page.getByTestId('sim-canvas')).toBeVisible()

  // The live dot blinks (scoped keyframe name — anything but `none`).
  const dotAnimation = await page
    .getByTestId('status-dot')
    .evaluate((el) => getComputedStyle(el).animationName)
  expect(dotAnimation).not.toBe('none')
  expect(dotAnimation).toContain('blink')

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('live background: boots on visit and swaps to a hovered preset (destroy + init)', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/')

  // The default double-slit background actually runs.
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  // Hovering the strip switches the backdrop (150 ms debounce) — the status
  // line follows the newly-inited scene.
  await page.locator('[data-preset="harmonic"]').hover()
  await expect
    .poll(() => page.getByTestId('landing-status').innerText(), { timeout: 5_000 })
    .toContain(`NOW SHOWING · ${EN.harmonic}`)

  // The swapped-in worker keeps feeding frames (no dead handover).
  const before = await frames(page)
  await expect
    .poll(() => frames(page), { timeout: 5_000 })
    .toBeGreaterThan(before + 5)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('rapid hover sweep across all five tiles: last preset wins, no worker races', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/')
  await expect(page.getByTestId('preset-tile')).toHaveCount(5)

  // A fast sweep (< 1 s total): every mouseenter lands inside the debounce
  // window of the previous one, so only the LAST preset may boot. Raw mouse
  // moves (not .hover, whose actionability waits would blow the budget while
  // the hero entrance is still settling), and the tile centers are collected
  // in ONE evaluate BEFORE the clock starts — five locator.boundingBox()
  // roundtrips inside the window cost ~1.2 s on a slow host and fail the
  // budget before any real timing question, while the five raw moves alone
  // are tens of milliseconds.
  const centers = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-testid="preset-tile"]')).map(
      (el) => {
        const rect = el.getBoundingClientRect()
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
      },
    ),
  )
  expect(centers).toHaveLength(5)
  const sweep = Date.now()
  for (const { x, y } of centers) {
    await page.mouse.move(x, y)
  }
  expect(Date.now() - sweep).toBeLessThan(1_000)

  await page.waitForTimeout(400) // debounce + destroy/init settle
  await expect(page.getByTestId('landing-status')).toContainText(`NOW SHOWING · ${EN.sandbox}`)
  // (The sweep ends on the sandbox, which boots PAUSED by design — a frozen
  // frames counter here is correct, so post-sweep liveness is pinned by the
  // harmonic swap in the test above instead.)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('landing -> sim handover: a hovered sandbox background yields to a RUNNING double-slit', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/')

  // Hover the sandbox: it boots with autoplay OFF, so its sim time freezes
  // at 0 — a perfect marker for "the landing worker must be gone" below.
  await page.locator('[data-preset="sandbox"]').hover()
  await expect
    .poll(() => page.getByTestId('landing-status').innerText(), { timeout: 5_000 })
    .toContain(`NOW SHOWING · ${EN.sandbox}`)
  await page.waitForTimeout(300)
  expect(await simTime(page)).toBe(0)

  // Click through to the double-slit simulation. If the landing's worker
  // leaked into the sim view, t stays frozen at 0; if the landing's cleanup
  // destroyed the sim's fresh init, no frame is ever drawn again.
  await page.locator('[data-preset="double-slit"]').click()
  await expect(page).toHaveURL(/#\/sim\/double-slit$/)
  const card = page.getByTestId('preset-card')
  await expect(card).toBeVisible()
  await expect(card).toContainText(EN['double-slit'])
  await expect
    .poll(() => simTime(page), { timeout: 10_000 })
    .toBeGreaterThan(0.5)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('back-link returns to landing: its own background boots; the next preset shows ITS card', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/harmonic')
  await expect(page.getByTestId('preset-card')).toContainText(EN.harmonic)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  // Back-link lands on '#/': the landing mounts and boots its OWN
  // background (a cleanup racing the init would leave it frozen instead).
  await page.getByTestId('back-link').click()
  await expect(page).toHaveURL(/#\/$/)
  await expect(page.getByTestId('preset-tile')).toHaveCount(5)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(await frames(page) + 5)

  // Entering free-packet must show the FREE-PACKET narration — not the
  // harmonic card the previous visit left behind (stale-state trap).
  await page.locator('[data-preset="free-packet"]').click()
  const card = page.getByTestId('preset-card')
  await expect(card).toContainText(EN['free-packet'])
  await expect(card).not.toContainText(EN.harmonic)
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('no WebGL2: static fallback landing renders, tiles still navigate (sim shows the dead end)', async ({
  page,
}) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  // Kill WebGL2 contexts only; everything else (2d, probes) stays intact.
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl2') return null
      return original.call(this, type, ...rest)
    } as typeof HTMLCanvasElement.prototype.getContext
  })

  await page.goto('/')

  // The full landing renders over the static backdrop — no sim canvas, and
  // hero + strip + status stay functional.
  await expect(page.getByTestId('landing-fallback')).toBeVisible()
  await expect(page.getByTestId('sim-canvas')).toHaveCount(0)
  await expect(page.getByTestId('landing-hero')).toBeVisible()
  await expect(page.getByTestId('preset-tile')).toHaveCount(5)
  await expect(page.getByTestId('landing-status')).toContainText(
    `NOW SHOWING · ${EN['double-slit']}`,
  )

  // Tile click still navigates; the SIMULATOR view keeps its dead end.
  await page.locator('[data-preset="sandbox"]').click()
  await expect(page).toHaveURL(/#\/sim\/sandbox$/)
  await expect(page.getByTestId('webgl-missing')).toBeVisible()

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})

test('prefers-reduced-motion: the status dot does not blink', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')

  const animationName = await page
    .getByTestId('status-dot')
    .evaluate((el) => getComputedStyle(el).animationName)
  expect(animationName).toBe('none')

  // The hero entrance stands down too (ruling 4).
  const heroAnimation = await page
    .getByTestId('landing-hero')
    .evaluate((el) => getComputedStyle(el.querySelector('.hero-in')!).animationName)
  expect(heroAnimation).toBe('none')
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

test('direct hash switch between presets keeps the loop alive (worker swap)', async ({ page }) => {
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

test('a garbage preset hash falls back to the double-slit simulation', async ({ page }) => {
  const { consoleErrors, pageErrors } = expectNoErrors(page)

  await page.goto('/#/sim/nonsense')

  await expect(page.getByTestId('preset-card')).toContainText(EN['double-slit'])
  await expect
    .poll(() => frames(page), { timeout: 10_000 })
    .toBeGreaterThan(10)

  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
})
