# C.B.devs Web

Official public website migration from Firebase Hosting to Next.js/Vercel.

## Stack
- Next.js + TypeScript
- Vercel
- Supabase PostgreSQL
- Stripe (for future billing flows)

## Local
```bash
npm install
cp .env.example .env.local
npm run dev
```

## Supabase
Run `supabase/schema.sql` in the SQL editor, then configure the Vercel environment variables.

Never commit `.env.local` or service-role credentials.

## Contact form → CBDEVS Admin leads

`/contacto` posts to `/api/inquiries`, which validates the request, checks the origin, drops bot submissions (honeypot + minimum fill time) and calls the central Supabase function `cbdevs_submit_inquiry` with the server-only service-role key. That function rate-limits by a keyed hash of the visitor IP (5 per hour), ignores 10-minute duplicates and stores the lead in `cbdevs_inquiries`, where the team works it from **Leads** in CBDEVS Admin.

Requires the `cbdevs-database` migration `20261019201500_cbdevs_leads_crm.sql` to be applied first.

Server-only variables: `CBDEVS_CENTRAL_SUPABASE_URL`, `CBDEVS_CENTRAL_SUPABASE_SERVICE_ROLE_KEY`, optional `CBDEVS_INQUIRY_HASH_SECRET` and `CBDEVS_WEB_ALLOWED_ORIGINS` (see `.env.example`).

Unit tests: `npm test` (Node 22.18+).

## Migration
Firebase remains the legacy source until data and admin flows are migrated and verified. Do not delete the Firebase project before the cutover is complete.
