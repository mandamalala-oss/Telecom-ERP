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
