-- Messages tool: optional per-number display names, set by staff INSIDE the SMS
-- app. The inbox shows the phone number by default and only shows a name when
-- one has been entered here — it never pulls the customer's name from the
-- delivery database. Keyed by normalized phone number.

create table if not exists public.sms_contacts (
  phone text primary key,
  display_name text,
  updated_at timestamptz not null default now()
);

alter table public.sms_contacts enable row level security;
grant select, insert, update, delete on table public.sms_contacts to service_role;
