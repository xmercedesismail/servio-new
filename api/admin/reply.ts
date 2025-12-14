import { Request, Response } from 'express'; 
import { SupabaseClient } from '@supabase/supabase-js';
import sgMail from '@sendgrid/mail'; // Keep this import for typing and usage

// --- Dependencies Type ---
// Define a type for the dependencies that will be injected from the main server file (index.ts)
interface ReplyDependencies {
  supabaseService: SupabaseClient;
  sendgridApiKey?: string;
  sendgridFrom: string;
}

/* ---------------- Type Definitions ---------------- */

interface ReplyRequestBody {
  submissionId: string;
  to_email: string;
  subject: string;
  body: string;
}

/* ---------------- Helpers (Refactored to accept Supabase client) ---------------- */

// NOTE: This helper is now part of the factory function's closure.
// It uses the injected 'supabase' client instead of the unreliable global 'supabaseService'.

/**
 * Creates the Express route handler by injecting the required services.
 * @param dependencies - The Supabase client and SendGrid configuration.
 * @returns The Express route handler function (Request, Response) => void.
 */
export const createAdminReplyHandler = ({ supabaseService, sendgridApiKey, sendgridFrom }: ReplyDependencies) => {
  
  // Set the API key once, inside the factory, if it exists
  if (sendgridApiKey) {
    sgMail.setApiKey(sendgridApiKey);
  } else {
    // Log a warning if the key is missing, even though the main app should check this
    console.warn("⚠️ WARNING: SENDGRID_API_KEY is missing in dependency injection. Email sending functionality is disabled.");
  }
  
  /**
   * Validates the user's access token and returns the user ID.
   */
  async function getUserIdFromToken(token?: string | null): Promise<string | null> {
    if (!token) return null;

    const { data, error } = await supabaseService.auth.getUser(token);

    if (error || !data?.user?.id) return null;
    return data.user.id;
  }

  /**
   * Checks if a given user ID has the 'admin' role.
   */
  async function isAdminUser(userId: string): Promise<boolean> {
    const { data } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .limit(1)
      .single();

    return data?.role === 'admin';
  }

  /* ---------------- Route Handler (The function returned by the factory) ---------------- */
  
  /**
   * Handles the admin's reply action: sends an email and updates the submission status.
   */
  return async function adminReply(req: Request, res: Response) {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Check for configured services using the injected dependencies
    if (!sendgridApiKey) {
      return res.status(500).json({ error: 'Email service not configured. Missing API Key.' });
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
      const { submissionId, to_email, subject, body } = req.body as ReplyRequestBody;
      
      if (!submissionId || !to_email || !subject || !body) {
        return res.status(400).json({ error: 'Missing required fields: submissionId, to_email, subject, and body' });
      }

      // 1. Send the email via SendGrid
      await sgMail.send({
        to: to_email,
        from: sendgridFrom, // Use injected 'from' address
        subject,
        text: body,
        html: `<p style="white-space: pre-wrap;">${body}</p>`,
      });

      // 2. Update the contact submission status in Supabase
      const { error: updateError } = await supabaseService
        .from('contact_submissions')
        .update({
          status: 'responded',
          responded_at: new Date().toISOString(),
          responded_by: userId,
        })
        .eq('id', submissionId);
        
      if (updateError) {
        console.error('Supabase update failed:', updateError);
        return res.status(500).json({ error: 'Failed to record response status' });
      }

      return res.json({ ok: true, message: `Reply sent and submission ${submissionId} updated.` });
    } catch (err) {
      console.error('adminReply error:', err);
      // Catch specific SendGrid errors here if needed
      return res.status(500).json({ error: 'Server error during reply process' });
    }
  }; // End of adminReply handler
}; // End of createAdminReplyHandler factory