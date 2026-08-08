-- 021: delivery_type lives on the Quote and follows the chain
-- (Quote → PO → Invoice → Payment), per user revision of the auto-project flow.
--
--   - quotes.delivery_type     (chosen here: 'ASP' | 'SUPPLY', no default)
--   - invoices.delivery_type   (inherited from the PO at creation)
--   - payments.delivery_type   (inherited from the invoice at creation)
--
-- purchase_orders.delivery_type already exists (020) and is now set
-- automatically from the quote instead of being hand-picked on the PO.
-- The auto-Project trigger fires on PO status = received: SUPPLY → supply/
-- trading project, ASP → telecom_service project (see financeWorkflows).
--
-- All idempotent; safe on the live DB.

alter table public.quotes add column if not exists delivery_type text
  check (delivery_type in ('ASP','SUPPLY'));

alter table public.invoices add column if not exists delivery_type text
  check (delivery_type in ('ASP','SUPPLY'));

alter table public.payments add column if not exists delivery_type text
  check (delivery_type in ('ASP','SUPPLY'));
