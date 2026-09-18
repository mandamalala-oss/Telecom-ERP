-- ============================================================
-- TelecomERP — Additive migration: created_at columns
--
-- Use this on an EXISTING database that already has data.
-- Unlike database/schema.sql (which drops & recreates tables),
-- this only ADDS columns — nothing is deleted.
--
-- Idempotent: safe to run multiple times.
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.inventory_items
  add column if not exists created_at timestamptz default now();

alter table public.stock_movements
  add column if not exists created_at timestamptz default now();

alter table public.evm_metrics
  add column if not exists created_at timestamptz default now();

alter table public.employees
  add column if not exists created_at timestamptz default now();

alter table public.vehicles
  add column if not exists created_at timestamptz default now();

alter table public.tools
  add column if not exists created_at timestamptz default now();

alter table public.documents
  add column if not exists created_at timestamptz default now();
-- ============================================================
-- TelecomERP — Additive migration: site/project link columns
--
-- Adds denormalized site_code / site_name / project_name columns
-- to installation_records and integration_records so the New/Edit
-- forms can auto-populate them from the Sites / Projects modules
-- (mirrors the survey_reports design).
--
-- Idempotent: safe to run multiple times.
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.installation_records
  add column if not exists site_code text;
alter table public.installation_records
  add column if not exists site_name text;
alter table public.installation_records
  add column if not exists project_name text;

alter table public.integration_records
  add column if not exists site_code text;
alter table public.integration_records
  add column if not exists site_name text;
alter table public.integration_records
  add column if not exists project_name text;
-- ============================================================
-- TelecomERP — Revenue model fix
--
-- companies.revenue was a single hand-typed number on a record
-- that is created once but has many projects over time — it can
-- only ever hold one value and drifts from invoices/payments.
-- Customer-level revenue is now computed from invoices/payments
-- (sum of paid) instead of stored.
--
-- Revenue (contract / booked value) now lives on the commercial
-- units instead:
--   projects.revenue  — project-level contract revenue
--   sites.revenue     — per-site revenue contribution
--
-- Idempotent: safe to run multiple times. Destructive only for
-- the obsolete companies.revenue column (user-approved; the
-- stored values were manual and are replaced by computed ones).
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.companies
  drop column if exists revenue;

alter table public.projects
  add column if not exists revenue bigint default 0;

alter table public.sites
  add column if not exists revenue bigint default 0;
-- ============================================================
-- TelecomERP — Project: Code → Site ID
--
-- A project is linked to exactly one site (decided 2026-08).
-- The projects form replaces the free-text unique `code` input
-- with a Site picker (choose from saved sites), stored in the
-- new `site_id` column.
--
--   drop code      — replaced by the site picker (user-approved)
--   drop site_ids  — never populated by any UI; superseded by
--                    the 1:1 `site_id` link
--   add site_id    — uuid of the linked site
--
-- Idempotent: safe to run multiple times (drop column if exists /
-- add column if not exists). Destructive for the obsolete `code`
-- and `site_ids` columns (user-approved).
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.projects
  drop column if exists code;

alter table public.projects
  drop column if exists site_ids;

alter table public.projects
  add column if not exists site_id uuid;
-- ============================================================
-- TelecomERP — Data repair: backfill FK ids from name columns
--
-- The company/customer/vendor lookups used to store only the
-- denormalized *name* (e.g. company_name) and never the FK id,
-- so cross-module "pull" views (company detail → contacts,
-- customer revenue from invoices, …) were empty. The configs are
-- fixed to populate the FK on save (entityConfigs.ts); this
-- migration repairs rows created before that fix.
--
-- Backfills the FK id by matching the stored name against
-- companies.name. Only fills NULL ids — idempotent, safe to
-- re-run. Caveat: two companies with identical names would match
-- arbitrarily; verify after running if you have duplicates.
--
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

update public.contacts c
  set company_id = cm.id
  from public.companies cm
  where c.company_id is null and c.company_name = cm.name;

update public.subcontractors s
  set company_id = cm.id
  from public.companies cm
  where s.company_id is null and s.company_name = cm.name;

update public.opportunities o
  set customer_id = cm.id
  from public.companies cm
  where o.customer_id is null and o.customer_name = cm.name;

update public.sites s
  set customer_id = cm.id
  from public.companies cm
  where s.customer_id is null and s.customer_name = cm.name;

