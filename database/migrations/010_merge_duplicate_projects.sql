-- 010_merge_duplicate_projects.sql
-- DATA REPAIR SCRIPT — REVIEW BEFORE RUNNING, NOT idempotent-by-design.
--
-- Background: with the old 1:1 model (005) a multi-site engagement was often
-- created as several project rows with the SAME name + customer (one per
-- site). After 009 restores project → many sites, those duplicates should be
-- consolidated into ONE project covering all its sites.
--
-- What it does, per duplicate (name, customer_name) group:
--   • keeps the EARLIEST project row as the survivor,
--   • unions the linked sites (project_sites),
--   • remaps every child row (tasks, quotes, invoices, POs, install/integration
--     records, BOQs, assets, …) to the survivor,
--   • collapses the survivor's EVM records into one (base inputs summed,
--     derived metrics re-derived, histories merged),
--   • SUMS budget / spent / revenue into the survivor (the per-site rows were
--     split by the 1:1 model),
--   • deletes the duplicate project rows.
--
-- ⚠️ BACKUP the DB first (Supabase → Database → Backup, or a pg_dump).
-- ⚠️ Run it AFTER migration 009, and review the RAISE NOTICE lines it prints.
-- ⚠️ Rollback = restore from backup. There is no undo.

do $$
declare
  g    record;
  surv uuid;
  d    uuid;
  keep uuid;
  cnt  int;
begin
  -- 1) Merge duplicate project rows.
  for g in
    select name, customer_name, count(*) as cnt
    from projects
    group by name, customer_name
    having count(*) > 1
  loop
    select id into surv
    from projects
    where name = g.name
      and coalesce(customer_name, '') = coalesce(g.customer_name, '')
    order by created_at asc nulls last, id asc
    limit 1;

    cnt := 0;
    for d in
      select id from projects
      where name = g.name
        and coalesce(customer_name, '') = coalesce(g.customer_name, '')
        and id <> surv
      order by created_at desc, id desc
    loop
      cnt := cnt + 1;

      -- sites: union into survivor, then drop the dupe's links
      insert into project_sites (project_id, site_id)
      select surv, site_id from project_sites where project_id = d
      on conflict (project_id, site_id) do nothing;
      delete from project_sites where project_id = d;

      -- child rows → survivor (every table with a project_id column)
      update tasks                set project_id = surv where project_id = d;
      update stock_movements      set project_id = surv where project_id = d;
      update quotes               set project_id = surv where project_id = d;
      update invoices             set project_id = surv where project_id = d;
      update purchase_orders      set project_id = surv where project_id = d;
      update evm_metrics          set project_id = surv where project_id = d;
      update survey_reports       set project_id = surv where project_id = d;
      update installation_records set project_id = surv where project_id = d;
      update integration_records  set project_id = surv where project_id = d;
      update atp_records          set project_id = surv where project_id = d;
      update boqs                 set project_id = surv where project_id = d;
      update assets               set project_id = surv where project_id = d;
      update purchase_requests    set project_id = surv where project_id = d;
      update employees            set current_project_id = surv where current_project_id = d;
      update vehicles             set current_project_id = surv where current_project_id = d;
      update contracts
      set linked_project_ids = (
        select array_agg(case when x = d::text then surv::text else x end)
        from unnest(linked_project_ids) x
      )
      where linked_project_ids && array[d::text];

      -- financials: sum into the survivor (the duplicates were split per site)
      update projects set
        budget  = budget  + coalesce((select budget  from projects where id = d), 0),
        spent   = spent   + coalesce((select spent   from projects where id = d), 0),
        revenue = revenue + coalesce((select revenue from projects where id = d), 0)
      where id = surv;

      delete from projects where id = d;
    end loop;

    raise notice 'MERGED % duplicate row(s) of project "%" (customer=%) into survivor %',
      cnt, g.name, coalesce(g.customer_name, 'NULL'), surv;
  end loop;

  -- 2) Collapse any project that now has multiple EVM records (from the merge
  --    above, or from older data): sum BAC/PV/EV/AC, re-derive metrics exactly
  --    like src/lib/evm.ts deriveEVM, merge history, keep earliest data date.
  for g in
    select project_id from evm_metrics group by project_id having count(*) > 1
  loop
    select id into keep
    from evm_metrics
    where project_id = g.project_id
    order by created_at asc nulls last, id asc
    limit 1;

    with agg as (
      select project_id,
             sum(bac) as bac, sum(pv) as pv, sum(ev) as ev, sum(ac) as ac,
             min(data_date) as data_date
      from evm_metrics
      where project_id = g.project_id
      group by project_id
    )
    update evm_metrics em set
      bac              = a.bac,
      pv               = a.pv,
      ev               = a.ev,
      ac               = a.ac,
      data_date        = a.data_date,
      history          = coalesce((
        select jsonb_agg(s order by s->>'date')
        from evm_metrics e, jsonb_array_elements(e.history) s
        where e.project_id = a.project_id
      ), '[]'::jsonb),
      sv               = a.ev - a.pv,
      cv               = a.ev - a.ac,
      spi              = case when a.pv > 0 then round((a.ev::numeric / a.pv)::numeric, 4) else 0 end,
      cpi              = case when a.ac > 0 then round((a.ev::numeric / a.ac)::numeric, 4) else 0 end,
      eac              = case when a.ac > 0 and a.ev > 0 then round((a.bac::numeric * a.ac) / a.ev)::bigint else 0 end,
      etc              = case when a.ac > 0 and a.ev > 0 then round((a.bac::numeric * a.ac) / a.ev - a.ac)::bigint else 0 end,
      vac              = a.bac - case when a.ac > 0 and a.ev > 0 then round((a.bac::numeric * a.ac) / a.ev)::bigint else 0 end,
      tcpi             = case when a.bac <> a.ac then round(((a.bac - a.ev)::numeric / (a.bac - a.ac))::numeric, 4) else 0 end,
      percent_complete = case when a.bac > 0 then round((a.ev::numeric / a.bac) * 100)::smallint else 0 end
    from agg a
    where em.id = keep;

    delete from evm_metrics where project_id = g.project_id and id <> keep;
    raise notice 'COLLAPSED EVM records for project % into one row', g.project_id;
  end loop;

  raise notice 'DONE — verify with: select name, customer_name, count(*) from projects group by 1,2 having count(*) > 1;';
end $$;
