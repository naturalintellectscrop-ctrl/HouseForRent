import { expect, test, type Page } from '@playwright/test';

/**
 * The product, driven through a real browser against the real API.
 *
 * ── What this proves that the API journey script does not ──
 * `apps/api/scripts/journey-http.mjs` proves every step is REACHABLE over
 * HTTP. It says nothing about whether a person can find the button. These
 * tests click the actual controls a tenant and a landlord would click, in
 * the order they would click them, and fail if a step exists in the API but
 * has no way into it from the site.
 *
 * ── No fixtures reach past the boundary ──
 * Accounts are created through the registration form. Nothing here touches
 * the database, and nothing is granted a state a real visitor could not
 * reach — which is the whole point of F-011.
 *
 * Requires: the API on :3000 and the web app on :3100, with the demo
 * corridor seeded (`npm run seed:demo`).
 */

const STAMP = Date.now();
const PASSWORD = 'e2e-journey-2026';

/** A phone number no other run will collide with. */
function phone(prefix: string): string {
  return `+2567${prefix}${String(STAMP).slice(-6)}`;
}

async function register(
  page: Page,
  opts: { name: string; phone: string; role: 'tenant' | 'lister' },
) {
  await page.goto('/register');
  await page.getByRole('radio', {
    name: opts.role === 'tenant' ? /I need a home/ : /I have one to let/,
  }).check();
  await page.getByLabel('Your name').fill(opts.name);
  await page.getByLabel('Phone number').fill(opts.phone);
  await page.getByLabel('Choose a password').fill(PASSWORD);
  await page.getByRole('button', { name: /Create account/ }).click();

  /**
   * Wait for the action's redirect to LAND before returning.
   *
   * Without this the caller's next `goto` can fire mid-flight and cancel the
   * navigation that sets the session cookie — producing a signed-out page
   * and a failure that looks like an authorisation bug rather than a race.
   */
  await page.waitForURL(opts.role === 'tenant' ? /\/account/ : /\/landlord/);
}

