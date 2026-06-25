alter table public.delivery_orders
  add column if not exists delivery_date date;
