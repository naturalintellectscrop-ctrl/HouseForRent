import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { resolveJwtSecret } from '../jwt-secret';

/**
 * Better Auth instance — INSTALLED AND CONFIGURED, NOT YET LOAD-BEARING.
 *
 * ── Why this sits beside the existing auth rather than replacing it ──
 * The current auth layer is the most heavily tested thing in this project:
 * 110 assertions covering the §4 authorisation matrix, verified
 * load-bearing by disabling `RolesGuard` and confirming exactly the denial
 * half failed. It also carries rules Better Auth knows nothing about —
 * `DealPartyGuard` returning 404-not-403 to prevent deal-ID enumeration,
 * `AssignedFooGuard` requiring the officer who was actually dispatched, and
 * the rule that `foo`/`admin` can never be self-registered.
 *
 * Swapping the credential store under all of that in the same change that
 * ships a logo is how a money system acquires a silent authorisation hole.
 * So this file makes Better Auth REAL — installed, configured, pointed at
 * the same database — while every guard still runs on the existing
 * session. The cutover is its own change, with its own test pass.
 *
 * ── What still has to happen before it can be load-bearing ──
 *   1. `npx @better-auth/cli generate` to emit its schema, then reconcile
 *      it with `user_account` / `user_credential` / `session`, which
 *      Data_Model.md §2.2–2.3 specify and which the deal guards join
 *      against by `partyId`.
 *   2. A migration mapping existing credentials across. Passwords are
 *      bcrypt; Better Auth defaults to scrypt, so either its hasher is
 *      configured to bcrypt or every user resets.
 *   3. Re-point `JwtAuthGuard` at Better Auth sessions, keeping
 *      `AuthenticatedCaller` ({ userAccountId, partyId, role }) intact —
 *      every guard and controller destructures it.
 *   4. Re-run the full matrix and re-verify it is still load-bearing.
 *
 * Until then, importing this file has no effect on request handling.
 */

/**
 * Its own client instance rather than `PrismaService`: that is a NestJS
 * provider with a lifecycle tied to the DI container, and Better Auth
 * expects a plain client it can own. Sharing one would couple two
 * connection lifecycles for no benefit while this is inert.
 */
function client(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must be set');
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export function createBetterAuth() {
  return betterAuth({
    database: prismaAdapter(client(), { provider: 'postgresql' }),

    /**
     * Reuses the same boot-time guard as the existing auth, so there is one
     * place that decides what counts as an acceptable secret — and one
     * place that refuses to start without one. `BETTER_AUTH_SECRET` wins if
     * set, so the two can be rotated independently later.
     */
    secret: process.env.BETTER_AUTH_SECRET?.trim() || resolveJwtSecret(),
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',

    emailAndPassword: {
      enabled: true,
      /**
       * Accounts here are keyed to a PHONE NUMBER, not an email —
       * verification runs against a Ugandan NIN and MSISDN, and the escrow
       * rails are mobile money. Email verification is therefore off: there
       * is no email to verify, and turning it on would lock out every real
       * user at signup.
       */
      requireEmailVerification: false,
      // Matches the existing bcrypt cost, so a credential migration does
      // not silently change the work factor.
      minPasswordLength: 8,
    },

    /**
     * ── Every table is namespaced `ba_` ──
     * Better Auth's defaults collide head-on with this schema: it wants a
     * model `Session` on a table `session`, and Data_Model.md §2.3 already
     * defines one — the live refresh-token store, with an entirely
     * different shape (`refresh_token_hash`, `revoked_at`). Taking the
     * default names would mean dropping the table every signed-in user
     * depends on, in order to install an auth system that is not yet
     * load-bearing.
     *
     * So Better Auth gets its own four tables beside the existing ones.
     * Both systems are real, neither can corrupt the other, and the
     * eventual cutover becomes a data migration between two live schemas
     * rather than a destructive replacement.
     */
    user: {
      modelName: 'BetterAuthUser',
      additionalFields: {
        // `role` and `partyId` are carried on the user record because every
        // guard in this codebase resolves them per request. Better Auth has
        // to be able to produce the same `AuthenticatedCaller` shape, or the
        // cutover would mean rewriting the guards too.
        partyId: { type: 'string', required: false, input: false },
        role: { type: 'string', required: false, input: false },
      },
    },
    session: {
      modelName: 'BetterAuthSession',
      // Mirrors the current 30-day refresh window (auth.service.ts), so a
      // cutover does not silently change how long a session lives.
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    account: { modelName: 'BetterAuthAccount' },
    verification: { modelName: 'BetterAuthVerification' },

    advanced: {
      // The mobile app is native and sends a bearer token; the console
      // talks to this API server-side. Neither needs a cross-site cookie,
      // and defaulting to one would widen CSRF surface for no gain.
      useSecureCookies: process.env.NODE_ENV === 'production',
    },
  });
}

export type BetterAuth = ReturnType<typeof createBetterAuth>;

/**
 * The singleton, under the name the Better Auth ecosystem expects.
 *
 * `@better-auth/cli` reads the config by importing this module and looking
 * for a default export or a binding called `auth` — the factory alone is
 * invisible to it, so `generate` and `migrate` cannot see the schema
 * without this. The factory stays exported because Nest constructs its own
 * instance through DI.
 *
 * Constructing at module scope is safe: `PrismaClient` with an adapter does
 * not open a connection until the first query, so importing this costs a
 * config object and nothing else.
 */
export const auth = createBetterAuth();
