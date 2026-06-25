import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { Brand, brandConfig, brandForSource, configuredBrands, deploymentBrand } from '@/lib/brand'

// Stripe access keyed by brand. The dashboard carries both accounts and selects
// per order source; each payment app carries only its own.
const clients = new Map<Brand, Stripe>()

export function stripeForBrand(brand: Brand): Stripe {
  const existing = clients.get(brand)
  if (existing) return existing
  const key = brandConfig(brand).stripeSecretKey
  if (!key) throw new Error(`Missing Stripe secret key for ${brand}`)
  const client = new Stripe(key)
  clients.set(brand, client)
  return client
}

// Which brand's Stripe account an order belongs to: a payment app uses its own;
// the dashboard looks up the order's source (defaulting to BCA when unknown).
export async function resolveOrderBrand(orderNumber: string): Promise<Brand> {
  const fixed = deploymentBrand()
  if (fixed) return fixed
  const normalized = (orderNumber || '').trim().toUpperCase()
  if (normalized) {
    const { data } = await supabaseAdmin
      .from('delivery_orders')
      .select('source')
      .eq('order_number', normalized)
      .maybeSingle()
    if (data) return brandForSource(data.source)
  }
  return 'bca'
}

// Retrieve a Checkout session that may live in either account (the public
// success page only has the session id). Tries each configured brand.
export async function retrieveCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  for (const brand of configuredBrands()) {
    try {
      const session = await stripeForBrand(brand).checkout.sessions.retrieve(sessionId)
      if (session) return session
    } catch {
      // Not in this account — try the next.
    }
  }
  return null
}

// Verify a webhook payload against whichever configured account signed it, so
// the dashboard (two accounts) and the single-brand payment apps share one
// endpoint. Returns the event and the brand that signed it.
export function verifyStripeEvent(raw: string, signature: string): { event: Stripe.Event; brand: Brand } {
  let lastError: unknown = null
  for (const brand of configuredBrands()) {
    const { stripeWebhookSecret } = brandConfig(brand)
    if (!stripeWebhookSecret) continue
    try {
      const event = stripeForBrand(brand).webhooks.constructEvent(raw, signature, stripeWebhookSecret)
      return { event, brand }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`Signature verification failed: ${lastError instanceof Error ? lastError.message : 'no configured Stripe account matched the signature'}`)
}
