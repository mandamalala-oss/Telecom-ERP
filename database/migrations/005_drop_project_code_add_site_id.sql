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
