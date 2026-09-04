import crypto from 'node:crypto';
import type { PaymentGatewayProvider, PaymentIntentPurpose, PaymentIntentStatus, PaymentGatewayEventType } from '../types/index.js';

/**
 * Payment Gateway adapter boundary (Production-Grade Payment & Settlement
 * Layer). This is the ONLY place a real gateway's SDK/API would ever be
 * called from -- every other module in this layer (paymentIntents.ts,
 * server.ts's routes) talks exclusively to this interface, never to a
 * gateway directly, so swapping the active provider is a one-line env
 * change with zero business-logic changes.
 *
 * No raw card data is ever modeled here: an adapter only ever receives/
 * returns amounts, currencies, and the gateway's own opaque reference ids
 * (`providerIntentId`, `providerRefundId`) -- never a card number, CVV, or
 * expiry. The actual card entry happens entirely inside the gateway's own
 * hosted UI/SDK on the frontend (Stripe Elements, Checkout.com's Frames,
 * etc.); this backend never sees it.
 */

export class GatewayNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayNotConfiguredError';
  }
}

export interface GatewayCreateIntentInput {
  amount: number;
  currency: string;
  purpose: PaymentIntentPurpose;
  /** Non-sensitive linkage metadata only (ids), echoed back by some real gateways on their webhook payload for cross-checking. */
  metadata: Record<string, string>;
}

export interface GatewayCreateIntentResult {
  providerIntentId: string;
  clientSecret?: string;
  status: PaymentIntentStatus;
}

export interface GatewayWebhookEvent {
  providerEventId: string;
  type: PaymentGatewayEventType;
  providerIntentId?: string;
  providerRefundId?: string;
}

export interface PaymentGatewayAdapter {
  provider: PaymentGatewayProvider;
  createIntent(input: GatewayCreateIntentInput): Promise<GatewayCreateIntentResult>;
  /** Voids an uncaptured authorization (security deposit release) or cancels a not-yet-completed intent. Final state is still only trusted once the corresponding webhook arrives. */
  cancelIntent(providerIntentId: string): Promise<{ status: PaymentIntentStatus }>;
  refund(providerIntentId: string, amount: number): Promise<{ providerRefundId: string }>;
  /** Constant-time HMAC verification against the raw request body. Returns false (never throws) on any missing config/header/mismatch. */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean;
  /** Parses an already-signature-verified raw webhook body into a normalized event, or null if the payload doesn't describe a recognized event type. */
  parseWebhookEvent(rawBody: Buffer): GatewayWebhookEvent | null;
}

/** Generic constant-time HMAC-SHA256 signature check -- the same primitive every major gateway's webhook signing scheme (Stripe, Checkout.com, Telr) is built on, and the same one already proven in this codebase for the WhatsApp/Meta webhook (see verifyWhatsAppWebhookSignature in server.ts). */
export function verifyHmacSignature(rawBody: Buffer, signatureHeader: string | undefined, secret: string | undefined): boolean {
  if (!secret || !rawBody || !signatureHeader) return false;
  const expectedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  let expectedBuf: Buffer, providedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expectedHex, 'hex');
    providedBuf = Buffer.from(signatureHeader, 'hex');
  } catch {
    return false;
  }
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}

