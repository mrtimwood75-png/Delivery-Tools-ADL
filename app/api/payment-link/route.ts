import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmail } from '@/lib/email'
import { sendMessageMediaSms } from '@/lib/sms'
import { formatAmountAu, normalizeMobileAu } from '@/lib/format'
import { getRequestUser } from '@/lib/apiAuth'
import { getSmsTemplate, renderSmsTemplate } from '@/lib/paymentMessage'
import { stripeForBrand, resolveOrderBrand } from '@/lib/stripe'
import { brandConfig } from '@/lib/brand'
import { getMerchantConfig } from '@/lib/merchant'

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

// Mints a one-off Stripe Checkout link for an ad-hoc sale, records it in
// payment_links, and (optionally) delivers it to the customer by SMS or email.
// The salesperson's return email is stashed in the session metadata so the
// webhook can confirm payment back to them.
export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()

    const customerName = String(body.customerName || '').trim()
    const orderNumber = String(body.orderNumber || '').trim()
    const amount = Number(body.amount || 0)
    const salespersonName = String(body.salespersonName || '').trim()
    const salespersonEmail = String(body.salespersonEmail || '').trim().toLowerCase()
    const customerPhone = String(body.customerPhone || '').trim()
    const customerEmail = String(body.customerEmail || '').trim().toLowerCase()
    const deliveryMethod = String(body.deliveryMethod || 'link').trim() // 'sms' | 'email' | 'link'
    const createdBy = (user.email || '').toLowerCase() || null

    if (!customerName) return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 })
    if (!orderNumber) return NextResponse.json({ error: 'Order number is required.' }, { status: 400 })
    if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Enter a payment amount greater than zero.' }, { status: 400 })
    if (!salespersonEmail || !isEmail(salespersonEmail)) return NextResponse.json({ error: 'A valid return email address is required.' }, { status: 400 })
    if (deliveryMethod === 'sms' && !customerPhone) return NextResponse.json({ error: 'Enter the customer mobile to send by SMS.' }, { status: 400 })
    if (deliveryMethod === 'email' && (!customerEmail || !isEmail(customerEmail))) return NextResponse.json({ error: 'Enter a valid customer email to send by email.' }, { status: 400 })

    // Land the customer on our own branded success page (passing the session id
    // so it can show what they paid). Derived from the request origin so it works
    // on whatever domain the tool is served from.
    const origin = request.headers.get('origin') || `https://${request.headers.get('host') || 'delivery-tools-adl.vercel.app'}`

    // Charge through the Stripe account of the brand this order belongs to.
    const brand = await resolveOrderBrand(orderNumber)
    const brandCfg = brandConfig(brand)
    const stripe = stripeForBrand(brand)

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(orderNumber ? { client_reference_id: orderNumber } : {}),
      line_items: [{
        price_data: {
          currency: 'aud',
          product_data: {
            name: orderNumber ? `Order ${orderNumber}` : `Payment from ${customerName}`,
            description: `Payment for ${customerName}${orderNumber ? ` — order ${orderNumber}` : ''}`
          },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      success_url: `${origin}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_CANCEL_URL || 'https://boconcept.com.au',
      metadata: {
        kind: 'adhoc_payment_link',
        customer_name: customerName,
        order_number: orderNumber,
        amount: String(amount),
        salesperson_name: salespersonName,
        salesperson_email: salespersonEmail
      }
    })

    const stripeUrl = session.url || ''

    // Deliver the link to the customer if requested.
    let deliveryStatus: string | null = null
    if (deliveryMethod === 'sms') {
      const template = await getSmsTemplate()
      const merchant = await getMerchantConfig(brand)
      const message = renderSmsTemplate(template, { customerName, amount, orderNumber, link: stripeUrl }, merchant)
      try {
        const messageId = await sendMessageMediaSms(customerPhone, message, brand)
        deliveryStatus = `SMS sent (${messageId})`
      } catch (error) {
        deliveryStatus = `SMS failed: ${error instanceof Error ? error.message : 'send failed'}`
      }
    } else if (deliveryMethod === 'email') {
      const subject = orderNumber ? `Payment link for order ${orderNumber}` : `Your ${brandCfg.displayName} payment link`
      const text = `Hi ${customerName},\n\nPlease use the secure link below to pay ${formatAmountAu(amount)}${orderNumber ? ` for order ${orderNumber}` : ''}:\n\n${stripeUrl}\n\nThank you,\n${salespersonName || brandCfg.displayName}`
      try {
        await sendEmail({ to: customerEmail, subject, text, from: brandCfg.emailFrom || undefined })
        deliveryStatus = 'Email sent'
      } catch (error) {
        deliveryStatus = `Email failed: ${error instanceof Error ? error.message : 'send failed'}`
      }
    }

    const { data: row, error } = await supabaseAdmin
      .from('payment_links')
      .insert({
        customer_name: customerName,
        order_number: orderNumber || null,
        amount,
        salesperson_name: salespersonName || null,
        salesperson_email: salespersonEmail,
        customer_phone: customerPhone ? normalizeMobileAu(customerPhone) : null,
        customer_email: customerEmail || null,
        delivery_method: deliveryMethod,
        delivery_status: deliveryStatus,
        stripe_session_id: session.id,
        stripe_url: stripeUrl,
        status: 'pending',
        created_by: createdBy
      })
      .select('id, stripe_url, delivery_status')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ id: row.id, url: row.stripe_url, deliveryStatus: row.delivery_status })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create payment link.' }, { status: 500 })
  }
}

// Recent links for the in-tool status list.
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('payment_links')
    .select('id, created_at, customer_name, order_number, amount, status, delivery_method, delivery_status, amount_paid, paid_at')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data || [] })
}
