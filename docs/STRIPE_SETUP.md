# Stripe setup & env vars

Required env vars:
- STRIPE_SECRET_KEY
- STRIPE_PUBLISHABLE_KEY
- STRIPE_WEBHOOK_SECRET
- STRIPE_PRICE_STARTER
- STRIPE_PRICE_PRO
- STRIPE_PRICE_ENTERPRISE

Steps:
1. Create products & prices in Stripe for Starter/Pro/Enterprise.
2. Copy the Price IDs to STRIPE_PRICE_STARTER, STRIPE_PRICE_PRO, STRIPE_PRICE_ENTERPRISE in your deployment environment.
3. Configure STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY.
4. Create a webhook in Stripe pointing to /api/stripe/webhook and copy the webhook secret to STRIPE_WEBHOOK_SECRET.
5. Deploy the app and confirm the webhook is reachable.
