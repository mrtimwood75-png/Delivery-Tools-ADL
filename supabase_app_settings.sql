create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value text not null,
  updated_at timestamptz default now()
);

insert into public.app_settings (setting_key, setting_value)
values ('density', 'normal')
on conflict (setting_key) do nothing;
