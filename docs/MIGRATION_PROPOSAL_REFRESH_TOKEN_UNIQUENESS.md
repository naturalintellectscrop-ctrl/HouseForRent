# Migration proposal — `session.refresh_token_hash` uniqueness

**Status:** DRAFT — prepared for owner approval. **Nothing has been applied anywhere.** Production remains untouched; the test rigs already exercise the constraint via the schema datamodel (the established DRAFT convention: schema leads, production follows on approval — same as `landlord_kyc` and `rate_limit_counter`).

- Proposed migration: `prisma/migrations/20261126120000_session_refresh_token_hash_unique/migration.sql`
- Schema change: `prisma/schema.prisma`, `Session.refreshTokenHash` gains `@unique` (annotation only; no client API change)

## 1. Investigation findings (evidence)

| Question | Finding | Evidence |
|---|---|---|
| What is stored in `refresh_token_hash`? | The SHA-256 hex digest of the opaque session token carried by the `hfr_session` httpOnly cookie. The column name is legacy from the original API's refresh-token table; here it identifies the whole session. | `src/server/auth.ts` (`hashToken`, `issueSession`) |
| How are hashes created? | `randomBytes(32)` (256-bit CSPRNG) → hex token → SHA-256. Minted fresh on every sign-in; **no rotation/refresh flow exists** — each sign-in creates a new session row. | `src/server/auth.ts` `issueSession` |
| Can duplicates occur today? | Only via (a) a 256-bit CSPRNG collision (cryptographically negligible) or (b) a future implementation bug re-issuing the same token, or a manual import/restore inserting duplicate rows. No current code path reuses a hash. | sole writer: `issueSession`; grep of all `refreshTokenHash` references |
| Is uniqueness enforced anywhere? | **No.** No `@unique` in the schema (only `@@index([userAccountId])`), no unique index in any applied migration, no code-level guard. `resolveSession` uses `findFirst` (arbitrary row on tie) and `revokeCurrentSession` uses `updateMany`. `src/server/auth.ts` said so itself in a comment before this round. | `prisma/schema.prisma` `model Session`; `src/server/auth.ts` |
| What would a duplicate actually do? | Two rows with the same hash means the same token maps to two session rows. `findFirst` resolves one arbitrarily (same account in every realistic scenario, so the practical impact is revocation/audit ambiguity, not cross-account access) — but the *invariant* "a token identifies exactly one session" would be silently broken. | analysis of `resolveSession` / `revokeCurrentSession` |

**Classification: defense-in-depth (INVESTIGATE → COMPLETE), not a live defect.** No exploit path exists today; the constraint closes a silent-failure class (bug/restore/import) by turning it into a loud insert error.

## 2. Proposed change (additive)

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "session_refresh_token_hash_key" ON "session"("refresh_token_hash");
```

The migration body additionally **refuses to apply** (raises inside the transaction) if duplicate hashes already exist, so the operator decides how to resolve history rather than the migration silently succeeding or failing mid-create. `prisma migrate diff --from-empty --to-schema-datamodel` over the amended datamodel emits exactly this index (verified — schema↔migration parity), so a future `prisma migrate dev` will not try to re-create or alter it.

## 3. Preflight (read-only, owner-run against the target before applying)

```sql
-- must return zero rows
SELECT refresh_token_hash, count(*) FROM session GROUP BY refresh_token_hash HAVING count(*) > 1;
-- inventory of existing indexes on the table (name-collision awareness)
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'session';
```

## 4. Apply procedure (owner action, via the existing rails)

```bash
TARGET_DATABASE_URL='…' ALLOW_PROD_MIGRATION=yes \
  node scripts/apply-migration.mjs \
  prisma/migrations/20261126120000_session_refresh_token_hash_unique/migration.sql
```

## 5. Risk assessment

| Risk | Assessment |
|---|---|
| Data change | None. Index only; no rows read or rewritten. |
| Locking | `CREATE UNIQUE INDEX` takes a SHARE lock on `session` (writes blocked during the build). The table is tiny pre-launch; the only writer is the sliding-expiry UPDATE, which pauses for the build's duration (sub-second at this scale). |
| Application behaviour | None until applied. After: `findFirst`/`updateMany` behave identically (≤1 row per hash). `issueSession` now *could* surface a P2002 on a hash collision — that failure class is exactly what the index exists to make loud; it would read as a 500 INTERNAL (an RNG/invariant failure, correctly a server error, logged with the Prisma class name by the API edge). |
| Deploy ordering | Safe with the current code (which never assumes >1 row). The code before this round also works with the index — ordering is not load-bearing. |
| Rollback | `DROP INDEX IF EXISTS "session_refresh_token_hash_key";` — instantaneous, no data impact. |
| DR interplay | Restores that reload a schema dump recreate the index with the table; the duplicate-guard means a restore containing duplicate hashes fails loudly during drill/restore instead of silently degrading session resolution afterwards. |
| Regression coverage | The five suites already regenerate rig schema from the datamodel, so every rig run now exercises sessions under the constraint (login/logout/session-slide journeys in authz 80/80, finance 166/166 — all green with the annotation in place). |

## 6. Decision requested

Approval to apply the DRAFT migration to production through `scripts/apply-migration.mjs` (after running the §3 preflight). Until then, production continues exactly as today.
