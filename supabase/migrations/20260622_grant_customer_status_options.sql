-- customer_status_options was created without privileges for the Supabase
-- roles, so the app (service_role) got "permission denied" on insert/delete
-- and the GET silently fell back to defaults. Grant the needed privileges.
grant select, insert, update, delete on table public.customer_status_options to service_role;
grant select on table public.customer_status_options to anon, authenticated;
