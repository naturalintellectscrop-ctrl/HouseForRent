-- Session refresh-token hash uniqueness (Round-72 engineering follow-up,
-- item 3, 2026-11-26): one token hash identifies exactly one session row.
--
-- PURELY ADDITIVE: one unique index on an existing column. No table, column
-- or business data is touched; no existing constraint is altered.
--
-- STATUS: DRAFT - NOT APPLIED TO PRODUCTION. The schema datamodel already
--   carries the constraint (prisma/schema.prisma, Session.refreshTokenHash),
--   so test rigs exercise it; production gains it only when the owner
--   applies this file through the rails in scripts/apply-migration.mjs
--   (ledger row written atomically):
--   TARGET_DATABASE_URL='…' ALLOW_PROD_MIGRATION=yes \
--   node scripts/apply-migration.mjs prisma/migrations/20261126120000_session_refresh_token_hash_unique/migration.sql
--
-- WHY (evidence): src/server/auth.ts resolves the caller with findFirst on
--   refresh_token_hash. Duplicates are excluded by construction today - the
--   only writer, issueSession, mints a fresh 256-bit random token per
--   sign-in - so this is defense-in-depth, not a live defect: if any future
--   bug (or a sloppy restore/import) ever produced two rows with the same
--   hash, findFirst would return one arbitrarily and session resolution
--   would become ambiguous. The index makes that failure class impossible
--   (a loud insert error) instead of silent.
--
-- PREFLIGHT (read-only, run against the target database BEFORE applying;
-- the first query must return zero rows, the second lists what already
-- exists on the table so index-name collisions are known in advance):
--   SELECT refresh_token_hash, count(*) FROM session
--     GROUP BY refresh_token_hash HAVING count(*) > 1;
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'session';
--
-- GUARD: the migration refuses to apply (transaction rolled back by the
--   raised exception) if duplicates already exist - resolution (revoking
--   stale duplicate sessions) is then an owner decision, not a silent one.
--
-- Lock note: CREATE UNIQUE INDEX takes a SHARE lock on session (writes
-- blocked briefly). Sessions are tiny pre-launch; the sliding-expiry write
-- pauses for the index build only.
--
-- Rollback path (owner-reviewed):
--   DROP INDEX IF EXISTS "session_refresh_token_hash_key";

DO $$
BEGIN
  IF EXISTS (
    SELECT refresh_token_hash FROM "session"
    GROUP BY refresh_token_hash
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate refresh_token_hash values exist in session - revoke the stale duplicates (owner decision) before applying this migration';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "session_refresh_token_hash_key" ON "session"("refresh_token_hash");
