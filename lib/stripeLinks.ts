import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { stripeForBrand } from '@/lib/stripe'
import { brandForSource } from '@/lib/brand'

// Stripe Checkout Sessions can live at most 24h; expire ~1 min early to be safe.
export const LINK_TTL_SECONDS = 24 * 60 * 60 - 60

function baseUrl(origin?: string): string {
  return (origin || process.env.PUBLIC_BASE_URL || 'https://delivery-tools-adl.vercel.app').replace(/\/$/, '')
}

// Mint a fresh Checkout Session for an order's current balance, in the order's
// brand Stripe account, and store it (with its 24h expiry). Used by the manual
// "Stripe Links" button and by the "regenerate link" automation action.
export async function createOrderCheckoutLink(orderId: string, origin?: string): Promise<{ ok: boolean; url?: string; reason?: string }> {
  const { data: order } = await supabaseAdmin
    .from('delivery_orders')
    .select('id, order_number, payment_due, source, customers(name)')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { ok: false, reason: 'order not found' }

  const amount = Number(order.payment_due || 0)
  if (amount <= 0) return { ok: false, reason: 'no balance owing' }

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const customerName = customer?.name || 'Customer'
  const stripe = stripeForBrand(brandForSource(order.source))
  const expiresEpoch = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.order_number,
    expires_at: expiresEpoch,
    line_items: [{
      price_data: {
        currency: 'aud',
        product_data: { name: `Order ${order.order_number}`, description: `Balance payment for ${customerName}` },
        unit_amount: Math.round(amount * 100)
      },
      quantity: 1
    }],
    success_url: `${baseUrl(origin)}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://boconcept.com.au',
    metadata: { kind: 'order_balance', customer_name: customerName, order_number: order.order_number, balance_payable: String(amount) }
  })

  const { error } = await supabaseAdmin
    .from('delivery_orders')
    .update({
      stripe_session_id: session.id,
      stripe_link: session.url,
      stripe_link_amount: amount,
      stripe_link_expires_at: new Date(expiresEpoch * 1000).toISOString()
    })
    .eq('id', orderId)
  if (error) return { ok: false, reason: error.message }
  return { ok: true, url: session.url || '' }
}
