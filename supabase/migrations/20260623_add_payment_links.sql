-- Standalone ad-hoc payment links.
--
-- This backs the self-contained "Payment Link" tool: a salesperson types in a
-- customer name, order number and amount, and the app mints a Stripe Checkout
-- link they can send to the customer. The salesperson's own email is captured
-- as a return address so they get a payment confirmation once it's paid.
--
-- Deliberately separate from delivery_orders so this tool stands on its own and
-- never collides with the imported-order Stripe flow.
create table if not exists public.payment_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  customer_name text not null,
  order_number text,
  amount numeric(12,2) not null,
  currency text not null default 'aud',
  salesperson_name text,
  salesperson_email text not null,
  customer_phone text,
  customer_email text,
  delivery_method text,
  delivery_status text,
  stripe_session_id text,
  stripe_url text,
  status text not null default 'pending',
  amount_paid numeric(12,2),
  paid_at timestamptz,
  confirmation_sent_at timestamptz,
  created_by text
);

create index if not exists payment_links_stripe_session_id_idx on public.payment_links (stripe_session_id);
create index if not exists payment_links_status_idx on public.payment_links (status);
create index if not exists payment_links_created_at_idx on public.payment_links (created_at);

alter table public.payment_links enable row level security;

create policy "Allow authenticated users to read payment links"
  on public.payment_links for select to authenticated using (true);
create policy "Allow authenticated users to insert payment links"
  on public.payment_links for insert to authenticated with check (true);
create policy "Allow authenticated users to update payment links"
  on public.payment_links for update to authenticated using (true) with check (true);