update public.projects p
  set customer_id = cm.id
  from public.companies cm
  where p.customer_id is null and p.customer_name = cm.name;

update public.quotes q
  set customer_id = cm.id
  from public.companies cm
  where q.customer_id is null and q.customer_name = cm.name;

update public.invoices i
  set customer_id = cm.id
  from public.companies cm
  where i.customer_id is null and i.customer_name = cm.name;

update public.boqs b
  set customer_id = cm.id
  from public.companies cm
  where b.customer_id is null and b.customer_name = cm.name;

update public.contracts c
  set customer_id = cm.id
  from public.companies cm
  where c.customer_id is null and c.customer_name = cm.name;

update public.purchase_orders po
  set vendor_id = cm.id
  from public.companies cm
  where po.vendor_id is null and po.vendor_name = cm.name;
-- ============================================================
-- TelecomERP — Sites: drop customer/project link columns
--
-- The link direction is project → site: the project form picks
-- its site (projects.site_id). The site's own reverse/denormalized
-- customer_id / customer_name / project_id / project_name columns
-- are redundant (customer comes from the project too) and were
-- removed from the form and UI — the site module now keeps only
-- site information and description.
--
-- Idempotent: safe to run multiple times (drop column if exists).
-- Destructive for the four obsolete columns (user-approved).
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.sites
  drop column if exists customer_id;

alter table public.sites
  drop column if exists customer_name;

alter table public.sites
  drop column if exists project_id;

alter table public.sites
  drop column if exists project_name;
-- ============================================================
-- TelecomERP — Sites: add distance field
--
-- Manual 'Distance (km)' field on the site form (stored), used
-- for logistics/planning — entered by the user per site.
--
-- Idempotent: safe to run multiple times (add column if not exists).
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.sites
  add column if not exists distance_km numeric(10,2) default 0;
-- 009_add_project_sites.sql
-- Restore "one project → many sites" (reverses the 1:1 site_id from 005)
-- using a proper junction table instead of the old projects.site_ids text[].
--
-- Idempotent. RUN AFTER 005–008. Safe on live data: existing single-site
-- links (projects.site_id) are copied into project_sites first, then the
-- now-redundant column is dropped.

create table if not exists project_sites (
  project_id uuid not null references projects(id) on delete cascade,
  site_id    uuid not null references sites(id)    on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, site_id)
);

-- Carry over the single-site links created by migration 005.
insert into project_sites (project_id, site_id)
select id, site_id from projects
where site_id is not null
on conflict (project_id, site_id) do nothing;

-- 005 added projects.site_id; the junction now owns the relationship.
alter table projects drop column if exists site_id;

-- Sanity check: every project should appear with its sites in the junction.
-- select p.name, count(ps.site_id) as sites
-- from projects p left join project_sites ps on ps.project_id = p.id
-- group by p.id order by p.name;
-- 010_merge_duplicate_projects.sql
-- DATA REPAIR SCRIPT — REVIEW BEFORE RUNNING, NOT idempotent-by-design.
--
-- Background: with the old 1:1 model (005) a multi-site engagement was often
-- created as several project rows with the SAME name + customer (one per
-- site). After 009 restores project → many sites, those duplicates should be
-- consolidated into ONE project covering all its sites.
--
-- What it does, per duplicate (name, customer_name) group:
--   • keeps the EARLIEST project row as the survivor,
--   • unions the linked sites (project_sites),
--   • remaps every child row (tasks, quotes, invoices, POs, install/integration
--     records, BOQs, assets, …) to the survivor,
--   • collapses the survivor's EVM records into one (base inputs summed,
--     derived metrics re-derived, histories merged),
--   • SUMS budget / spent / revenue into the survivor (the per-site rows were
--     split by the 1:1 model),
--   • deletes the duplicate project rows.
--
-- ⚠️ BACKUP the DB first (Supabase → Database → Backup, or a pg_dump).
-- ⚠️ Run it AFTER migration 009, and review the RAISE NOTICE lines it prints.
-- ⚠️ Rollback = restore from backup. There is no undo.

do $$
declare
  g    record;
  surv uuid;
  d    uuid;
  keep uuid;
  cnt  int;
