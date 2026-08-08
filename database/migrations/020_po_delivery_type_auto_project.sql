-- 020: auto-create a supply/trading Project from a SUPPLY PO marked Accepted.
--
-- Adds to purchase_orders:
--   - delivery_type ('ASP' | 'SUPPLY', nullable, no default — set per PO)
--   - quote_id (real link to the Quote the PO came from, set by the
--     quote-accepted automation; also matched by number in notes as fallback)
--   - status 'accepted' added to the status CHECK (was draft/approved/sent/
--     partial/received/cancelled)
--
-- Adds insert_project_with_goods(jsonb, jsonb): inserts a Project row + its
-- project_supply_items rows in ONE transaction and returns the new Project as
-- jsonb. The client builds the payload (financeWorkflows.projectFromSupplyPo)
-- and calls it via supabase.rpc so the two inserts cannot half-complete.
-- Default security invoker: the caller's RLS still applies (projects_write
-- requires a write-capable role, matching the UI grants).
--
-- All idempotent; safe on the live DB.

alter table public.purchase_orders add column if not exists delivery_type text
  check (delivery_type in ('ASP','SUPPLY'));

alter table public.purchase_orders add column if not exists quote_id uuid
  references public.quotes(id) on delete set null;

alter table public.purchase_orders drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft','approved','sent','partial','accepted','received','cancelled'));

create or replace function public.insert_project_with_goods(
  p_project jsonb,
  p_goods   jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_row   public.projects;
  v_item  jsonb;
begin
  insert into public.projects (
    name, customer_id, customer_name, status, current_phase, phases,
    start_date, end_date, budget, spent, revenue, pm, team, progress, region,
    project_type, customer_contact, delivery_deadline, delivery_address,
    delivery_status, po_reference, notes
  ) values (
    p_project ->> 'name',
    nullif(p_project ->> 'customerId', '')::uuid,
    p_project ->> 'customerName',
    coalesce(p_project ->> 'status', 'not_started'),
    coalesce(p_project ->> 'currentPhase', 'survey'),
    coalesce(p_project -> 'phases', '[]'::jsonb),
    nullif(p_project ->> 'startDate', '')::date,
    nullif(p_project ->> 'endDate', '')::date,
    coalesce((p_project ->> 'budget')::bigint, 0),
    coalesce((p_project ->> 'spent')::bigint, 0),
    coalesce((p_project ->> 'revenue')::bigint, 0),
    p_project ->> 'pm',
    coalesce((p_project -> 'team')::text[], '{}'::text[]),
    coalesce((p_project ->> 'progress')::smallint, 0),
    p_project ->> 'region',
    coalesce(p_project ->> 'projectType', 'supply_trading'),
    p_project ->> 'customerContact',
    nullif(p_project ->> 'deliveryDeadline', '')::date,
    p_project ->> 'deliveryAddress',
    coalesce(p_project ->> 'deliveryStatus', 'pending'),
    p_project ->> 'poReference',
    p_project ->> 'notes'
  )
  returning * into v_row;

  for v_item in select * from jsonb_array_elements(coalesce(p_goods, '[]'::jsonb))
  loop
    insert into public.project_supply_items (
      project_id, code, description, unit, qty, purchase_price, selling_price
    ) values (
      v_row.id,
      v_item ->> 'code',
      v_item ->> 'description',
      coalesce(nullif(v_item ->> 'unit', ''), 'U'),
      coalesce((v_item ->> 'qty')::numeric, 1),
      coalesce((v_item ->> 'purchasePrice')::numeric, 0),
      coalesce((v_item ->> 'sellingPrice')::numeric, 0)
    );
  end loop;

  return to_jsonb(v_row);
end;
$$;
