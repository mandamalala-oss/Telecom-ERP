-- 019: supply/trading project line.
-- Adds a project-type discriminator, delivery fields, and the goods-line
-- table for 'supply_trading' projects. All idempotent; safe on the live DB.
alter table public.projects add column if not exists project_type text
  default 'telecom_service'
  check (project_type in ('telecom_service','supply_trading'));

alter table public.projects add column if not exists customer_contact text;
alter table public.projects add column if not exists delivery_deadline date;
alter table public.projects add column if not exists delivery_address text;
alter table public.projects add column if not exists delivery_status text
  default 'pending'
  check (delivery_status in ('pending','partial','delivered'));
alter table public.projects add column if not exists po_reference text;
alter table public.projects add column if not exists notes text;

-- Goods lines for supply/trading projects. Computed values (total_selling,
-- total_cost, margin) are derived in TypeScript, not stored.
create table if not exists public.project_supply_items (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references public.projects(id) on delete cascade,
  code           text,
  description    text not null,
  unit           text default 'U',
  qty            numeric not null default 1,
  purchase_price numeric not null default 0,
  selling_price  numeric not null default 0,
  created_at     timestamptz default now()
);

-- RLS phase 2 (allow_all), consistent with the other non-core tables.
alter table public.project_supply_items enable row level security;
drop policy if exists "allow_all_project_supply_items" on public.project_supply_items;
create policy "allow_all_project_supply_items" on public.project_supply_items
  for all using (true) with check (true);
