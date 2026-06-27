import { NextRequest, NextResponse } from 'next/server'
import { retrieveCheckoutSession } from '@/lib/stripe'
import { brandConfig } from '@/lib/brand'

// Public lookup for the customer-facing success page. Given a Checkout session
// id (which only the person who paid has), returns a small summary so the page
// can confirm what was paid. Restricted to ad-hoc payment-link sessions. The
// session may belong to either brand's Stripe account.
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('session_id') || ''
  if (!sessionId) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

  try {
    const found = await retrieveCheckoutSession(sessionId)
    if (!found || found.session.metadata?.kind !== 'adhoc_payment_link') {
      return NextResponse.json({ error: 'Not found.' }, { status: 404 })
    }
    const { session, brand } = found
    const cfg = brandConfig(brand)
    return NextResponse.json({
      paid: session.payment_status === 'paid',
      amount: Number(session.amount_total || 0) / 100,
      customerName: session.metadata?.customer_name || '',
      orderNumber: session.metadata?.order_number || String(session.client_reference_id || ''),
      successUrl: session.success_url || null,
      cancelUrl: session.cancel_url || null,
      // Brand the payment belongs to, so the success page can show the right
      // logo, name and contact details.
      merchant: {
        brand,
        name: cfg.displayName,
        logo: cfg.logo,
        phone: cfg.supportPhone,
        email: cfg.supportEmail,
        address: cfg.supportAddress
      }
    })
  } catch {
    return NextResponse.json({ error: 'Could not load payment.' }, { status: 404 })
  }
}
