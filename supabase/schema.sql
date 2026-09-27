create table if not exists public.inquiries (id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), name text not null, email text not null, phone text, message text not null, status text not null default 'new');
alter table public.inquiries enable row level security;
create policy "public cannot read inquiries" on public.inquiries for select using (false);
create policy "public cannot insert inquiries" on public.inquiries for insert with check (false);
-- Inserts are performed server-side with SUPABASE_SERVICE_ROLE_KEY.
