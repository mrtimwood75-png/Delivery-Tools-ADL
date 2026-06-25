alter table public.delivery_order_items
add column if not exists cubic_meters numeric default 0;
