-- 030: Project Manager on field operations.
--
-- Field operations (survey / installation / integration) gain a Project
-- Manager, chosen from Resource Mgmt (department 'Project' + role 'Manager').
-- Idempotent.

alter table public.survey_reports       add column if not exists project_manager_id uuid;
alter table public.installation_records add column if not exists project_manager_id uuid;
alter table public.integration_records  add column if not exists project_manager_id uuid;
