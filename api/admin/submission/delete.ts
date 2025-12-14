import { Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- Configuration and Initialization ---

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// 1. Initialize Supabase
let supabaseService: SupabaseClient | undefined;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
} else {
  console.error("CRITICAL: Missing Supabase URL or Service Role Key.");
}

// --- Type Definitions ---

// Define the expected body for a DELETE request
interface DeleteRequestBody {
  // Assuming we are deleting a contact submission, use a generic ID field
  resourceId: string;
  tableName: 'contact_submissions' | 'users' | 'other_admin_table'; // Only allow safe table names
}

/* ---------------- Authorization Helpers ---------------- */

/**
 * Validates the user's access token and returns the user ID.
 */
async function getUserIdFromToken(token?: string | null): Promise<string | null> {
  if (!supabaseService || !token) return null;

  const { data, error } = await supabaseService.auth.getUser(token);

  if (error || !data?.user?.id) return null;
  return data.user.id;
}

/**
 * Checks if a given user ID has the 'admin' role.
 */
async function isAdminUser(userId: string): Promise<boolean> {
  if (!supabaseService) return false;

  const { data } = await supabaseService
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .limit(1)
    .single();

  // You might also check 'user_memberships' here, as in your check.ts file
  return data?.role === 'admin';
}

/* ---------------- Route Handler ---------------- */

/**
 * Handles the admin's DELETE request to remove a resource from a specified table.
 */
export async function adminDelete(req: Request, res: Response) {
  // DELETE requests should use req.body when deleting based on parameters not in the URL
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  if (!supabaseService) {
    return res.status(500).json({ error: 'Database service not initialized' });
  }

  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const userId = await getUserIdFromToken(token);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }

    // Use type assertion for req.body
    const { resourceId, tableName } = req.body as DeleteRequestBody;
    
    if (!resourceId || !tableName) {
      return res.status(400).json({ error: 'Missing required fields: resourceId and tableName' });
    }

    // 1. Perform the deletion in Supabase
    // ⚠️ Security Note: It is CRITICAL that the table name is validated (as done in the interface)
    // to prevent malicious deletion from arbitrary tables.
    const { error: deleteError, count } = await supabaseService
      .from(tableName)
      .delete({ count: 'exact' }) // Request the count of deleted rows
      .eq('id', resourceId);
      
    if (deleteError) {
      console.error('Supabase deletion failed:', deleteError);
      return res.status(500).json({ error: 'Failed to delete resource' });
    }
    
    if (count === 0) {
      // If no rows were deleted, the resource likely wasn't found
      return res.status(404).json({ error: `Resource with ID ${resourceId} not found in ${tableName}.` });
    }

    return res.json({ ok: true, message: `Resource ${resourceId} deleted successfully from ${tableName}.` });
  } catch (err) {
    console.error('adminDelete error:', err);
    return res.status(500).json({ error: 'Server error during deletion process' });
  }
}

// ⚠️ Optional: If you use the file directly as an API endpoint handler, use this export:
// export default adminDelete;