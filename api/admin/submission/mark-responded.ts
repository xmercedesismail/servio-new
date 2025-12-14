// --- Deno-Compatible Imports (Now Bare Names) ---
import { SupabaseClient } from '@supabase/supabase-js';
import { Request, Response } from 'express';


// Handler factory function using Dependency Injection
export const createMarkRespondedHandler = (supabaseService: SupabaseClient) => {
    
    // The actual Express handler function
    return async (req: Request, res: Response) => {
        const { messageId } = req.body;

        if (!messageId) {
            return res.status(400).json({ error: 'messageId is required.' });
        }

        try {
            const { error } = await supabaseService
                .from('messages')
                .update({ has_been_responded_to: true })
                .eq('id', messageId);

            if (error) {
                console.error("Supabase update error:", error);
                return res.status(500).json({ error: 'Failed to update message status in Supabase.' });
            }

            return res.status(200).json({ success: true, message: `Message ${messageId} marked as responded.` });

        } catch (e) {
            console.error('General error marking message responded:', e);
            return res.status(500).json({ error: 'Internal server error.' });
        }
    };
};