// @ts-ignore: Ignore for SendGrid types
import sgMail from '@sendgrid/mail';
import { SupabaseClient } from '@supabase/supabase-js';
import { Request, Response } from 'express';

interface ReplyDependencies {
    supabaseService: SupabaseClient;
    sendgridApiKey: string | undefined;
    sendgridFrom: string;
}

export const createAdminReplyHandler = (deps: ReplyDependencies) => {
    const { supabaseService, sendgridApiKey, sendgridFrom } = deps;

    if (sendgridApiKey) {
        // Set the API Key on the SendGrid client
        sgMail.setApiKey(sendgridApiKey);
    }

    return async (req: Request, res: Response) => {
        const { to, subject, body } = req.body;

        if (!to || !subject || !body) {
            return res.status(400).json({ error: 'Missing required fields: to, subject, or body.' });
        }
        
        if (!sendgridApiKey) {
            console.error("SENDGRID_API_KEY is not set.");
            return res.status(500).json({ error: 'Email service is not configured.' });
        }

        const msg = {
            to,
            from: sendgridFrom,
            subject,
            html: body,
        };

        try {
            await sgMail.send(msg);
            return res.status(200).json({ success: true, message: 'Email sent successfully.' });
        } catch (error: any) {
            console.error('SendGrid Error:', error.response?.body || error.message);
            return res.status(500).json({ error: 'Failed to send email via SendGrid.', details: error.message });
        }
    };
};