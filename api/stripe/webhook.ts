import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2022-11-15' });
const supabaseService = createClient(process.env.SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');

export const config = { api: { bodyParser: false } } as const;

import getRawBody from 'raw-body';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  const sig = req.headers['stripe-signature'] as string | undefined;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
  let event: Stripe.Event;
  try {
    const buf = await getRawBody(req as any);
    event = stripe.webhooks.constructEvent(buf, sig || '', webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed.', err.message);
    return res.status(400).send(\`Webhook Error: \${err.message}\`);
  }

  // Persist event for audit
  try {
    await supabaseService.from('stripe_events').insert([{ event_id: event.id, payload: event }]);
  } catch (err) {
    console.error('Failed to persist stripe event', err);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | undefined;
        const clientId = session.metadata?.clientId;
        if (clientId && customerId) {
          await supabaseService.from('clients').update({ stripe_customer_id: customerId }).eq('id', clientId);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const { data: client } = await supabaseService.from('clients').select('id').eq('stripe_customer_id', customerId).limit(1).single();
        if (client) {
          const clientId = (client as any).id;
          const status = subscription.status;
          const current_period_end = new Date((subscription.current_period_end || 0) * 1000).toISOString();
          await supabaseService.from('clients').update({ subscription_status: status, subscription_current_period_end: current_period_end }).eq('id', clientId);
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('Error handling stripe event', err);
  }

  res.status(200).json({ received: true });
}
