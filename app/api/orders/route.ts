import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmail } from '@/lib/email'
import { brandForSource, brandConfig } from '@/lib/brand'
import { runSimpleTrigger, runStatusSet } from '@/lib/automations'

type OrderLookupRow = {
  id: string
  customer_id: string | null
}

function formatDateAu(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-AU')
}

// Best-effort: email the order's salesperson that it has been delivered,
// using the admin-configured template. Silently skips if anything is missing.
async function sendDeliveryEmail(orderId: string): Promise<{ ok: boolean; reason: string }> {
  const { data: order } = await supabaseAdmin
    .from('delivery_orders')
    .select('order_number, salesperson, delivery_date, source, customers(name)')
    .eq('id', orderId)
    .maybeSingle()
  if (!order || !order.salesperson) return { ok: false, reason: 'order has no salesperson' }

  // Send from the order's own merchant address (BCA_EMAIL_FROM / TRANSFORMA_EMAIL_FROM),
  // falling back to the global EMAIL_FROM.
  const from = brandConfig(brandForSource(order.source)).emailFrom || undefined

  const { data: sp } = await supabaseAdmin
    .from('salespeople')
    .select('name, email')
    .eq('code', order.salesperson)
    .maybeSingle()
  if (!sp?.email) return { ok: false, reason: `no email set for salesperson "${order.salesperson}"` }

  const { data: tpl } = await supabaseAdmin
    .from('email_templates')
    .select('subject, body, enabled')
    .eq('key', 'delivery')
    .maybeSingle()
  if (!tpl) return { ok: false, reason: 'no delivery email template' }
  if (!tpl.enabled) return { ok: false, reason: 'delivery email is turned off in Admin' }

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const fill = (text: string) => String(text || '')
    .replaceAll('{order_number}', order.order_number || '')
    .replaceAll('{customer_name}', customer?.name || '')
    .replaceAll('{salesperson_code}', order.salesperson || '')
    .replaceAll('{salesperson_name}', sp.name || order.salesperson || '')
    .replaceAll('{delivery_date}', formatDateAu(order.delivery_date) || 'today')

  await sendEmail({ to: sp.email, subject: fill(tpl.subject), text: fill(tpl.body), from })
  return { ok: true, reason: `sent to ${sp.email}` }
}

const customerSelect = 'id, name, phone, address, street_address, suburb, state, postcode, delivery_notes'

function cleanText(value: unknown) {
  return String(value || '').trim()
}

