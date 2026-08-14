-- 028: field-operation team assignment from Resource Mgmt + Field Operation ↔ Project link.
--
-- Field operations (survey / installation / integration) now pick a crew
-- (1 Team Leader, 1 Technician, 1 Rigger, 1 Driver — each optional) and a
-- vehicle directly from Resource Mgmt. Assigning them flips the resource's
-- status (employee → 'assigned', vehicle → 'in_use') so it shows as no
-- longer available. Idempotent (drop-if-exists / add-if-not-exists).

-- 1) New employee roles for the crew.
alter table public.employees drop constraint if exists employees_role_check;
alter table public.employees add constraint employees_role_check check (
  role in ('pm','supervisor','rigger','civil_engineer','rf_engineer','mw_engineer',
           'integration_engineer','hse_officer','driver','helper','team_leader','technician')
);

-- 2) survey_reports: project name for the Project link + crew/vehicle slots.
alter table public.survey_reports
  add column if not exists project_name   text,
  add column if not exists team_leader_id uuid,
  add column if not exists technician_id  uuid,
  add column if not exists rigger_id      uuid,
  add column if not exists driver_id      uuid,
  add column if not exists vehicle_id     uuid;

-- 3) installation_records: crew/vehicle slots (project_id/project_name already exist).
alter table public.installation_records
  add column if not exists team_leader_id uuid,
  add column if not exists technician_id  uuid,
  add column if not exists rigger_id      uuid,
  add column if not exists driver_id      uuid,
  add column if not exists vehicle_id     uuid;

-- 4) integration_records: crew/vehicle slots.
alter table public.integration_records
  add column if not exists team_leader_id uuid,
  add column if not exists technician_id  uuid,
  add column if not exists rigger_id      uuid,
  add column if not exists driver_id      uuid,
  add column if not exists vehicle_id     uuid;
