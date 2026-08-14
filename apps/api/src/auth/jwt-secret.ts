/**
 * Resolves the JWT signing secret, and REFUSES to start without a real one
 * outside development.
 *
 * ── Why this is not a `?? 'dev-secret'` one-liner ──
 * It was. A fallback secret is committed to a public repository, so anyone
 * who can read the repo can forge a token for any account — including
 * `admin`, which can create commission rate versions and read the audit
 * log. Nothing in the app would look wrong: tokens verify, guards pass,
 * every test stays green. The failure is silent, total, and only
 * discoverable by someone exploiting it.
 *
 * So the fallback is confined to development, and production fails loudly
 * at boot instead. A service that will not start is an outage; a service
 * signing with a public secret is a breach, and an outage is the better
 * failure by a wide margin.
 *
 * Same posture as `ConfigService`, which throws on an unset business
 * parameter rather than inventing a default: a silent fallback is how an
 * unmade decision becomes permanent.
 */

export const DEV_ONLY_JWT_SECRET = 'dev-only-secret-change-in-production';

/** Below this, a secret is guessable regardless of how random it looks. */
const MIN_SECRET_LENGTH = 32;

export class InsecureJwtSecretError extends Error {
  constructor(reason: string) {
    super(
      `JWT_SECRET ${reason}. Set it to at least ${MIN_SECRET_LENGTH} random ` +
        'characters before starting outside development — for example ' +
        '`openssl rand -base64 48`. Refusing to start: signing tokens with a ' +
        'guessable or published secret would let anyone mint an admin token, ' +
        'and nothing in the running system would look wrong.',
    );
    this.name = 'InsecureJwtSecretError';
  }
}

export function resolveJwtSecret(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const secret = env.JWT_SECRET?.trim();
  // Anything that is not explicitly production is treated as production for
  // this check — an unset NODE_ENV on a server is the exact case where a
  // dev fallback would slip through.
  const isDevelopment =
    env.NODE_ENV === 'development' || env.NODE_ENV === 'test';

  if (!secret) {
    if (isDevelopment) return DEV_ONLY_JWT_SECRET;
    throw new InsecureJwtSecretError('is not set');
  }

  if (secret === DEV_ONLY_JWT_SECRET) {
    if (isDevelopment) return secret;
    throw new InsecureJwtSecretError(
      'is still the development placeholder, which is published in the repository',
    );
  }

  if (!isDevelopment && secret.length < MIN_SECRET_LENGTH) {
    throw new InsecureJwtSecretError(
      `is only ${secret.length} characters long`,
    );
  }

  return secret;
}
