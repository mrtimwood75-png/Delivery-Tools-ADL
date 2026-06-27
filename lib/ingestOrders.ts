import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { lookupSuburb } from '@/lib/postcode'
import { stripCustomerTitle } from '@/lib/text'

// A single normalized order row, source-agnostic. Both the BCA packing-list
// import and the Transforma Options-API sync hand rows in this shape to
// ingestRows(), which owns the MERGE logic into Supabase.
export type ImportRow = {
  send_sms?: boolean
  customer_name: string
  salesperson?: string
  salesperson_name?: string
  mobile: string
  order_number: string
  balance_payable: number
  product_name?: string
  product_code?: string
  quantity?: number
  // Full product-line list for the order (Transforma supplies every line). When
  // present, all of these are created as order items; product_name/code/quantity
  // above are just the first line for back-compat.
  items?: Array<{ product_name?: string; product_code?: string; quantity?: number }>
  // Optional delivery address (Transforma supplies these from the Options API).
  street_address?: string
  suburb?: string
  state?: string
  postcode?: string
  // Booked delivery date as YYYY-MM-DD (Transforma: BOOKOUT).
  delivery_date?: string
  stripe_session_id?: string
  stripe_checkout_url?: string
  stripe_link_amount?: number
  sms_status?: string
  payment_status?: string
  date_sent?: string
}

export type OrderSource = 'bca' | 'transforma'

export type IngestResult = {
  imported: number
  created: number
  updated: number
  skipped: number
  milliseconds: number
}

function cleanRows(rows: ImportRow[]) {
  const map = new Map<string, ImportRow & { order_number: string; customer_name: string }>()
  for (const row of rows) {
    const orderNumber = String(row.order_number || '').trim().toUpperCase()
    const customerName = stripCustomerTitle(String(row.customer_name || '').trim())
    if (!orderNumber || !customerName) continue
    map.set(orderNumber, { ...row, order_number: orderNumber, customer_name: customerName })
  }
  return Array.from(map.values())
}

function importPaymentStatus(balance: number) {
  return Number(balance || 0) > 0 ? 'Unpaid' : 'Paid'
}

