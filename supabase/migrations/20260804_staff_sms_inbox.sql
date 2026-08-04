-- Staff SMS inbox: per-staff two-way messaging.
--
-- Backs the "Messages" tool where a staff member has their own private SMS
-- window: they see only the conversations they've taken part in (any message
-- they sent), and can send free-form texts to a customer or a typed mobile.
--
--   app_users.sms_notify_email  - per-staff toggle: email me when a customer
--                                 replies to one of my conversations. Default on.
--   sms_messages_sent_by_idx    - the "my conversations" list filters on
--                                 sent_by, so index it.

alter table public.app_users
  add column if not exists sms_notify_email boolean not null default true;

create index if not exists sms_messages_sent_by_idx on public.sms_messages (sent_by);
