-- 014_fix_auth_hook_select_star.sql
-- Root cause of "Error finding user: sql: Scan error on column index 3":
-- an auth-hook function on the LIVE DB does `SELECT * FROM public.users`
-- and the Supabase Go scanner reads columns positionally — as soon as the
-- users table column order differs (or grows), the scan breaks.
--
-- Every function in THIS repo already uses explicit columns (app_role,
-- app_has_role, sync_user_from_auth). This migration:
--   1) finds any function on the live DB whose body selects * from
--      public.users and prints its signature + definition,
--   2) re-asserts our own functions (explicit columns, idempotent).
--
-- After running, paste the signature from the Messages tab here and we
-- rewrite that function to:
--     SELECT id, email, role, name FROM public.users WHERE id = auth.uid()

-- ── 1) Discover any auth-hook / helper doing SELECT * FROM public.users ──────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as signature,
           p.prosrc as definition   -- body text directly, no pg_get_functiondef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~* 'from\s+public\.users'
      and p.prosrc ~* 'select\s+\*'
  loop
    raise notice 'FOUND SELECT * FROM public.users function: %', r.signature;
    raise notice '%', r.definition;
  end loop;
end $$;

-- ── 2) Re-assert our own helpers with explicit columns (idempotent) ─────────
create or replace function public.app_role() returns text
language sql stable security definer set search_path = public
as $$
  select role from public.users where auth_id = auth.uid()
$$;

create or replace function public.app_has_role(roles text[]) returns boolean
language sql stable security definer set search_path = public
as $$
  select public.app_role() = any(roles)
$$;

-- ── 3) Verify: should print nothing (no offenders left after the fix) ───────
-- select p.oid::regprocedure::text
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and p.prosrc ~* 'from\s+public\.users'
--   and p.prosrc ~* 'select\s+\*';
