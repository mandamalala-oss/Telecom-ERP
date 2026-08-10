-- 026: create the boqs table on the live DB (the module was shipped with
-- schema.sql only — no migration — so the table is missing in Supabase and
-- every BOQ query failed with "relation boqs does not exist").
-- Mirrors database/schema.sql exactly; idempotent (create if not exists +
-- drop-if-exists trigger/policy); safe to run on any environment.

create table if not exists public.boqs (
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

drop trigger if exists trg_boq_updated_at on public.boqs;
create trigger trg_boq_updated_at
  before update on public.boqs
  for each row execute function set_updated_at();

-- Non-core table: permissive RLS, matching the schema.sql convention.
alter table public.boqs enable row level security;
drop policy if exists "allow_all_boqs" on public.boqs;
create policy "allow_all_boqs" on public.boqs for all using (true) with check (true);