test.describe('the public marketplace', () => {
  test('a visitor with no account can understand and browse', async ({
    page,
  }) => {
    await page.goto('/');

    // What House For Rent is, above the fold, in the first heading.
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /stood inside/i,
    );

    // Homes are shown on the home page, not behind a sign-up wall.
    const cards = page.locator('a.pcard');
    await expect(cards.first()).toBeVisible();

    // Search is reachable and returns the same feed.
    await page.getByRole('link', { name: 'Find a home' }).first().click();
    await expect(page).toHaveURL(/\/properties/);
    await expect(page.locator('a.pcard').first()).toBeVisible();
  });

  test('a property page shows terms, evidence and a way in', async ({
    page,
  }) => {
    await page.goto('/properties');
    await page.locator('a.pcard').first().click();

    await expect(page).toHaveURL(/\/properties\/[0-9a-f-]+/);

    // The commercial terms a tenant needs before deciding.
    await expect(
      page.getByText('Deposit', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Months payable upfront')).toBeVisible();
    await expect(page.getByText('Held in escrow at agreement')).toBeVisible();

    // The trust claim, which is what distinguishes this from a listings site.
    await expect(page.getByText(/Verified in person/i).first()).toBeVisible();

    // The call to action exists and, signed out, routes to registration.
    await page.getByRole('link', { name: /Request a viewing/ }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test('filtering narrows the feed and survives a reload', async ({ page }) => {
    await page.goto('/properties');
    await page.getByLabel('Bedrooms').selectOption('2');
    await page.getByRole('button', { name: 'Apply' }).click();

    await expect(page).toHaveURL(/bedrooms=2/);
    // Filters live in the URL, so a shared link reproduces the search.
    await page.reload();
    await expect(page.getByLabel('Bedrooms')).toHaveValue('2');
  });

  test('every public page renders', async ({ page }) => {
    for (const path of [
      '/how-it-works',
      '/for-landlords',
      '/about',
      '/contact',
      '/login',
      '/register',
    ]) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} should render`).toBeLessThan(400);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('the tenant journey', () => {
  test('register, verify identity, request a viewing', async ({ page }) => {
    const tenantPhone = phone('55');
    await register(page, {
      name: 'E2E Tenant',
      phone: tenantPhone,
      role: 'tenant',
    });

    // Registration lands on the tenant's own surface, not a generic page.
    await expect(page).toHaveURL(/\/account/);

    // The blocking step is surfaced first, because until it is done the API
    // refuses every viewing request.
    await expect(
      page.getByRole('heading', { name: /Verify your identity/ }),
    ).toBeVisible();

    await page.getByRole('link', { name: /Verify my identity/ }).click();
    await expect(page).toHaveURL(/\/account\/identity/);

    await page.getByLabel('National Identification Number').fill('CM12345678ABCD');
    await page.getByLabel(/Phone number registered/).fill(tenantPhone);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /Verify my identity/ }).click();

    await expect(
      page.getByRole('heading', { name: /Your identity is verified/ }),
    ).toBeVisible();

    // Now the viewing request is reachable and accepted.
    await page.goto('/properties');
    await page.locator('a.pcard').first().click();
    await page.getByRole('link', { name: /Request a viewing/ }).click();

    await expect(page).toHaveURL(/\/account\/viewings\/new/);
    await page.getByRole('button', { name: /Request this viewing/ }).click();

    await expect(page).toHaveURL(/\/account\/viewings/);
    await expect(page.getByText(/Request sent/i)).toBeVisible();
    // The viewing appears with the property it is about, not a bare id.
    await expect(page.locator('.list-item').first()).toContainText(/bed/);
  });
});

test.describe('the landlord journey', () => {
  test('register, add a property, see what it is waiting on', async ({
    page,
  }) => {
    await register(page, {
      name: 'E2E Landlord',
      phone: phone('44'),
      role: 'lister',
    });

    await expect(page).toHaveURL(/\/landlord/);
    await expect(
      page.getByRole('heading', { name: /Your properties/ }),
    ).toBeVisible();

    // Three controls legitimately offer this — the nav, the header button
    // and the empty state. Any of them is the right answer.
    await page
      .getByRole('link', { name: /Add (a|your first) property/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/landlord\/properties\/new/);

    // F-015: the neighbourhood picker is populated from the API. Before the
    // taxonomy routes existed this select could not have had options at all.
    const hood = page.getByLabel('Neighbourhood');
    await expect(hood.locator('option')).not.toHaveCount(1);
    await hood.selectOption({ index: 1 });

    await page
      .getByLabel('Landmark')
      .fill(`E2E landmark ${STAMP}, past the roundabout`);
    await page.getByLabel('Bedrooms').fill('2');
    await page.getByLabel('Bathrooms').fill('1');
    await page.getByLabel('Monthly rent (UGX)').fill('1400000');
    await page.getByLabel('Deposit (UGX)').fill('1400000');
    await page.getByLabel('Months payable upfront').fill('2');

    await page.getByRole('button', { name: /Save and continue/ }).click();

    await expect(page).toHaveURL(/\/landlord\/listings\/[0-9a-f-]+/);

    // The landlord is told what is outstanding, in their own vocabulary,
    // from the server's `blockedBy`.
    await expect(page.getByText(/What happens next/)).toBeVisible();
    await expect(
      page.getByText(/field officer to visit and verify/i),
    ).toBeVisible();

    // Publishing is refused while blocked — the button follows the server's
    // `canPublish`, and the API refuses regardless.
    const publish = page.getByRole('button', { name: /Publish this listing/ });
    await expect(publish).toBeDisabled();

    // The agreement is presented with a real figure, not a percentage.
    await expect(page.getByText(/Our commission, if it lets/)).toBeVisible();
    await expect(page.getByText(/UGX/).first()).toBeVisible();
  });
});

test.describe('authorisation is not a UI concern', () => {
  test('a signed-out visitor is sent to sign in, not shown the page', async ({
    page,
  }) => {
    for (const path of ['/account', '/landlord', '/ops']) {
      await page.goto(path);
      await expect(page, `${path} must not render signed out`).toHaveURL(
        /\/login/,
      );
    }
  });

  test('a tenant following a landlord link lands on their own surface', async ({
    page,
  }) => {
    await register(page, {
      name: 'E2E Wrong Role',
      phone: phone('33'),
      role: 'tenant',
    });
    await page.goto('/landlord');
    // Not an error page: they have done nothing wrong. The API would refuse
    // the landlord calls regardless of what this redirect does.
    await expect(page).toHaveURL(/\/account/);
  });
});
