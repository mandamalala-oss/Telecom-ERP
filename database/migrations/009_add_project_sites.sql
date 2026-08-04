-- 009_add_project_sites.sql
-- Restore "one project → many sites" (reverses the 1:1 site_id from 005)
-- using a proper junction table instead of the old projects.site_ids text[].
--
-- Idempotent. RUN AFTER 005–008. Safe on live data: existing single-site
-- links (projects.site_id) are copied into project_sites first, then the
-- now-redundant column is dropped.

create table if not exists project_sites (
  project_id uuid not null references projects(id) on delete cascade,
  site_id    uuid not null references sites(id)    on delete cascade,
  created_at timestamptz default now(),
  primary key (project_id, site_id)
);

-- Carry over the single-site links created by migration 005.
insert into project_sites (project_id, site_id)
select id, site_id from projects
where site_id is not null
on conflict (project_id, site_id) do nothing;

-- 005 added projects.site_id; the junction now owns the relationship.
alter table projects drop column if exists site_id;

-- Sanity check: every project should appear with its sites in the junction.
-- select p.name, count(ps.site_id) as sites
-- from projects p left join project_sites ps on ps.project_id = p.id
-- group by p.id order by p.name;