// MERGE order rows from a given ingest source into Supabase.
//
// New orders are created (tagged with the originating `source`, plus address and
// booked delivery date when supplied). For existing orders:
//  - updateExisting=true (BCA): only the fields this source owns are updated
//    (payment, salesperson, stripe link); status, dates, notes and items are left
//    untouched.
//  - updateExisting=false (Transforma): the order is left completely untouched, so
//    a later sync never overwrites edits made on the dashboard.
export async function ingestRows(
  rows: ImportRow[],
  { source, updateExisting = true }: { source: OrderSource; updateExisting?: boolean }
): Promise<IngestResult> {
  const cleaned = cleanRows(rows)
  if (!cleaned.length) {
    return { imported: 0, created: 0, updated: 0, skipped: 0, milliseconds: 0 }
  }

  const startedAt = Date.now()

  // Register salesperson codes (so admin can map email), and set their name when
  // the source resolved one (Transforma's AREA code -> salesperson name).
  const nameByCode = new Map<string, string>()
  for (const row of cleaned) {
    const code = String(row.salesperson || '').trim()
    const name = String(row.salesperson_name || '').trim()
    if (code && name) nameByCode.set(code, name)
  }
  const salesCodes = Array.from(new Set(cleaned.map((row) => String(row.salesperson || '').trim()).filter(Boolean)))
  if (salesCodes.length) {
    const withName = salesCodes.filter((c) => nameByCode.has(c)).map((c) => ({ code: c, name: nameByCode.get(c) }))
    // New codes are tagged with the originating brand so admin can group them
    // (bca vs transforma). ignoreDuplicates means existing rows — and any brand
    // the admin set on them — are never overwritten.
    const withoutName = salesCodes.filter((c) => !nameByCode.has(c)).map((c) => ({ code: c, brand: source }))
    if (withName.length) await supabaseAdmin.from('salespeople').upsert(withName, { onConflict: 'code' })
    if (withoutName.length) await supabaseAdmin.from('salespeople').upsert(withoutName, { onConflict: 'code', ignoreDuplicates: true })
  }

  const { data: existingRows, error: existError } = await supabaseAdmin
    .from('delivery_orders')
    .select('id, order_number, customer_id')
    .in('order_number', cleaned.map((row) => row.order_number))
  if (existError) throw new Error(existError.message)
  const existingByNumber = new Map((existingRows || []).map((order) => [order.order_number, order]))

  let created = 0
  let updated = 0
  let skipped = 0

  for (const row of cleaned) {
    const balance = Number(row.balance_payable || 0)
    const sales = String(row.salesperson || '').trim()
    const existing = existingByNumber.get(row.order_number)

    if (existing) {
      // Never overwrite an order already on the dashboard (Transforma).
      if (!updateExisting) {
        skipped += 1
        continue
      }
      // Only the fields this source owns. Status, dates, notes, items and the
      // delivery address are left exactly as they are.
      const orderUpdate: Record<string, unknown> = { payment_due: balance, payment_status: importPaymentStatus(balance) }
      if (sales) orderUpdate.salesperson = sales
      if (row.stripe_session_id) orderUpdate.stripe_session_id = row.stripe_session_id
      if (row.stripe_checkout_url) orderUpdate.stripe_link = row.stripe_checkout_url
      if (Number(row.stripe_link_amount || 0)) orderUpdate.stripe_link_amount = Number(row.stripe_link_amount)
      const { error: updError } = await supabaseAdmin.from('delivery_orders').update(orderUpdate).eq('id', existing.id)
      if (updError) throw new Error(updError.message)

      if (existing.customer_id) {
        const customerUpdate: Record<string, unknown> = {}
        if (row.customer_name) customerUpdate.name = row.customer_name
        if (row.mobile) customerUpdate.phone = row.mobile
        if (Object.keys(customerUpdate).length) await supabaseAdmin.from('customers').update(customerUpdate).eq('id', existing.customer_id)
      }
      updated += 1
    } else {
      const customerInsert: Record<string, unknown> = { name: row.customer_name, phone: row.mobile || '', address: row.street_address || '' }
      if (row.street_address) customerInsert.street_address = row.street_address
      if (row.suburb) customerInsert.suburb = row.suburb
      // Derive postcode/state from the suburb when the source didn't supply them
      // (e.g. Transforma's Options address carries only street + suburb).
      let state = row.state || ''
      let postcode = row.postcode || ''
      if (row.suburb && (!state || !postcode)) {
        const hit = lookupSuburb(row.suburb)
        if (hit) { state = state || hit.state; postcode = postcode || hit.postcode }
      }
      if (state) customerInsert.state = state
      if (postcode) customerInsert.postcode = postcode

      const { data: customer, error: customerError } = await supabaseAdmin
        .from('customers')
        .insert(customerInsert)
        .select('id')
        .single()
      if (customerError || !customer) throw new Error(customerError?.message || 'Could not create customer.')

      const orderInsert: Record<string, unknown> = {
        order_number: row.order_number,
        customer_id: customer.id,
        source,
        payment_status: importPaymentStatus(balance),
        order_status: 'Open',
        ready_status: 'Not Ready',
        stripe_session_id: row.stripe_session_id || null,
        stripe_link: row.stripe_checkout_url || null,
        stripe_link_amount: Number(row.stripe_link_amount || 0),
        payment_due: balance,
        salesperson: sales || null
      }
      if (row.delivery_date) orderInsert.delivery_date = row.delivery_date

      const { data: order, error: orderError } = await supabaseAdmin
        .from('delivery_orders')
        .insert(orderInsert)
        .select('id')
        .single()
      if (orderError || !order) throw new Error(orderError?.message || 'Could not create order.')

      const lineItems = (row.items && row.items.length)
        ? row.items
        : [{ product_name: row.product_name, product_code: row.product_code, quantity: row.quantity }]
      await supabaseAdmin.from('delivery_order_items').insert(
        lineItems.map((it) => ({
          order_id: order.id,
          product_name: it.product_name || `Balance payable ${balance.toFixed(2)}`,
          product_code: it.product_code || '',
          quantity: Number(it.quantity || 1)
        }))
      )
      created += 1
    }
  }

  return { imported: created + updated, created, updated, skipped, milliseconds: Date.now() - startedAt }
}
