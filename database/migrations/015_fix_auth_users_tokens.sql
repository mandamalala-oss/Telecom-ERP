-- 015_fix_auth_users_tokens.sql
-- Fixes "Error finding user: sql: Scan error on column index 3, name
-- 'confirmation token': converting NULL to string is unsupported".
--
-- Root cause: rows inserted directly into auth.users (e.g. the 013 seed)
-- left the token columns NULL; the Supabase Go auth server scans them as
-- non-null strings → every login 500s. Dashboard-created users set these
-- to '' automatically.
--
-- Idempotent + version-safe: only touches token columns that exist, and
-- only fills NULLs (never overwrites real tokens).

do $$
declare c text;
begin
  foreach c in array array[
    'confirmation_token',
    'recovery_token',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change_token'
  ]
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = c
    ) then
      execute format('update auth.users set %I = coalesce(%I, '''') where %I is null', c, c, c);
    end if;
  end loop;
end $$;

-- Make sure the admin is confirmed (needed for the password grant to pass).
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where lower(email) = 'admin@manongadoria.mg';

-- Verify: must return 0 rows.
-- select id, email, confirmation_token, recovery_token
-- from auth.users
-- where confirmation_token is null or recovery_token is null;
