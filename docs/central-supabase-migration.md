# CBDEVS central Supabase rollout

## Status and scope

This is the first additive foundation migration for the new, empty shared Supabase project. Scope is limited to CBDEVS Admin, CBDEVS Web, CBDEVS Courses, and the CBDEVS Client Portal. It creates shared identity/profile, organization membership, app catalog, per-organization app enablement, user app permissions, and audit-log tables. DetailFlow, QuoteSnap, and QuoteAI are explicitly excluded: no tables, users, data, auth configuration, or database connections for those products are to be added to this central project. It does not import Firebase users/data, move existing inquiries, change any production environment variables, or delete legacy systems.

The migration is staged on branch `feat/central-supabase-foundation`. It must be reviewed and tested before merging or applying to a hosted database.

## Migration workflow

1. Confirm the Supabase dashboard project reference belongs to the new, empty CBDEVS central project.
2. Install the Supabase CLI and Docker, then run:
   ```bash
   npx supabase start
   npx supabase db reset
   npx supabase test db
   ```
   If no pgTAP tests exist yet, the last command may report that there are no tests; add policy tests before production cutover.
3. Review the SQL and test the authorization matrix: unauthenticated users, authenticated non-members, members, managers, admins, owners, suspended members, and users in a different organization.
4. Link only the new central project:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR_NEW_CENTRAL_PROJECT_REF
   npx supabase migration list
   npx supabase db push --dry-run
   ```
5. Verify the project reference and dry-run output before applying:
   ```bash
   npx supabase db push
   npx supabase gen types typescript --linked > types/supabase.ts
   ```
   Do not run `db reset` against a linked/remote project. Never point this workflow at DetailFlow, QuoteSnap, QuoteAI, or another existing production project.

## Environment variables

For apps migrated to the shared project, use that project's URL and publishable/anon key. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only and never expose it as a `NEXT_PUBLIC_*` variable. Do not change production environment variables until an app has a reviewed migration PR, verified auth redirects, RLS tests, and a rollback plan.

## Identity and permissions

- Supabase Auth user IDs are the canonical IDs for this new platform. Do not assume legacy Firebase UIDs equal Supabase UUIDs.
- Create an organization through the authenticated `create_organization(name, slug)` RPC so organization and owner membership are created atomically.
- A valid session alone grants no access to organization data. Product tables must include an organization boundary and have RLS policies that validate active membership and the relevant app permission.
- Do not allow clients to write roles, grant app access, or assign permissions unless the server-side authorization path explicitly permits it.
- Treat `audit_logs` as append-only for application clients; use a trusted server process for high-integrity security events.

## What remains before cutover

- Add automated pgTAP tests for RLS and cross-organization IDOR attempts.
- Add product-specific tables in separate, reviewed migrations; avoid mixing app schemas in one giant migration.
- Migrate only CBDEVS Admin, CBDEVS Web, CBDEVS Courses, and the CBDEVS Client Portal sign-in, session handling, authorization, and data access independently. DetailFlow, QuoteSnap, and QuoteAI remain outside this project.
- For the public website's `inquiries` table, decide whether to keep it in this project or migrate it into the shared schema, then add an explicit least-privilege insert path. The current `supabase/schema.sql` is a legacy standalone setup script, not a migration and should not be run as part of the central migration workflow.
- Verify email confirmation, password reset, OAuth redirect URLs, storage policies, webhook secrets, billing, monitoring, and deployment variables in a staging environment.
- Keep Firebase and every previous Supabase project available as read-only/reference until the new paths are validated. No legacy project should be deleted as part of this rollout.