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
