/**
 * Server-side Stripe helpers.
 * Place this file on the server (Next.js API routes or backend) — do NOT bundle to client.
 *
 * Exports:
 * - stripe: initialized Stripe client
 * - createCheckoutSession(params)
 * - createBillingPortalSession(customerId, returnUrl)
 * - constructEvent(rawBody, signature)  // for webhook verification
 * - getPriceIdForPlan(planKey) // reads STRIPE_PRICE_* env slots
 */

import Stripe from 'stripe';

// 💡 FIX: This version MUST match the one your installed Stripe types expect.
// We are using '2025-11-17.clover' to fix the TS error from the previous discussion.
// You should update this string if Stripe recommends a new version later.
const API_VERSION = '2025-11-17.clover' as const; 

// --- Client Initialization ---

if (!process.env.STRIPE_SECRET_KEY) {
  // Console warning is fine for development; change to throw if you want fail-fast.
  console.warn('⚠️ WARNING: Missing STRIPE_SECRET_KEY environment variable. Stripe functions will fail.');
}

// 🔑 The initialized Stripe client, exported for use across your backend.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { 
  apiVersion: API_VERSION,
  // 💡 Recommendation: Use the library's built-in fetch if possible, or set a custom one.
  // This is often not needed, but good to know for advanced environments.
  // fetch: undefined, 
});

// --- Types ---

export type CreateCheckoutSessionParams = {
  priceId: string;
  clientId?: string; // optional metadata to tie back to your client/org
  successUrl?: string;
  cancelUrl?: string;
  customerEmail?: string;
  // customerId?: string; // Optional: include if you want to reuse existing Stripe customers
};

export type CreateBillingPortalParams = {
  customerId: string;
  returnUrl?: string;
};

// --- Helper Functions ---

/**
 * Create a Stripe Checkout Session for subscriptions.
 * @param params - priceId, clientId, successUrl, cancelUrl, customerEmail
 */
export async function createCheckoutSession(params: CreateCheckoutSessionParams) {
  const { priceId, clientId, successUrl, cancelUrl, customerEmail } = params;

  if (!priceId) {
    throw new Error('priceId is required to create a Checkout Session.');
  }

  // 💡 Improvement: The environment variable checks are handled at initialization.
  // We can trust the 'stripe' client is initialized, but may have an empty key.
  
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    
    // Use the client_reference_id for linking to your application's user/org ID
    client_reference_id: clientId, 
    
    // Only set customer_email if customerId is NOT used.
    customer_email: customerEmail, 

    success_url: successUrl || `${process.env.APP_URL || 'https://your-app.example'}/dashboard?session=success`,
    cancel_url: cancelUrl || `${process.env.APP_URL || 'https://your-app.example'}/pricing`,
  });

  return session;
}

/**
 * Create a Stripe Billing Portal session for managing subscriptions.
 * @param params - customerId, returnUrl
 */
export async function createBillingPortalSession({ customerId, returnUrl }: CreateBillingPortalParams) {
  if (!customerId) {
    throw new Error('customerId is required to create a Billing Portal Session.');
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl || `${process.env.APP_URL || 'https://your-app.example'}/dashboard`,
  });

  return session;
}

/**
 * Verify and construct a Stripe webhook event.
 * @param rawBody - The raw request body (Buffer)
 * @param signature - The value of the 'stripe-signature' header
 * @returns The verified Stripe Event object
 */
export function constructEvent(rawBody: Buffer | string, signature?: string): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable.');
  }
  if (!signature) {
    throw new Error('Missing Stripe signature header.');
  }

  // stripe.webhooks.constructEvent will throw an error if verification fails
  // 
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}

/**
 * Type union for allowed plan keys.
 */
export type PlanKey = 'starter' | 'pro' | 'enterprise';

/**
 * Helper to read price ids from env slots (STRIPE_PRICE_...).
 * @param planKey - The key of the plan to look up.
 * @returns The Stripe Price ID string or null if not found.
 */
export function getPriceIdForPlan(planKey: PlanKey): string | null {
  switch (planKey) {
    case 'starter':
      return process.env.STRIPE_PRICE_STARTER ?? null;
    case 'pro':
      return process.env.STRIPE_PRICE_PRO ?? null;
    case 'enterprise':
      return process.env.STRIPE_PRICE_ENTERPRISE ?? null;
    default:
      // Type 'PlanKey' ensures this branch is technically unreachable,
      // but it's good practice to handle a default if the type is bypassed.
      return null;
  }
}