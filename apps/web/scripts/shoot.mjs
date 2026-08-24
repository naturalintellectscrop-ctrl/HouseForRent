/**
 * Screenshots a list of routes at a set of widths.
 *
 * A development tool, not a test: it exists so the person building the site
 * can actually LOOK at it at phone, tablet and desktop widths instead of
 * asserting that it probably renders. The Playwright specs under `e2e/`
 * are what assert behaviour.
 *
 * Usage: node scripts/shoot.mjs [baseUrl] [outDir]
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:3100';
const OUT = process.argv[3] ?? './shots';

const ROUTES = (process.env.ROUTES ?? '/,/properties,/how-it-works,/for-landlords,/about,/login,/register')
  .split(',')
  .map((r) => r.trim())
  .filter(Boolean);

const WIDTHS = (process.env.WIDTHS ?? '390,1440')
  .split(',')
  .map((w) => Number(w.trim()));

const browser = await chromium.launch();
await mkdir(OUT, { recursive: true });

for (const width of WIDTHS) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 700 ? 844 : 900 },
    deviceScaleFactor: 1,
    colorScheme: process.env.SCHEME === 'dark' ? 'dark' : 'light',
  });
  const page = await ctx.newPage();

  for (const route of ROUTES) {
    const url = `${BASE}${route}`;
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    }
    // Let lazy images below the fold settle before a full-page capture.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);

    const name = (route === '/' ? 'home' : route.replace(/\//g, '-').replace(/^-/, ''))
      .replace(/[?=&]/g, '_');
    const file = join(OUT, `${name}-${width}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(file);
  }
  await ctx.close();
}

await browser.close();
