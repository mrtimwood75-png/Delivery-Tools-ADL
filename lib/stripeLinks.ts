import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { stripeForBrand } from '@/lib/stripe'
import { brandForSource } from '@/lib/brand'
import { checkoutCustomText } from '@/lib/paymentSession'

// Dashboard order-balance links hard-expire 7 days after they're created (to
// match the Payment Link tool). The customer holds a stable …/pay/order/<id>
// link the whole time; a fresh Stripe session is minted on each visit.
export const ORDER_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000

function baseUrl(origin?: string): string {
  return (process.env.PUBLIC_BASE_URL || origin || 'https://delivery-tools-bcb-vercel.vercel.app').replace(/\/$/, '')
}

// Set up (or refresh) an order's stable payment link: store …/pay/order/<id> on
// the order with a hard 7-day expiry. The actual Stripe session is created lazily
// when the customer opens the link, for whatever balance is owing at that moment.
// Used by the manual "Stripe Links" button and the "regenerate link" automation
// (which resets the 7-day clock).
export async function createOrderCheckoutLink(orderId: string, origin?: string): Promise<{ ok: boolean; url?: string; reason?: string }> {
  const { data: order } = await supabaseAdmin
    .from('delivery_orders')
    .select('id, payment_due')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { ok: false, reason: 'order not found' }

  const amount = Number(order.payment_due || 0)
  if (amount <= 0) return { ok: false, reason: 'no balance owing' }

  const url = `${baseUrl(origin)}/pay/order/${orderId}`
  const expiresAt = new Date(Date.now() + ORDER_LINK_TTL_MS).toISOString()

  const { error } = await supabaseAdmin
    .from('delivery_orders')
    .update({
      stripe_link: url,
      stripe_link_amount: amount,
      stripe_link_expires_at: expiresAt,
      stripe_session_id: null
    })
    .eq('id', orderId)
  if (error) return { ok: false, reason: error.message }
  return { ok: true, url }
}

// Mint a fresh Checkout Session for an order's CURRENT balance, in its brand's
// Stripe account. client_reference_id = order_number so the webhook attributes
// the payment regardless of which minted session is the one actually paid.
export async function mintOrderSession(
  order: { id: string; order_number: string; payment_due: number; source: string | null; customerName: string },
  origin?: string
): Promise<Stripe.Checkout.Session> {
  const brand = brandForSource(order.source)
  const stripe = stripeForBrand(brand)
  const amount = Number(order.payment_due || 0)

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: order.order_number,
    line_items: [{
      price_data: {
        currency: 'aud',
        product_data: { name: `Order ${order.order_number}`, description: `Balance payment for ${order.customerName}` },
        unit_amount: Math.round(amount * 100)
      },
      quantity: 1
    }],
    success_url: `${baseUrl(origin)}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: process.env.STRIPE_CANCEL_URL || 'https://boconcept.com.au',
    custom_text: await checkoutCustomText(brand),
    metadata: { kind: 'order_balance', customer_name: order.customerName, order_number: order.order_number, balance_payable: String(amount) }
  })

  await supabaseAdmin.from('delivery_orders').update({ stripe_session_id: session.id }).eq('id', order.id)
  return session
}
