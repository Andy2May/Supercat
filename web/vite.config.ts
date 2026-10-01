/// <reference types="vitest/config" />
import { svelteTesting } from '@testing-library/svelte/vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    svelte(),
    // No-op outside `vitest` (early-returns unless VITEST is set): inside,
    // resolves `svelte` to its browser build and auto-cleans mounted
    // components between tests — required by tests/toolRail.test.ts.
    svelteTesting(),
  ],
  base: './',
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
