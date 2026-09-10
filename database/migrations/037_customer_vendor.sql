-- 037: Customer (companies) vendor field.
-- A Customer's vendor (e.g. Nokia / Huawei / other) is the single source of
-- truth for grouping that customer's sites; Sites never store a vendor of
-- their own — it is resolved through site.customer_id → companies.vendor.
-- Idempotent.
alter table companies add column if not exists vendor text;
