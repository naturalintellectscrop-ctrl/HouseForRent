/**
 * Session-policy probe (round 60 verification) - talks DIRECTLY to the
 * isolated rig's PGlite over the same wire protocol the app uses, so the
 * idle-logout mechanics can be asserted at the row level. NEVER pointed at
 * production; the rig database is disposable.
 *
 * Usage: DATABASE_URL=postgres://rig:rig@127.0.0.1:5511/postgres?pgbouncer=true&connection_limit=1 bun scripts/session-probe.mjs <op>
 *   show     - print the newest session row's timestamps (ISO)
 *   expire   - set the newest session's expires_at 1s in the past (simulated idle hour)
 *   slide    - set expires_at to now+54min (inside the slide window: <60-5)
 *   clamp    - set expires_at to now+20d (a pre-policy 30-day session) and created_at to now
 *   cap      - backdate created_at 29d23.5h and set expires_at now+10min
 */
import { PrismaClient } from '@prisma/client';

const op = process.argv[2] ?? 'show';
const db = new PrismaClient();

const newest = () =>
  db.session.findFirst({ orderBy: { createdAt: 'desc' } });

if (op === 'show') {
  const s = await newest();
  const all = await db.$queryRaw`SELECT count(*)::int AS n FROM session`;
  const n = Array.isArray(all) ? all[0].n : all.rows[0].n;
  if (!s) {
    console.log(JSON.stringify({ NO_SESSION_ROWS: true, total_sessions: n }));
  } else {
    console.log(JSON.stringify({ id: s.id, created: s.createdAt, expires: s.expiresAt, revoked: s.revokedAt, total_sessions: n }));
  }
} else if (op === 'expire') {
  const s = await newest();
  const past = new Date(Date.now() - 1000);
  await db.session.update({ where: { id: s.id }, data: { expiresAt: past } });
  console.log(JSON.stringify({ id: s.id, expires_set: past.toISOString() }));
} else if (op === 'slide') {
  const s = await newest();
  const soon = new Date(Date.now() + 54 * 60 * 1000);
  await db.session.update({ where: { id: s.id }, data: { expiresAt: soon } });
  console.log(JSON.stringify({ id: s.id, expires_set: soon.toISOString() }));
} else if (op === 'clamp') {
  const s = await newest();
  const created = new Date(Date.now() - 60 * 1000);
  const long = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);
  await db.session.update({ where: { id: s.id }, data: { createdAt: created, expiresAt: long } });
  console.log(JSON.stringify({ id: s.id, created_set: created.toISOString(), expires_set: long.toISOString() }));
} else if (op === 'cap') {
  const s = await newest();
  const created = new Date(Date.now() - (29 * 24 * 60 + 23.5 * 60) * 60 * 1000);
  const soon = new Date(Date.now() + 10 * 60 * 1000);
  await db.session.update({ where: { id: s.id }, data: { createdAt: created, expiresAt: soon } });
  console.log(JSON.stringify({ id: s.id, created_set: created.toISOString(), expires_set: soon.toISOString(), absolute_cap_should_be: new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() }));
} else {
  console.error('unknown op');
  process.exit(1);
}

await db.$disconnect();
