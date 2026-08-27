-- 031: Gantt dates on tasks (Task Board Gantt tab)
-- Optional start date; missing on existing rows (they stay visible as
-- 1-day bars on their due date until edited).

alter table tasks add column if not exists start_date date;

-- Timeline queries group by project and order by start/due date.
create index if not exists tasks_project_start_due_idx
  on tasks (project_id, start_date, due_date);
