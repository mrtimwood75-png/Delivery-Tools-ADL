# CLAUDE.md — BoConcept Adelaide + Transforma (ADL)

## ⚠️ Twin-repo parity — READ FIRST, EVERY SESSION

This repository is **one of a twin pair** that share a near-identical codebase.
They are the **same application** deployed for two different businesses — only
the branding, Supabase project, and environment variables differ.

| | GitHub repo | Live hosts | Supabase project |
|---|---|---|---|
| **This repo — Adelaide** | `mrtimwood75-png/Delivery-Tools-ADL` | `payments-bca.vercel.app`, `payments-trans.vercel.app`, + the ADL warehouse dashboard | `delivery-tools-adl-vercel` (`naosxzqvozsxoujasfrn`) |
| **Sibling — Brisbane** | `mrtimwood75-png/delivery-tools-bcb-vercel` | `payments-bcb.vercel.app`, `bcb-dashboard.vercel.app` | `delivery-tools-bcb-vercel` (`kwcpdvcqageeadeistgh`) |

### The parity rule (do this without being asked)

Whenever you add or change a **feature, shared component, API route, `lib/`
helper, or fix a bug** in this repo, **STOP and consider whether the sibling
repo needs the same change.** For functional changes the answer is almost always
**yes** — the two are meant to stay in sync.

When a change should propagate:
1. Tell the user explicitly: "this should also go into the Brisbane app."
2. Offer to port it (add the sibling repo to the session, apply the same change).
3. Don't let the two silently drift.

> Note: Brisbane is currently **ahead** — it has the Order Tools module, the
> shared design system (`components/ui.tsx`, `PayShell`), and the stable
> self-minting `/pay/<id>` + `/pay/order/<id>` payment links (7-day hard expiry)
> with company info on the Stripe checkout page. If these aren't here yet, they
> are candidates to port in from the sibling.

### What is intentionally DIFFERENT — do NOT copy across

- **Branding:** `lib/brand.ts` display names + `BRAND_LOGO`, and the logo assets
  in `public/`. Here `bca` = **"BoConcept Adelaide"**; in Brisbane `bca` =
  **"BoConcept Brisbane"**.
- **Env / secrets:** Stripe, MessageMedia SMS, Resend, Supabase keys — per
  deployment, never shared.
- **Database:** migrations must be applied to **each project's own Supabase**
  (this repo → `naosxzqvozsxoujasfrn`; sibling → `kwcpdvcqageeadeistgh`). A schema
  change here needs the same migration run on the sibling's database.
- **Brand count:** This app serves **two** payment brands (BoConcept Adelaide +
  Transforma); Brisbane serves **one** (BCB). Keep the multi-brand logic in
  `lib/brand.ts` working for both — don't hardcode a single brand.

### What SHOULD stay in sync — port these across

Feature modules (Order Tools, Messages/SMS, payment links, stable `/pay` links),
shared components (`components/ui.tsx`, `PayShell`, `PortalNav`), API routes,
`lib/*` helpers, and any UX/bug fix to a shared surface. Apply the same code,
then re-check branding constants and run any DB migration against the sibling's
own Supabase.

---

## App purpose

Delivery sheets for iRise — input must be the "Packing List - Order" report as a
text file. Plus the payment tools (Payment Link, Order Tools) and the warehouse
delivery dashboard with SMS/Messages.
