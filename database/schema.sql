-- ============================================================
-- TelecomERP — Supabase schema (v2, app-aligned)
-- Manonga Doria — Telecom deployment ERP
--
-- This replaces the old normalized schema/migration. Each table
-- maps 1:1 to a TypeScript interface in src/types, using JSONB /
-- TEXT[] columns for nested arrays & objects instead of dozens of
-- child join-tables. This keeps the app's data-access layer
-- generic and every module wireable to real CRUD.
--
-- HOW TO RUN: Supabase Dashboard → SQL Editor → paste this whole
-- file → Run. Safe to re-run (drops & recreates app tables only).
-- ============================================================

create extension if not exists pgcrypto;

-- ─── Clean slate (app tables only) ─────────────────────────────
drop table if exists
  contracts, documents, subcontractors, purchase_requests, tools, vehicles,
  employees, assets, boqs, atp_records, atp_templates, integration_records,
  installation_records, survey_reports, evm_metrics, payments, purchase_orders,
  invoices, quotes, stock_movements, inventory_items, warehouses, tasks,
  projects, sites, contacts, companies, opportunities, leads, users
cascade;

-- ─── USERS ──────────────────────────────────────────────────────
create table users (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique,
  name        text not null,
  email       text unique not null,
  role        text not null default 'viewer' check (role in ('admin','pm','engineer','finance','viewer')),
  avatar      text,
  department  text,
  phone       text,
  created_at  timestamptz default now()
);

-- ─── CRM ────────────────────────────────────────────────────────
create table leads (
  id          uuid primary key default gen_random_uuid(),
  company     text not null,
  contact     text,
  email       text,
  phone       text,
  status      text not null default 'new' check (status in ('new','contacted','qualified','unqualified')),
  source      text check (source in ('referral','tender','cold_call','website','partner')),
  value       bigint default 0,
  assigned_to text,
  notes       text,
  created_at  timestamptz default now()
);

create table opportunities (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  customer_id    uuid,
  customer_name  text,
  stage          text not null default 'prospecting' check (stage in ('prospecting','proposal','negotiation','closed_won','closed_lost')),
  value          bigint default 0,
  probability    smallint default 0,
  expected_close date,
  assigned_to    text,
  technologies   text[] default '{}',
  site_count     integer default 0,
  notes          text,
  created_at     timestamptz default now()
);

-- ─── CUSTOMERS ──────────────────────────────────────────────────
create table companies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('telecom_operator','tower_company','vendor','subcontractor','government')),
  country     text default 'Madagascar',
  city        text,
  address     text,
  website     text,
  status      text default 'active' check (status in ('active','inactive')),
  created_at  timestamptz default now()
);

create table contacts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid references companies(id) on delete cascade,
  company_name  text,
  first_name    text not null,
  last_name     text,
  title         text,
  email         text,
  phone         text,
  is_primary    boolean default false,
  created_at    timestamptz default now()
);

-- ─── SITES ──────────────────────────────────────────────────────
create table sites (
  id            uuid primary key default gen_random_uuid(),
  site_id       text unique not null,
  name          text not null,
  region        text not null,
  latitude      numeric(10,7) not null,
  longitude     numeric(10,7) not null,
  altitude      numeric(7,1),
  technology    text[] default '{}',
  status        text not null default 'planned' check (status in ('planned','survey','installation','integration','atp','acceptance','live','decommissioned')),
  priority      text default 'medium' check (priority in ('low','medium','high','critical')),
  tower_type    text check (tower_type in ('greenfield','rooftop','mast','shared_tower')),
  power_source  text check (power_source in ('grid','generator','solar','hybrid')),
  access_type   text default 'road' check (access_type in ('road','offroad','boat')),
  distance_km   numeric(10,2) default 0,
  revenue       bigint default 0,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── PROJECTS ───────────────────────────────────────────────────
create table projects (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  customer_id   uuid,
  customer_name text,
  status        text not null default 'not_started' check (status in ('not_started','in_progress','on_hold','completed','cancelled')),
  current_phase text default 'survey' check (current_phase in ('survey','installation','integration','atp','acceptance')),
  phases        jsonb default '[]',
  start_date    date,
  end_date      date,
  budget        bigint default 0,
  spent         bigint default 0,
  revenue       bigint default 0,
  pm            text,
  team          text[] default '{}',
  progress      smallint default 0,
  region        text,
  created_at    timestamptz default now()
);

-- Junction: one project covers many sites (a multi-site engagement).
-- A site can also appear in several projects over time. See 009.
create table project_sites (
  project_id uuid not null references projects(id) on delete cascade,
  site_id    uuid not null references sites(id)    on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, site_id)
);

