-- ============================================================
-- TelecomERP — Data repair: backfill FK ids from name columns
--
-- The company/customer/vendor lookups used to store only the
-- denormalized *name* (e.g. company_name) and never the FK id,
-- so cross-module "pull" views (company detail → contacts,
-- customer revenue from invoices, …) were empty. The configs are
-- fixed to populate the FK on save (entityConfigs.ts); this
-- migration repairs rows created before that fix.
--
-- Backfills the FK id by matching the stored name against
-- companies.name. Only fills NULL ids — idempotent, safe to
-- re-run. Caveat: two companies with identical names would match
-- arbitrarily; verify after running if you have duplicates.
--
-- How to run: Supabase Dashboard → SQL Editor → paste → Run.
-- ============================================================

update public.contacts c
  set company_id = cm.id
  from public.companies cm
  where c.company_id is null and c.company_name = cm.name;

update public.subcontractors s
  set company_id = cm.id
  from public.companies cm
  where s.company_id is null and s.company_name = cm.name;

update public.opportunities o
  set customer_id = cm.id
  from public.companies cm
  where o.customer_id is null and o.customer_name = cm.name;

update public.sites s
  set customer_id = cm.id
  from public.companies cm
  where s.customer_id is null and s.customer_name = cm.name;

update public.projects p
  set customer_id = cm.id
  from public.companies cm
  where p.customer_id is null and p.customer_name = cm.name;

update public.quotes q
  set customer_id = cm.id
  from public.companies cm
  where q.customer_id is null and q.customer_name = cm.name;

update public.invoices i
  set customer_id = cm.id
  from public.companies cm
  where i.customer_id is null and i.customer_name = cm.name;

update public.boqs b
  set customer_id = cm.id
  from public.companies cm
  where b.customer_id is null and b.customer_name = cm.name;

update public.contracts c
  set customer_id = cm.id
  from public.companies cm
  where c.customer_id is null and c.customer_name = cm.name;

update public.purchase_orders po
  set vendor_id = cm.id
  from public.companies cm
  where po.vendor_id is null and po.vendor_name = cm.name;
