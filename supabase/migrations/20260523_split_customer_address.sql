alter table public.customers
add column if not exists street_address text,
add column if not exists suburb text,
add column if not exists state text,
add column if not exists postcode text,
add column if not exists delivery_notes text;

update public.customers
set street_address = coalesce(street_address, address)
where street_address is null
  and address is not null;