-- ─── TASKS ──────────────────────────────────────────────────────
create table tasks (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references projects(id) on delete cascade,
  project_name     text,
  site_id          uuid,
  title            text not null,
  description      text,
  status           text not null default 'todo' check (status in ('backlog','todo','in_progress','review','done')),
  priority         text default 'medium' check (priority in ('low','medium','high','critical')),
  assignee_id      uuid,
  assignee_name    text,
  due_date         date,
  estimated_hours  numeric(6,1) default 0,
  logged_hours     numeric(6,1) default 0,
  phase            text,
  dependencies     text[] default '{}',
  tags             text[] default '{}',
  created_at       timestamptz default now()
);

-- ─── INVENTORY ──────────────────────────────────────────────────
create table warehouses (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  city       text,
  manager    text,
  created_at timestamptz default now()
);

create table inventory_items (
  id             uuid primary key default gen_random_uuid(),
  sku            text unique not null,
  name           text not null,
  category       text not null check (category in ('antenna','radio','router','cable','power_equipment','hardware','tools','transport')),
  brand          text,
  model          text,
  unit           text default 'pcs',
  quantity       integer default 0,
  reserved       integer default 0,
  reorder_point  integer default 0,
  unit_cost      bigint default 0,
  warehouse_id   uuid references warehouses(id),
  warehouse_name text,
  location       text,
  serializable   boolean default false,
  updated_at     timestamptz default now(),
  created_at     timestamptz default now()
);

create table stock_movements (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid references inventory_items(id),
  item_name       text,
  type            text not null check (type in ('in','out','transfer','adjustment')),
  quantity        integer not null,
  from_warehouse  text,
  to_warehouse    text,
  project_id      uuid,
  project_name    text,
  reason          text,
  date            date default current_date,
  performed_by    text,
  created_at      timestamptz default now()
);

-- ─── FINANCE ────────────────────────────────────────────────────
create table quotes (
  id           uuid primary key default gen_random_uuid(),
  number       text unique not null,
  customer_id  uuid,
  customer_name text,
  project_id   uuid,
  status       text not null default 'draft' check (status in ('draft','sent','accepted','rejected','expired')),
  items        jsonb default '[]',
  subtotal     bigint default 0,
  tax_rate     numeric(5,2) default 20,
  tax          bigint default 0,
  total        bigint default 0,
  valid_until  date,
  notes        text,
  created_at   timestamptz default now()
);

