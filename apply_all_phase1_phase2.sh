#!/usr/bin/env bash
# apply_all_phase1_phase2.sh
# Creates all Phase 1 + Phase 2 files prepared in the conversation.
# Usage:
# 1. Save this file to the repo root (e.g. ./apply_all_phase1_phase2.sh)
# 2. Make executable: chmod +x ./apply_all_phase1_phase2.sh
# 3. Run: ./apply_all_phase1_phase2.sh
#    (It will create files. It will NOT commit or push.)
# 4. Inspect files in VS Code, then git add/commit/push as desired.
#
# IMPORTANT: This script writes files exactly as prepared. Do not run it
# if you have existing files with the same paths you want to keep.
set -euo pipefail

echo "Creating files for Phase 1 + Phase 2..."

# Phase 1 files
mkdir -p src/hooks src/components/Admin api sql/migrations docs

cat > src/hooks/useAuth.tsx <<'EOF'
import { useState, useEffect, createContext, useContext, ReactNode } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { getPlanByProductId, PlanKey } from "@/lib/stripe";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  accessToken: string | null;
  isLoading: boolean;
  isSubscribed: boolean;
  currentPlan: PlanKey | null;
  subscriptionEnd: string | null;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<PlanKey | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);

  const checkSubscription = async () => {
    if (!session) return;
    
    try {
      const { data, error } = await supabase.functions.invoke("check-subscription");
      if (error) throw error;
      
      setIsSubscribed(data.subscribed);
      if (data.product_id) {
        setCurrentPlan(getPlanByProductId(data.product_id));
      } else {
        setCurrentPlan(null);
      }
      setSubscriptionEnd(data.subscription_end);
    } catch (error) {
      console.error("Error checking subscription:", error);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setIsLoading(false);
        
        if (session?.user) {
          setTimeout(() => checkSubscription(), 0);
        } else {
          setIsSubscribed(false);
          setCurrentPlan(null);
          setSubscriptionEnd(null);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
      if (session?.user) {
        setTimeout(() => checkSubscription(), 0);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    
    const interval = setInterval(checkSubscription, 60000);
    return () => clearInterval(interval);
  }, [session]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      session, 
      accessToken: session?.access_token ?? null,
      isLoading, 
      isSubscribed, 
      currentPlan, 
      subscriptionEnd,
      signOut, 
      checkSubscription 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
EOF

cat > src/components/Admin/ReplyModal.tsx <<'EOF'
import React, { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

type Props = {
  submission: {
    id: string;
    name: string;
    email: string;
    message: string;
  };
  onClose: () => void;
  onSent: () => void;
};

export default function ReplyModal({ submission, onClose, onSent }: Props) {
  const { accessToken } = useAuth();
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend() {
    setError(null);
    if (!replyBody.trim()) {
      setError('Please enter a reply.');
      return;
    }
    setSending(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      const res = await fetch('/api/client/reply', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          submissionId: submission.id,
          to_email: submission.email,
          subject: `Re: your message to us`,
          body: replyBody,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let errMsg = text;
        try {
          const parsed = JSON.parse(text);
          errMsg = parsed.error || parsed.message || text;
        } catch (_) {}
        throw new Error(errMsg || `Status ${res.status}`);
      }
      onSent();
    } catch (err: any) {
      console.error(err);
      setError(process.env.NODE_ENV === 'development' ? String(err.message || err) : 'Failed to send reply. See console for details.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reply-title" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', padding: 20, maxWidth: 800, width: '100%' }}>
        <h2 id="reply-title">Reply to {submission.name} ({submission.email})</h2>
        <p>Original message:</p>
        <blockquote>{submission.message}</blockquote>

        <label>
          Your reply
          <textarea rows={8} value={replyBody} onChange={e => setReplyBody(e.target.value)} style={{ width: '100%' }} />
        </label>

        {error && <p role="alert" style={{ color: 'red' }}>{error}</p>}

        <div style={{ marginTop: 12 }}>
          <button onClick={handleSend} disabled={sending}>{sending ? 'Sending…' : 'Send reply'}</button>
          <button onClick={onClose} style={{ marginLeft: 8 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
EOF

cat > api/admin/reply.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM || 'noreply@yourdomain.com';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const supabaseService = createClient(SUPABASE_URL || '', SUPABASE_SERVICE_ROLE_KEY || '');
if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

async function getUserIdFromToken(token?: string | null) {
  if (!token) return null;
  try {
    const { data, error } = await supabaseService.auth.getUser({ access_token: token } as any);
    if (error) {
      console.error('getUser error', error);
      return null;
    }
    return data?.user?.id ?? null;
  } catch (err) {
    console.error('Failed to get user from token', err);
    return null;
  }
}

async function isAdminUser(userId: string | null) {
  if (!userId) return false;

  try {
    let query = supabaseService
      .from('user_roles')
      .select('role');

    const { data: dataUserId, error: errUserId } = await query.eq('user_id', userId).limit(1).single();
    if (!errUserId && dataUserId) {
      return dataUserId.role === 'admin';
    }

    const { data: dataId, error: errId } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('id', userId)
      .limit(1)
      .single();

    if (!errId && dataId) {
      return dataId.role === 'admin';
    }

    return false;
  } catch (err) {
    console.error('isAdminUser error', err);
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const authHeader = (req.headers.authorization as string) || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    const userId = await getUserIdFromToken(token);
    if (!userId) return res.status(401).json({ error: 'Unauthorized: invalid token' });

    const admin = await isAdminUser(userId);
    if (!admin) return res.status(403).json({ error: 'Forbidden: requires admin' });

    const { submissionId, to_email, subject, body } = req.body;
    if (!submissionId || !to_email || !subject || !body) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!SENDGRID_API_KEY) {
      console.error('SENDGRID_API_KEY is not configured.');
      return res.status(500).json({ error: 'Email service not configured' });
    }

    try {
      await sgMail.send({
        to: to_email,
        from: SENDGRID_FROM,
        subject,
        text: body,
        html: `<pre>${body}</pre>`,
      });
    } catch (err) {
      console.error('SendGrid send error', err);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    try {
      const { error: updateErr } = await supabaseService
        .from('contact_submissions')
        .update({
          status: 'responded',
          responded_at: new Date().toISOString(),
          responded_by: userId,
        })
        .eq('id', submissionId);

      if (updateErr) {
        console.error('Failed to update submission status', updateErr);
        return res.status(200).json({ ok: true, warning: 'Email sent but failed to update DB status' });
      }
    } catch (err) {
      console.error('Error updating submission record', err);
      return res.status(500).json({ error: 'Failed to update submission record' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unhandled server error in /api/admin/reply', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
EOF

cat > src/components/Admin/Inbox.tsx <<'EOF'
import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ReplyModal from './ReplyModal';
import { useAuth } from '@/hooks/useAuth';

type Submission = {
  id: string;
  name: string;
  email: string;
  message: string;
  created_at: string;
  status?: 'unread' | 'responded';
  responded_at?: string | null;
  responded_by?: string | null;
  client_id?: string | null;
};

export default function Inbox() {
  const [rows, setRows] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const { accessToken } = useAuth();

  async function fetchRows() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from<Submission>('contact_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRows(data ?? []);
    } catch (err) {
      console.error('Failed to fetch submissions', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchRows();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm('Delete this submission?')) return;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch(`/api/admin/submission/delete?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Status ${res.status}`);
      }
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Delete failed', err);
      alert('Delete failed. See console for details.');
    }
  }

  async function markResponded(id: string) {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

      const res = await fetch('/api/admin/submission/mark-responded', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Status ${res.status}`);
      }
      await fetchRows();
    } catch (err) {
      console.error('Mark responded failed', err);
      alert('Mark responded failed. See console for details.');
    }
  }

  function openReply(row: Submission) {
    setSelected(row);
    setReplyOpen(true);
  }

  async function onReplySent() {
    setReplyOpen(false);
    setSelected(null);
    await fetchRows();
  }

  return (
    <section>
      {loading && <div>Loading…</div>}
      {!loading && rows.length === 0 && <div>No submissions yet.</div>}
      {!loading && rows.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Message</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.email}</td>
                <td style={{ maxWidth: 360, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.message}</td>
                <td>{new Date(r.created_at).toLocaleString()}</td>
                <td>{r.status ?? 'unread'}</td>
                <td>
                  <button onClick={() => { setSelected(r); alert(r.message); }}>View</button>
                  <button onClick={() => openReply(r)}>Reply</button>
                  <button onClick={() => markResponded(r.id)}>Mark responded</button>
                  <button onClick={() => handleDelete(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {replyOpen && selected && (
        <ReplyModal submission={selected} onClose={() => setReplyOpen(false)} onSent={onReplySent} />
      )}
    </section>
  );
}
EOF

cat > sql/migrations/2025-12-13_create_tables_and_policies.sql <<'EOF'
-- 2025-12-13 Migration: create user_roles & contact_submissions, enable RLS and add policies
-- Run this with the service_role key from the SQL editor

create extension if not exists "pgcrypto";

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id),
  role text not null,
  created_at timestamptz default now()
);

create table if not exists public.contact_submissions (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  message text,
  created_at timestamptz default now(),
  status text default 'unread',
  responded_at timestamptz,
  responded_by uuid,
  client_id uuid
);

alter table public.contact_submissions enable row level security;
alter table public.user_roles enable row level security;

create policy "Allow public insert" on public.contact_submissions
  for insert
  using ( true )
  with check ( true );

create policy "Admins can select" on public.contact_submissions
  for select
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

create policy "Admins can update" on public.contact_submissions
  for update
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur2
      where ur2.user_id = auth.uid() and ur2.role = 'admin'
    )
  );

create policy "Admins can delete" on public.contact_submissions
  for delete
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  );

create policy "Admins manage user_roles" on public.user_roles
  for all
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid() and ur.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_roles ur2
      where ur2.user_id = auth.uid() and ur2.role = 'admin'
    )
  );
EOF

cat > docs/ADMIN_SETUP.md <<'EOF'
# Admin setup & deployment checklist

This document explains how to bootstrap admin access, run migrations, and configure environment variables.

## Required server environment variables (do NOT commit secrets)
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- SENDGRID_API_KEY
- SENDGRID_FROM (optional; default used if not provided)

Set these in your deployment provider (Vercel, Netlify, Fly, etc).

## Run the SQL migration (one-time, using service_role)
1. Open Supabase → SQL editor.
2. Paste the contents of `sql/migrations/2025-12-13_create_tables_and_policies.sql` and run.
3. Seed your initial admin row (replace <ADMIN_USER_UUID>):
   INSERT INTO public.user_roles (user_id, role) VALUES ('<ADMIN_USER_UUID>', 'admin');

Important: run the seed using the SQL editor so policies don't block you.

## Admin endpoints
- /api/admin/reply (already implemented)
- /api/admin/submission/delete (DELETE) — new; expects Authorization Bearer token
- /api/admin/submission/mark-responded (POST) — new; expects Authorization Bearer token

These endpoints require a valid Supabase user token for an admin user. The server code uses SUPABASE_SERVICE_ROLE_KEY to validate tokens and run admin queries.

## Testing checklist (after deploying and adding envs)
1. Seed admin via SQL editor.
2. Login as admin in app.
3. Inbox → View → Reply:
   - Confirm network request to `/api/admin/reply` includes Authorization header.
   - Expect 200 { ok: true } and email delivered via SendGrid.
   - Verify contact_submissions row updated with status/responded_at/responded_by.
4. Inbox → Delete:
   - Confirm DELETE to `/api/admin/submission/delete?id=<id>` with Authorization header returns ok and row removed.
5. Inbox → Mark responded:
   - Confirm POST `/api/admin/submission/mark-responded` with { id } and Authorization header returns ok and row updated.
6. Try with non-admin user — should get 403.
7. Try without Authorization header — should get 401.
EOF

# Phase 2 files
cat > sql/migrations/2025-12-14_multi_tenant_and_stripe.sql <<'EOF'
-- Migration: add organizations, user_memberships, add client_id to contact_submissions, and Stripe-related table
-- Run with service_role in Supabase SQL editor

create extension if not exists "pgcrypto";

-- organizations / clients
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text,
  subscription_status text,
  subscription_current_period_end timestamptz,
  created_at timestamptz default now()
);

-- user_memberships: links users to clients with roles
create table if not exists public.user_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) not null,
  client_id uuid references public.clients(id) not null,
  role text not null default 'agent', -- owner, admin, agent
  created_at timestamptz default now()
);

-- ensure contact_submissions has client_id for tenancy
alter table public.contact_submissions add column if not exists client_id uuid;

-- RLS: enable on clients and user_memberships if not already
alter table public.clients enable row level security;
alter table public.user_memberships enable row level security;

-- RLS policies for user_memberships: only members can see their membership
create policy "members can select memberships" on public.user_memberships
  for select
  using ( exists (select 1 from public.user_memberships um where um.user_id = auth.uid() and um.client_id = client_id) );

-- RLS for contact_submissions: anyone can INSERT, but SELECT/UPDATE/DELETE limited to membership and roles
create policy "Allow public insert" on public.contact_submissions
  for insert
  using ( true )
  with check ( true );

create policy "Members can select their client submissions" on public.contact_submissions
  for select
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = client_id
    )
  );

create policy "Members can update if role in ('admin','owner')" on public.contact_submissions
  for update
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = client_id and um.role in ('admin','owner')
    )
  )
  with check (
    exists (
      select 1 from public.user_memberships um2
      where um2.user_id = auth.uid() and um2.client_id = client_id and um2.role in ('admin','owner')
    )
  );

create policy "Members can delete if role in ('admin','owner')" on public.contact_submissions
  for delete
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = client_id and um.role in ('admin','owner')
    )
  );

-- RLS for clients: members can select their client
create policy "Members can select client" on public.clients
  for select
  using (
    exists (
      select 1 from public.user_memberships um
      where um.user_id = auth.uid() and um.client_id = id
    )
  );

-- Optional: table to store stripe webhook events for auditing
create table if not exists public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  event_id text,
  payload jsonb,
  created_at timestamptz default now()
);
EOF

cat > api/stripe/create-checkout-session.ts <<'EOF'
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
EOF

cat > api/stripe/customer-portal.ts <<'EOF'
import type { NextApiRequest, NextApiResponse } from 'next';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2022-11-15' });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  try {
    const { customerId, returnUrl } = req.body;
    if (!customerId) return res.status(400).json({ error: 'Missing customerId' });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${req.headers.origin}/dashboard`,
    });
    return res.status(200).json({ url: session.url });
  } catch (err: any) {
    console.error('customer-portal error', err);
    return res.status(500).json({ error: 'Failed to create billing portal session' });
  }
}
EOF

cat > api/stripe/webhook.ts <<'EOF'
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
EOF

cat > api/admin/submission/delete.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getUserIdFromToken(token?: string | null) {
  if (!token) return null;
  try {
    const { data, error } = await supabaseService.auth.getUser({ access_token: token } as any);
    if (error) {
      console.error('getUser error', error);
      return null;
    }
    return data?.user?.id ?? null;
  } catch (err) {
    console.error('Failed to get user from token', err);
    return null;
  }
}

async function isAdminOrOwner(userId: string | null, clientId?: string) {
  if (!userId || !clientId) return false;
  try {
    const { data: membership } = await supabaseService
      .from('user_memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .limit(1)
      .single();
    if (membership && ['owner','admin'].includes((membership as any).role)) return true;
    return false;
  } catch (err) {
    console.error('isAdminOrOwner error', err);
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = (req.headers.authorization as string) || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const userId = await getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: invalid token' });

  const id = (req.query.id as string) || (req.body && req.body.id);
  if (!id) return res.status(400).json({ error: 'Missing submission id' });

  const { data: submission, error: fetchErr } = await supabaseService.from('contact_submissions').select('client_id').eq('id', id).limit(1).single();
  if (fetchErr || !submission) {
    console.error('Failed to fetch submission', fetchErr);
    return res.status(404).json({ error: 'Submission not found' });
  }
  const clientId = (submission as any).client_id;

  const allowed = await isAdminOrOwner(userId, clientId);
  if (!allowed) return res.status(403).json({ error: 'Forbidden: requires admin/owner' });

  try {
    const { error } = await supabaseService.from('contact_submissions').delete().eq('id', id);
    if (error) {
      console.error('Delete error', error);
      return res.status(500).json({ error: 'Failed to delete submission' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unhandled delete error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
EOF

cat > api/admin/submission/mark-responded.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function getUserIdFromToken(token?: string | null) {
  if (!token) return null;
  try {
    const { data, error } = await supabaseService.auth.getUser({ access_token: token } as any);
    if (error) {
      console.error('getUser error', error);
      return null;
    }
    return data?.user?.id ?? null;
  } catch (err) {
    console.error('Failed to get user from token', err);
    return null;
  }
}

async function isAdminOrOwner(userId: string | null, clientId?: string) {
  if (!userId || !clientId) return false;
  try {
    const { data: membership } = await supabaseService
      .from('user_memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .limit(1)
      .single();
    if (membership && ['owner','admin'].includes((membership as any).role)) return true;
    return false;
  } catch (err) {
    console.error('isAdminOrOwner error', err);
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = (req.headers.authorization as string) || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const userId = await getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: invalid token' });

  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing submission id' });

  const { data: submission, error: fetchErr } = await supabaseService.from('contact_submissions').select('client_id').eq('id', id).limit(1).single();
  if (fetchErr || !submission) {
    console.error('Failed to fetch submission', fetchErr);
    return res.status(404).json({ error: 'Submission not found' });
  }
  const clientId = (submission as any).client_id;

  const allowed = await isAdminOrOwner(userId, clientId);
  if (!allowed) return res.status(403).json({ error: 'Forbidden: requires admin/owner' });

  try {
    const { error } = await supabaseService
      .from('contact_submissions')
      .update({ status: 'responded', responded_at: new Date().toISOString(), responded_by: userId })
      .eq('id', id);

    if (error) {
      console.error('Mark responded error', error);
      return res.status(500).json({ error: 'Failed to mark responded' });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Unhandled mark responded error', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
EOF

cat > src/hooks/useClients.tsx <<'EOF'
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Client = {
  id: string;
  name: string;
  stripe_customer_id?: string | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
};

type Membership = {
  id: string;
  client_id: string;
  role: "owner" | "admin" | "agent" | string;
  clients?: Client | null;
};

export function useClients() {
  const { user } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentClient, setCurrentClient] = useState<Client | null>(null);

  useEffect(() => {
    let mounted = true;
    async function fetchMemberships() {
      if (!user) {
        setMemberships([]);
        setClients([]);
        setCurrentClient(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from<Membership>("user_memberships")
          .select("id, role, client_id, clients(id, name, stripe_customer_id, subscription_status, subscription_current_period_end)")
          .eq("user_id", user.id);

        if (error) {
          console.error("Failed to fetch memberships", error);
          setMemberships([]);
          setClients([]);
          setCurrentClient(null);
          return;
        }

        const ms = (data ?? []).map((m: any) => ({
          id: m.id,
          client_id: m.client_id,
          role: m.role,
          clients: m.clients ?? null,
        }));

        if (!mounted) return;
        setMemberships(ms);
        const cls = ms
          .map(m => m.clients)
          .filter(Boolean) as Client[];
        setClients(cls);
        setCurrentClient(prev => prev ?? cls[0] ?? null);
      } catch (err) {
        console.error("Error fetching memberships", err);
        setMemberships([]);
        setClients([]);
        setCurrentClient(null);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    fetchMemberships();
    return () => { mounted = false; };
  }, [user]);

  return { memberships, clients, isLoading, currentClient, setCurrentClient };
}
EOF

cat > src/hooks/useDashboardData.tsx <<'EOF'
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface DashboardStats {
  emailsProcessed: number;
  avgResponseTime: number; // minutes
  satisfactionRate: number;
  activeTickets: number;
  totalTickets: number;
  resolvedTickets: number;
}

interface ActivityItem {
  id: string;
  activityType: string;
  title: string;
  description: string | null;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
}

export const useDashboardData = (clientId?: string) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    emailsProcessed: 0,
    avgResponseTime: 0,
    satisfactionRate: 0,
    activeTickets: 0,
    totalTickets: 0,
    resolvedTickets: 0,
  });
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function computeStatsForClient(cid?: string) {
    if (!user || !cid) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { data: submissions, error } = await supabase
        .from("contact_submissions")
        .select("*")
        .eq("client_id", cid)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const rows = submissions ?? [];

      const total = rows.length;
      const resolved = rows.filter((r: any) => r.status === "responded").length;
      const active = total - resolved;

      const respondedRows = rows.filter((r: any) => r.responded_at);
      let avgResponseMin = 0;
      if (respondedRows.length > 0) {
        const totalMinutes = respondedRows.reduce((sum: number, r: any) => {
          const created = new Date(r.created_at).getTime();
          const responded = new Date(r.responded_at).getTime();
          return sum + Math.max(0, (responded - created) / 1000 / 60);
        }, 0);
        avgResponseMin = totalMinutes / respondedRows.length;
      }

      const now = Date.now();
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const last7 = rows.filter((r: any) => new Date(r.created_at).getTime() >= now - sevenDaysMs).length;
      const ticketsPerDay = Math.round((last7 / 7) * 10) / 10;

      setStats({
        emailsProcessed: total,
        avgResponseTime: Math.round(avgResponseMin * 10) / 10,
        satisfactionRate: 0,
        activeTickets: active,
        totalTickets: total,
        resolvedTickets: resolved,
      });

      const recent = (rows as any[]).slice(0, 20).map(r => ({
        id: r.id,
        activityType: r.status === "responded" ? "responded" : "new",
        title: r.name ?? r.email,
        description: r.message ?? null,
        createdAt: r.created_at,
      }));
      setActivities(recent);

      const ticketList = (rows as any[]).map(r => ({
        id: r.id,
        title: r.name ?? r.email,
        description: r.message ?? null,
        status: r.status ?? "unread",
        priority: "normal",
        createdAt: r.created_at,
      }));
      setTickets(ticketList);
    } catch (err) {
      console.error("Failed to fetch dashboard data", err);
      setStats(s => ({ ...s }));
      setActivities([]);
      setTickets([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    computeStatsForClient(clientId);
  }, [user, clientId]);

  return { stats, activities, tickets, isLoading, refresh: () => computeStatsForClient(clientId) };
};
EOF

cat > src/pages/ClientDashboard.tsx <<'EOF'
import React, { useState } from "react";
import { useClients } from "@/hooks/useClients";
import { useDashboardData } from "@/hooks/useDashboardData";
import ReplyModal from "@/components/Admin/ReplyModal";
import { useAuth } from "@/hooks/useAuth";

const ClientDashboard = () => {
  const { clients, isLoading: clientsLoading, currentClient, setCurrentClient } = useClients();
  const clientId = currentClient?.id;
  const { stats, activities, tickets, isLoading, refresh } = useDashboardData(clientId);
  const [filter, setFilter] = useState<"all" | "unread" | "responded">("all");
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const { accessToken } = useAuth();

  const filteredTickets = tickets.filter(t => {
    if (filter === "all") return true;
    if (filter === "unread") return t.status !== "responded";
    if (filter === "responded") return t.status === "responded";
    return true;
  });

  async function handleDelete(id: string) {
    if (!confirm("Delete ticket?")) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(`/api/admin/submission/delete?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error(await res.text());
      refresh();
    } catch (err) {
      console.error("Delete failed", err);
      alert("Delete failed. See console.");
    }
  }

  async function handleMarkResponded(id: string) {
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch("/api/admin/submission/mark-responded", {
        method: "POST",
        headers,
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(await res.text());
      refresh();
    } catch (err) {
      console.error("Mark responded failed", err);
      alert("Mark responded failed. See console.");
    }
  }

  function openReply(ticket: any) {
    setSelectedTicket(ticket);
    setReplyOpen(true);
  }

  async function onReplySent() {
    setReplyOpen(false);
    setSelectedTicket(null);
    refresh();
  }

  async function startCheckoutForClient(clientId: string, priceEnvVar?: string) {
    const priceId =
      process.env.NEXT_PUBLIC_STRIPE_PRICE_STARTER ||
      (process.env as any).VITE_STRIPE_PRICE_STARTER ||
      process.env.STRIPE_PRICE_STARTER ||
      priceEnvVar;

    if (!priceId) {
      alert('Stripe price ID not configured. Set NEXT_PUBLIC_STRIPE_PRICE_STARTER or VITE_STRIPE_PRICE_STARTER in your environment.');
      return;
    }

    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          clientId,
          success_url: `${window.location.origin}/client?session=success`,
          cancel_url: `${window.location.origin}/client?session=cancel`
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to create checkout session');
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Missing checkout url from server');
      }
    } catch (err: any) {
      console.error('Checkout error', err);
      alert(err.message || 'Failed to start checkout. See console for details.');
    }
  }

  if (clientsLoading) return <div>Loading clients…</div>;
  if (!currentClient) return <div>No client selected — ask an admin to assign you to a client.</div>;

  return (
    <main className="p-6">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1>{currentClient.name} Dashboard</h1>
        <div>
          <label>
            Client:
            <select
              value={currentClient?.id}
              onChange={(e) => {
                const id = e.target.value;
                const selected = clients.find(c => c.id === id) ?? null;
                setCurrentClient(selected);
              }}
              style={{ marginLeft: 8 }}
            >
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button onClick={() => startCheckoutForClient(currentClient.id)} style={{ marginLeft: 12, background: '#16a34a', color: 'white', padding: '8px 12px', borderRadius: 6 }}>Subscribe / Upgrade</button>
        </div>
      </div>

      <section style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
          <div>Emails Processed</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.emailsProcessed}</div>
        </div>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
          <div>Avg Response Time</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.avgResponseTime}m</div>
        </div>
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 6 }}>
          <div>Active Tickets</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{stats.activeTickets}</div>
        </div>
      </section>

      <section>
        <div style={{ marginBottom: 12 }}>
          <label>Filter: </label>
          <select value={filter} onChange={e => setFilter(e.target.value as any)} style={{ marginLeft: 8 }}>
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="responded">Responded</option>
          </select>
          <button onClick={() => refresh()} style={{ marginLeft: 12 }}>Refresh</button>
        </div>

        {isLoading && <div>Loading tickets…</div>}
        {!isLoading && filteredTickets.length === 0 && <div>No tickets for this filter.</div>}

        {!isLoading && filteredTickets.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Message</th>
                <th>Created</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((t: any) => (
                <tr key={t.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ padding: 8 }}>{t.title}</td>
                  <td style={{ padding: 8, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</td>
                  <td style={{ padding: 8 }}>{new Date(t.createdAt).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{t.status}</td>
                  <td style={{ padding: 8 }}>
                    <button onClick={() => { setSelectedTicket(t); alert(t.description); }}>View</button>
                    <button onClick={() => openReply(t)} style={{ marginLeft: 8 }}>Reply</button>
                    <button onClick={() => handleMarkResponded(t.id)} style={{ marginLeft: 8 }}>Mark responded</button>
                    <button onClick={() => handleDelete(t.id)} style={{ marginLeft: 8 }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {replyOpen && selectedTicket && (
        <ReplyModal
          submission={{
            id: selectedTicket.id,
            name: selectedTicket.title,
            email: selectedTicket.title,
            message: selectedTicket.description,
          }}
          onClose={() => setReplyOpen(false)}
          onSent={onReplySent}
        />
      )}
    </main>
  );
};

export default ClientDashboard;
EOF

cat > api/client/reply.ts <<'EOF'
import { createClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail';
import type { NextApiRequest, NextApiResponse } from 'next';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const SENDGRID_FROM = process.env.SENDGRID_FROM || 'noreply@yourdomain.com';

const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

async function getUserIdFromToken(token?: string | null) {
  if (!token) return null;
  try {
    const { data, error } = await supabaseService.auth.getUser({ access_token: token } as any);
    if (error) {
      console.error('getUser error', error);
      return null;
    }
    return data?.user?.id ?? null;
  } catch (err) {
    console.error('Failed to get user from token', err);
    return null;
  }
}

async function isMember(userId: string | null, clientId?: string) {
  if (!userId || !clientId) return false;
  try {
    const { data } = await supabaseService
      .from('user_memberships')
      .select('role')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .limit(1)
      .single();
    if (!data) return false;
    const role = (data as any).role;
    return ['owner', 'admin', 'agent'].includes(role);
  } catch (err) {
    console.error('isMember error', err);
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  const authHeader = (req.headers.authorization as string) || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const userId = await getUserIdFromToken(token);
  if (!userId) return res.status(401).json({ error: 'Unauthorized: invalid token' });

  const { submissionId, to_email, subject, body } = req.body;
  if (!submissionId || !to_email || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data: submission } = await supabaseService.from('contact_submissions').select('client_id').eq('id', submissionId).limit(1).single();
  const clientId = (submission as any)?.client_id;
  if (!clientId) return res.status(400).json({ error: 'Submission missing client association' });

  const member = await isMember(userId, clientId);
  if (!member) return res.status(403).json({ error: 'Forbidden: not a member of client' });

  if (!SENDGRID_API_KEY) {
    console.error('SENDGRID_API_KEY is not configured.');
    return res.status(500).json({ error: 'Email service not configured' });
  }

  try {
    await sgMail.send({
      to: to_email,
      from: SENDGRID_FROM,
      subject,
      text: body,
      html: `<pre>${body}</pre>`,
    });
  } catch (err) {
    console.error('SendGrid send error', err);
    return res.status(500).json({ error: 'Failed to send email' });
  }

  try {
    const { error } = await supabaseService
      .from('contact_submissions')
      .update({ status: 'responded', responded_at: new Date().toISOString(), responded_by: userId })
      .eq('id', submissionId);
    if (error) {
      console.error('Failed to update submission status', error);
      return res.status(500).json({ error: 'Email sent but failed to update db status' });
    }
  } catch (err) {
    console.error('Error updating submission record', err);
    return res.status(500).json({ error: 'Failed to update submission record' });
  }

  return res.status(200).json({ ok: true });
}
EOF

cat > docs/STRIPE_SETUP.md <<'EOF'
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
EOF

# Optional App.tsx (react-router) — only add if you use react-router (not Next.js)
cat > src/App.tsx <<'EOF'
import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import ClientDashboard from './pages/ClientDashboard';
import Home from './pages/Home';
import AdminPage from './pages/AdminPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/client" element={<ClientDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}
EOF

echo "All files created. Review them in VS Code."
echo "Next steps (recommended):"
echo "1) git checkout -b feature/phase-2-multiclient  (if not already on that branch)"
echo "2) git add ."
echo "3) git commit -m \"feat(multiclient+stripe): add Phase 1 + Phase 2 files\""
echo "4) git push -u origin feature/phase-2-multiclient"
echo ""
echo "Remember: set your env vars (SUPABASE_SERVICE_ROLE_KEY, STRIPE keys, SENDGRID, TWILIO, etc.) and run SQL migrations in Supabase SQL editor using the service role."