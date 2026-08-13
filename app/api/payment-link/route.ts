import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmail } from '@/lib/email'
import { sendMessageMediaSms } from '@/lib/sms'
import { formatAmountAu, normalizeMobileAu } from '@/lib/format'
import { getRequestUser } from '@/lib/apiAuth'
import { getSmsTemplate, renderSmsTemplate } from '@/lib/paymentMessage'
import { resolveOrderBrand } from '@/lib/stripe'
import { brandConfig } from '@/lib/brand'
import { paymentBrandForHost } from '@/lib/host'
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

    // The tool serves the customer a STABLE link (…/pay/<id>) rather than a raw
    // 24h Stripe URL. Visiting it mints a fresh session on demand, so the link
    // never dies. Derived from the request origin so it works on any domain.
    const origin = process.env.PUBLIC_BASE_URL || request.headers.get('origin') || `https://${request.headers.get('host') || 'dashboard-adl.vercel.app'}`
    // On a payment host the brand is fixed by the domain; on the dashboard it
    // falls back to the order's own source.
    const brand = paymentBrandForHost(request.headers.get('host')) || await resolveOrderBrand(orderNumber)
    const brandCfg = brandConfig(brand)

    // Record the link first so we have its id to build the stable URL from.
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
        status: 'pending',
        brand,
        created_by: createdBy
      })
      .select('id')
      .single()

    if (error || !row) return NextResponse.json({ error: error?.message || 'Could not create payment link.' }, { status: 500 })

    const payUrl = `${origin}/pay/${row.id}`

    // Deliver the stable link to the customer if requested.
    let deliveryStatus: string | null = null
    if (deliveryMethod === 'sms') {
      const template = await getSmsTemplate()
      const merchant = await getMerchantConfig(brand)
      const message = renderSmsTemplate(template, { customerName, amount, orderNumber, link: payUrl, salespersonName }, merchant)
      try {
        const messageId = await sendMessageMediaSms(customerPhone, message, brand)
        deliveryStatus = `SMS sent (${messageId})`
      } catch (error) {
        deliveryStatus = `SMS failed: ${error instanceof Error ? error.message : 'send failed'}`
      }
    } else if (deliveryMethod === 'email') {
      const subject = orderNumber ? `Payment link for order ${orderNumber}` : `Your ${brandCfg.displayName} payment link`
      const text = `Hi ${customerName},\n\nPlease use the secure link below to pay ${formatAmountAu(amount)}${orderNumber ? ` for order ${orderNumber}` : ''}:\n\n${payUrl}\n\nThank you,\n${salespersonName || brandCfg.displayName}`
      try {
        await sendEmail({ to: customerEmail, subject, text, from: brandCfg.emailFrom || undefined })
        deliveryStatus = 'Email sent'
      } catch (error) {
        deliveryStatus = `Email failed: ${error instanceof Error ? error.message : 'send failed'}`
      }
    }

    if (deliveryStatus) {
      await supabaseAdmin.from('payment_links').update({ delivery_status: deliveryStatus, updated_at: new Date().toISOString() }).eq('id', row.id)
    }

    return NextResponse.json({ id: row.id, url: payUrl, deliveryStatus })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not create payment link.' }, { status: 500 })
  }
}

// Recent links for the in-tool status list — the last 10 transactions.
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // On a payment host, only that brand's links; on the dashboard, all.
  const brand = paymentBrandForHost(request.headers.get('host'))
  let query = supabaseAdmin
    .from('payment_links')
    .select('id, created_at, customer_name, order_number, amount, status, delivery_method, delivery_status, amount_paid, paid_at')
    .order('created_at', { ascending: false })
    .limit(10)
  if (brand) query = query.eq('brand', brand)

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ links: data || [] })
}
