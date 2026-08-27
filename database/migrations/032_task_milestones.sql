-- 032: Milestones on tasks for MS Project-style Gantt rendering.
alter table tasks add column if not exists is_milestone boolean default false;

update tasks
set is_milestone = false
where is_milestone is null;

alter table tasks alter column is_milestone set default false;
alter table tasks alter column is_milestone set not null;
