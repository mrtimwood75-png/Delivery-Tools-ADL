# Messages (staff SMS inbox) module — port guide

A private, per‑staff two‑way SMS inbox ("Messages") added to the payment app,
built on the existing MessageMedia SMS plumbing. This document is the spec for
replicating it in a sibling payment app (e.g. `Delivery-Tools-BCB`).

**Reference implementation:** this repo (`Delivery-Tools-ADL`), branch `main`
(SMS‑module commits `bccf76d`→`e94bec0`). If you can read this repo from the
target app's session, **copy the files in the manifest (§13) and adapt per §10**
rather than re‑typing. Otherwise implement from this spec.

---

## 1. Feature summary
- A `/messages` page: two‑pane inbox (conversation list + thread + composer), on
  the payment host, with nav links to/from the payment page — **no re‑login**.
- **Private per staff:** a staff member only sees conversations they took part in
  — i.e. where they sent a **free‑form** message through this tool (no `order_id`
  / `template_id`). Dashboard order/template SMS never appear here.
- Send free‑form texts to a typed mobile (auto‑threads to an existing customer
  when the number matches one).
- **Contact names:** shows the phone number by default; a name shows only if a
  staff member set one **inside** this tool — never the customer DB name.
- **Email notification** to the owning staff member when a customer replies
  (per‑staff toggle, default on).
- **Audible ping** + mute toggle when a new reply arrives.
- **Delete (hide) a thread** per staff (non‑destructive).
- **MMS:** paste/attach an image to send, and render inbound images.

## 2. Confirm the foundation exists
`lib/sms.ts` (`sendMessageMediaSms`), `sms_messages` table with `sent_by,
template_id, order_id, read_at, direction, phone, body, status,
provider_message_id, created_at`; `app_users`; `customers`;
`app/api/sms/inbound/route.ts` (MessageMedia webhook storing inbound replies);
`lib/apiAuth.ts` (`getRequestUser`); `lib/email.ts` (`sendEmail`); `lib/host.ts`
(`paymentBrandForHost`); `lib/brand.ts` (`brandConfig(brand).emailFrom /
.smsApiKey / .smsFrom`); `middleware.ts` with a payment‑host page gate;
`components/BrandLogos.tsx`; `app/payment-link/page.tsx`.

## 3. Database migrations
Apply to the target app's Supabase project **and** update its `supabase/schema.sql`.

```sql
-- 1) per-staff email toggle + index for the "my conversations" query
alter table public.app_users add column if not exists sms_notify_email boolean not null default true;
create index if not exists sms_messages_sent_by_idx on public.sms_messages (sent_by);

-- 2) store (brand) a free-form send went out from, so each app shows only its own threads
alter table public.sms_messages add column if not exists brand text;

-- 3) MMS media on a message
alter table public.sms_messages add column if not exists media_urls jsonb;

-- 4) optional per-number display names, set inside the tool (keyed by phone)
create table if not exists public.sms_contacts (
  phone text primary key, display_name text, updated_at timestamptz not null default now()
);
alter table public.sms_contacts enable row level security;
grant select, insert, update, delete on table public.sms_contacts to service_role;

-- 5) per-staff "delete" (hide) of a thread
create table if not exists public.sms_hidden_threads (
  user_id uuid not null references public.app_users(id) on delete cascade,
  phone text not null, hidden_at timestamptz not null default now(),
  primary key (user_id, phone)
);
alter table public.sms_hidden_threads enable row level security;
grant select, insert, update, delete on table public.sms_hidden_threads to service_role;

-- 6) public storage bucket for MMS images
insert into storage.buckets (id, name, public) values ('sms-media','sms-media',true)
  on conflict (id) do update set public = true;
```

## 4. Shared lib changes
**`lib/apiAuth.ts`** — add `getRequestAppUser()`: read the NextAuth session email,
look up `app_users` by email, return `{ id (uuid), email, isAdmin: role==='admin',
notifyEmail: sms_notify_email !== false }` or `null`. (The session only has the
email; you need the uuid for `sent_by`.)

**`lib/sms.ts`:**
- `sendMessageMediaSms(toMobile, message, brand?, mediaUrls?)` — when
  `mediaUrls?.length`, set `format:'MMS'` and `media: mediaUrls`; else `'SMS'`.
  (Change the payload object type to `Record<string, unknown>`.)
