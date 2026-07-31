import { defineConfig, devices } from '@playwright/test';

/**
 * These drive a REAL backend and a real database — nothing is mocked. Start
 * the API (`cd backend && npx ts-node src/main.ts`) and seed a scenario
 * before running; see e2e/README.md.
 *
 * Serial, single worker: the tests share one seeded viewing and mutate it
 * through a state machine, so ordering is the point rather than a limitation.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    // Field-realistic viewport: this console must work on a phone (NFR-5).
    ...devices['Pixel 7'],
  },
});
