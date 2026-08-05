-- MMS support for the Messages tool: send/receive images.
--   sms_messages.media_urls  - array of public image URLs on a message (outbound
--                              images staff sent, or inbound images a customer
--                              sent). Null/empty for text-only messages.
--   storage bucket 'sms-media' - public bucket holding the image files, so
--                              MessageMedia can fetch outbound media by URL and
--                              the thread can render them.

alter table public.sms_messages
  add column if not exists media_urls jsonb;

insert into storage.buckets (id, name, public)
  values ('sms-media', 'sms-media', true)
  on conflict (id) do update set public = true;
