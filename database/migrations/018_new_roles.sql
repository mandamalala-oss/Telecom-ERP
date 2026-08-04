-- 018_new_roles.sql
-- Team roles → CEO / Manager / Inspector / Team Leader; departments list
-- (Direction, HSE, Logistic, Project) is handled by the app form.
--
-- Run AFTER 012–017 on the LIVE DB (fresh DBs get everything from the
-- updated schema.sql). Idempotent. Migrates existing roles:
--   admin → CEO · pm → Manager · finance → Manager · engineer → Inspector · viewer → Team Leader
-- and re-applies the role-scoped RLS policies with the new role names.

-- 1) Migrate existing users.
update public.users set role = case role
  when 'admin'   then 'CEO'
  when 'pm'      then 'Manager'
  when 'finance' then 'Manager'
  when 'engineer' then 'Inspector'
  when 'viewer'  then 'Team Leader'
  else role
end;

-- 2) New role check constraint + default.
alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check
  check (role in ('CEO','Manager','Inspector','Team Leader'));
alter table public.users alter column role set default 'Team Leader';

-- 3) Recreate the sync trigger with the new default role.
create or replace function public.sync_user_from_auth() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.users (id, auth_id, name, email, role)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.email,
    'Team Leader'
  )
  on conflict (email) do update
    set auth_id = excluded.auth_id,
        name    = excluded.name;
  return new;
end;
$$;

-- 4) Re-apply role-scoped policies with the new role names.
drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin" on public.users
  for all
  using (public.app_has_role(array['CEO']))
  with check (public.app_has_role(array['CEO']));

drop policy if exists "sites_write" on public.sites;
create policy "sites_write" on public.sites for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "projects_write" on public.projects;
create policy "projects_write" on public.projects for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "project_sites_write" on public.project_sites;
create policy "project_sites_write" on public.project_sites for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "tasks_read" on public.tasks;
create policy "tasks_read" on public.tasks for select
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));
drop policy if exists "tasks_write" on public.tasks;
create policy "tasks_write" on public.tasks for all
  using (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']))
  with check (public.app_has_role(array['CEO','Manager','Team Leader','Inspector']));

drop policy if exists "evm_metrics_read" on public.evm_metrics;
create policy "evm_metrics_read" on public.evm_metrics for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "evm_metrics_write" on public.evm_metrics;
create policy "evm_metrics_write" on public.evm_metrics for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "companies_read" on public.companies;
create policy "companies_read" on public.companies for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "companies_write" on public.companies;
create policy "companies_write" on public.companies for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "contacts_read" on public.contacts;
create policy "contacts_read" on public.contacts for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "contacts_write" on public.contacts;
create policy "contacts_write" on public.contacts for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "invoices_read" on public.invoices;
create policy "invoices_read" on public.invoices for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "invoices_write" on public.invoices;
create policy "invoices_write" on public.invoices for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

drop policy if exists "payments_read" on public.payments;
create policy "payments_read" on public.payments for select
  using (public.app_has_role(array['CEO','Manager']));
drop policy if exists "payments_write" on public.payments;
create policy "payments_write" on public.payments for all
  using (public.app_has_role(array['CEO','Manager']))
  with check (public.app_has_role(array['CEO','Manager']));

-- Verify:
-- select role, count(*) from public.users group by role;
-- select email, role from public.users where email = 'admin@manongadoria.mg';
