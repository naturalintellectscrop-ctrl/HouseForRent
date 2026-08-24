import { expect, test } from '@playwright/test';

/**
 * The same site, on a phone.
 *
 * ── Why this is its own project ──
 * "Responsive" usually means the CSS reflows. What actually matters is
 * whether a person can still GET ANYWHERE: at 412px the main navigation is
 * inside a collapsed menu, and if that menu is broken the site is not
 * narrow, it is unusable. These tests drive the narrow layout the way a
 * tenant on a phone browser would.
 */

test('the collapsed menu is the way through the site', async ({ page }) => {
  await page.goto('/');

  // The desktop nav is genuinely hidden, not merely visually small.
  await expect(
    page.locator('.site-nav').getByRole('link', { name: 'Find a home' }),
  ).toBeHidden();

  // The menu is a <details>, so it works before any JavaScript loads.
  await page.locator('.menu > summary').click();
  await page.locator('.menu-panel').getByRole('link', { name: 'Find a home' }).click();

  await expect(page).toHaveURL(/\/properties/);
  await expect(page.locator('a.pcard').first()).toBeVisible();
});

test('the page never scrolls sideways', async ({ page }) => {
  for (const path of ['/', '/properties', '/how-it-works', '/for-landlords']) {
    await page.goto(path);
    // A horizontal scrollbar on a phone is the single most common
    // responsive defect, and it is always an overflowing child rather than
    // a deliberate choice.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test('a property card is readable and tappable at 412px', async ({ page }) => {
  await page.goto('/properties');
  const card = page.locator('a.pcard').first();
  await expect(card).toBeVisible();

  const box = await card.boundingBox();
  expect(box!.width).toBeGreaterThan(280);

  await card.click();
  await expect(page).toHaveURL(/\/properties\/[0-9a-f-]+/);

  // The action a tenant came for is present without hunting for it.
  await expect(
    page.getByRole('link', { name: /Request a viewing/ }),
  ).toBeVisible();
});

test('the filter form is usable without a keyboard shortcut', async ({
  page,
}) => {
  await page.goto('/properties');
  await page.getByLabel('Bedrooms').selectOption('2');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page).toHaveURL(/bedrooms=2/);
});
