# End-to-end tests

These drive the console in a real browser against a **real backend and a
real database** — nothing is mocked. That is the point: they cover the two
things the unit suites cannot reach, namely that the Server Actions actually
round-trip, and that the Data_Model.md §5.1 invariant is what a field
officer *sees* — the close button is unavailable until the structured report
exists, and the introduction record appears only alongside it.

They already earned their keep: the first run found that a `'use server'`
file cannot export a plain object (`IDLE`), a defect that passed both
`tsc --noEmit` and `next build` and only failed under a browser.

## Running them

1. Start the database (from `apps/api/`): `npx prisma dev`
2. Start the API (from `apps/api/`):
   `DATABASE_URL=... npx ts-node -r tsconfig-paths/register src/main.ts`
3. Build and start the console (from `apps/console/`):
   `npm run build && npx next start -p 3100`
4. Seed a scenario — a FOO account with assigned viewings — and export:

   ```
   export E2E_FOO_PHONE="+2567..."      # the seeded field officer
   export E2E_VIEWING_ID="..."          # a scheduled viewing assigned to them
   export E2E_VIEWING_ID_2="..."        # a second one, for the no-show path
   ```

5. `npx playwright test`

Without those variables the suite **skips rather than passing**, so an
unseeded run cannot be mistaken for a green one.

The tests mutate the seeded viewing through its state machine, so they run
serially with one worker and need a fresh seed per full run.
