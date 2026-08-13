-- Payment-received automations can target a specific link source, so the
-- warehouse (dashboard-generated links) and showroom (payment-app links) can
-- each get their own confirmation SMS.
--   any       — fire for every confirmed payment (default; existing behaviour)
--   dashboard — only for links generated from the warehouse dashboard
--   showroom  — only for links generated from the payment app / Order Tools
alter table public.automations
  add column if not exists payment_source text not null default 'any';
