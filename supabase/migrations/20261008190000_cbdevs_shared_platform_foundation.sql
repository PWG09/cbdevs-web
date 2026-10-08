-- CBDEVS shared platform foundation.
-- Safe additive migration: does not migrate legacy records or alter existing production tables.
begin;

create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'member', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.app_catalog (
  app_key text primary key check (app_key ~ '^[a-z][a-z0-9_-]{1,63}$'),
  display_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_apps (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  app_key text not null references public.app_catalog(app_key) on delete restrict,
  enabled boolean not null default true,
  enabled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (organization_id, app_key)
);

create table if not exists public.user_app_permissions (
  organization_id uuid not null,
  user_id uuid not null,
  app_key text not null references public.app_catalog(app_key) on delete cascade,
  permissions text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, app_key),
  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete cascade,
  check (array_position(permissions, null) is null)
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  app_key text references public.app_catalog(app_key) on delete set null,
  action text not null check (length(trim(action)) between 1 and 120),
  resource_type text,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists organization_members_user_status_idx
  on public.organization_members(user_id, status);
create index if not exists organization_apps_app_enabled_idx
  on public.organization_apps(app_key, enabled);
create index if not exists user_app_permissions_user_idx
  on public.user_app_permissions(user_id, organization_id);
create index if not exists audit_logs_org_created_idx
  on public.audit_logs(organization_id, created_at desc);

insert into public.app_catalog (app_key, display_name) values
  ('admin', 'CBDEVS Admin'),
  ('web', 'CBDEVS Web'),
  ('courses', 'CBDEVS Courses'),
  ('client-portal', 'CBDEVS Client Portal'),
  ('detailflow', 'DetailFlow'),
  ('quoteai', 'QuoteAI'),
  ('quotesnap', 'QuoteSnap')
on conflict (app_key) do nothing;

create or replace function private.is_org_member(p_org_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create or replace function private.has_org_role(p_org_id uuid, p_roles text[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any(p_roles)
  );
$$;

create or replace function private.can_access_app(p_org_id uuid, p_app_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members m
    join public.organization_apps oa on oa.organization_id = m.organization_id
    join public.app_catalog ac on ac.app_key = oa.app_key
    where m.organization_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and oa.app_key = p_app_key
      and oa.enabled
      and ac.active
  );
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, text[]) from public;
revoke all on function private.can_access_app(uuid, text) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, text[]) to authenticated;
grant execute on function private.can_access_app(uuid, text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'avatar_url', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

create or replace function public.create_organization(p_name text, p_slug text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_slug text := lower(trim(coalesce(p_slug, '')));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if length(v_name) < 1 or length(v_name) > 160 then
    raise exception 'Organization name must be 1-160 characters' using errcode = '22023';
  end if;
  if v_slug !~ '^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$' or length(v_slug) > 80 then
    raise exception 'Invalid organization slug' using errcode = '22023';
  end if;

  insert into public.organizations (name, slug, created_by)
  values (v_name, v_slug, v_user_id)
  returning id into v_org_id;

  insert into public.organization_members (organization_id, user_id, role, status)
  values (v_org_id, v_user_id, 'owner', 'active');

  return v_org_id;
end;
$$;

revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.app_catalog enable row level security;
alter table public.organization_apps enable row level security;
alter table public.user_app_permissions enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists organizations_select_members on public.organizations;
create policy organizations_select_members on public.organizations
  for select to authenticated using (private.is_org_member(id));
drop policy if exists organizations_update_admins on public.organizations;
create policy organizations_update_admins on public.organizations
  for update to authenticated using (private.has_org_role(id, array['owner','admin']))
  with check (private.has_org_role(id, array['owner','admin']));

drop policy if exists org_members_select_members on public.organization_members;
create policy org_members_select_members on public.organization_members
  for select to authenticated using (
    user_id = (select auth.uid()) or private.has_org_role(organization_id, array['owner','admin','manager'])
  );
drop policy if exists org_members_admin_manage on public.organization_members;
create policy org_members_admin_manage on public.organization_members
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner','admin']))
  with check (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists app_catalog_authenticated_read on public.app_catalog;
create policy app_catalog_authenticated_read on public.app_catalog
  for select to authenticated using (active);

drop policy if exists organization_apps_select_members on public.organization_apps;
create policy organization_apps_select_members on public.organization_apps
  for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists organization_apps_admin_manage on public.organization_apps;
create policy organization_apps_admin_manage on public.organization_apps
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner','admin']))
  with check (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists user_app_permissions_select_self_or_admin on public.user_app_permissions;
create policy user_app_permissions_select_self_or_admin on public.user_app_permissions
  for select to authenticated using (
    user_id = (select auth.uid())
    or private.has_org_role(organization_id, array['owner','admin','manager'])
  );
drop policy if exists user_app_permissions_admin_manage on public.user_app_permissions;
create policy user_app_permissions_admin_manage on public.user_app_permissions
  for all to authenticated
  using (private.has_org_role(organization_id, array['owner','admin']))
  with check (private.has_org_role(organization_id, array['owner','admin']));

drop policy if exists audit_logs_select_admins on public.audit_logs;
create policy audit_logs_select_admins on public.audit_logs
  for select to authenticated using (
    organization_id is not null
    and private.has_org_role(organization_id, array['owner','admin'])
  );
drop policy if exists audit_logs_insert_member on public.audit_logs;
create policy audit_logs_insert_member on public.audit_logs
  for insert to authenticated with check (
    actor_user_id = (select auth.uid())
    and (organization_id is null or private.is_org_member(organization_id))
  );
-- Intentionally no UPDATE or DELETE policies for audit_logs.

grant select, insert, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update, delete on public.organization_members to authenticated;
grant select on public.app_catalog to authenticated;
grant select, insert, update, delete on public.organization_apps to authenticated;
grant select, insert, update, delete on public.user_app_permissions to authenticated;
grant select, insert on public.audit_logs to authenticated;

commit;
