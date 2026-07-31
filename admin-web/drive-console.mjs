// Drives the console in a real browser.
//
// Server Actions only work after hydration, so curl cannot verify the forms
// — it can fetch the HTML and see a `<form action="">` that does nothing
// without JavaScript. This script signs in through the real login form and
// submits the real version-creating forms.
//
// It has already earned its keep: it caught `CreateConfigVersionDto.value`
// carrying no class-validator decorator, which made the global
// `whitelist: true` strip the one field the endpoint exists to accept. tsc,
// `next build` and 339 backend tests were all green.
//
// Prerequisites: the API on :3000, the console on :3100, and the console
// admin from `backend/seed-console-admin.mjs`.
//
// Usage: node drive-console.mjs
import { chromium } from 'playwright';

const CONSOLE = process.env.CONSOLE_URL ?? 'http://localhost:3100';
const PHONE = process.env.CONSOLE_PHONE ?? '+256700000901';
const PASSWORD = process.env.CONSOLE_PASSWORD ?? 'console-demo-pass';

const browser = await chromium.launch();
const page = await browser.newPage();

const problems = [];
page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
});

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) process.exitCode = 1;
}

/** Submits a form and returns [message, wasError]. */
async function submit(buttonText) {
  await page.click(`button:has-text("${buttonText}")`);
  await page.waitForSelector('.alert-ok, .alert-error', { timeout: 15000 });
  const el = page.locator('.alert-ok, .alert-error').first();
  const cls = (await el.getAttribute('class')) ?? '';
  return [(await el.textContent())?.trim() ?? '', cls.includes('alert-error')];
}

// ── sign in through the real form ──
await page.goto(`${CONSOLE}/login`);
await page.fill('#primaryPhone', PHONE);
await page.fill('#password', PASSWORD);
await page.click('button[type=submit]');
await page.waitForURL(`${CONSOLE}/`, { timeout: 15000 });
check('login redirects to the dispatch board', page.url() === `${CONSOLE}/`);

// ── the ops overview renders its hero figure and meter ──
await page.goto(`${CONSOLE}/ops`);
const hero = (await page.textContent('.hero'))?.trim();
const meterStyle = await page.getAttribute('.meter-fill', 'style');
check('ops hero figure renders', /\d/.test(hero ?? ''), hero);
check('meter fill has a width', /width:/.test(meterStyle ?? ''), meterStyle);
check(
  'exactly one hero figure on the view',
  (await page.locator('.hero').count()) === 1,
);
check(
  'admin sees the reconciliation section',
  (await page.locator('h2', { hasText: 'Reconciliation' }).count()) === 1,
);

// ── FR-10.1: create a rate version through the real form ──
const RATE = String(9000 + Math.floor(Math.random() * 900));
await page.goto(`${CONSOLE}/ops/config`);
await page.fill('#rateBpOfMonth', RATE);
await page.fill('#note', 'browser-driven check');
{
  const [msg, isError] = await submit('Create rate version');
  check(
    'rate-version form submits and the server accepts it',
    !isError && /New rate version created/.test(msg),
    msg,
  );
}

// ── the SERVER, not the console, rejects a bad rate ──
await page.goto(`${CONSOLE}/ops/config`);
await page.fill('#rateBpOfMonth', '999999');
{
  const [msg, isError] = await submit('Create rate version');
  check(
    'an out-of-range rate is REJECTED, with the reason shown',
    isError,
    msg.slice(0, 70),
  );
}

// ── FR-10.1: create a config version through the real form ──
// `required_months_default`, not `freshness_window_days`: config versions
// are append-only, so writing the freshness window here would change what
// every listing in this database is judged against.
await page.goto(`${CONSOLE}/ops/config`);
await page.selectOption('#key', 'required_months_default');
await page.fill('#value', '3');
{
  const [msg, isError] = await submit('Create config version');
  check(
    'config-version form submits and the server accepts it',
    !isError && /New version of/.test(msg),
    msg,
  );
}

// ── malformed JSON is explained before it reaches the API ──
await page.goto(`${CONSOLE}/ops/config`);
await page.selectOption('#key', 'required_months_default');
await page.fill('#value', 'not json');
{
  const [msg, isError] = await submit('Create config version');
  check('malformed JSON is explained, not sent', isError && /valid JSON/.test(msg), msg.slice(0, 60));
}

// ── the history table reflects the new version ──
// Matched on the VALUE cell specifically, and anchored. A loose
// has-text("3") would also match a date or an id and pass whether or not
// the version was ever written — a check that cannot fail proves nothing.
await page.goto(`${CONSOLE}/ops/config?key=required_months_default`);
const wroteVersion = await page
  .locator('tbody tr')
  .filter({ has: page.locator('td.mono', { hasText: /^3$/ }) })
  .count();
check('the new config version appears in the history', wroteVersion > 0);
check(
  'exactly one version is marked in force',
  (await page.locator('.pill', { hasText: 'in force' }).count()) === 1,
);

// ── the read-only pages render ──
for (const [path, heading] of [
  ['/ops/queue', 'Verification queue'],
  ['/ops/reconciliation', 'Reconciliation'],
  ['/ops/audit', 'Audit trail'],
  ['/introductions', 'Introduction evidence'],
]) {
  await page.goto(`${CONSOLE}${path}`);
  const h1 = (await page.textContent('h1'))?.trim();
  check(`${path} renders`, h1 === heading, h1);
}

check(
  'no uncaught page errors anywhere in the run',
  problems.length === 0,
  problems.slice(0, 3).join(' | '),
);

await browser.close();
