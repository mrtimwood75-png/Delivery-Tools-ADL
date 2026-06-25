-- Remove anon-role policies that exposed customer data to the public anon key.
--
-- customers, delivery_orders and delivery_order_items each had anon
-- SELECT/INSERT/UPDATE policies with USING(true)/WITH CHECK(true), meaning
-- anyone holding the publishable anon key could read and modify customer PII
-- and orders. Every page in the app sits behind login (so the browser client
-- acts as the authenticated role) and all server routes use the service-role
-- key, so dropping the anon policies closes the hole with no loss of function.
-- The existing "authenticated" policies remain in place.
drop policy if exists "Allow anon users to read customers" on public.customers;
drop policy if exists "Allow anon users to insert customers" on public.customers;
drop policy if exists "Allow anon users to update customers" on public.customers;

drop policy if exists "Allow anon users to read delivery orders" on public.delivery_orders;
drop policy if exists "Allow anon users to insert delivery orders" on public.delivery_orders;
drop policy if exists "Allow anon users to update delivery orders" on public.delivery_orders;

drop policy if exists "Allow anon users to read delivery order items" on public.delivery_order_items;
drop policy if exists "Allow anon users to insert delivery order items" on public.delivery_order_items;
drop policy if exists "Allow anon users to update delivery order items" on public.delivery_order_items;