/** Signs a payload the same way a real gateway would -- used by this adapter's own webhook sender AND by tests that need to simulate an authentic, correctly-signed delivery rather than bypassing verification. */
export function signHmacPayload(rawBody: Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Sandbox adapter -- a real, fully-functioning implementation (not a mock
 * that's deleted before production), active whenever PAYMENT_GATEWAY_PROVIDER
 * is unset or 'sandbox'. It never moves real money: `createIntent`/`refund`/
 * `cancelIntent` only ever return a freshly-minted opaque reference and the
 * FIRST status in that resource's lifecycle -- exactly like a real gateway,
 * nothing here is ever marked `succeeded` synchronously. Progressing a
 * PaymentIntent/PaymentRefund to its final state always requires a separate,
 * signature-verified webhook delivery (see paymentIntents.ts), so this
 * adapter cannot be used to shortcut the "success only via webhook" rule
 * even though it isn't a real gateway.
 */
class SandboxGatewayAdapter implements PaymentGatewayAdapter {
  provider: PaymentGatewayProvider = 'sandbox';

  async createIntent(input: GatewayCreateIntentInput): Promise<GatewayCreateIntentResult> {
    const providerIntentId = `sandbox_pi_${crypto.randomBytes(12).toString('hex')}`;
    return {
      providerIntentId,
      clientSecret: `sandbox_secret_${crypto.randomBytes(8).toString('hex')}`,
      status: 'requires_payment'
    };
  }

  async cancelIntent(providerIntentId: string): Promise<{ status: PaymentIntentStatus }> {
    // A real gateway's cancel/void call typically also returns a final
    // status synchronously, but this layer never trusts that alone --
    // paymentIntents.ts still waits for the confirming webhook.
    return { status: 'processing' };
  }

  async refund(providerIntentId: string, amount: number): Promise<{ providerRefundId: string }> {
    return { providerRefundId: `sandbox_re_${crypto.randomBytes(12).toString('hex')}` };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    return verifyHmacSignature(rawBody, signatureHeader, process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET);
  }

  parseWebhookEvent(rawBody: Buffer): GatewayWebhookEvent | null {
    try {
      const parsed = JSON.parse(rawBody.toString('utf8'));
      if (!parsed?.id || !parsed?.type) return null;
      return {
        providerEventId: String(parsed.id),
        type: parsed.type as PaymentGatewayEventType,
        providerIntentId: parsed.data?.providerIntentId,
        providerRefundId: parsed.data?.providerRefundId
      };
    } catch {
      return null;
    }
  }
}

/**
 * A real-provider adapter is intentionally NOT implemented with fabricated
 * network calls -- that would be worse than not having one, since it could
 * silently "succeed" against nothing. Each of these throws a clear,
 * specific error naming exactly which environment secret and SDK
 * integration a real deployment needs, so wiring in the real provider
 * later is a scoped, obvious task rather than a landmine.
 */
function unconfiguredAdapter(provider: PaymentGatewayProvider, requiredEnvVar: string): PaymentGatewayAdapter {
  const fail = (): never => {
    throw new GatewayNotConfiguredError(
      `Payment gateway provider "${provider}" is selected but not integrated in this codebase yet. ` +
      `Set ${requiredEnvVar} and wire the official ${provider} SDK into src/server/paymentGatewayAdapter.ts before enabling it in production.`
    );
  };
  return {
    provider,
    createIntent: async () => fail(),
    cancelIntent: async () => fail(),
    refund: async () => fail(),
    verifyWebhookSignature: () => false,
    parseWebhookEvent: () => null
  };
}

const sandboxAdapter = new SandboxGatewayAdapter();

/**
 * Resolves the active gateway from PAYMENT_GATEWAY_PROVIDER (env) --
 * never hardcoded, never selected by request input. Defaults to the safe
 * sandbox so a misconfigured deployment fails toward "no real charges",
 * not toward silently picking a real provider.
 */
export function getActiveGatewayAdapter(): PaymentGatewayAdapter {
  const provider = (process.env.PAYMENT_GATEWAY_PROVIDER || 'sandbox') as PaymentGatewayProvider;
  switch (provider) {
    case 'sandbox':
      return sandboxAdapter;
    case 'stripe':
      return unconfiguredAdapter('stripe', 'STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET');
    case 'checkout_com':
      return unconfiguredAdapter('checkout_com', 'CHECKOUT_COM_SECRET_KEY / CHECKOUT_COM_WEBHOOK_SECRET');
    case 'telr':
      return unconfiguredAdapter('telr', 'TELR_STORE_ID / TELR_AUTH_KEY');
    case 'network_international':
      return unconfiguredAdapter('network_international', 'NI_API_KEY / NI_WEBHOOK_SECRET');
    default:
      return sandboxAdapter;
  }
}
