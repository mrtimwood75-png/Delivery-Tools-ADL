create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text unique not null,
  full_name text not null,
  role text not null default 'user',
  is_active boolean not null default true,
  password_hash text,
  last_login_at timestamptz,
  store text
);

alter table public.app_users
  add column if not exists store text;

-- Per-staff toggle: email me when a customer replies in one of my SMS threads.
alter table public.app_users
  add column if not exists sms_notify_email boolean not null default true;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  phone text,
  address text
);

create table if not exists public.delivery_orders (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  import_date date not null default current_date,
  imported_at timestamptz not null default now(),
  order_number text unique not null,
  customer_id uuid not null references public.customers(id) on delete restrict,
  payment_status text not null default 'Pending',
  order_status text not null default 'Open',
  goods_ready_date date,
  stripe_session_id text,
  stripe_link text,
  stripe_link_amount numeric(12,2) not null default 0,
  payment_due numeric(12,2) not null default 0,
  sms_status text,
  date_sent timestamptz,
  source text not null default 'bca',
  imported_by uuid references public.app_users(id) on delete set null
);

alter table public.delivery_orders
  add column if not exists import_date date not null default current_date,
  add column if not exists imported_at timestamptz not null default now(),
  add column if not exists order_notes text,
  add column if not exists archived_at timestamptz,
  add column if not exists salesperson text,
  add column if not exists delivery_confirmation text,
  add column if not exists delivery_confirmation_at timestamptz,
  add column if not exists source text not null default 'bca';

create table if not exists public.salespeople (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  code text unique not null,
  name text,
  email text
);

create table if not exists public.delivery_order_items (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.delivery_orders(id) on delete cascade,
  product_name text not null,
  product_code text,
  quantity integer not null default 1,
  notes text
);

create table if not exists public.notification_templates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text unique not null,
  template_text text not null,
  audience text not null default 'Both',
  is_active boolean not null default true,
  sort_order integer,
  purpose text
);

insert into public.notification_templates (name, template_text, audience)
values
  ('Standard payment request', 'Hi {customer_name}, payment for order {order_number} is now due. Amount payable: {balance_payable}. Please pay securely here: {stripe_checkout_url}', 'Balance only'),
  ('Friendly reminder', 'Hi {customer_name}, just a reminder that payment for order {order_number} of {balance_payable} is outstanding. Payment link: {stripe_checkout_url}', 'Balance only'),
  ('Short version', 'Hi {customer_name}, please pay {balance_payable} for order {order_number}: {stripe_checkout_url}', 'Balance only'),
  ('Delivery notice', 'Hi {customer_name}, your order {order_number} is ready for delivery scheduling.', 'Zero balance only'),
  ('General notice', 'Hi {customer_name}, this is an update regarding order {order_number}.', 'Both')
on conflict (name) do nothing;

create index if not exists app_users_email_idx on public.app_users (email);
create index if not exists app_users_role_idx on public.app_users (role);
create index if not exists customers_name_idx on public.customers using gin (to_tsvector('english', name));
create index if not exists customers_phone_idx on public.customers (phone);
create index if not exists delivery_orders_order_number_idx on public.delivery_orders (order_number);
create index if not exists delivery_orders_import_date_idx on public.delivery_orders (import_date);
create index if not exists delivery_orders_imported_at_idx on public.delivery_orders (imported_at);
create index if not exists delivery_orders_customer_id_idx on public.delivery_orders (customer_id);
create index if not exists delivery_orders_payment_status_idx on public.delivery_orders (payment_status);
create index if not exists delivery_orders_order_status_idx on public.delivery_orders (order_status);
create index if not exists delivery_order_items_order_id_idx on public.delivery_order_items (order_id);
create index if not exists notification_templates_name_idx on public.notification_templates (name);
create index if not exists notification_templates_sort_order_idx on public.notification_templates (sort_order);
create index if not exists delivery_orders_delivery_confirmation_idx on public.delivery_orders (delivery_confirmation);

-- Key/value app configuration (e.g. delivery confirmation status mapping).
create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value text,
  updated_at timestamptz not null default now()
);
create unique index if not exists app_settings_setting_key_idx on public.app_settings (setting_key);

