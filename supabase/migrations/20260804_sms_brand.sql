-- Messages tool: tag each free-form (staff inbox) send with the store it went
-- out from, so each app's Messages inbox only shows its own store's threads.
-- Null for order/template sends (those belong to the dashboard, not this tool).

alter table public.sms_messages
  add column if not exists brand text;
