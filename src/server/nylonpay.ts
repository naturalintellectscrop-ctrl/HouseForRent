import { createNylonPay, verifyWebhookSignature } from '@nile-squad/nylonpay-ts';
import type { PaymentInstance } from '@nile-squad/nylonpay-ts';
import { ApiError } from './http';

/**
 * Nylon Pay — the platform's payment service provider (PSP).
 *
 * Credentials come from the environment and NEVER from the repo:
 *   NYLONPAY_API_KEY          npk_…
 *   NYLONPAY_API_SECRET       nps_…
 *   NYLONPAY_WEBHOOK_SECRET   per-key webhook signing secret
 *   NYLONPAY_MODE             "live" | "sandbox" (default: sandbox)
 *
 * ── Why an explicit mode flag ──
 * Live money movement must never be one missing-env-var away from the
 * sandbox, nor one forgotten-env-var away from a fake ledger. `mode: live`
 * requires ALL THREE credentials; anything else — including a typo — is the
 * sandbox mock, which labels every instruction it creates as a MOCK in the
 * database itself. Failure direction is always towards honesty.
 *
 * ── The contract with the ledger ──
 * The sandbox mock settles instantly. Nylon Pay does not: a collection is
 * ASYNC (the tenant approves a prompt on their phone), so in live mode an
 * instruction is created `pending`, and ONLY a signature-verified webhook
 * (see /api/v1/payments/nylonpay/webhook) moves it to `succeeded` — which is
 * the only moment custody is booked. The ledger never takes the PSP's word
 * for money the webhook did not confirm.
 */

export type NylonPayMode = 'sandbox' | 'live';

export function nylonPayMode(): NylonPayMode {
  const key = process.env.NYLONPAY_API_KEY;
  const secret = process.env.NYLONPAY_API_SECRET;
  const webhookSecret = process.env.NYLONPAY_WEBHOOK_SECRET;
  const complete = Boolean(key && secret && webhookSecret);
  if (process.env.NYLONPAY_MODE === 'live' && !complete) {
    console.warn(
      '[nylonpay] NYLONPAY_MODE=live but credentials are incomplete — falling back to the sandbox mock. Money state must never depend on a half-configured provider.',
    );
  }
  return process.env.NYLONPAY_MODE === 'live' && complete ? 'live' : 'sandbox';
}

/** True when real money movement is armed. Used for honest copy on actions. */
export function nylonPayLive(): boolean {
  return nylonPayMode() === 'live';
}

let cachedClient: ReturnType<typeof createNylonPay> | null = null;
let cachedKey = '';

function nylonClient() {
  const apiKey = process.env.NYLONPAY_API_KEY ?? '';
  const apiSecret = process.env.NYLONPAY_API_SECRET ?? '';
  if (!apiKey || !apiSecret) {
    throw new ApiError(500, 'PSP_NOT_CONFIGURED', 'Nylon Pay credentials are not configured');
  }
  // Re-create only if the key changed (env reload in tests/dev).
  if (!cachedClient || cachedKey !== apiKey) {
    cachedClient = createNylonPay({
      apiKey,
      apiSecret,
      ...(process.env.NYLONPAY_BASE_URL ? { baseUrl: process.env.NYLONPAY_BASE_URL } : {}),
    });
    cachedKey = apiKey;
  }
  return cachedClient;
}

/**
 * Initiate a collection. Returns as soon as the provider ACCEPTS the
 * instruction — the tenant then sees a prompt on their phone. The webhook —
 * not this call — is what confirms money moved.
 */
export async function initiateNylonCollect(params: {
  reference: string; // UUID — the provider's dedupe key AND our PspInstruction.reference
  amountUGX: number; // integer shillings; UGX has no subunit
  description: string;
  customerName: string;
  customerPhone: string;
  metadata?: Record<string, string>;
}): Promise<PaymentInstance> {
  const client = nylonClient();
  try {
    return await client.collectPayment({
      amount: params.amountUGX,
      currency: 'UGX',
      description: params.description,
      customer: { name: params.customerName, phoneNumber: params.customerPhone },
      reference: params.reference,
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown provider error';
    throw new ApiError(
      502,
      'PSP_INITIATION_FAILED',
      `Nylon Pay did not accept the payment instruction: ${message}. No money moved and no ledger entry was made — retry the action.`,
    );
  }
}

/**
 * Verify a webhook delivery against the raw request body. The signature is
 * lowercase hex HMAC over the exact bytes; the SDK also enforces the 5-minute
 * freshness window (retries are re-signed by the provider, so genuine retries
 * always pass — only captured replays fail).
 */
export function verifyNylonWebhook(rawBody: string, signature: string): boolean {
  const secret = process.env.NYLONPAY_WEBHOOK_SECRET;
  if (!secret) return false; // fail closed: an unconfigured endpoint accepts nothing
  return verifyWebhookSignature({ payload: rawBody, signature, secret });
}