begin
  -- 1) Merge duplicate project rows.
  for g in
    select name, customer_name, count(*) as cnt
    from projects
    group by name, customer_name
    having count(*) > 1
  loop
    select id into surv
    from projects
    where name = g.name
      and coalesce(customer_name, '') = coalesce(g.customer_name, '')
    order by created_at asc nulls last, id asc
    limit 1;

    cnt := 0;
    for d in
      select id from projects
      where name = g.name
        and coalesce(customer_name, '') = coalesce(g.customer_name, '')
        and id <> surv
      order by created_at desc, id desc
    loop
      cnt := cnt + 1;

      -- sites: union into survivor, then drop the dupe's links
      insert into project_sites (project_id, site_id)
      select surv, site_id from project_sites where project_id = d
      on conflict (project_id, site_id) do nothing;
      delete from project_sites where project_id = d;

      -- child rows → survivor (every table with a project_id column)
      update tasks                set project_id = surv where project_id = d;
      update stock_movements      set project_id = surv where project_id = d;
      update quotes               set project_id = surv where project_id = d;
      update invoices             set project_id = surv where project_id = d;
      update purchase_orders      set project_id = surv where project_id = d;
      update evm_metrics          set project_id = surv where project_id = d;
      update survey_reports       set project_id = surv where project_id = d;
      update installation_records set project_id = surv where project_id = d;
      update integration_records  set project_id = surv where project_id = d;
      update atp_records          set project_id = surv where project_id = d;
      update boqs                 set project_id = surv where project_id = d;
      update assets               set project_id = surv where project_id = d;
      update purchase_requests    set project_id = surv where project_id = d;
      update employees            set current_project_id = surv where current_project_id = d;
      update vehicles             set current_project_id = surv where current_project_id = d;
      update contracts
      set linked_project_ids = (
        select array_agg(case when x = d::text then surv::text else x end)
        from unnest(linked_project_ids) x
      )
      where linked_project_ids && array[d::text];

      -- financials: sum into the survivor (the duplicates were split per site)
      update projects set
        budget  = budget  + coalesce((select budget  from projects where id = d), 0),
        spent   = spent   + coalesce((select spent   from projects where id = d), 0),
        revenue = revenue + coalesce((select revenue from projects where id = d), 0)
      where id = surv;

      delete from projects where id = d;
    end loop;

    raise notice 'MERGED % duplicate row(s) of project "%" (customer=%) into survivor %',
      cnt, g.name, coalesce(g.customer_name, 'NULL'), surv;
  end loop;

  -- 2) Collapse any project that now has multiple EVM records (from the merge
  --    above, or from older data): sum BAC/PV/EV/AC, re-derive metrics exactly
  --    like src/lib/evm.ts deriveEVM, merge history, keep earliest data date.
  for g in
    select project_id from evm_metrics group by project_id having count(*) > 1
  loop
    select id into keep
    from evm_metrics
    where project_id = g.project_id
    order by created_at asc nulls last, id asc
    limit 1;

    with agg as (
      select project_id,
             sum(bac) as bac, sum(pv) as pv, sum(ev) as ev, sum(ac) as ac,
             min(data_date) as data_date
      from evm_metrics
      where project_id = g.project_id
      group by project_id
    )
    update evm_metrics em set
      bac              = a.bac,
      pv               = a.pv,
      ev               = a.ev,
      ac               = a.ac,
      data_date        = a.data_date,
      history          = coalesce((
        select jsonb_agg(s order by s->>'date')
        from evm_metrics e, jsonb_array_elements(e.history) s
        where e.project_id = a.project_id
      ), '[]'::jsonb),
      sv               = a.ev - a.pv,
      cv               = a.ev - a.ac,
      spi              = case when a.pv > 0 then round((a.ev::numeric / a.pv)::numeric, 4) else 0 end,
      cpi              = case when a.ac > 0 then round((a.ev::numeric / a.ac)::numeric, 4) else 0 end,
      eac              = case when a.ac > 0 and a.ev > 0 then round((a.bac::numeric * a.ac) / a.ev)::bigint else 0 end,
      etc              = case when a.ac > 0 and a.ev > 0 then round((a.bac::numeric * a.ac) / a.ev - a.ac)::bigint else 0 end,
      vac              = a.bac - case when a.ac > 0 and a.ev > 0 then round((a.bac::numeric * a.ac) / a.ev)::bigint else 0 end,
      tcpi             = case when a.bac <> a.ac then round(((a.bac - a.ev)::numeric / (a.bac - a.ac))::numeric, 4) else 0 end,
      percent_complete = case when a.bac > 0 then round((a.ev::numeric / a.bac) * 100)::smallint else 0 end
    from agg a
    where em.id = keep;

    delete from evm_metrics where project_id = g.project_id and id <> keep;
    raise notice 'COLLAPSED EVM records for project % into one row', g.project_id;
  end loop;

  raise notice 'DONE — verify with: select name, customer_name, count(*) from projects group by 1,2 having count(*) > 1;';
