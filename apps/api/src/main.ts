/**
 * Loaded FIRST, and by a side-effect import rather than a call.
 *
 * Runtime configuration is loaded before the Nest application bootstraps.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

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
  const app = await NestFactory.create(AppModule);
  const origins = corsOrigins();

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
