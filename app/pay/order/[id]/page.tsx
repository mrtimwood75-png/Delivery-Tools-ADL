import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { mintOrderSession } from '@/lib/stripeLinks'
import Shell from '@/components/PayShell'

// Stable payment link for a dashboard order balance. The customer is sent
// …/pay/order/<id>; within the 7-day window each visit mints a fresh Stripe
// session for the balance still owing, then redirects. After 7 days it
// hard-expires (no self-renew). Paid in full → thank-you.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function PayOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: order } = await supabaseAdmin
    .from('delivery_orders')
    .select('id, order_number, payment_due, payment_status, source, stripe_link_expires_at, customers(name)')
    .eq('id', id)
    .maybeSingle()

  if (!order) {
    return <Shell heading="Link not found" body="We couldn’t find this payment link. Please contact us and we’ll send you a new one." />
  }

  const due = Number(order.payment_due || 0)
  if (due <= 0 || order.payment_status === 'Paid') {
    return <Shell heading="Paid in full" tone="good" body={`Thank you — order ${order.order_number} has been paid in full. There’s nothing more to do.`} />
  }

  const exp = order.stripe_link_expires_at ? new Date(order.stripe_link_expires_at as string).getTime() : 0
  if (exp && Date.now() > exp) {
    return <Shell heading="This link has expired" body={`This payment link for order ${order.order_number} is no longer active. Please contact us and we’ll send you a new one.`} />
  }

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const h = await headers()
  const origin = process.env.PUBLIC_BASE_URL || `https://${h.get('host') || 'payments-bca.vercel.app'}`
  const session = await mintOrderSession(
    { id: order.id as string, order_number: order.order_number as string, payment_due: due, source: (order.source as string) || null, customerName: (customer as { name?: string })?.name || 'Customer' },
    origin
  )

  redirect(session.url as string)
}
