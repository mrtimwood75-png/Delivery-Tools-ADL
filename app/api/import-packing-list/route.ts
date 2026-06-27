import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { toProperCase, stripCustomerTitle } from '@/lib/text'

type PackingRow = {
  order_number: string
  customer_name?: string
  mobile?: string
  street_address?: string
  suburb?: string
  state?: string
  postcode?: string
  delivery_notes?: string
  product_name: string
  product_code?: string
  quantity?: number
  cubic_meters?: number
  notes?: string
}

function cleanText(value: unknown) {
  return String(value || '').trim().replace(/�/g, 'x')
}

function cleanRows(rows: PackingRow[]) {
  return rows
    .map((row) => ({
      order_number: cleanText(row.order_number).toUpperCase(),
      customer_name: stripCustomerTitle(toProperCase(cleanText(row.customer_name))),
      mobile: cleanText(row.mobile),
      street_address: toProperCase(cleanText(row.street_address)),
      suburb: toProperCase(cleanText(row.suburb)),
      state: cleanText(row.state).toUpperCase(),
      postcode: cleanText(row.postcode),
      delivery_notes: cleanText(row.delivery_notes),
      product_name: toProperCase(cleanText(row.product_name)),
      product_code: cleanText(row.product_code),
      quantity: Number(row.quantity || 1),
      cubic_meters: Number(row.cubic_meters || 0),
      notes: cleanText(row.notes)
    }))
    .filter((row) => row.order_number && (row.product_name || row.product_code))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rows = cleanRows(Array.isArray(body.rows) ? body.rows : [])

    if (!rows.length) return NextResponse.json({ error: 'No packing list rows supplied.' }, { status: 400 })

    const orderNumbers = Array.from(new Set(rows.map((row) => row.order_number)))

    const { data: orders, error: orderError } = await supabaseAdmin
      .from('delivery_orders')
      .select('id, order_number, customer_id')
      .in('order_number', orderNumbers)

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

    const orderIdByNumber = new Map((orders || []).map((order) => [order.order_number, order.id]))
    const customerIdByNumber = new Map((orders || []).map((order) => [order.order_number, order.customer_id]))
    const matchedRows = rows.filter((row) => orderIdByNumber.has(row.order_number))
    const unmatchedOrders = orderNumbers.filter((orderNumber) => !orderIdByNumber.has(orderNumber))

    if (!matchedRows.length) {
      return NextResponse.json({ imported: 0, matchedOrders: 0, updatedCustomers: 0, unmatchedOrders, message: 'No matching orders found.' })
    }

    const addressRowsByOrder = new Map<string, typeof matchedRows[number]>()
    for (const row of matchedRows) {
      if (!addressRowsByOrder.has(row.order_number)) addressRowsByOrder.set(row.order_number, row)
    }

    let updatedCustomers = 0
    for (const [orderNumber, row] of addressRowsByOrder.entries()) {
      const customerId = customerIdByNumber.get(orderNumber)
      if (!customerId) continue

      const update: Record<string, string> = {}
      if (row.customer_name) update.name = row.customer_name
      if (row.mobile) update.phone = row.mobile
      if (row.street_address) {
        update.address = row.street_address
        update.street_address = row.street_address
      }
      if (row.suburb) update.suburb = row.suburb
      if (row.state) update.state = row.state
      if (row.postcode) update.postcode = row.postcode
      if (row.delivery_notes) update.delivery_notes = row.delivery_notes

      if (!Object.keys(update).length) continue

      const { error: customerError } = await supabaseAdmin
        .from('customers')
        .update(update)
        .eq('id', customerId)

      if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
      updatedCustomers += 1
    }

    const matchedOrderIds = Array.from(new Set(matchedRows.map((row) => orderIdByNumber.get(row.order_number)).filter(Boolean)))

    const { error: deleteError } = await supabaseAdmin
      .from('delivery_order_items')
      .delete()
      .in('order_id', matchedOrderIds)

    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

    const itemPayload = matchedRows.map((row) => ({
      order_id: orderIdByNumber.get(row.order_number),
      product_name: row.product_name || row.product_code || 'Item',
      product_code: row.product_code || '',
      quantity: Number(row.quantity || 1),
      cubic_meters: Number(row.cubic_meters || 0),
      notes: row.notes || ''
    }))

    const { error: itemError } = await supabaseAdmin
      .from('delivery_order_items')
      .insert(itemPayload)

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    return NextResponse.json({
      imported: itemPayload.length,
      matchedOrders: matchedOrderIds.length,
      updatedCustomers,
      unmatchedOrders
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Packing List import failed.' }, { status: 500 })
  }
}
