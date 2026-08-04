-- 013_seed_admin.sql
-- Guaranteed working admin login, seeded directly into auth.users.
-- Run AFTER 012. Idempotent: re-running does nothing (email already exists).
--
-- Credentials:  admin@manongadoria.mg  /  Admin@2026!
-- ⚠️ CHANGE THE PASSWORD after first login (Supabase → Authentication →
--    Users → the admin → "Reset password", or a security preference).
--
-- If you'd rather use a different email/password, edit the two values below.

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
  'admin@manongadoria.mg',
  crypt('Admin@2026!', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  now(),
  now()
)
on conflict (email) do nothing;

-- The 012 sync trigger created the profile with role 'viewer' — promote it.
update public.users
set role = 'admin'
where email = 'admin@manongadoria.mg';

-- Verify:
-- select email, role from public.users where email = 'admin@manongadoria.mg';