- `findCustomerIdByPhone(phone)` — return an existing customer id whose stored
  phone matches on the **last 9 digits**, else null.
- `sendStaffSms({ toPhone, body, brand?, customerId?, sentBy?, mediaUrls? })` —
  send via `sendMessageMediaSms`, insert an `sms_messages` row with
  `direction:'outbound', order_id:null, template_id:null, sent_by, brand,
  media_urls`, and **`created_at: new Date().toISOString()`** (gotcha §9c).
  Allow send if `body` **or** media present. Never throws.

## 5. API endpoints (`app/api/sms/`; all use `getRequestAppUser()`, 401 if none)
- **`GET conversations`** — the caller's own threads. Keys from `sms_messages`
  where `sent_by=me AND order_id IS NULL AND template_id IS NULL` and (on a
  payment host) `brand = paymentBrandForHost(host)`. Fetch all messages for those
  customers/phones (two queries: by `customer_id IN`, and `customer_id IS NULL AND
  phone IN`), fold to one conversation per key (`c:<id>` / `p:<phone>`),
  newest‑first. **Name = `sms_contacts.display_name` for the phone, else the phone
  number.** `unread` = inbound rows with `read_at IS NULL`. Exclude
  `sms_hidden_threads` for this user **unless** the last message is newer than
  `hidden_at`.
- **`GET thread?customerId=|phone=`** — ownership‑enforced: caller must have a
  **free‑form** outbound (`sent_by=me, order_id IS NULL, template_id IS NULL`) in
  it (else 403). Return messages ordered `created_at ASC, direction DESC, id ASC`
  (§9c), selecting `..., error, media_urls`. Label from `sms_contacts` else the
  number. Mark the conversation's inbound `read_at=now`. Return `{ name,
  customerId, phone, messages }`.
- **`DELETE thread?phone=`** — upsert `sms_hidden_threads(user_id=me, phone,
  hidden_at=now)` (per‑staff hide).
- **`POST send`** `{ customerId?, phone?, body?, mediaUrls? }` — resolve recipient
  (customer's stored mobile, or typed number; a typed number matching a customer
  via `findCustomerIdByPhone` threads to them). `brand =
  paymentBrandForHost(host)`. **Only accept `mediaUrls` starting with your bucket
  prefix** `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/sms-media/`.
  Require text or media. Call `sendStaffSms`. Return `{ ok, key, customerId,
  phone, messageId }`.
- **`POST upload`** (multipart `file`) — validate image ≤ ~2MB, upload to
  `sms-media` via `supabaseAdmin.storage`, return `{ url }` from `getPublicUrl`.
- **`GET/POST notify-pref`** — get/set `app_users.sms_notify_email` for the caller.
- **`POST contact`** `{ phone, name }` — upsert/delete `sms_contacts` (blank name
  clears it); normalize the phone.

## 6. Inbound webhook changes (`app/api/sms/inbound/route.ts`)
- **Store replies on OUR clock:** inbound `created_at = new Date().toISOString()`
  (server‑receipt), not the provider timestamp; remove any `Math.min(providerTime,
  now)` (gotcha §9c).
- **Media:** add tolerant `pickMedia(reply)` reading `media|media_urls|
  attachments|mms` (URL strings or objects with `url/uri/href`). Allow replies
  with text **or** media; store `media_urls`; body = text or `'📷 Image'`.
- **Email notify:** find the **free‑form owner** — newest outbound with `sent_by
  NOT NULL, order_id IS NULL, template_id IS NULL` matching this `customer_id` OR
  `phone` via **two separate queries, take the newest** (NOT a combined `.or()` —
  §9a). If the owner is active with the toggle on, `sendEmail` with a `/messages`
  link, and **`from: brandConfig(ownerBrand).emailFrom`** (select `brand` on the
  owner query; fall back to your brand's sender — §9b). Write the outcome string to
  the inbound row's `error` column for diagnosis.

## 7. Frontend
- **`components/PortalNav.tsx`** — pill links `Payments`↔`Messages`, unread badge,
  and the **ping**: poll `/api/sms/conversations` ~15s, and on an unread increase
  play a short Web‑Audio two‑tone beep (no asset; never on first load). `🔔/🔇`
  mute toggle persisted in `localStorage`; resume `AudioContext` on first
  click/keydown.
- **`app/messages/page.tsx`** — client page: conversation list + thread (bubbles;
  render `media_urls` as clickable `<img>`; show `error`/`status` meta **only on
  outbound**) + composer with **📎 attach** and **paste‑image** (`onPaste` grabs an
  image, canvas‑downscales to ~1024px JPEG, POSTs `/api/sms/upload`, previews,
  sends `mediaUrls`) + **New message** panel (number + message + attach) +
  email‑notify checkbox + **Add/Edit name** and **Delete** in the thread header.
  Poll open thread + list ~20s. Match the payment page palette (`#f4f3f1` bg,
  `#1a1a1a` primary).
