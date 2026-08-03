import {
  DEV_ONLY_JWT_SECRET,
  InsecureJwtSecretError,
  resolveJwtSecret,
} from './jwt-secret';

/**
 * The boot-time guard on the JWT signing secret.
 *
 * This exists because the previous `process.env.JWT_SECRET ?? 'dev-only-…'`
 * would have deployed a PUBLISHED secret to production in silence — every
 * token verifying, every guard passing, every test green, while anyone with
 * the repository could mint an `admin` token.
 */
describe('JWT secret resolution', () => {
  const REAL = 'k9Xq2mV7pL4wZ8nR5tY3bC6vH1jF0sDgA2eU7iO4kM9x';

  describe('outside development', () => {
    for (const NODE_ENV of ['production', 'staging', undefined]) {
      // An UNSET NODE_ENV is the dangerous case — a server where nobody
      // set it must be treated as production, not as development.
      test(`NODE_ENV=${NODE_ENV ?? 'unset'}: an absent secret REFUSES to boot`, () => {
        expect(() => resolveJwtSecret({ NODE_ENV } as NodeJS.ProcessEnv)).toThrow(
          InsecureJwtSecretError,
        );
      });

      test(`NODE_ENV=${NODE_ENV ?? 'unset'}: the PUBLISHED dev secret refuses to boot`, () => {
        expect(() =>
          resolveJwtSecret({
            NODE_ENV,
            JWT_SECRET: DEV_ONLY_JWT_SECRET,
          } as NodeJS.ProcessEnv),
        ).toThrow(InsecureJwtSecretError);
      });

      test(`NODE_ENV=${NODE_ENV ?? 'unset'}: a too-short secret refuses to boot`, () => {
        expect(() =>
          resolveJwtSecret({
            NODE_ENV,
            JWT_SECRET: 'short',
          } as NodeJS.ProcessEnv),
        ).toThrow(InsecureJwtSecretError);
      });

      test(`NODE_ENV=${NODE_ENV ?? 'unset'}: a real secret is accepted`, () => {
        expect(
          resolveJwtSecret({
            NODE_ENV,
            JWT_SECRET: REAL,
          } as NodeJS.ProcessEnv),
        ).toBe(REAL);
      });
    }

    test('whitespace is not a secret', () => {
      expect(() =>
        resolveJwtSecret({
          NODE_ENV: 'production',
          JWT_SECRET: '        ',
        } as NodeJS.ProcessEnv),
      ).toThrow(InsecureJwtSecretError);
    });

    test('the error names the variable and how to generate one', () => {
      try {
        resolveJwtSecret({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
        throw new Error('should have thrown');
      } catch (err) {
        // Whoever hits this at 2am needs the fix in the message, not a
        // stack trace pointing at a DI factory.
        expect((err as Error).message).toMatch(/JWT_SECRET/);
        expect((err as Error).message).toMatch(/openssl rand/);
      }
    });
  });

  describe('in development', () => {
    test('an absent secret falls back, so local work needs no setup', () => {
      expect(
        resolveJwtSecret({ NODE_ENV: 'development' } as NodeJS.ProcessEnv),
      ).toBe(DEV_ONLY_JWT_SECRET);
    });

    test('the test environment falls back too, so the suite needs no secret', () => {
      expect(resolveJwtSecret({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).toBe(
        DEV_ONLY_JWT_SECRET,
      );
    });

    test('a short secret is allowed locally — the rule is about deployment', () => {
      expect(
        resolveJwtSecret({
          NODE_ENV: 'development',
          JWT_SECRET: 'short',
        } as NodeJS.ProcessEnv),
      ).toBe('short');
    });
  });
});
