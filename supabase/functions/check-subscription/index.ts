// index.ts - The definitive, FINAL stable version using npm:

import { Hono } from 'https://deno.land/x/hono/mod.ts';

// FINAL FIX: Revert to the stable Node-based client with the npm: specifier.
// This client is proven to work when the key is correct.
import { createClient } from 'npm:@supabase/supabase-js'; 

// --- 1. Lazy Client Initialization Function ---
function getSupabaseClient() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL"); 
  const SERVICE_KEY_VALUE = Deno.env.get("SERVICE_KEY"); 

  if (!SUPABASE_URL || !SERVICE_KEY_VALUE) {
      throw new Error("FATAL ERROR: Required secrets (SUPABASE_URL or SERVICE_KEY) are missing or misnamed.");
  }

  // Use the new SB_SECRET_... key here
  return createClient(
    SUPABASE_URL,
    SERVICE_KEY_VALUE
  );
}


// --- 2. Hono App Definition ---
const app = new Hono();

app.post('/', async (c) => {
  let supabase;
  console.log("HANDLER REACHED: check-subscription"); 

  try {
    supabase = getSupabaseClient(); 
    
    const { user_id } = await c.req.json();

    if (!user_id) {
        return c.json({ error: "User ID is required" }, 400);
    }

    const { data, error } = await supabase
      .from('subscriptions') 
      .select('status')
      .eq('user_id', user_id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error("Supabase Query Error:", error);
      return c.json({ error: "Database query failed" }, 500);
    }

    const is_subscribed = data && data.status === 'active';

    return c.json({
        status: "ok",
        is_subscribed: is_subscribed,
        subscription_status: data?.status || 'none'
    }, 200);

  } catch (err) {
    console.error("Unhandled Edge Function Error:", err.message); 
    if (err.message.startsWith("FATAL ERROR")) {
         return c.json({ error: "Secret Configuration Error" }, 500);
    }
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

export default app.fetch;