function numericValue(value: unknown, fallback = 0) {
  const n = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

export async function GET(request: NextRequest) {
  const view = new URL(request.url).searchParams.get('view') === 'archived' ? 'archived' : 'active'
  let query = supabaseAdmin
    .from('delivery_orders')
    .select('id, created_at, import_date, imported_at, order_number, customer_id, payment_status, order_status, ready_status, goods_ready_date, goods_in_date, delivery_date, stripe_link, stripe_link_expires_at, payment_due, sms_status, date_sent, order_notes, archived_at, salesperson, source, delivery_confirmation')
    .order('imported_at', { ascending: false })
    .order('order_number', { ascending: true })
    .limit(500)
  query = view === 'archived' ? query.not('archived_at', 'is', null) : query.is('archived_at', null)
  const { data: orderRows, error: orderError } = await query

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

  const customerIds = Array.from(new Set((orderRows || []).map((order) => order.customer_id).filter(Boolean)))
  const orderIds = (orderRows || []).map((order) => order.id)

  const customersById: Record<string, { name: string; phone: string | null; address: string | null; street_address: string | null; suburb: string | null; state: string | null; postcode: string | null; delivery_notes: string | null }> = {}
  const itemsByOrderId: Record<string, { id: string; product_name: string; product_code: string | null; quantity: number; cubic_meters: number; notes: string | null }[]> = {}

  if (customerIds.length) {
    const { data: customerRows, error: customerError } = await supabaseAdmin
      .from('customers')
      .select(customerSelect)
      .in('id', customerIds)

    if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })

    for (const customer of customerRows || []) {
      customersById[customer.id] = {
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        street_address: customer.street_address,
        suburb: customer.suburb,
        state: customer.state,
        postcode: customer.postcode,
        delivery_notes: customer.delivery_notes
      }
    }
  }

  if (orderIds.length) {
    const { data: itemRows, error: itemError } = await supabaseAdmin
      .from('delivery_order_items')
      .select('id, order_id, product_name, product_code, quantity, cubic_meters, notes')
      .in('order_id', orderIds)
      .order('created_at', { ascending: true })

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    for (const item of itemRows || []) {
      if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = []
      itemsByOrderId[item.order_id].push({
        id: item.id,
        product_name: item.product_name,
        product_code: item.product_code,
        quantity: item.quantity,
        cubic_meters: Number(item.cubic_meters || 0),
        notes: item.notes
      })
    }
  }

  const repliedCustomerIds = new Set<string>()
  if (customerIds.length) {
    const { data: replyRows } = await supabaseAdmin
      .from('sms_messages')
      .select('customer_id')
      .eq('direction', 'inbound')
      .in('customer_id', customerIds)
    for (const row of replyRows || []) if (row.customer_id) repliedCustomerIds.add(row.customer_id as string)
  }

  const orders = (orderRows || []).map((order) => ({
    ...order,
    ready_status: order.ready_status || 'Not Ready',
    payment_status: Number(order.payment_due || 0) > 0 ? 'Unpaid' : 'Paid',
    customers: customersById[order.customer_id] || null,
    items: itemsByOrderId[order.id] || [],
    has_reply: repliedCustomerIds.has(order.customer_id)
  }))

  return NextResponse.json({ orders }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const orderNumber = cleanText(body.order_number).toUpperCase()
    const customerName = cleanText(body.customer_name)
    const paymentDue = numericValue(body.payment_due, 0)
    const items = Array.isArray(body.items) ? body.items : []

    if (!orderNumber) return NextResponse.json({ error: 'Order number is required.' }, { status: 400 })
    if (!customerName) return NextResponse.json({ error: 'Customer name is required.' }, { status: 400 })

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .insert({
        name: customerName,
        phone: cleanText(body.phone),
        address: cleanText(body.address),
        street_address: cleanText(body.street_address || body.address),
        suburb: cleanText(body.suburb),
        state: cleanText(body.state),
        postcode: cleanText(body.postcode),
        delivery_notes: cleanText(body.delivery_notes)
      })
      .select('id')
      .single()

    if (customerError || !customer) return NextResponse.json({ error: customerError?.message || 'Could not create customer.' }, { status: 500 })

    const { data: order, error: orderError } = await supabaseAdmin
      .from('delivery_orders')
      .upsert({
        order_number: orderNumber,
        customer_id: customer.id,
        payment_due: paymentDue,
        payment_status: paymentDue > 0 ? 'Unpaid' : 'Paid',
        order_status: cleanText(body.order_status) || 'Open',
        ready_status: cleanText(body.ready_status) || 'Not Ready',
        goods_in_date: cleanText(body.goods_in_date) || null,
        goods_ready_date: cleanText(body.goods_ready_date) || null,
        delivery_date: cleanText(body.delivery_date) || null,
        order_notes: cleanText(body.order_notes) || null,
        sms_status: ''
      }, { onConflict: 'order_number' })
      .select('id, order_number')
      .single()

    if (orderError || !order) return NextResponse.json({ error: orderError?.message || 'Could not create order.' }, { status: 500 })

    const cleanItems = items
      .map((item: Record<string, unknown>) => ({
        order_id: order.id,
        product_code: cleanText(item.product_code),
        product_name: cleanText(item.product_name) || 'Manual product line',
        quantity: numericValue(item.quantity, 1),
        cubic_meters: numericValue(item.cubic_meters, 0),
        notes: cleanText(item.notes)
      }))
      .filter((item: { product_name: string }) => item.product_name)

    if (cleanItems.length) {
      const { error: itemError } = await supabaseAdmin
        .from('delivery_order_items')
        .insert(cleanItems)

      if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })
    }

    return NextResponse.json({ order, created: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Manual order create failed.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing order id.' }, { status: 400 })

    const orderUpdate: Record<string, unknown> = {}
    for (const key of ['order_status', 'ready_status', 'goods_ready_date', 'goods_in_date', 'delivery_date', 'order_notes', 'salesperson', 'delivery_confirmation']) {
      if (key in body) orderUpdate[key] = body[key] || null
    }

    // Detect a delivery-date transition (null -> date, or date -> null) so the
    // matching automations can fire after the update is written.
    let deliveryTransition: 'delivery_date_set' | 'delivery_date_cleared' | null = null
    if ('delivery_date' in body) {
      const newVal = body.delivery_date || null
      const { data: prev } = await supabaseAdmin.from('delivery_orders').select('delivery_date').eq('id', id).maybeSingle()
      const oldVal = prev?.delivery_date || null
      if (!oldVal && newVal) deliveryTransition = 'delivery_date_set'
      else if (oldVal && !newVal) deliveryTransition = 'delivery_date_cleared'
    }
    if ('delivery_confirmation' in body) orderUpdate.delivery_confirmation_at = new Date().toISOString()

    // Delivered jobs auto-archive; moving the status away from Delivered restores them.
    let willEmailDelivery = false
    if ('order_status' in body) {
      const newStatus = String(body.order_status)
      orderUpdate.archived_at = newStatus === 'Delivered' ? new Date().toISOString() : null
      if (newStatus === 'Delivered') {
        const { data: cur } = await supabaseAdmin.from('delivery_orders').select('delivery_email_sent_at').eq('id', id).maybeSingle()
        if (cur && !cur.delivery_email_sent_at) willEmailDelivery = true
      } else {
        orderUpdate.delivery_email_sent_at = null
      }
    }
    // "When status is set to X" automations fire after the update (handled below).
    const statusChangedTo = ('order_status' in body && !('delivery_confirmation' in body))
      ? String(body.order_status || '').trim()
      : ''

    if ('archived_at' in body) orderUpdate.archived_at = body.archived_at

    if ('order_number' in body) {
      const orderNumber = cleanText(body.order_number).toUpperCase()
      if (!orderNumber) return NextResponse.json({ error: 'Order number cannot be empty.' }, { status: 400 })
      orderUpdate.order_number = orderNumber
    }

    if ('payment_due' in body) {
      const paymentDue = Number(String(body.payment_due ?? '').replace(',', '.'))
      if (!Number.isFinite(paymentDue)) return NextResponse.json({ error: 'Invalid payment amount.' }, { status: 400 })
      orderUpdate.payment_due = paymentDue
      orderUpdate.payment_status = paymentDue > 0 ? 'Unpaid' : 'Paid'
    }

    if (Object.keys(orderUpdate).length) {
      const { error } = await supabaseAdmin
        .from('delivery_orders')
        .update(orderUpdate)
        .eq('id', id)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (willEmailDelivery) {
      try {
        const result = await sendDeliveryEmail(id)
        console.log(`[delivery-email] ${id} ${result.ok ? 'SENT' : 'SKIPPED'}: ${result.reason}`)
        if (result.ok) await supabaseAdmin.from('delivery_orders').update({ delivery_email_sent_at: new Date().toISOString() }).eq('id', id)
      } catch (emailError) {
        // Never block the status update; just record why it failed.
        console.error(`[delivery-email] ${id} FAILED: ${emailError instanceof Error ? emailError.message : 'error'}`)
      }
    }

    const customerUpdate: Record<string, unknown> = {}
    for (const key of ['name', 'phone', 'address', 'street_address', 'suburb', 'state', 'postcode', 'delivery_notes']) {
      if (key in body) customerUpdate[key] = String(body[key] || '').trim() || null
    }

    if (Object.keys(customerUpdate).length) {
      const { data: order, error: lookupError } = await supabaseAdmin
        .from('delivery_orders')
        .select('customer_id')
        .eq('id', id)
        .single()

      if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
      if (order?.customer_id) {
        const { error: customerError } = await supabaseAdmin
          .from('customers')
          .update(customerUpdate)
          .eq('id', order.customer_id)

        if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
      }
    }

    // Fire delivery-date automations, then echo the resulting display fields so
    // the dashboard reflects any status/light change without a reload.
    const echo: Record<string, unknown> = {}
    if ('delivery_confirmation' in orderUpdate) echo.delivery_confirmation = orderUpdate.delivery_confirmation
    let ranAutomation = Boolean(deliveryTransition)
    if (deliveryTransition) {
      try { await runSimpleTrigger(id, deliveryTransition) } catch (e) { console.error('[automation] delivery-date trigger failed', id, e) }
    }
    if (statusChangedTo) {
      try { const n = await runStatusSet(id, statusChangedTo); if (n) ranAutomation = true } catch (e) { console.error('[automation] status-set trigger failed', id, e) }
    }
    if (ranAutomation) {
      const { data: after } = await supabaseAdmin
        .from('delivery_orders')
        .select('order_status, delivery_confirmation, ready_status, archived_at')
        .eq('id', id)
        .maybeSingle()
      if (after) Object.assign(echo, after)
    }

    return NextResponse.json({ order: { id, ...echo } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Order update failed.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : []

    if (!ids.length) return NextResponse.json({ error: 'No orders selected.' }, { status: 400 })

    const { data: orders, error: lookupError } = await supabaseAdmin
      .from('delivery_orders')
      .select('id, customer_id')
      .in('id', ids)

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

    const customerIds = Array.from(new Set(((orders || []) as OrderLookupRow[]).map((order) => order.customer_id).filter((id): id is string => Boolean(id))))

    const { error: itemError } = await supabaseAdmin
      .from('delivery_order_items')
      .delete()
      .in('order_id', ids)

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    const { error: orderError } = await supabaseAdmin
      .from('delivery_orders')
      .delete()
      .in('id', ids)

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

    if (customerIds.length) {
      const { data: remaining, error: remainingError } = await supabaseAdmin
        .from('delivery_orders')
        .select('customer_id')
        .in('customer_id', customerIds)

      if (remainingError) return NextResponse.json({ error: remainingError.message }, { status: 500 })

      const stillUsed = new Set(((remaining || []) as OrderLookupRow[]).map((order) => order.customer_id).filter((id): id is string => Boolean(id)))
      const orphanCustomerIds = customerIds.filter((id) => !stillUsed.has(id))

      if (orphanCustomerIds.length) {
        const { error: customerError } = await supabaseAdmin
          .from('customers')
          .delete()
          .in('id', orphanCustomerIds)

        if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ deleted: ids.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed.' }, { status: 500 })
  }
}
