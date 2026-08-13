import Stripe from 'stripe'
import { stripeForBrand, resolveOrderBrand } from '@/lib/stripe'
import { getMerchantConfig } from '@/lib/merchant'
import { paymentBrandForHost } from '@/lib/host'
import type { Brand } from '@/lib/brand'

// The brand to charge through. On a multi-brand payment deployment (Adelaide:
// BoConcept + Transforma on separate hosts) it's decided by the host the link
// was opened on; single-brand deployments (Brisbane) fall back to the order's
// brand. Kept identical across the twin repos — the host→brand map lives in
// lib/host.ts, which differs per deployment.
async function brandForLink(orderNumber: string | null, origin?: string): Promise<Brand> {
  let host = ''
  try { if (origin) host = new URL(origin).host } catch { /* origin may be bare */ }
  return paymentBrandForHost(host) || await resolveOrderBrand(orderNumber || '')
}

// Company/support details shown on the Stripe checkout page (above the Pay
// button), so it carries more than just the logo. Sourced from the editable
// merchant settings. Stripe also shows the business name/address/support from
// your Dashboard "Public details" — this supplements that.
export async function checkoutCustomText(brand: Brand): Promise<Stripe.Checkout.SessionCreateParams.CustomText> {
  const m = await getMerchantConfig(brand)
  const contact = [m.showroomPhone ? `call ${m.showroomPhone}` : '', m.email ? `email ${m.email}` : ''].filter(Boolean).join(' or ')
  const lines = [
    [m.displayName, m.address].filter(Boolean).join(' · '),
    contact ? `Questions about your order? Please ${contact}.` : ''
  ].filter(Boolean)
  const message = lines.join('\n').slice(0, 1200)
  return message ? { submit: { message } } : {}
}

// The data a Checkout Session needs from a payment_links row.
export type LinkRow = {
  id: string
  customer_name: string
  order_number: string | null
  amount: number | string
  salesperson_name: string | null
  salesperson_email: string
}

function baseUrl(origin?: string): string {
  return (process.env.PUBLIC_BASE_URL || origin || 'https://delivery-tools-bcb-vercel.vercel.app').replace(/\/$/, '')
}

// Mint a fresh Stripe Checkout Session for an ad-hoc payment link. Called lazily
// each time the customer opens their stable /pay/<id> link, so the session is
// always current (and the raw Stripe URL, which only lives 24h, is never the
// thing we hand out). The link's row id rides in the metadata so the webhook can
// attribute the payment even though the session id changes on every visit.
export async function createLinkSession(link: LinkRow, origin?: string): Promise<Stripe.Checkout.Session> {
  const brand = await brandForLink(link.order_number || null, origin)
  const stripe = stripeForBrand(brand)
  const base = baseUrl(origin)
  const amount = Number(link.amount)

  return stripe.checkout.sessions.create({
    mode: 'payment',
    ...(link.order_number ? { client_reference_id: link.order_number } : {}),
    line_items: [{
      price_data: {
        currency: 'aud',
        product_data: {
          name: link.order_number ? `Order ${link.order_number}` : `Payment from ${link.customer_name}`,
          description: `Payment for ${link.customer_name}${link.order_number ? ` — order ${link.order_number}` : ''}`
        },
        unit_amount: Math.round(amount * 100)
      },
      quantity: 1
    }],
    success_url: `${base}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://boconcept.com.au',
    custom_text: await checkoutCustomText(brand),
    metadata: {
      kind: 'adhoc_payment_link',
      payment_link_id: link.id,
      customer_name: link.customer_name,
      order_number: link.order_number || '',
      amount: String(amount),
      salesperson_name: link.salesperson_name || '',
      salesperson_email: link.salesperson_email
    }
  })
}
