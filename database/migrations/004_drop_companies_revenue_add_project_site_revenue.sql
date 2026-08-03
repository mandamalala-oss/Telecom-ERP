-- ============================================================
-- TelecomERP — Revenue model fix
--
-- companies.revenue was a single hand-typed number on a record
-- that is created once but has many projects over time — it can
-- only ever hold one value and drifts from invoices/payments.
-- Customer-level revenue is now computed from invoices/payments
-- (sum of paid) instead of stored.
--
-- Revenue (contract / booked value) now lives on the commercial
-- units instead:
--   projects.revenue  — project-level contract revenue
--   sites.revenue     — per-site revenue contribution
--
-- Idempotent: safe to run multiple times. Destructive only for
-- the obsolete companies.revenue column (user-approved; the
-- stored values were manual and are replaced by computed ones).
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.companies
  drop column if exists revenue;

alter table public.projects
  add column if not exists revenue bigint default 0;

alter table public.sites
  add column if not exists revenue bigint default 0;
