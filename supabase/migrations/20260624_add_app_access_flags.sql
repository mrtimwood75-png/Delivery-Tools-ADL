-- Per-app access control. Each user can be granted Dashboard access, Payment App
-- access, or both. New users get Dashboard by default and Payment App opt-in;
-- existing users are backfilled to both so nothing breaks on rollout.
alter table public.app_users
  add column if not exists can_access_dashboard boolean not null default true,
  add column if not exists can_access_payments boolean not null default false;

update public.app_users set can_access_payments = true;
