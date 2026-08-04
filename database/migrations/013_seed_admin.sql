-- 013_seed_admin.sql
-- Guaranteed working admin login, seeded directly into auth.users.
-- Run AFTER 012. Idempotent: re-running does nothing (email already exists).
--
-- Credentials:  admin@manongadoria.mg  /  Admin@2026!
-- ⚠️ CHANGE THE PASSWORD after first login (Supabase → Authentication →
--    Users → the admin → "Reset password", or a security preference).
--
-- If you'd rather use a different email/password, edit the two values below.
-- The DO block prints a notice: 'admin created' / 'admin already exists' /
-- the real error if the insert fails — paste that back if anything is red.

do $$
declare
  v_email text := 'admin@manongadoria.mg';
  v_pass  text := 'Admin@2026!';
begin
  if exists (select 1 from auth.users where lower(email) = lower(v_email)) then
    raise notice 'admin already exists';
  else
    -- pgcrypto (crypt/gen_salt) is enabled by default on Supabase.
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_pass, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now()
    );
    raise notice 'admin created';
  end if;

  -- The 012 sync trigger created the profile with role 'viewer' — promote it.
  update public.users
  set role = 'admin'
  where lower(email) = lower(v_email);

  raise notice 'profile role set to admin';
exception when others then
  raise notice 'ERROR: %', sqlerrm;
end $$;

-- Verify (must return exactly 1 row):
select email, role from public.users where lower(email) = 'admin@manongadoria.mg';
