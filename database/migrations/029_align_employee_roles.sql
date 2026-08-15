-- 029: align employees.role with the Team-module roles + field crew.
--
-- Resource Mgmt Role becomes: Team Leader, Technician, Rigger, Driver,
-- Inspector, Manager, CEO (display strings, same vocabulary as the Team
-- module). Existing snake_case roles are mapped over best-effort, then the
-- check constraint is recreated against the new vocabulary.

update public.employees set role = case role
  when 'team_leader' then 'Team Leader'
  when 'technician'  then 'Technician'
  when 'rigger'      then 'Rigger'
  when 'driver'      then 'Driver'
  when 'pm'          then 'Manager'
  when 'supervisor'  then 'Manager'
  when 'hse_officer' then 'Inspector'
  else 'Technician'  -- civil_engineer / rf_engineer / mw_engineer / integration_engineer / helper
end
where role is not null;

alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees add constraint employees_role_check check (
  role in ('Team Leader','Technician','Rigger','Driver','Inspector','Manager','CEO')
);
