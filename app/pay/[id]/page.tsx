import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createLinkSession } from '@/lib/paymentSession'
import Shell from '@/components/PayShell'

// Stable payment link. The customer is always sent payments-bcb…/pay/<id> —
// never a raw Stripe URL. For 7 days after creation each visit mints a fresh 24h
// Checkout Session and redirects, so the link keeps working within that window.
// After 7 days it hard-expires (no customer self-renew); once paid it shows a
// thank-you instead of charging again.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TTL_MS = 7 * 24 * 60 * 60 * 1000

type Params = { params: Promise<{ id: string }> }

export default async function PayLinkPage({ params }: Params) {
  const { id } = await params

  const { data: link } = await supabaseAdmin
    .from('payment_links')
    .select('id, created_at, status, order_number, customer_name, amount, salesperson_name, salesperson_email')
    .eq('id', id)
    .maybeSingle()

  if (!link) {
    return <Shell heading="Link not found" body="We couldn’t find this payment link. Please contact us and we’ll send you a new one." />
  }

  if (link.status === 'paid') {
    return (
      <Shell heading="Already paid" tone="good"
        body={`Thank you — payment for ${link.order_number ? `order ${link.order_number}` : 'this order'} has already been received. There’s nothing more to do.`} />
    )
  }

  const created = new Date(link.created_at as string).getTime()
  const expired = Number.isFinite(created) && Date.now() - created > TTL_MS

  // Past the 7-day mark: the link is closed. No customer self-renew — they
  // contact us for a new one.
  if (expired) {
    return (
      <Shell
        heading="This link has expired"
        body={`This payment link for ${link.order_number ? `order ${link.order_number}` : 'your order'} is no longer active. Please contact us and we’ll send you a new one.`}
      />
    )
  }

  // Active: mint a fresh session and hand off to Stripe.
  const h = await headers()
  const origin = process.env.PUBLIC_BASE_URL || `https://${h.get('host') || 'payments-bca.vercel.app'}`
  const session = await createLinkSession(link, origin)
  await supabaseAdmin
    .from('payment_links')
    .update({ stripe_session_id: session.id, stripe_url: session.url, updated_at: new Date().toISOString() })
    .eq('id', id)

  redirect(session.url as string)
}
