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

## Migration
Firebase remains the legacy source until data and admin flows are migrated and verified. Do not delete the Firebase project before the cutover is complete.
