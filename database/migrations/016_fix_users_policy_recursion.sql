-- 016_fix_users_policy_recursion.sql
-- Fixes "infinite recursion detected in policy for relation 'users'".
--
-- Cause: users_write_admin referenced public.users in a subquery directly
--   using (auth.uid() in (select u.auth_id from public.users u where ...))
-- Postgres forbids a policy whose expression queries the same table it
-- protects — even a plain SELECT on users then errors (a `for all` policy
-- also applies its USING clause to SELECTs).
--
-- Fix: route the admin check through the SECURITY DEFINER app_has_role()
-- helper. The function runs with owner privileges (RLS bypassed inside its
-- own query), and the policy expression only calls a function — no table
-- reference, no recursion. Idempotent.

drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin" on public.users
  for all
  using (public.app_has_role(array['admin']))
  with check (public.app_has_role(array['admin']));

-- Verify: a plain SELECT on users must now succeed without recursion.
-- select count(*) from public.users;
