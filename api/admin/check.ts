// ✅ Fix 1: Use 'import type' to force TypeScript to read the definitions
import type { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

// --- Environment Setup ---
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("CRITICAL: Missing Supabase Environment Variables");
}

// Initialize Supabase
const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// --- Handler ---
export default async function handler(req: Request, res: Response) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    return res.status(401).json({ error: 'Missing Authorization header' });
  }

  try {
    // ✅ Fix 2: Removed manual type import. We let TS infer the type.
    // In Supabase v2, getUser() expects the token string directly.
    const { data: sessionData, error: userErr } = await supabaseService.auth.getUser(token);
    
    if (userErr || !sessionData?.user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = sessionData.user.id;

    // Check user_roles
    const { data: roleRow } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .limit(1)
      .single();

    if (roleRow?.role === 'admin') {
      return res.json({ isAdmin: true });
    }

    // Check user_memberships
    const { data: membership } = await supabaseService
      .from('user_memberships')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['owner', 'admin'])
      .limit(1)
      .single();

    if (membership) {
      return res.json({ isAdmin: true });
    }

    return res.json({ isAdmin: false });

  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}