-- 011_add_evm_po.sql
-- EVM: add the customer PO (contracted value) to evm_metrics.
-- BAC stays our internal budget; Benefit = PO − AC is derived at render.
-- EV is now derived = BAC × percent_complete (no manual EV entry).
--
-- Idempotent. RUN AFTER 009 (010 optional). Existing rows get po = 0
-- until re-saved through the EVM form.

alter table evm_metrics add column if not exists po bigint default 0;
