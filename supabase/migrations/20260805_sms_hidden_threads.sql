-- Messages tool: per-staff "delete" (hide) of a conversation. Non-destructive —
-- the underlying sms_messages rows stay (they're shared with the dashboard/order
-- history); this only removes the thread from that staff member's inbox. A thread
-- reappears if a message newer than hidden_at arrives (so a fresh reply isn't
-- lost). Keyed by (user, phone).

create table if not exists public.sms_hidden_threads (
  user_id uuid not null references public.app_users(id) on delete cascade,
  phone text not null,
  hidden_at timestamptz not null default now(),
  primary key (user_id, phone)
);

alter table public.sms_hidden_threads enable row level security;
grant select, insert, update, delete on table public.sms_hidden_threads to service_role;
