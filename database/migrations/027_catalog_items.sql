-- 027: catalog_items (RAN/MW unit-price catalog for the BOQ item picker).
--
-- One-off import lives in scripts/importCatalog.mjs (reads BOQ.csv / MW.csv).
-- Mirrors database/schema.sql exactly; idempotent (type via DO-block guard,
-- create table if not exists, add column if not exists, drop-if-exists
-- trigger/policy); safe to run on any environment.

-- network_type enum: shared by catalog_items and boqs.network_type.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'network_type') then
    create type network_type as enum ('RAN', 'MW');
  end if;
end
$$;

create table if not exists public.catalog_items (
  id           uuid primary key default gen_random_uuid(),
  network_type network_type not null,
  item_code    text not null,          -- SI, e.g. P394659
  description  text not null,          -- NEW DESCRIPTION
  comments     text,                   -- Comments column
  unit_cost    numeric not null,       -- parsed from Contract, e.g. 400000
  default_qty  numeric default 1,      -- QTY column, fallback 1
  remarks      text,
  category     text default 'other',   -- civil/supply/installation/integration/testing/pm/hse/other
  unit         text default 'lot',
  created_at   timestamptz default now()
);

create index if not exists idx_catalog_items_network on public.catalog_items (network_type);
create index if not exists idx_catalog_items_search on public.catalog_items
  using gin (to_tsvector('simple', item_code || ' ' || description));

-- BOQs are classified per network; the column is nullable so pre-existing
-- rows keep NULL until re-saved through the form (which requires RAN|MW).
alter table public.boqs add column if not exists network_type network_type;

-- Non-core table: permissive RLS, matching the schema.sql convention.
alter table public.catalog_items enable row level security;
drop policy if exists "allow_all_catalog_items" on public.catalog_items;
create policy "allow_all_catalog_items" on public.catalog_items for all using (true) with check (true);