alter table public.app_users enable row level security;
alter table public.customers enable row level security;
alter table public.delivery_orders enable row level security;
alter table public.delivery_order_items enable row level security;
alter table public.notification_templates enable row level security;

create policy "Allow authenticated users to read app users"
  on public.app_users for select to authenticated using (true);
create policy "Allow authenticated users to insert app users"
  on public.app_users for insert to authenticated with check (true);
create policy "Allow authenticated users to update app users"
  on public.app_users for update to authenticated using (true) with check (true);

create policy "Allow authenticated users to read customers"
  on public.customers for select to authenticated using (true);
create policy "Allow authenticated users to insert customers"
  on public.customers for insert to authenticated with check (true);
create policy "Allow authenticated users to update customers"
  on public.customers for update to authenticated using (true) with check (true);

create policy "Allow authenticated users to read delivery orders"
  on public.delivery_orders for select to authenticated using (true);
create policy "Allow authenticated users to insert delivery orders"
  on public.delivery_orders for insert to authenticated with check (true);
create policy "Allow authenticated users to update delivery orders"
  on public.delivery_orders for update to authenticated using (true) with check (true);

create policy "Allow authenticated users to read delivery order items"
  on public.delivery_order_items for select to authenticated using (true);
create policy "Allow authenticated users to insert delivery order items"
  on public.delivery_order_items for insert to authenticated with check (true);
create policy "Allow authenticated users to update delivery order items"
  on public.delivery_order_items for update to authenticated using (true) with check (true);

create policy "Allow authenticated users to read notification templates"
  on public.notification_templates for select to authenticated using (true);
create policy "Allow authenticated users to insert notification templates"
  on public.notification_templates for insert to authenticated with check (true);
create policy "Allow authenticated users to update notification templates"
  on public.notification_templates for update to authenticated using (true) with check (true);
create policy "Allow authenticated users to delete notification templates"
  on public.notification_templates for delete to authenticated using (true);

create table if not exists public.sms_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.delivery_orders(id) on delete set null,
  direction text not null default 'outbound',
  phone text,
  body text not null,
  status text,
  provider_message_id text,
  template_id uuid references public.notification_templates(id) on delete set null,
  sent_by uuid references public.app_users(id) on delete set null,
  error text,
  read_at timestamptz,
  purpose text,
  -- Store a free-form (Messages tool) send went out from, so each app's inbox
  -- only shows its own store's threads. Null for order/template sends.
  brand text
);

create index if not exists sms_messages_customer_id_idx on public.sms_messages (customer_id);
create index if not exists sms_messages_order_id_idx on public.sms_messages (order_id);
create index if not exists sms_messages_phone_idx on public.sms_messages (phone);
create index if not exists sms_messages_provider_message_id_idx on public.sms_messages (provider_message_id);
create index if not exists sms_messages_created_at_idx on public.sms_messages (created_at);
create index if not exists sms_messages_sent_by_idx on public.sms_messages (sent_by);

-- Optional per-number display names for the Messages tool, set by staff inside
-- the app. The inbox shows the number by default and a name only when set here;
-- it never uses the customer's delivery-database name.
create table if not exists public.sms_contacts (
  phone text primary key,
  display_name text,
  updated_at timestamptz not null default now()
);
alter table public.sms_contacts enable row level security;

-- Per-staff "delete" (hide) of a Messages conversation. Non-destructive: the
-- sms_messages rows stay; this only removes the thread from that staff member's
-- inbox, and it reappears if a message newer than hidden_at arrives.
create table if not exists public.sms_hidden_threads (
  user_id uuid not null references public.app_users(id) on delete cascade,
  phone text not null,
  hidden_at timestamptz not null default now(),
  primary key (user_id, phone)
);
alter table public.sms_hidden_threads enable row level security;

alter table public.sms_messages enable row level security;

create policy "Allow authenticated users to read sms messages"
  on public.sms_messages for select to authenticated using (true);
create policy "Allow authenticated users to insert sms messages"
  on public.sms_messages for insert to authenticated with check (true);
create policy "Allow authenticated users to update sms messages"
  on public.sms_messages for update to authenticated using (true) with check (true);
