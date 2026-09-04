-- 033: Task parent/subtask hierarchy (MS Project XML import)
-- parent_id references another task in the same table; NULL = top-level task.
-- Deleting a parent cascades to its subtasks.

alter table tasks add column if not exists parent_id uuid references tasks(id) on delete cascade;

create index if not exists tasks_parent_id_idx on tasks (parent_id);
