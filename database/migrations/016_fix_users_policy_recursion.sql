-- 016_fix_users_policy_recursion.sql
-- Fixes "infinite recursion detected in policy for relation 'users'".
--
-- Cause: the users_write_admin policy (from 012) referenced public.users in
-- a subquery directly
--   using (auth.uid() in (select u.auth_id from public.users u where ...))
-- Postgres forbids a policy whose expression queries the same table it
-- protects — and a `for all` policy also applies its USING clause to
-- SELECTs, so even reads explode. The Team module's INSERT (adding a member)
-- triggers it via WITH CHECK.
--
-- Fix: route the admin check through the SECURITY DEFINER app_has_role()
-- helper. The function runs with owner privileges (RLS bypassed inside its
-- own query), and the policy expression only calls a function — no table
-- reference, no recursion. Idempotent; also drops any leftover open policy.

drop policy if exists "allow_all_users" on public.users;
drop policy if exists "users_read" on public.users;
create policy "users_read" on public.users
  for select using (auth.uid() is not null);

drop policy if exists "users_write_admin" on public.users;
create policy "users_write_admin" on public.users
  for all
  using (public.app_has_role(array['CEO']))
  with check (public.app_has_role(array['CEO']));

-- Verify:
-- 1) plain read must work (no recursion):
--    select count(*) from public.users;
-- 2) only these two policies should exist on users:
--    select policyname, cmd, qual, with_check
--    from pg_policies where schemaname = 'public' and tablename = 'users';
