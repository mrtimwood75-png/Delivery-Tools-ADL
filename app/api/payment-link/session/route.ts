import { NextRequest, NextResponse } from 'next/server'
import { retrieveCheckoutSession } from '@/lib/stripe'

// Public lookup for the customer-facing success page. Given a Checkout session
// id (which only the person who paid has), returns a small summary so the page
// can confirm what was paid. Restricted to ad-hoc payment-link sessions. The
// session may belong to either brand's Stripe account.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id') || ''
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  try {
    const session = await retrieveCheckoutSession(sessionId)
    if (!session || session.metadata?.kind !== 'adhoc_payment_link') {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }
    return NextResponse.json({
      paid: session.payment_status === 'paid',
      amount: Number(session.amount_total || 0) / 100,
      customerName: session.metadata?.customer_name || '',
      orderNumber: session.metadata?.order_number || String(session.client_reference_id || ''),
      successUrl: session.success_url || null,
      cancelUrl: session.cancel_url || null
    })
  } catch {
    return NextResponse.json({ error: 'Could not load payment.' }, { status: 404 })
  }
}
