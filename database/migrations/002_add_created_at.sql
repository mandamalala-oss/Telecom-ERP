-- ============================================================
-- TelecomERP — Additive migration: created_at columns
--
-- Use this on an EXISTING database that already has data.
-- Unlike database/schema.sql (which drops & recreates tables),
-- this only ADDS columns — nothing is deleted.
--
-- Idempotent: safe to run multiple times.
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.inventory_items
  add column if not exists created_at timestamptz default now();

alter table public.stock_movements
  add column if not exists created_at timestamptz default now();

alter table public.evm_metrics
  add column if not exists created_at timestamptz default now();

alter table public.employees
  add column if not exists created_at timestamptz default now();

alter table public.vehicles
  add column if not exists created_at timestamptz default now();

alter table public.tools
  add column if not exists created_at timestamptz default now();

alter table public.documents
  add column if not exists created_at timestamptz default now();