create table invoices (
  id            uuid primary key default gen_random_uuid(),
  number        text unique not null,
  customer_id   uuid,
  customer_name text,
  project_id    uuid,
  quote_id      uuid,
  status        text not null default 'draft' check (status in ('draft','sent','partially_paid','paid','overdue','cancelled')),
  items         jsonb default '[]',
  subtotal      bigint default 0,
  tax_rate      numeric(5,2) default 20,
  tax           bigint default 0,
  total         bigint default 0,
  paid          bigint default 0,
  balance       bigint generated always as (total - paid) stored,
  issue_date    date not null default current_date,
  due_date      date not null,
  notes         text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create table purchase_orders (
  id                uuid primary key default gen_random_uuid(),
  number            text unique not null,
  vendor_id         uuid,
  vendor_name       text,
  project_id        uuid,
  status            text not null default 'draft' check (status in ('draft','approved','sent','partial','received','cancelled')),
  items             jsonb default '[]',
  subtotal          bigint default 0,
  tax               bigint default 0,
  total             bigint default 0,
  order_date        date default current_date,
  expected_delivery date,
  notes             text,
  created_at        timestamptz default now()
);

create table payments (
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid references invoices(id) on delete cascade,
  invoice_number text,
  customer_name  text,
  amount         bigint not null,
  date           date default current_date,
  method         text not null check (method in ('bank_transfer','mobile_money','check','cash')),
  reference      text,
  notes          text,
  created_at     timestamptz default now()
);

-- ─── EVM ────────────────────────────────────────────────────────
create table evm_metrics (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid references projects(id) on delete cascade,
  project_name     text,
  customer_name    text,
  po               bigint default 0,
  bac              bigint default 0,
  pv               bigint default 0,
  ev               bigint default 0,
  ac               bigint default 0,
  sv               bigint default 0,
  cv               bigint default 0,
  spi              numeric(6,4) default 1,
  cpi              numeric(6,4) default 1,
  eac              bigint default 0,
  etc              bigint default 0,
  vac              bigint default 0,
  tcpi             numeric(6,4) default 1,
  percent_complete smallint default 0,
  data_date        date default current_date,
  history          jsonb default '[]',
  created_at       timestamptz default now()
);

-- ─── FIELD OPERATIONS ───────────────────────────────────────────
create table survey_reports (
  id                   uuid primary key default gen_random_uuid(),
  site_id              uuid,
  site_code            text,
  site_name            text,
  project_id           uuid,
  status               text not null default 'planned' check (status in ('planned','assigned','survey_started','survey_completed','approved')),
  assigned_to          text[] default '{}',
  scheduled_date       date,
  started_at           timestamptz,
  completed_at         timestamptz,
  approved_at          timestamptz,
  approved_by          text,
  tower_type           text,
  tower_height         numeric(6,1),
  shelter_available    boolean default false,
  shelter_size         text,
  generator_available  boolean default false,
  generator_capacity   text,
  power_source         text,
  transmission_type    text check (transmission_type in ('fiber','mw','vsat','none')),
  accessibility        text check (accessibility in ('easy','moderate','difficult','very_difficult')),
  latitude             numeric(10,7),
  longitude            numeric(10,7),
  altitude             numeric(7,1),
  risks                text,
  comments             text,
  recommendations      text,
  photos               jsonb default '[]',
  engineer_signature   text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table installation_records (
  id                    uuid primary key default gen_random_uuid(),
  site_id               uuid,
  project_id            uuid,
  site_code             text,
  site_name             text,
  project_name          text,
  status                text not null default 'pending' check (status in ('pending','material_delivered','install_started','install_completed','quality_check','approved')),
  team                  text[] default '{}',
  supervisor_id         text,
  material_delivered_at timestamptz,
  started_at            timestamptz,
  completed_at          timestamptz,
  approved_at           timestamptz,
  approved_by           text,
  equipment_installed   jsonb default '[]',
  punch_list            jsonb default '[]',
  photos                jsonb default '[]',
  comments              text,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now()
);

create table integration_records (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid,
  project_id          uuid,
  site_code           text,
  site_name           text,
  project_name        text,
  status              text not null default 'pending' check (status in ('pending','integration_started','testing','integrated','accepted')),
  engineer_id         text,
  started_at          timestamptz,
  completed_at        timestamptz,
  accepted_at         timestamptz,
  bbu_model           text,
  bbu_serial          text,
  rru_models          text[] default '{}',
  mw_link             text,
  mw_frequency        text,
  ip_address          text,
  vlan_id             text,
  neighbor_cells      text[] default '{}',
  vswr                numeric(5,2),
  pim_level           numeric(6,2),
  throughput_d_l      numeric(8,2),
  throughput_u_l      numeric(8,2),
  latency             numeric(6,2),
  commissioning_data  jsonb default '{}',
  photos              jsonb default '[]',
  comments            text,
  created_at          timestamptz default now()
);

-- ─── ATP ────────────────────────────────────────────────────────
create table atp_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  version       text,
  customer      text,
  technologies  text[] default '{}',
  sections      jsonb default '[]',
  created_at    timestamptz default now(),
  is_active     boolean default true
);

create table atp_records (
  id                      uuid primary key default gen_random_uuid(),
  atp_number              text unique not null,
  site_id                 uuid,
  site_name               text,
  site_code               text,
  project_id              uuid,
  template_id             uuid references atp_templates(id),
  template_name           text,
  status                  text not null default 'draft' check (status in ('draft','submitted','reviewed','approved','customer_accepted','failed')),
  results                 jsonb default '[]',
  pass_count              integer default 0,
  fail_count              integer default 0,
  na_count                integer default 0,
  overall_result          text check (overall_result in ('pass','fail','partial')),
  engineer_id             text,
  engineer_name           text,
  engineer_signature      text,
  customer_representative text,
  customer_signature      text,
  submitted_at            timestamptz,
  reviewed_at             timestamptz,
  approved_at             timestamptz,
  customer_accepted_at    timestamptz,
  pdf_url                 text,
  comments                text,
  created_at              timestamptz default now()
);

-- ─── BOQ ────────────────────────────────────────────────────────
create table boqs (
  id                  uuid primary key default gen_random_uuid(),
  boq_number          text unique not null,
  version             integer default 1,
  status              text not null default 'draft' check (status in ('draft','submitted','approved','revised','superseded')),
  project_id          uuid,
  project_name        text,
  customer_id         uuid,
  customer_name       text,
  site_id             uuid,
  site_name           text,
  items               jsonb default '[]',
  subtotal            bigint default 0,
  contingency         bigint default 0,
  contingency_pct     numeric(5,2) default 0,
  grand_total         bigint default 0,
  approved_by         text,
  approved_at         timestamptz,
  created_by          text,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  notes               text,
  previous_version_id uuid
);

-- ─── ASSETS ─────────────────────────────────────────────────────
create table assets (
  id               uuid primary key default gen_random_uuid(),
  asset_tag        text unique not null,
  serial_number    text,
  barcode          text,
  qr_code          text,
  category         text check (category in ('antenna','radio','router','cable','power_equipment','hardware','tools','transport')),
  brand            text,
  model            text,
  description      text,
  status           text not null default 'in_warehouse' check (status in ('in_warehouse','reserved','in_transit','on_vehicle','on_site','installed','defective','under_repair','decommissioned')),
  condition        text default 'new' check (condition in ('new','good','fair','poor','defective')),
  current_location text,
  warehouse_id     uuid,
  vehicle_id       uuid,
  site_id          uuid,
  project_id       uuid,
  purchase_date    date,
  purchase_cost    bigint,
  warranty_expiry  date,
  supplier_name    text,
  po_number        text,
  movements        jsonb default '[]',
  photos           text[] default '{}',
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- ─── RESOURCES ──────────────────────────────────────────────────
create table employees (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid,
  employee_number    text unique,
  name               text not null,
  role               text check (role in ('pm','supervisor','rigger','civil_engineer','rf_engineer','mw_engineer','integration_engineer','hse_officer','driver','helper')),
  department         text,
  email              text,
  phone              text,
  skills             text[] default '{}',
  certifications     jsonb default '[]',
  status             text default 'available' check (status in ('available','assigned','on_leave','sick','training','unavailable')),
  current_project_id uuid,
  current_site_id    uuid,
  daily_rate         bigint default 0,
  joined_at          date default current_date,
  created_at         timestamptz default now()
);

create table vehicles (
  id                 uuid primary key default gen_random_uuid(),
  registration       text unique not null,
  make               text,
  model              text,
  year               integer,
  type               text check (type in ('4x4','pickup','van','crane','flatbed','motorcycle')),
  status             text default 'available' check (status in ('available','in_use','maintenance','breakdown')),
  driver_id          uuid,
  driver_name        text,
  current_project_id uuid,
  last_service_date  date,
  next_service_date  date,
  current_odometer   integer default 0,
  fuel_type          text check (fuel_type in ('petrol','diesel')),
  fuel_logs          jsonb default '[]',
  notes              text,
  created_at         timestamptz default now()
);

create table tools (
  id               uuid primary key default gen_random_uuid(),
  tool_code        text unique not null,
  name             text not null,
  category         text,
  serial_number    text,
  condition        text default 'good' check (condition in ('good','fair','poor','requires_calibration')),
  assigned_to      text,
  assigned_project text,
  last_calibration date,
  next_calibration date,
  returned_at      timestamptz,
  notes            text,
  created_at       timestamptz default now()
);

-- ─── PROCUREMENT ────────────────────────────────────────────────
create table purchase_requests (
  id                uuid primary key default gen_random_uuid(),
  pr_number         text unique not null,
  requested_by      uuid,
  requested_by_name text,
  project_id        uuid,
  project_name      text,
  site_id           uuid,
  urgency           text default 'normal' check (urgency in ('normal','urgent','critical')),
  status            text not null default 'draft' check (status in ('draft','pending_approval','approved','rejected','po_raised','cancelled')),
  items             jsonb default '[]',
  total_estimated   bigint default 0,
  justification     text,
  required_by       date,
  approved_by       text,
  approved_at       timestamptz,
  rejection_reason  text,
  linked_po_id      uuid,
  created_at        timestamptz default now()
);

-- ─── SUBCONTRACTORS ─────────────────────────────────────────────
create table subcontractors (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references companies(id),
  company_name       text,
  contact_person     text,
  email              text,
  phone              text,
  specializations    text[] default '{}',
  technologies       text[] default '{}',
  regions            text[] default '{}',
  contract_value     bigint default 0,
  active_projects    integer default 0,
  completed_projects integer default 0,
  scores             jsonb default '{}',
  incidents          jsonb default '[]',
  certifications     text[] default '{}',
  is_approved        boolean default false,
  approved_at        timestamptz,
  created_at         timestamptz default now()
);

-- ─── DOCUMENTS ──────────────────────────────────────────────────
create table documents (
  id               uuid primary key default gen_random_uuid(),
  doc_number       text unique not null,
  name             text not null,
  type             text check (type in ('contract','po','atp_report','survey_report','drawing','as_built','sow','boq','invoice','nda','safety_plan','method_statement','other')),
  status           text default 'draft' check (status in ('draft','under_review','approved','superseded','archived')),
  version          integer default 1,
  previous_version_id uuid,
  file_url         text,
  file_size        bigint default 0,
  mime_type        text,
  tags             text[] default '{}',
  links            jsonb default '[]',
  uploaded_by      text,
  uploaded_by_name text,
  uploaded_at      timestamptz default now(),
  approved_by      text,
  approved_at      timestamptz,
  expires_at       date,
  description      text,
  is_confidential  boolean default false,
  access_roles     text[] default '{}',
  created_at       timestamptz default now()
);

-- ─── CONTRACTS ──────────────────────────────────────────────────
create table contracts (
  id                 uuid primary key default gen_random_uuid(),
  contract_number    text unique not null,
  customer_id        uuid,
  customer_name      text,
  type               text check (type in ('framework','project','maintenance','supply')),
  value              bigint default 0,
  currency           text default 'MGA',
  start_date         date,
  end_date           date,
  status             text default 'draft' check (status in ('draft','active','completed','terminated','expired')),
  scope_of_work      text,
  payment_terms      text,
  retention_pct      numeric(5,2) default 0,
  penalty_clause     text,
  linked_project_ids text[] default '{}',
  documents          text[] default '{}',
  created_at         timestamptz default now()
);

-- ─── updated_at triggers ────────────────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end;
$$;

create trigger trg_sites_updated_at         before update on sites              for each row execute function set_updated_at();
create trigger trg_inventory_updated_at     before update on inventory_items    for each row execute function set_updated_at();
create trigger trg_invoices_updated_at      before update on invoices           for each row execute function set_updated_at();
create trigger trg_survey_updated_at        before update on survey_reports     for each row execute function set_updated_at();
create trigger trg_install_updated_at       before update on installation_records for each row execute function set_updated_at();
create trigger trg_boq_updated_at           before update on boqs               for each row execute function set_updated_at();
create trigger trg_assets_updated_at        before update on assets             for each row execute function set_updated_at();

-- ─── Row Level Security ─────────────────────────────────────────
-- Real Supabase Auth (email/password) with role-scoped RLS on the core
-- tables. Non-core tables keep open allow_all policies (phase 2 TODO).
-- Canonical copy — the live DB applies it via database/migrations/012_auth_rls.sql.

-- Role helpers (security definer: RLS policies may read `users` w/o recursion).
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.users where auth_id = auth.uid() $$;

create or replace function public.app_has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public
as $$ select public.app_role() = any(roles) $$;

-- users ↔ auth.users sync: on signup/update, upsert the profile row.
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.sync_user_from_auth();
create trigger on_auth_user_updated
  after update of email, raw_user_meta_data on auth.users
  for each row execute function public.sync_user_from_auth();

-- Non-core tables keep the permissive policy (phase 2: role-scope the rest).
do $$
declare t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public'
      and tablename not in ('users','sites','projects','project_sites','tasks','evm_metrics','companies','contacts','invoices','payments')
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "allow_all_%1$s" on public.%1$I for all using (true) with check (true);', t);
  end loop;
end $$;

-- Core tables: role-scoped policies (matrix mirrors ROLE_PERMISSIONS in src/types).
-- users: roster readable by any logged-in user; only admins write.
alter table public.users enable row level security;
drop policy if exists "allow_all_users" on public.users;
create policy "users_read" on public.users
  for select using (auth.uid() is not null);
create policy "users_write_admin" on public.users
  for all
  using (auth.uid() in (select u.auth_id from public.users u where u.role = 'admin'))
  with check (auth.uid() in (select u.auth_id from public.users u where u.role = 'admin'));

-- sites / projects / project_sites / tasks: everyone reads; admin/pm/engineer write.
alter table public.sites enable row level security;
drop policy if exists "allow_all_sites" on public.sites;
create policy "sites_read" on public.sites for select using (public.app_role() is not null);
create policy "sites_write" on public.sites for insert/update/delete
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

alter table public.projects enable row level security;
drop policy if exists "allow_all_projects" on public.projects;
create policy "projects_read" on public.projects for select using (public.app_role() is not null);
create policy "projects_write" on public.projects for insert/update/delete
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

alter table public.project_sites enable row level security;
drop policy if exists "allow_all_project_sites" on public.project_sites;
create policy "project_sites_read" on public.project_sites for select using (public.app_role() is not null);
create policy "project_sites_write" on public.project_sites for insert/update/delete
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

alter table public.tasks enable row level security;
drop policy if exists "allow_all_tasks" on public.tasks;
create policy "tasks_read" on public.tasks for select using (public.app_has_role(array['admin','pm','engineer']));
create policy "tasks_write" on public.tasks for insert/update/delete
  using (public.app_has_role(array['admin','pm','engineer']))
  with check (public.app_has_role(array['admin','pm','engineer']));

-- evm_metrics / companies / contacts / invoices / payments: admin/pm/finance.
alter table public.evm_metrics enable row level security;
drop policy if exists "allow_all_evm_metrics" on public.evm_metrics;
create policy "evm_metrics_read" on public.evm_metrics for select using (public.app_has_role(array['admin','pm','finance']));
create policy "evm_metrics_write" on public.evm_metrics for insert/update/delete
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.companies enable row level security;
drop policy if exists "allow_all_companies" on public.companies;
create policy "companies_read" on public.companies for select using (public.app_has_role(array['admin','pm','finance']));
create policy "companies_write" on public.companies for insert/update/delete
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.contacts enable row level security;
drop policy if exists "allow_all_contacts" on public.contacts;
create policy "contacts_read" on public.contacts for select using (public.app_has_role(array['admin','pm','finance']));
create policy "contacts_write" on public.contacts for insert/update/delete
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.invoices enable row level security;
drop policy if exists "allow_all_invoices" on public.invoices;
create policy "invoices_read" on public.invoices for select using (public.app_has_role(array['admin','pm','finance']));
create policy "invoices_write" on public.invoices for insert/update/delete
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

alter table public.payments enable row level security;
drop policy if exists "allow_all_payments" on public.payments;
create policy "payments_read" on public.payments for select using (public.app_has_role(array['admin','pm','finance']));
create policy "payments_write" on public.payments for insert/update/delete
  using (public.app_has_role(array['admin','pm','finance']))
  with check (public.app_has_role(array['admin','pm','finance']));

-- ─── Realtime (optional, nice for live dashboards) ───────────────
alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table sites;
alter publication supabase_realtime add table projects;

-- ─── Seed: a starter admin user so the login screen has someone ──
insert into users (name, email, role, avatar, department, phone) values
  ('Malala', 'malala@manongadoria.mg', 'admin', '', 'Direction', '');
