import { defineConfig, devices } from '@playwright/test';

/**
 * These drive a REAL backend and a real database — nothing is mocked.
 *
 * Start the API (`npm run api`) and the web app (`npm run web`), and seed the
 * demo corridor (`npm run seed:demo`) first. See e2e/README.md.
 *
 * Serial, single worker: several specs walk one entity through a state
 * machine, so ordering is the point rather than a limitation.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],

  /**
   * ── Why the timeouts are generous ──
   * Registration is three sequential round trips (register, login, me) to a
   * hosted Postgres, one of them doing bcrypt work. On a local database that
   * is fast; against the real deployment it is comfortably over Playwright's
   * 5s default, and a test that fails on latency teaches nothing.
   */
  timeout: 90_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3100',
    trace: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
  },

  projects: [
    /**
     * The default. A landlord evaluating us opens this on a laptop, so that
     * is the width the journeys are driven at.
     */
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /responsive\.spec\.ts/,
    },
    /**
     * The same site on a phone. A tenant browsing and an officer filing a
     * field report both do it from a phone browser (NFR-5), so the narrow
     * layout is tested rather than assumed.
     */
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
});
