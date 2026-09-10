-- 035: PAC / FAC acceptance certificates.
-- ATP stays the test evidence; a certificate is the formal customer
-- acceptance that follows it. PAC (preliminary) is issued after install +
-- ATP tests pass; FAC (final) is issued after the defect liability period
-- once every punch-list item is closed. Mirrors database/schema.sql;
-- idempotent (create if not exists + drop-if-exists trigger/policy).

create table if not exists public.acceptance_certificates (
  id                      uuid primary key default gen_random_uuid(),
  certificate_number      text unique not null,
  type                    text not null check (type in ('PAC','FAC')),
  site_id                 uuid,
  site_name               text,
  site_code               text,
  project_id              uuid,
  project_name            text,
  atp_record_id           uuid references atp_records(id),
  atp_number              text,
  status                  text not null default 'draft' check (status in ('draft','submitted','reviewed','issued','signed','rejected')),
  punch_list              jsonb default '[]',
  dlp_start_date          date,
  dlp_end_date            date,
  previous_certificate_id uuid references acceptance_certificates(id),
  engineer_name           text,
  engineer_signature      text,
  customer_representative text,
  customer_signature      text,
  issued_at               timestamptz,
  signed_at               timestamptz,
  pdf_url                 text,
  comments                text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

drop trigger if exists trg_acceptance_certificates_updated_at on public.acceptance_certificates;
create trigger trg_acceptance_certificates_updated_at
  before update on public.acceptance_certificates
  for each row execute function set_updated_at();

-- Non-core table: permissive RLS, matching the schema.sql convention.
alter table public.acceptance_certificates enable row level security;
drop policy if exists "allow_all_acceptance_certificates" on public.acceptance_certificates;
create policy "allow_all_acceptance_certificates" on public.acceptance_certificates for all using (true) with check (true);
