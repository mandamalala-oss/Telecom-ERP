-- 036: payment schedules (milestone billing tied to PAC / FAC).
-- A schedule is a reusable template of milestones (percent of project
-- revenue). Applying a schedule to a project expands it into
-- project_payment_milestones rows; the 'advance' milestone is invoiced on
-- apply, PAC/FAC milestones are invoiced when the matching acceptance
-- certificate is signed. Idempotent: create-if-not-exists + guarded seed.

create table if not exists public.payment_schedules (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  milestones  jsonb default '[]',
  is_active   boolean default true,
  created_at  timestamptz default now()
);

create table if not exists public.project_payment_milestones (
  id                      uuid primary key default gen_random_uuid(),
  project_id              uuid references projects(id) on delete cascade,
  project_name            text,
  schedule_id             uuid references payment_schedules(id),
  schedule_name           text,
  name                    text not null,
  pct                     numeric(5,2) default 0,
  trigger                 text not null default 'manual' check (trigger in ('advance','PAC','FAC','manual')),
  due_days                integer default 0,
  amount                  bigint default 0,
  status                  text not null default 'pending' check (status in ('pending','invoiced','paid','cancelled')),
  invoice_id              uuid references invoices(id),
  invoice_number          text,
  trigger_certificate_id  uuid references acceptance_certificates(id),
  due_date                date,
  invoiced_at             timestamptz,
  created_at              timestamptz default now()
);

alter table projects add column if not exists payment_schedule_id   uuid;
alter table projects add column if not exists payment_schedule_name text;

-- Non-core tables: permissive RLS, matching the schema.sql convention.
alter table public.payment_schedules enable row level security;
drop policy if exists "allow_all_payment_schedules" on public.payment_schedules;
create policy "allow_all_payment_schedules" on public.payment_schedules for all using (true) with check (true);

alter table public.project_payment_milestones enable row level security;
drop policy if exists "allow_all_project_payment_milestones" on public.project_payment_milestones;
create policy "allow_all_project_payment_milestones" on public.project_payment_milestones for all using (true) with check (true);

-- Seed the two standard modes (only when absent, so re-runs are safe).
insert into public.payment_schedules (name, description, milestones, is_active)
select
  '20/65/15 — Advance / PAC / FAC',
  '20% advance before works, 65% after preliminary acceptance (PAC), 15% after final acceptance (FAC).',
  '[{"id":"adv","name":"Advance","pct":20,"trigger":"advance","dueDays":0},{"id":"pac","name":"After PAC","pct":65,"trigger":"PAC","dueDays":0},{"id":"fac","name":"After FAC","pct":15,"trigger":"FAC","dueDays":0}]'::jsonb,
  true
where not exists (select 1 from public.payment_schedules where name = '20/65/15 — Advance / PAC / FAC');

insert into public.payment_schedules (name, description, milestones, is_active)
select
  '100% after FAC (90 days)',
  'Full payment 90 days after final acceptance (FAC).',
  '[{"id":"fac","name":"After FAC (90d)","pct":100,"trigger":"FAC","dueDays":90}]'::jsonb,
  true
where not exists (select 1 from public.payment_schedules where name = '100% after FAC (90 days)');
