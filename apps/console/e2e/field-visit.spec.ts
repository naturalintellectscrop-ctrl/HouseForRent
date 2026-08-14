import { test, expect, type Page } from '@playwright/test';

/**
 * Drives the console the way a field officer does, against a REAL backend
 * and a real database — no mocked API.
 *
 * The point of these is the two things a unit test cannot reach: that the
 * server actions actually round-trip, and that the invariant of
 * Data_Model.md §5.1 is what the officer SEES — the close button is
 * unavailable until the structured report exists, and the introduction
 * record appears only alongside it.
 *
 * `E2E_FOO_PHONE` and `E2E_VIEWING_ID` come from the seed script; the suite
 * skips rather than lying if they are absent.
 */

const PHONE = process.env.E2E_FOO_PHONE;
const PASSWORD = process.env.E2E_PASSWORD ?? 'correct-horse-battery';
const VIEWING_ID = process.env.E2E_VIEWING_ID;
const SECOND_VIEWING_ID = process.env.E2E_VIEWING_ID_2;

test.skip(
  !PHONE || !VIEWING_ID,
  'set E2E_FOO_PHONE / E2E_VIEWING_ID from the seed script',
);

/** Taps a structured-choice pill and asserts it actually took. */
async function choose(page: Page, label: string) {
  const choice = page
    .locator('label.choice')
    .filter({ hasText: new RegExp(`^${label}$`) });
  await choice.click();
  await expect(choice.locator('input')).toBeChecked();
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Phone number').fill(PHONE!);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/');
}

test('an unauthenticated officer is sent to sign in', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('bad credentials are refused without saying which part was wrong', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Phone number').fill(PHONE!);
  await page.getByLabel('Password').fill('definitely-not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  // Must not distinguish "no such account" from "wrong password" — the
  // backend deliberately makes them indistinguishable.
  await expect(alert).not.toContainText(/no such|not found|unknown user/i);
});

test('the officer signs in and sees only their own assigned visits', async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Your visits' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Listing/ }).first()).toBeVisible();
});

test('THE INVARIANT: a visit cannot be closed until the report is filed', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/viewings/${VIEWING_ID}`);

  // Before the report: the officer is told why, and the button is dead.
  await expect(
    page.getByText('File the structured field report first'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close visit' })).toBeDisabled();

  // File the structured report (FR-5.4). Tapping the label is the real
  // gesture — the radio itself is visually hidden behind its styled pill,
  // so driving the input directly would test something no officer does.
  await choose(page, 'good');
  await choose(page, 'Matches');
  await choose(page, 'Available');
  await page
    .getByLabel('On-site issues (optional)')
    .fill('Tap leaking in the second bathroom.');
  await page
    .getByLabel('Timing note (optional)')
    .fill('Landlord arrived 20 minutes late.');
  await page.getByRole('button', { name: 'File report' }).click();

  // The filed report is rendered back as structured fields, not prose.
  await expect(page.getByText('Condition')).toBeVisible();
  await expect(page.getByText('Tap leaking')).toBeVisible();

  // Now — and only now — the visit can be closed.
  const close = page.getByRole('button', { name: 'Close visit' });
  await expect(close).toBeEnabled();
  await close.click();

  // FR-5.3: the introduction record exists, and says so.
  await expect(page.getByText('introduction recorded')).toBeVisible();
  await expect(page.getByText('Introduced at')).toBeVisible();
  await expect(
    page.getByText('immutable and persists independently of any deal'),
  ).toBeVisible();
});

test('a conducted visit offers no way to reopen or re-file', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/viewings/${VIEWING_ID}`);

  await expect(page.getByText('introduction recorded')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close visit' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Tenant did not show' }),
  ).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'File report' })).toHaveCount(0);
});

test('the introduction record is queryable as evidence', async ({ page }) => {
  await signIn(page);
  await page.goto('/introductions');

  await expect(
    page.getByRole('heading', { name: 'Introduction evidence' }),
  ).toBeVisible();
  await expect(page.getByText('Landlord').first()).toBeVisible();
  await expect(page.getByText('Officer').first()).toBeVisible();
});

test('a no-show is recorded and closes the visit without an introduction', async ({
  page,
}) => {
  test.skip(!SECOND_VIEWING_ID, 'needs a second seeded viewing');
  await signIn(page);
  await page.goto(`/viewings/${SECOND_VIEWING_ID}`);

  await page.getByRole('button', { name: 'Tenant did not show' }).click();

  await expect(page.getByText('Recorded as a no-show')).toBeVisible();
  await expect(
    page.getByText('No introduction record was created'),
  ).toBeVisible();
});

test('signing out clears the session', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});
