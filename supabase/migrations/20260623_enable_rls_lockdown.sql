-- Lock down tables that were left without Row Level Security.
--
-- These five tables are only ever accessed server-side via the service-role
-- key (which bypasses RLS), never from the browser anon/authenticated client.
-- Enabling RLS with no permissive policy therefore denies all anon/authenticated
-- access while leaving the app's server routes fully working. This closes the
-- hole where anyone holding the public anon key could read or modify them —
-- most importantly app_users, which stores password hashes.
alter table public.app_users enable row level security;
alter table public.app_settings enable row level security;
alter table public.sms_log enable row level security;
alter table public.customer_status_options enable row level security;
alter table public.sms_reply_rules enable row level security;
