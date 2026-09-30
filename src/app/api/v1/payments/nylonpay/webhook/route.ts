import { NextRequest, NextResponse } from 'next/server';
import * as deals from '@/server/deals';
import { verifyNylonWebhook } from '@/server/nylonpay';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/payments/nylonpay/webhook — Nylon Pay's delivery endpoint.
 *
 * Configure this URL on the API key (Dashboard > API Settings > Webhook
 * Configuration): https://<host>/api/v1/payments/nylonpay/webhook
 *
 * ── Security ──
 * The signature in `x-nylon-signature` (lowercase hex HMAC of the RAW body
 * with the key's webhook secret) IS the authentication: there is no session
 * on this route by design. Verification runs against the raw bytes before
 * anything is parsed or trusted, and the SDK's freshness window rejects
 * captured replays. A missing/invalid signature is a 401; an unconfigured
 * secret is a 503 so the provider RETRIES later instead of anyone accepting
 * unsigned money events.
 *
 * ── Delivery contract ──
 * Nylon delivers at-least-once and retries non-2xx answers (5 fast, then
 * nightly, ~10 total), so everything here is idempotent: instruction states
 * only ever move forward (ledger.transitionPspInstruction), already-applied
 * money outcomes are no-ops, and unknown references are ACKed (200) rather
 * than error-retried forever. All four documented events share one payload
 * shape; the route is deliberately fast (respond 2xx within the 10s budget).
 */

type NylonWebhookBody = {
  delivery_id?: unknown;
  event?: unknown;
  payload?: {
    reference?: unknown;
    amount?: unknown;
    currency?: unknown;
    status?: unknown;
    failureReason?: unknown;
    operatorTid?: unknown;
    [key: string]: unknown;
  };
  timestamp?: unknown;
};

const HANDLED_EVENTS = new Set([
  'transaction.successful',
  'transaction.failed',
  'transaction.processing',
  'transaction.cancelled',
]);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('x-nylon-signature') ?? '';

  if (!process.env.NYLONPAY_WEBHOOK_SECRET) {
    // Fail closed, and in a way the provider retries: the operator has not
    // configured the secret yet, so no delivery can be trusted right now.
    console.error('[nylonpay-webhook] NYLONPAY_WEBHOOK_SECRET is not configured — rejecting delivery');
    return NextResponse.json({ error: 'WEBHOOK_NOT_CONFIGURED' }, { status: 503 });
  }

  if (!signature || !verifyNylonWebhook(rawBody, signature)) {
    return NextResponse.json({ error: 'INVALID_SIGNATURE' }, { status: 401 });
  }

  let body: NylonWebhookBody;
  try {
    body = JSON.parse(rawBody) as NylonWebhookBody;
  } catch {
    // Authenticated but unintelligible — ack so the provider does not retry
    // a permanently malformed payload; the raw body is in our logs.
    console.error('[nylonpay-webhook] non-JSON delivery after valid signature');
    return NextResponse.json({ received: true, note: 'unparseable payload' });
  }

  const event = typeof body.event === 'string' ? body.event : '';
  const tx = body.payload ?? {};
  const reference = typeof tx.reference === 'string' ? tx.reference : '';
  const deliveryId = typeof body.delivery_id === 'string' ? body.delivery_id : null;

  if (!HANDLED_EVENTS.has(event) || !reference) {
    // Genuine but irrelevant delivery (unknown event type) — acknowledge it.
    return NextResponse.json({ received: true, note: 'no matching handler' });
  }

  try {
    const outcome = await deals.applyPspWebhookOutcome({
      event,
      transaction: {
        reference,
        amount: typeof tx.amount === 'string' ? tx.amount : null,
        currency: typeof tx.currency === 'string' ? tx.currency : null,
        status: typeof tx.status === 'string' ? tx.status : null,
        failureReason: typeof tx.failureReason === 'string' ? tx.failureReason : null,
        operatorTid: typeof tx.operatorTid === 'string' ? tx.operatorTid : null,
      },
    });
    console.log(
      `[nylonpay-webhook] delivery=${deliveryId ?? 'unknown'} event=${event} outcome=${outcome.matched ? outcome.action : 'unmatched-reference'}`,
    );
    return NextResponse.json({ received: true, ...(outcome.matched ? { action: outcome.action } : {}) });
  } catch (err) {
    // Transient failure on OUR side (DB busy, etc.): a non-2xx makes the
    // provider retry, which is exactly what we want. Signed deliveries are
    // re-stamped on retry, so freshness is not an issue.
    console.error('[nylonpay-webhook] processing failed, letting the provider retry', err);
    return NextResponse.json({ error: 'PROCESSING_FAILED' }, { status: 500 });
  }
}
