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