end $$;
-- 011_add_evm_po.sql
-- EVM: add the customer PO (contracted value) to evm_metrics.
-- BAC stays our internal budget; Benefit = PO − AC is derived at render.
-- EV is now derived = BAC × percent_complete (no manual EV entry).
--
-- Idempotent. RUN AFTER 009 (010 optional). Existing rows get po = 0
-- until re-saved through the EVM form.

alter table evm_metrics add column if not exists po bigint default 0;
-- 012_auth_rls.sql
-- Real Supabase Auth (email/password) + role-scoped Row Level Security.
--
-- Idempotent (drop-if-exists / create-or-replace). Run AFTER 011.
-- Prereqs (Supabase → Authentication):
--   • Email provider enabled (default for email/password).
--   • Create the first admin: Authentication → Add user (email + temp password).
--     On first login the trigger below auto-creates the matching `users` row
--     (role 'Team Leader'); flip it to 'CEO' in the Team module (CEO-only).
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
    'Team Leader'
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
  using (public.app_has_role(array['CEO']))
  with check (public.app_has_role(array['CEO']));

-- sites / projects / project_sites / tasks: everyone reads, pm/engineer/admin write.
alter table public.sites enable row level security;
drop policy if exists "sites_read" on public.sites;
create policy "sites_read" on public.sites for select using (public.app_role() is not null);
drop policy if exists "sites_write" on public.sites;
create policy "sites_write" on public.sites for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

alter table public.projects enable row level security;
drop policy if exists "projects_read" on public.projects;
create policy "projects_read" on public.projects for select using (public.app_role() is not null);
drop policy if exists "projects_write" on public.projects;
create policy "projects_write" on public.projects for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

alter table public.project_sites enable row level security;
drop policy if exists "project_sites_read" on public.project_sites;
create policy "project_sites_read" on public.project_sites for select using (public.app_role() is not null);
drop policy if exists "project_sites_write" on public.project_sites;
create policy "project_sites_write" on public.project_sites for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

alter table public.tasks enable row level security;
drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));
drop policy if exists "tasks_write" on public.tasks;
create policy "tasks_write" on public.tasks for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

-- evm_metrics / companies / contacts / invoices / payments: pm/finance/admin.
alter table public.evm_metrics enable row level security;
drop policy if exists "evm_metrics_read" on public.evm_metrics;
create policy "evm_metrics_read" on public.evm_metrics for select using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "evm_metrics_write" on public.evm_metrics;
create policy "evm_metrics_write" on public.evm_metrics for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

alter table public.companies enable row level security;
drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies for select using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "companies_write" on public.companies;
create policy "companies_write" on public.companies for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

alter table public.contacts enable row level security;
drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts for select using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "contacts_write" on public.contacts;
create policy "contacts_write" on public.contacts for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

alter table public.invoices enable row level security;
drop policy if exists "invoices_read" on public.invoices;
create policy "invoices_read" on public.invoices for select using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

alter table public.payments enable row level security;
drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments for select using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

-- ── 4) Verify ────────────────────────────────────────────────────────────────
-- select schemaname, tablename, policyname from pg_policies
-- where schemaname = 'public' order by tablename;
-- 013_seed_admin.sql
-- Guaranteed working admin login, seeded directly into auth.users.
-- Run AFTER 012. Idempotent: re-running does nothing (email already exists).
--
-- Credentials:  admin@manongadoria.mg  /  Admin@2026!
-- ⚠️ CHANGE THE PASSWORD after first login (Supabase → Authentication →
--    Users → the admin → "Reset password", or a security preference).
--
-- If you'd rather use a different email/password, edit the two values below.
-- The DO block prints a notice: 'admin created' / 'admin already exists' /
-- the real error if the insert fails — paste that back if anything is red.