- **`app/payment-link/page.tsx`** — render `<PortalNav active="payments" />`.

## 8. Middleware
Add `/messages` to the payment‑host page allowlist (`allowedOnPaymentStore()` or
equivalent) so it's reachable and not rewritten to the payment tool.

## 9. Critical gotchas — implement exactly
- **(a) No `.or()` for owner lookup** — a `+61…` phone breaks a combined PostgREST
  `.or()` and silently fails. Use two `.eq()` queries, pick the newest.
- **(b) Email `from` is required** — `EMAIL_FROM` may be unset (Resend); the
  notifier must pass `from: brandConfig(brand).emailFrom`. Wrong ⇒ `send FAILED:
  Missing EMAIL_FROM`.
- **(c) Thread ordering** — outbound `created_at` stamped at send time; inbound
  stored on our server clock (§6). MessageMedia's clock runs behind ours and
  otherwise sorts a reply above the text it answered. Order: `created_at ASC,
  direction DESC (outbound before inbound on ties), id ASC`.
- **(d) Invisible buttons** — the global `button { color:#fff }` renders
  white‑bg buttons white‑on‑white. Set an explicit dark `color` on every
  secondary/Cancel button and on the conversation‑row buttons.
- **(e) Media security** — `send` must reject `mediaUrls` not on your `sms-media`
  public prefix.
- **(f)** Hide the notify diagnostic (`error`) on inbound bubbles in the UI.

## 10. Target‑app adaptations
- **Brand/host:** use `paymentBrandForHost(request.headers.get('host'))` exactly
  as here. On a single‑brand app it returns that one brand — the `brand` stamp and
  the conversations `brand` filter still work (they scope to the one brand). If it
  returns `null` on the payment host, fix it to return the brand, or skip the
  `brand` filter when null.
- Apply migrations to the **target's** Supabase project; update its `schema.sql`.
- Email notifications send from the **target's** configured brand sender
  (`brandConfig(<brand>).emailFrom`). Confirm that env is set (paid‑confirmation
  emails prove it).

## 11. Prerequisites / env
No new env if MMS is off. For MMS to **deliver**, MessageMedia/Sinch must have MMS
provisioned and the **sender must be a numeric MMS‑capable number** (not an
alphanumeric ID) — otherwise image sends are accepted but fail at delivery.
Everything else (text, threading, notifications, ping, delete, names) works
regardless.

## 12. Deploy & test
Develop on the designated branch, apply migrations, `next build`, push to trigger
the production build. Test: send a text → reply from a phone → confirm thread
order, unread ping, email notification (check spam the first time), rename,
delete, and (if MMS provisioned) paste‑image send + inbound image.

## 13. File manifest (copy from this repo, then adapt per §10)
**New files:**
```
app/messages/page.tsx
components/PortalNav.tsx
app/api/sms/conversations/route.ts
app/api/sms/thread/route.ts
app/api/sms/send/route.ts
app/api/sms/upload/route.ts
app/api/sms/notify-pref/route.ts
app/api/sms/contact/route.ts
supabase/migrations/20260804_staff_sms_inbox.sql
supabase/migrations/20260804_sms_brand.sql
supabase/migrations/20260804_sms_contacts.sql
supabase/migrations/20260805_sms_hidden_threads.sql
supabase/migrations/20260805_sms_mms.sql
```
**Modified files (merge the changes described above):**
```
lib/sms.ts              # + findCustomerIdByPhone, sendStaffSms, MMS in sendMessageMediaSms
lib/apiAuth.ts          # + getRequestAppUser
app/api/sms/inbound/route.ts   # server-clock timestamp, pickMedia, email notify
app/payment-link/page.tsx      # + <PortalNav active="payments" />
middleware.ts           # allow /messages on the payment host
supabase/schema.sql     # mirror the migrations
```
