-- 034: Task cost (MS Project import). Leaf tasks carry their own cost;
-- summary tasks roll up the sum of their subtasks on display.
alter table tasks add column if not exists cost numeric(14,2) default 0;
