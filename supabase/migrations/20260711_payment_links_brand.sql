-- Tag payment links with their brand so each payment app lists only its own.
alter table public.payment_links add column if not exists brand text;
