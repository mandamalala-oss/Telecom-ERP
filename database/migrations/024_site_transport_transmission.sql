-- 024: telecom site access & transmission fields (per user 2026-08).
--   - means_of_transport      text[] — checkbox multi-select (more than one
--     means allowed; replaces the old single-choice access_type concept,
--     which stays for existing data)
--   - transport_length_km     numeric — length of the transport leg in km
--   - walk_distance_km        numeric — distance from the end of the 4x4
--     track to the site (on foot) in km
--   - transmission_type       text — MW | VSAT | STARLINK | OF
-- (sites.technology is already text[]; the form now edits it via checkboxes
--  instead of the comma-separated tags input — no schema change needed.)
-- All idempotent; safe on the live DB.

alter table public.sites add column if not exists means_of_transport text[] default '{}';
alter table public.sites add column if not exists transport_length_km numeric(10,2) default 0;
alter table public.sites add column if not exists walk_distance_km numeric(10,2) default 0;
alter table public.sites add column if not exists transmission_type text;
