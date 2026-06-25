-- Grant service_role the table privileges it was missing.
--
-- Like payment_links, these tables were created without the default Supabase
-- role grants, leaving service_role with only REFERENCES/TRIGGER/TRUNCATE. Any
-- server write failed with "permission denied for table ...". The app reaches
-- these only via the service-role key, so service_role is the role that needs
-- DML here. (app_settings backs the admin-editable payment SMS message.)
grant select, insert, update, delete on public.app_settings to service_role;
grant select, insert, update, delete on public.sms_log to service_role;
