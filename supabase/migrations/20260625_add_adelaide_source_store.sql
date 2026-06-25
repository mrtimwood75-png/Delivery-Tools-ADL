-- Adelaide fork additions on top of the Brisbane schema.
--
-- Already applied to the Adelaide Supabase project (naosxzqvozsxoujasfrn); this
-- migration records the change so the repo schema stays authoritative.

-- Tag every order with the ingest source it came from. Existing/BCA orders
-- default to 'bca'; the Transforma Options-API sync writes 'transforma'.
alter table public.delivery_orders
  add column if not exists source text not null default 'bca';

-- Which brand/app a dashboard user is gated to (e.g. 'transforma', 'boconcept').
-- Drives the two-door auth allowlist in the Adelaide app.
alter table public.app_users
  add column if not exists store text;
