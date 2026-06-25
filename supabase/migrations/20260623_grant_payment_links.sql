-- Grant the service_role the table privileges it needs on payment_links.
--
-- Tables created outside the normal Supabase flow don't pick up the default
-- role grants, so service_role was left with only REFERENCES/TRIGGER/TRUNCATE
-- and every server query failed with "permission denied for table
-- payment_links". The app only touches this table server-side via the
-- service-role key, so service_role is the only role that needs DML here
-- (anon/authenticated are intentionally left without access).
grant select, insert, update, delete on public.payment_links to service_role;