do $$
declare
  v_email text := 'admin@manongadoria.mg';
  v_pass  text := 'Admin@2026!';
begin
  if exists (select 1 from auth.users where lower(email) = lower(v_email)) then
    raise notice 'admin already exists';
  else
    -- pgcrypto (crypt/gen_salt) is enabled by default on Supabase.
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change_token_current,
      phone_change_token,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_pass, gen_salt('bf')),
      now(),
      '',
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now()
    );
    raise notice 'admin created';
  end if;

  -- The 012 sync trigger created the profile with role 'Team Leader' — promote it.
  update public.users
  set role = 'CEO'
  where lower(email) = lower(v_email);

  raise notice 'profile role set to admin';
exception when others then
  raise notice 'ERROR: %', sqlerrm;
end $$;

-- Verify (must return exactly 1 row):
select email, role from public.users where lower(email) = 'admin@manongadoria.mg';
-- 014_fix_auth_hook_select_star.sql
-- Root cause of "Error finding user: sql: Scan error on column index 3":
-- an auth-hook function on the LIVE DB does `SELECT * FROM public.users`
-- and the Supabase Go scanner reads columns positionally — as soon as the
-- users table column order differs (or grows), the scan breaks.
--
-- Every function in THIS repo already uses explicit columns (app_role,
-- app_has_role, sync_user_from_auth). This migration:
--   1) finds any function on the live DB whose body selects * from
--      public.users and prints its signature + definition,
--   2) re-asserts our own functions (explicit columns, idempotent).
--
-- After running, paste the signature from the Messages tab here and we
-- rewrite that function to:
--     SELECT id, email, role, name FROM public.users WHERE id = auth.uid()

-- ── 1) Discover any auth-hook / helper doing SELECT * FROM public.users ──────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as signature,
           p.prosrc as definition   -- body text directly, no pg_get_functiondef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* 'from\s+public\.users'
      and p.prosrc ~* 'select\s+\*'
  loop
    raise notice 'FOUND SELECT * FROM public.users function: %', r.signature;
    raise notice '%', r.definition;
  end loop;
end $$;

-- ── 2) Re-assert our own helpers with explicit columns (idempotent) ─────────
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

-- ── 3) Verify: should print nothing (no offenders left after the fix) ───────
-- select p.oid::regprocedure::text
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.prosrc ~* 'from\s+public\.users'
--   and p.prosrc ~* 'select\s+\*';
-- 015_fix_auth_users_tokens.sql
-- Fixes "Error finding user: sql: Scan error on column index 3, name
-- 'confirmation token': converting NULL to string is unsupported".
--
-- Root cause: rows inserted directly into auth.users (e.g. the 013 seed)
-- left the token columns NULL; the Supabase Go auth server scans them as
-- non-null strings → every login 500s. Dashboard-created users set these
-- to '' automatically.
--
-- Idempotent + version-safe: only touches token columns that exist, and
-- only fills NULLs (never overwrites real tokens).

