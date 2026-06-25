# Adelaide deployment & setup guide

One codebase (`Delivery-Tools-ADL`), **deployed three times** on Vercel, sharing
**one** Supabase project. Each deployment differs only by environment variables.

| Deployment | `NEXT_PUBLIC_STORE` | Login | Stripe | Brand |
|---|---|---|---|---|
| Warehouse dashboard | `dashboard` | email + password | both (by order `source`) | dual (BCA + Transforma) |
| BCA payment app | `bca` | Microsoft — BoConcept tenant | BCA account | BoConcept Adelaide |
| Transforma payment app | `transforma` | Microsoft — Transforma tenant | Transforma account | Transforma |

All three read/write the same Adelaide Supabase, so payments reconcile against
warehouse orders. The allowlist of who may sign in is the `app_users` table,
managed in the dashboard **Admin** page and enforced server-side, fail-closed.

---

## 1. Supabase (already provisioned — do not recreate)

- Project: `delivery-tools-adl-vercel` · ref `naosxzqvozsxoujasfrn` · `ap-southeast-2`
- URL: `https://naosxzqvozsxoujasfrn.supabase.co`
- Schema cloned from Brisbane + `delivery_orders.source` (default `bca`) and
  `app_users.store`. See `supabase/schema.sql`.
- The `service_role` key is in **Supabase → Settings → API**.

## 2. Azure / Microsoft Entra app registrations (Tim)

Create **two** single-tenant registrations — one per payment app.

For **each** registration (BCA in the BoConcept tenant `33d5a57b-89e6-4244-9bd7-5d807ea37140`,
Transforma in the Transforma tenant `41cec85f-0532-4db4-960d-4d8c3323fb82`):

1. Entra admin centre → **App registrations** → **New registration**.
2. Name: e.g. `Adelaide Payments – BCA` / `Adelaide Payments – Transforma`.
3. Supported account types: **Single tenant** (accounts in this org only).
4. **Redirect URI** → platform **Web**:
   - `https://<that-deployment-domain>/api/auth/callback/entra-bca` (BCA app), or
   - `https://<that-deployment-domain>/api/auth/callback/entra-transforma` (Transforma app).
   - Add a second URI for any custom domain you map later.
5. After creating: copy the **Application (client) ID**.
6. **Certificates & secrets** → **New client secret** → copy the **secret value**
   (not the ID) immediately.
7. **API permissions** → Microsoft Graph → delegated **openid**, **profile**,
   **email** → Grant admin consent.

The tenant IDs are already hard-coded in `auth.config.ts`; you only provide the
client IDs and secrets via env. The callback path suffix (`entra-bca` /
`entra-transforma`) must match the registration's redirect URI exactly.

## 3. Vercel projects (3)

Create three projects, each connected to the `Delivery-Tools-ADL` repo
(team `boconcept` / `team_8NuhJgA8j47lY8T8MvdSSzvu`), then set env per the matrix
below and deploy. The dashboard deployment runs the Transforma cron
(`vercel.json`).

## 4. Environment variables

### Shared by all three deployments
```
NEXT_PUBLIC_SUPABASE_URL=https://naosxzqvozsxoujasfrn.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
NEXTAUTH_SECRET=<32+ random bytes, same value across the 3>
NEXTAUTH_URL=https://<this deployment's domain>
RESEND_API_KEY=<resend key>
# MessageMedia (SMS)
<MessageMedia keys as per Brisbane>
```

### Dashboard (`NEXT_PUBLIC_STORE=dashboard`)
```
NEXT_PUBLIC_STORE=dashboard
# Transforma Options API
OPTIONS_URL=<options api url>
OPTIONS_CLIENT_KEY=<options client key>
ENABLE_TRANSFORMA_SYNC=true
CRON_SECRET=<random; also used by the cron>
# First-admin bootstrap (remove after first admin exists)
BOOTSTRAP_SECRET=<random>
# Both Stripe accounts — the dashboard picks by order source
BCA_STRIPE_SECRET_KEY=<bca stripe secret>
BCA_STRIPE_WEBHOOK_SECRET=<bca webhook secret>
TRANSFORMA_STRIPE_SECRET_KEY=<transforma stripe secret>
TRANSFORMA_STRIPE_WEBHOOK_SECRET=<transforma webhook secret>
# Per-brand customer-facing identity (used by source)
BCA_DISPLAY_NAME=BoConcept Adelaide
BCA_EMAIL_FROM=<bca from address>
BCA_SMS_FROM=<bca sender id/number>
TRANSFORMA_DISPLAY_NAME=Transforma
TRANSFORMA_EMAIL_FROM=<transforma from address>
TRANSFORMA_SMS_FROM=<transforma sender id/number>
```

### BCA payment app (`NEXT_PUBLIC_STORE=bca`)
```
NEXT_PUBLIC_STORE=bca
AZURE_BCA_CLIENT_ID=<bca app registration client id>
AZURE_BCA_CLIENT_SECRET=<bca app registration secret>
BCA_STRIPE_SECRET_KEY=<bca stripe secret>
BCA_STRIPE_WEBHOOK_SECRET=<bca webhook secret>
BCA_DISPLAY_NAME=BoConcept Adelaide
BCA_EMAIL_FROM=<bca from address>
BCA_SMS_FROM=<bca sender id/number>
```

### Transforma payment app (`NEXT_PUBLIC_STORE=transforma`)
```
NEXT_PUBLIC_STORE=transforma
AZURE_TRANSFORMA_CLIENT_ID=<transforma app registration client id>
AZURE_TRANSFORMA_CLIENT_SECRET=<transforma app registration secret>
TRANSFORMA_STRIPE_SECRET_KEY=<transforma stripe secret>
TRANSFORMA_STRIPE_WEBHOOK_SECRET=<transforma webhook secret>
TRANSFORMA_DISPLAY_NAME=Transforma
TRANSFORMA_EMAIL_FROM=<transforma from address>
TRANSFORMA_SMS_FROM=<transforma sender id/number>
```

> Per-brand `*_STRIPE_*`, `*_EMAIL_FROM`, `*_SMS_FROM`, `*_DISPLAY_NAME` fall back
> to the legacy single-value names (`STRIPE_SECRET_KEY`, `EMAIL_FROM`, etc.) when
> unset, so a single-brand payment deployment can use either naming.

## 5. First-admin bootstrap (one time)

Because every route is behind the allowlist and `app_users` starts empty, seed
the first admin once on the **dashboard** deployment:

```
curl -X POST https://<dashboard-domain>/api/bootstrap \
  -H "Authorization: Bearer $BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"email":"timw@boconceptadelaide.com.au","password":"<temp password>","full_name":"Tim"}'
```

It only works while the table is empty. Afterwards, remove `BOOTSTRAP_SECRET`
and manage everyone (and their `store` + access flags) from **Admin**. Microsoft
(payment-app) users must also be added to `app_users` to be allowed in — add
them in Admin and tick **Payment App access**.

## 6. Stripe webhooks

Each Stripe account points its webhook at **its own** payment deployment's
`/api/stripe-webhook`, plus the dashboard deployment if you want the dashboard to
record both. Set the matching `*_STRIPE_WEBHOOK_SECRET`.
