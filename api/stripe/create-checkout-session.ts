import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2022-11-15' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const { priceId, clientId, successUrl, cancelUrl } = req.body;
    if (!priceId || !clientId) return res.status(400).json({ error: 'Missing priceId or clientId' });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { clientId },
      success_url: successUrl || `${req.headers.origin}/dashboard?session=success`,
      cancel_url: cancelUrl || `${req.headers.origin}/pricing`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('create-checkout-session error', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
