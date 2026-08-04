-- 012_auth_rls.sql
-- Real Supabase Auth (email/password) + role-scoped Row Level Security.
--
-- Idempotent (drop-if-exists / create-or-replace). Run AFTER 011.
-- Prereqs (Supabase → Authentication):
--   • Email provider enabled (default for email/password).
--   • Create the first admin: Authentication → Add user (email + temp password).
--     On first login the trigger below auto-creates the matching `users` row
--     (role 'viewer'); flip it to 'admin' in the Team module (admin-only).
-- ⚠️ After this runs, the anon key can NO LONGER read the core tables —
--    deploy the app's login screen at the same time.

-- ── 1) Role helpers ──────────────────────────────────────────────────────────
-- security definer so RLS policies can read `users` without recursion.
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public
as $$
  select role from public.users where auth_id = auth.uid()
$$;

create or replace function public.app_has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public
as $$
  select public.app_role() = any(roles)
$$;

-- ── 2) users ↔ auth.users sync ──────────────────────────────────────────────
-- On signup/update, upsert the profile row (id = auth uid, default role viewer).
create or replace function public.sync_user_from_auth() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, auth_id, name, email, role)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'viewer'
  )
  on conflict (email) do update
    set auth_id = excluded.auth_id,
        name    = excluded.name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.sync_user_from_auth();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_user_from_auth();

-- ── 3) Role-scoped RLS on the core tables (phase 1) ─────────────────────────
-- Matrix mirrors ROLE_PERMISSIONS in src/types/index.ts:
--   read  = any authenticated profile with a role (app_role() not null)
--   write = roles listed per table
-- Non-core tables keep their open allow_all policies (phase 2 TODO).

do $$
declare t text;
begin
  -- Drop the old open policies on the tables now role-scoped.
  foreach t in array array['users','sites','projects','project_sites','tasks','evm_metrics','companies','contacts','invoices','payments']
  loop
    execute format('drop policy if exists "allow_all_%1$s" on public.%1$I;', t);
  end loop;
end $$;

-- users: any logged-in user can read the roster (pickers); only admins write.
-- (Uses a direct subquery instead of app_role() to avoid policy self-reference.)
alter table public.users enable row level security;
drop policy if exists "users_read" on public.users;
create policy "users_read" on public.users
  for select using (auth.uid() is not null);
drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin" on public.users
  for all
  using (public.app_has_role(array['admin']))
  with check (public.app_has_role(array['admin']));

-- sites / projects / project_sites / tasks: everyone reads, pm/engineer/admin write.
alter table public.sites enable row level security;
drop policy if exists "sites_read" on public.sites;
create policy "sites_read" on public.sites for select using (public.app_role() is not null);
drop policy if exists "sites_write" on public.sites;
create policy "sites_write" on public.sites for all
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

alter table public.projects enable row level security;
drop policy if exists "projects_read" on public.projects;
create policy "projects_read" on public.projects for select using (public.app_role() is not null);
drop policy if exists "projects_write" on public.projects;
create policy "projects_write" on public.projects for all
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

alter table public.project_sites enable row level security;
drop policy if exists "project_sites_read" on public.project_sites;
create policy "project_sites_read" on public.project_sites for select using (public.app_role() is not null);
drop policy if exists "project_sites_write" on public.project_sites;
create policy "project_sites_write" on public.project_sites for all
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

alter table public.tasks enable row level security;
drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select using (public.app_has_role(array['admin','pm','engineer']));
drop policy if exists "tasks_write" on public.tasks;
create policy "tasks_write" on public.tasks for all
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

-- evm_metrics / companies / contacts / invoices / payments: pm/finance/admin.
alter table public.evm_metrics enable row level security;
drop policy if exists "evm_metrics_read" on public.evm_metrics;
create policy "evm_metrics_read" on public.evm_metrics for select using (public.app_has_role(array['admin','pm','finance']));
drop policy if exists "evm_metrics_write" on public.evm_metrics;
create policy "evm_metrics_write" on public.evm_metrics for all
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.companies enable row level security;
drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies for select using (public.app_has_role(array['admin','pm','finance']));
drop policy if exists "companies_write" on public.companies;
create policy "companies_write" on public.companies for all
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.contacts enable row level security;
drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts for select using (public.app_has_role(array['admin','pm','finance']));
drop policy if exists "contacts_write" on public.contacts;
create policy "contacts_write" on public.contacts for all
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.invoices enable row level security;
drop policy if exists "invoices_read" on public.invoices;
create policy "invoices_read" on public.invoices for select using (public.app_has_role(array['admin','pm','finance']));
drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices for all
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.payments enable row level security;
drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments for select using (public.app_has_role(array['admin','pm','finance']));
drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments for all
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

-- ── 4) Verify ────────────────────────────────────────────────────────────────
-- select schemaname, tablename, policyname from pg_policies
-- where schemaname = 'public' order by tablename;
