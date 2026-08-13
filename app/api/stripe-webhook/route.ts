import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { runSimpleTrigger } from '@/lib/automations'
import { sendEmail } from '@/lib/email'
import { sendMessageMediaSms } from '@/lib/sms'
import { formatAmountAu } from '@/lib/format'
import { getEmailTemplates, renderEmailTemplate, getPaymentSuccessSms, renderPaymentSuccessSms } from '@/lib/paymentMessage'
import { verifyStripeEvent } from '@/lib/stripe'
import { getMerchantConfig } from '@/lib/merchant'
import { brandConfig, type Brand } from '@/lib/brand'

// Ad-hoc payment links (from the standalone Payment Link tool).
//
// If the link's order number matches a delivery_orders row, the payment is
// applied to that order: the amount is subtracted from its balance and it's
// marked Paid once the balance reaches zero, exactly like a dashboard payment.
// If there's no matching order, the payment stays entirely in the payment app —
// the shared stripe_payments ledger row is acknowledged immediately so it never
// shows on the dashboard. Either way the salesperson gets a confirmation email.
async function confirmAdhocPaymentLink(session: Stripe.Checkout.Session, amountPaid: number, brand: Brand) {
  // Stable /pay/<id> links mint a fresh session on each visit, so the paid
  // session may not be the one currently stored on the row. Attribute by the
  // link id carried in the session metadata first; fall back to the session id
  // for older links created before stable links existed.
  const cols = 'id, customer_name, customer_phone, order_number, salesperson_email, salesperson_name, status'
  const linkId = String(session.metadata?.payment_link_id || '').trim()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let link: any = null
  if (linkId) {
    const { data } = await supabaseAdmin.from('payment_links').select(cols).eq('id', linkId).maybeSingle()
    link = data
  }
  if (!link) {
    const { data } = await supabaseAdmin.from('payment_links').select(cols).eq('stripe_session_id', session.id).maybeSingle()
    link = data
  }
  if (!link) return false

  await supabaseAdmin
    .from('payment_links')
    .update({ status: 'paid', amount_paid: amountPaid, paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', link.id)

  const orderNumber = String(link.order_number || session.metadata?.order_number || '').trim()

  // Apply to a dashboard order when the order number matches.
  let allocatedOrder: string | null = null
  let remainingDue = 0
  if (orderNumber) {
    const { data: order } = await supabaseAdmin
      .from('delivery_orders')
      .select('id, payment_due')
      .eq('order_number', orderNumber)
      .maybeSingle()
    if (order) {
      remainingDue = Math.max(0, Math.round((Number(order.payment_due || 0) - amountPaid) * 100) / 100)
      await supabaseAdmin
        .from('delivery_orders')
        .update({ payment_due: remainingDue, payment_status: remainingDue > 0 ? 'Unpaid' : 'Paid' })
        .eq('id', order.id)
      await supabaseAdmin.from('stripe_payments').update({ order_id: order.id }).eq('session_id', session.id)
      const fired = await runSimpleTrigger(order.id, 'payment_received')
      console.log('[stripe-webhook] adhoc payment applied to order', { orderId: order.id, orderNumber, remainingDue, automationsFired: fired })
      allocatedOrder = orderNumber
    }
  }

  // No matching order → keep it off the dashboard (auto-acknowledge the ledger row).
  if (!allocatedOrder) {
    await supabaseAdmin
      .from('stripe_payments')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('session_id', session.id)

    // The dashboard's own payment-received automation only fires on a matched
    // order, so text the customer the payment-success SMS for this ad-hoc sale.
    const customerPhone = String(link.customer_phone || '').trim()
    if (customerPhone) {
      try {
        const template = await getPaymentSuccessSms(brand)
        const merchant = await getMerchantConfig(brand)
        const message = renderPaymentSuccessSms(template, { customerName: link.customer_name || '', amount: amountPaid, orderNumber, salespersonName: link.salesperson_name || '' }, merchant)
        await sendMessageMediaSms(customerPhone, message, brand)
      } catch (error) {
        console.error('[stripe-webhook] payment-success SMS failed', error)
      }
    }
  }

  const returnTo = String(link.salesperson_email || session.metadata?.salesperson_email || '').trim()
  if (returnTo) {
    const allocationNote = allocatedOrder
      ? `Applied to order ${allocatedOrder} on the dashboard. Remaining balance: ${formatAmountAu(remainingDue)}${remainingDue === 0 ? ' (marked Paid).' : '.'}`
      : `This payment was not applied to a dashboard order (no matching order number was found).`
    const { subject: subjectTpl, body: bodyTpl } = await getEmailTemplates()
    const fields = {
      customerName: link.customer_name || '',
      orderNumber,
      amount: amountPaid,
      paidAt: new Date().toLocaleString('en-AU'),
      salespersonName: link.salesperson_name || '',
      allocationNote
    }
    const merchant = await getMerchantConfig(brand)
    try {
      await sendEmail({ to: returnTo, subject: renderEmailTemplate(subjectTpl, fields, merchant), text: renderEmailTemplate(bodyTpl, fields, merchant), from: brandConfig(brand).emailFrom || undefined })
      await supabaseAdmin.from('payment_links').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', link.id)
    } catch (error) {
      console.error('[stripe-webhook] payment-link confirmation email failed', error)
    }
  }
  return true
}

// Stripe payment webhook. When a checkout link is paid, deduct the amount from
// the order's balance. The stripe_payments table makes this idempotent so
// retried/duplicate events never double-count a payment. The signature is
// verified against whichever brand's Stripe account signed it (the dashboard
// carries both BCA and Transforma).
export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature') || ''
  const raw = await request.text()

  let event: Stripe.Event
  let signingBrand: Brand = 'bca'
  try {
    const verified = verifyStripeEvent(raw, signature)
    event = verified.event
    signingBrand = verified.brand
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Signature verification failed' }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.payment_status === 'paid') {
        const amountPaid = Number(session.amount_total || 0) / 100
        const orderNumber = String(session.client_reference_id || session.metadata?.order_number || '')
        const sessionId = String(session.id)

        // Claim this session once — duplicate events hit the unique constraint and stop here.
        const claim = await supabaseAdmin
          .from('stripe_payments')
          .insert({ session_id: sessionId, event_id: event.id, order_number: orderNumber, amount: amountPaid })
          .select('id')
          .single()

        if (claim.error) {
          // Unique violation = already processed; acknowledge so Stripe stops retrying.
          return NextResponse.json({ received: true, duplicate: true })
        }

        // Ad-hoc Payment Link tool: confirm to the salesperson, skip order logic.
        if (session.metadata?.kind === 'adhoc_payment_link') {
          const handled = await confirmAdhocPaymentLink(session, amountPaid, signingBrand)
          if (handled) return NextResponse.json({ received: true, paymentLink: true })
        }

        let order: { id: string; payment_due: number } | null = null
        const bySession = await supabaseAdmin.from('delivery_orders').select('id, payment_due').eq('stripe_session_id', sessionId).maybeSingle()
        if (bySession.data) order = bySession.data as { id: string; payment_due: number }
        else if (orderNumber) {
          const byNumber = await supabaseAdmin.from('delivery_orders').select('id, payment_due').eq('order_number', orderNumber).maybeSingle()
          if (byNumber.data) order = byNumber.data as { id: string; payment_due: number }
        }

        if (order) {
          const newDue = Math.max(0, Math.round((Number(order.payment_due || 0) - amountPaid) * 100) / 100)
          await supabaseAdmin
            .from('delivery_orders')
            .update({ payment_due: newDue, payment_status: newDue > 0 ? 'Unpaid' : 'Paid' })
            .eq('id', order.id)
          await supabaseAdmin.from('stripe_payments').update({ order_id: order.id }).eq('session_id', sessionId)
          // Run any "payment received" automations (e.g. send a receipt SMS).
          const fired = await runSimpleTrigger(order.id, 'payment_received')
          console.log('[stripe-webhook] payment-received automations', { orderId: order.id, automationsFired: fired })
        }
      }
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook handling failed.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: 'stripe-webhook' })
}
