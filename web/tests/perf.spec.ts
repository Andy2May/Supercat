import { expect, test } from '@playwright/test'

/**
 * Perf probe (Task 11, H2 gate): the default grid under `?perf=1` (256^2
 * after the controller ruling on the gate; 512 remains available via
 * `?grid=512` for strong machines), sampled for ~6 s off
 * `window.__psiforgePerf` (fps EMA / last substeps / post->frame latency).
 * This spec NEVER asserts a threshold — it only proves the page ran and
 * produced numbers; the median is read by a human (or the controller) off
 * stdout.
 *
 * Exclusion from `npm run test:e2e` / CI (see playwright.config.ts): npm
 * sets `npm_lifecycle_event` to the script being run, so the skip is off
 * unless invoked via `npm run perf` — cross-platform, no env-var gymnastics.
 */
test.skip(
  process.env.npm_lifecycle_event !== 'perf',
  'perf probe runs only via npm run perf',
)

type PerfSample = { fps: number; substeps: number; workerMs: number }

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

test('perf probe: default 256^2 grid produces fps/substeps/workerMs numbers', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await page.goto('/?perf=1')

  const samples: PerfSample[] = []
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(500)
    samples.push(
      await page.evaluate(() => {
        const perf = window.__psiforgePerf
        return {
          fps: perf?.fps ?? Number.NaN,
          substeps: perf?.substeps ?? -1,
          workerMs: perf?.workerMs ?? Number.NaN,
        }
      }),
    )
  }

  // Warm-up: the first sample(s) may precede the first worker frame (wasm
  // compile + first advance) and read the {0,0,0} stub; also the fps EMA
  // needs two frames to seed. Only samples off measured frames count.
  const measured = samples.filter((s) => s.fps > 0)
  const medians: PerfSample = {
    fps: median(measured.map((s) => s.fps)),
    substeps: median(measured.map((s) => s.substeps)),
    workerMs: median(measured.map((s) => s.workerMs)),
  }
  // eslint-disable-next-line no-console -- the probe's whole point: numbers on stdout
  console.log('__psiforgePerf@default-256^2 samples:', JSON.stringify(samples))
  console.log('__psiforgePerf@default-256^2 medians:', JSON.stringify(medians))

  // The page ran and produced numbers — nothing more (CI never gates on perf).
  expect(pageErrors).toEqual([])
  expect(measured.length).toBeGreaterThan(0)
  for (const sample of measured) {
    expect(Number.isFinite(sample.fps)).toBe(true)
    expect(Number.isFinite(sample.workerMs)).toBe(true)
    expect(sample.substeps).toBeGreaterThan(0)
    expect(sample.workerMs).toBeGreaterThan(0)
  }
})
