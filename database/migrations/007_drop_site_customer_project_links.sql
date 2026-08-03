-- ============================================================
-- TelecomERP — Sites: drop customer/project link columns
--
-- The link direction is project → site: the project form picks
-- its site (projects.site_id). The site's own reverse/denormalized
-- customer_id / customer_name / project_id / project_name columns
-- are redundant (customer comes from the project too) and were
-- removed from the form and UI — the site module now keeps only
-- site information and description.
--
-- Idempotent: safe to run multiple times (drop column if exists).
-- Destructive for the four obsolete columns (user-approved).
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.sites
  drop column if exists customer_id;

alter table public.sites
  drop column if exists customer_name;

alter table public.sites
  drop column if exists project_id;

alter table public.sites
  drop column if exists project_name;
