-- Adds the fields needed to render an MS-Project-style Gantt chart on tasks:
-- a planned start date, a manual progress percentage, and a milestone flag
-- (zero-duration marker, rendered as a diamond instead of a bar).

alter table tasks
  add column if not exists start_date       date,
  add column if not exists percent_complete numeric(5,1) check (percent_complete between 0 and 100),
  add column if not exists milestone        boolean not null default false;

-- Keep start_date <= due_date when both are set.
alter table tasks
  add constraint tasks_start_before_due
  check (start_date is null or due_date is null or start_date <= due_date);

comment on column tasks.start_date is 'Planned start date used by the Gantt chart timeline.';
comment on column tasks.percent_complete is 'Manual progress override (0-100). Falls back to a value derived from status when null.';
comment on column tasks.milestone is 'True for zero-duration marker tasks, drawn as a diamond on the Gantt chart.';
