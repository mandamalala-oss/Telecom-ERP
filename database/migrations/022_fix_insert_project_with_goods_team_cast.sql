-- 022: fix insert_project_with_goods — `jsonb -> 'team'::text[]` cast does not
-- exist in Postgres and only fails at first execution (plpgsql resolves casts
-- lazily), so the PO-received auto-Project AND the auto-Invoice were both
-- blocked by "cannot cast type jsonb to text[]". Recreate the function with
-- jsonb_array_elements_text for the team array. Idempotent; safe on the live
-- DB (run after 020).

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
    -- No jsonb→text[] cast exists in Postgres; collect the array via
    -- jsonb_array_elements_text (NULL/[] → NULL → '{}').
    coalesce((select array(select jsonb_array_elements_text(p_project -> 'team'))), '{}'::text[]),
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