do $$
declare c text;
begin
  foreach c in array array[
    'confirmation_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      execute format('update auth.users set %I = coalesce(%I, '''') where %I is null', c, c, c);
    end if;
  end loop;
end $$;

-- Make sure the admin is confirmed (needed for the password grant to pass).
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where lower(email) = 'admin@manongadoria.mg';

-- Verify: must return 0 rows.
-- select id, email, confirmation_token, recovery_token
-- from auth.users
-- where confirmation_token is null or recovery_token is null;
-- 016_fix_users_policy_recursion.sql
-- Fixes "infinite recursion detected in policy for relation 'users'".
--
-- Cause: the users_write_admin policy (from 012) referenced public.users in
-- a subquery directly
--   using (auth.uid() in (select u.auth_id from public.users u where ...))
-- Postgres forbids a policy whose expression queries the same table it
-- protects — and a `for all` policy also applies its USING clause to
-- SELECTs, so even reads explode. The Team module's INSERT (adding a member)
-- triggers it via WITH CHECK.
--
-- Fix: route the admin check through the SECURITY DEFINER app_has_role()
-- helper. The function runs with owner privileges (RLS bypassed inside its
-- own query), and the policy expression only calls a function — no table
-- reference, no recursion. Idempotent; also drops any leftover open policy.

drop policy if exists "allow_all_users" on public.users;
drop policy if exists "users_read" on public.users;
create policy "users_read" on public.users
  for select using (auth.uid() is not null);

drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin" on public.users
  for all
  using (public.app_has_role(array['CEO']))
  with check (public.app_has_role(array['CEO']));

-- Verify:
-- 1) plain read must work (no recursion):
--    select count(*) from public.users;
-- 2) only these two policies should exist on users:
--    select policyname, cmd, qual, with_check
--    from pg_policies where schemaname = 'public' and tablename = 'users';
-- 017_add_user_permissions.sql
-- Per-member module permission matrix: users.permissions is a JSONB map of
--   { "<module>": "view" | "edit" }
-- Missing modules fall back to the role defaults (ROLE_PERMISSIONS).
-- Idempotent.

alter table public.users add column if not exists permissions jsonb default '{}'::jsonb;
-- 018_new_roles.sql
-- Team roles → CEO / Manager / Inspector / Team Leader; departments list
-- (Direction, HSE, Logistic, Project) is handled by the app form.
--
-- Run AFTER 012–017 on the LIVE DB (fresh DBs get everything from the
-- updated schema.sql). Idempotent. Migrates existing roles:
--   admin → CEO · pm → Manager · finance → Manager · engineer → Inspector · viewer → Team Leader
-- and re-applies the role-scoped RLS policies with the new role names.

-- 1) Drop the OLD constraint FIRST so the role migration below can apply.
alter table public.users drop constraint if exists users_role_check;

-- 2) Migrate existing roles.
update public.users set role = case role
  when 'admin'   then 'CEO'
  when 'pm'      then 'Manager'
  when 'finance' then 'Manager'
  when 'engineer' then 'Inspector'
  when 'viewer'  then 'Team Leader'
  else role
end;

-- 3) New role check constraint + default.
alter table public.users add constraint users_role_check
  check (role in ('CEO','Manager','Inspector','Team Leader'));
alter table public.users alter column role set default 'Team Leader';

-- 4) Recreate the sync trigger with the new default role.
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
    'Team Leader'
  )
  on conflict (email) do update
    set auth_id = excluded.auth_id,
        name    = excluded.name;
  return new;
end;
$$;

-- 4) Re-apply role-scoped policies with the new role names.
drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin" on public.users
  for all
  using (public.app_has_role(array['CEO']))
  with check (public.app_has_role(array['CEO']));

drop policy if exists "sites_write" on public.sites;
create policy "sites_write" on public.sites for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "projects_write" on public.projects;
create policy "projects_write" on public.projects for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "project_sites_write" on public.project_sites;
create policy "project_sites_write" on public.project_sites for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));
drop policy if exists "tasks_write" on public.tasks;
create policy "tasks_write" on public.tasks for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "evm_metrics_read" on public.evm_metrics;
create policy "evm_metrics_read" on public.evm_metrics for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "evm_metrics_write" on public.evm_metrics;
create policy "evm_metrics_write" on public.evm_metrics for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "companies_write" on public.companies;
create policy "companies_write" on public.companies for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "contacts_write" on public.contacts;
create policy "contacts_write" on public.contacts for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "invoices_read" on public.invoices;
create policy "invoices_read" on public.invoices for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

-- Verify:
-- select role, count(*) from public.users group by role;
-- select email, role from public.users where email = 'admin@manongadoria.mg';

-- ═══════════════════════════════════════════════════════════════
-- Migration 019: add_task_gantt_fields
-- ═══════════════════════════════════════════════════════════════

-- Adds the fields needed to render an MS-Project-style Gantt chart on tasks:
-- a planned start date, a manual progress percentage, and a milestone flag
-- (zero-duration marker, rendered as a diamond instead of a bar).

alter table tasks
  add column if not exists start_date       date,
  add column if not exists percent_complete numeric(5,1) check (percent_complete between 0 and 100),
  add column if not exists milestone        boolean not null default false;

-- Keep start_date <= due_date when both are set.
alter table tasks
  add constraint tasks_start_before_due
  check (start_date is null or due_date is null or start_date <= due_date);

comment on column tasks.start_date is 'Planned start date used by the Gantt chart timeline.';
comment on column tasks.percent_complete is 'Manual progress override (0-100). Falls back to a value derived from status when null.';
comment on column tasks.milestone is 'True for zero-duration marker tasks, drawn as a diamond on the Gantt chart.';
