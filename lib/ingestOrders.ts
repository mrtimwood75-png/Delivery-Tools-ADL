import { supabaseAdmin } from '@/lib/supabaseAdmin'

// A single normalized order row, source-agnostic. Both the BCA packing-list
// import and the Transforma Options-API sync hand rows in this shape to
// ingestRows(), which owns the MERGE logic into Supabase.
export type ImportRow = {
  send_sms?: boolean
  customer_name: string
  salesperson?: string
  mobile: string
  order_number: string
  balance_payable: number
  product_name?: string
  product_code?: string
  quantity?: number
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
  milliseconds: number
}

function cleanRows(rows: ImportRow[]) {
  const map = new Map<string, ImportRow & { order_number: string; customer_name: string }>()
  for (const row of rows) {
    const orderNumber = String(row.order_number || '').trim().toUpperCase()
    const customerName = String(row.customer_name || '').trim()
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
// Each source only ever writes the fields it owns (payment, salesperson, stripe
// link). Status, dates, notes, items and the delivery address an existing order
// already carries are left untouched, so the two sources and the dashboard never
// blank each other's data. New orders are tagged with the originating `source`.
export async function ingestRows(rows: ImportRow[], { source }: { source: OrderSource }): Promise<IngestResult> {
  const cleaned = cleanRows(rows)
  if (!cleaned.length) {
    return { imported: 0, created: 0, updated: 0, milliseconds: 0 }
  }

  const startedAt = Date.now()

  // Register any new salesperson codes so they appear in admin for email mapping.
  const salesCodes = Array.from(new Set(cleaned.map((row) => String(row.salesperson || '').trim()).filter(Boolean)))
  if (salesCodes.length) {
    await supabaseAdmin.from('salespeople').upsert(salesCodes.map((code) => ({ code })), { onConflict: 'code', ignoreDuplicates: true })
  }

  // Look up existing orders so we MERGE — only ever add/update the fields this
  // source carries, and never blank data the other source or dashboard set.
  const { data: existingRows, error: existError } = await supabaseAdmin
    .from('delivery_orders')
    .select('id, order_number, customer_id')
    .in('order_number', cleaned.map((row) => row.order_number))
  if (existError) throw new Error(existError.message)
  const existingByNumber = new Map((existingRows || []).map((order) => [order.order_number, order]))

  let created = 0
  let updated = 0

  for (const row of cleaned) {
    const balance = Number(row.balance_payable || 0)
    const sales = String(row.salesperson || '').trim()
    const existing = existingByNumber.get(row.order_number)

    if (existing) {
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
      const { data: customer, error: customerError } = await supabaseAdmin
        .from('customers')
        .insert({ name: row.customer_name, phone: row.mobile || '', address: '' })
        .select('id')
        .single()
      if (customerError || !customer) throw new Error(customerError?.message || 'Could not create customer.')

      const { data: order, error: orderError } = await supabaseAdmin
        .from('delivery_orders')
        .insert({
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
        })
        .select('id')
        .single()
      if (orderError || !order) throw new Error(orderError?.message || 'Could not create order.')

      await supabaseAdmin.from('delivery_order_items').insert({
        order_id: order.id,
        product_name: row.product_name || `Balance payable ${balance.toFixed(2)}`,
        product_code: row.product_code || '',
        quantity: Number(row.quantity || 1)
      })
      created += 1
    }
  }

  return { imported: created + updated, created, updated, milliseconds: Date.now() - startedAt }
}
