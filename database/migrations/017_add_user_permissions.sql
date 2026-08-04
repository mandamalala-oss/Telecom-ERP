-- 017_add_user_permissions.sql
-- Per-member module permission matrix: users.permissions is a JSONB map of
--   { "<module>": "view" | "edit" }
-- Missing modules fall back to the role defaults (ROLE_PERMISSIONS).
-- Idempotent.

alter table public.users add column if not exists permissions jsonb default '{}'::jsonb;
