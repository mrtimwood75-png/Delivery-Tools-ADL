import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Customer = {
  id: string
  name: string | null
  phone: string | null
  address: string | null
  street_address: string | null
  suburb: string | null
  state: string | null
  postcode: string | null
  delivery_notes: string | null
}

type Item = {
  order_id: string
  product_code: string | null
  product_name: string | null
  quantity: number | null
  cubic_meters: number | null
  notes: string | null
}

function clean(value: unknown) {
  return String(value ?? '').trim()
}

function csvEscape(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

function ymd() {
  return new Date().toISOString().slice(0, 10)
}

function normalisePhone(value: unknown) {
  return clean(value).replace(/[^0-9+]/g, '')
}

function splitLegacyAddress(customer: Customer | null) {
  const raw = clean(customer?.address)
  const street = clean(customer?.street_address) || raw
  const suburb = clean(customer?.suburb)
  const postcode = clean(customer?.postcode)
  if (suburb || postcode || !raw) return { street, suburb, postcode }

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean)
  const last = parts[parts.length - 1] || ''
  const postcodeMatch = last.match(/\b(\d{4})\b/)
  const inferredPostcode = postcodeMatch?.[1] || ''
  const inferredSuburb = inferredPostcode ? last.replace(inferredPostcode, '').replace(/\b(NSW|QLD|SA|TAS|VIC|WA|ACT|NT)\b/i, '').trim() : ''
  const inferredStreet = parts.length > 1 ? parts.slice(0, -1).join(', ') : raw.replace(inferredSuburb, '').replace(inferredPostcode, '').trim()
  return { street: inferredStreet || raw, suburb: inferredSuburb, postcode: inferredPostcode }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : []
    if (!ids.length) return NextResponse.json({ error: 'No orders selected.' }, { status: 400 })

    const { data: orders, error: orderError } = await supabaseAdmin
      .from('delivery_orders')
      .select('id, order_number, customer_id, goods_ready_date, goods_in_date')
      .in('id', ids)

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })
    if (!orders?.length) return NextResponse.json({ error: 'No matching orders found.' }, { status: 404 })

    const customerIds = Array.from(new Set(orders.map((order) => order.customer_id).filter(Boolean)))
    const customersById: Record<string, Customer> = {}

    if (customerIds.length) {
      const { data: customers, error: customerError } = await supabaseAdmin
        .from('customers')
        .select('id, name, phone, address, street_address, suburb, state, postcode, delivery_notes')
        .in('id', customerIds)

      if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
      for (const customer of customers || []) customersById[customer.id] = customer as Customer
    }

    const { data: items, error: itemError } = await supabaseAdmin
      .from('delivery_order_items')
      .select('order_id, product_code, product_name, quantity, cubic_meters, notes')
      .in('order_id', ids)
      .order('created_at', { ascending: true })

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    const itemsByOrderId: Record<string, Item[]> = {}
    for (const item of (items || []) as Item[]) {
      if (!itemsByOrderId[item.order_id]) itemsByOrderId[item.order_id] = []
      itemsByOrderId[item.order_id].push(item)
    }

    const headers = [
      'Sales Order Number',
      'Delivery Type',
      'Customer Name',
      'SKU number',
      'Product Description',
      'Quantity',
      'Location',
      'Ship Address',
      'Ship Zip',
      'Ship City',
      'Phone',
      'Weight',
      'Volume(Unit)',
      'EmailAddress',
      'Notes'
    ]

    const rows = [headers]
    for (const order of orders) {
      const customer = order.customer_id ? customersById[order.customer_id] : null
      const address = splitLegacyAddress(customer)
      const phone = normalisePhone(customer?.phone)
      const orderItems = itemsByOrderId[order.id]?.length ? itemsByOrderId[order.id] : [{ order_id: order.id, product_code: '', product_name: '', quantity: 1, cubic_meters: 0, notes: '' }]
      for (const item of orderItems) {
        rows.push([
          order.order_number || '',
          'premium delivery',
          customer?.name || '',
          item.product_code || '',
          item.product_name || '',
          item.quantity || 1,
          'bcwh',
          address.street,
          address.postcode,
          address.suburb,
          phone,
          '',
          item.cubic_meters ?? 0,
          '',
          [customer?.delivery_notes, item.notes].map(clean).filter(Boolean).join(' | ')
        ])
      }
    }

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="Irise-boconcept-${ymd()}.csv"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'iRise export failed.' }, { status: 500 })
  }
}
