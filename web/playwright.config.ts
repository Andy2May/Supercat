import { defineConfig, devices } from '@playwright/test'

/**
 * E2E smoke setup. One chromium project; the app under test is the Vite dev
 * server (`npm run dev`), pinned to port 5173 with --strictPort so the
 * webServer URL contract can never silently drift to 5174+.
 *
 * `testMatch` restricts collection to `*.spec.ts` — the sibling vitest files
 * (`*.test.ts`) must not be picked up as Playwright tests.
 */
export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts$/,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: true,
  retries: 1,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://localhost:5173',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
