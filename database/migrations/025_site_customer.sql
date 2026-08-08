-- 025: Customer on telecom sites — selected from the Customer module
-- (companies). Mirrors the quote/invoice convention: a visible name +
-- a populated FK id. Idempotent; safe on the live DB.

alter table public.sites add column if not exists customer_id uuid;
alter table public.sites add column if not exists customer_name text;
