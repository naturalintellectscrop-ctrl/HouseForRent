import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { AppModule } from './app.module';
import { auth } from './auth/better-auth/auth';

/**
 * ── CORS ──
 * `CORS_ORIGINS` is a comma-separated allowlist of exact origins, e.g.
 *   CORS_ORIGINS=https://console.houseforrent.ug,https://houseforrent.vercel.app
 *
 * Deliberately an allowlist and not `origin: true`. Reflecting whatever
 * Origin a request arrives with is equivalent to no CORS at all, and this
 * API exposes money and state-transition endpoints — the browser's
 * same-origin policy is one of the few controls standing between a
 * malicious page and an authenticated admin's session.
 *
 * Unset means NO cross-origin browser access, which is the correct default
 * for the mobile app (native, not subject to CORS) and for the console's
 * server-side fetches (also not subject to CORS). Only the console's
 * client-side calls need this, so an empty value fails closed rather than
 * silently opening the API to every page on the internet.
 */
function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  /**
   * ── Body parsing is taken over from Nest, deliberately ──
   * Better Auth's handler reads the RAW request body. Nest's default JSON
   * parser consumes the stream before any `app.use` mounted afterwards can
   * see it, so `/api/auth/*` would receive an empty body and fail every
   * POST. Disabling the built-in parser and re-adding it BELOW the auth
   * mount gives Better Auth the raw stream and every Nest controller the
   * parsed body it already expects — the ordering is the whole point.
   */
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const origins = corsOrigins();

  /**
   * Better Auth's routes, live at `/api/auth/*`.
   *
   * ── Live, but not yet load-bearing ──
   * Nothing else in this API trusts a Better Auth session: `JwtAuthGuard`
   * still resolves the session table in Data_Model.md §2.3, and every
   * authorisation decision still runs through the guards covered by the 132
   * assertions in `authorization-matrix.spec.ts`. Mounting the handler makes
   * Better Auth real enough to exercise and migrate onto; it does not hand
   * it authority over anything (see `auth/better-auth/auth.ts`).
   */
  app.use('/api/auth', toNodeHandler(auth));

  // Everything below the auth mount gets the parsed body, as before.
  app.use(json());
  app.use(urlencoded({ extended: true }));

  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    });
  } else if (process.env.NODE_ENV === 'production') {
    // Not fatal — the console talks to this API server-side, and the
    // mobile app is not a browser. But a deployment that expected
    // cross-origin access will fail confusingly, so say so at boot.
    new Logger('Bootstrap').warn(
      'CORS_ORIGINS is unset: no cross-origin browser requests will be ' +
        'accepted. Set it to the console origin if you need them.',
    );
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
