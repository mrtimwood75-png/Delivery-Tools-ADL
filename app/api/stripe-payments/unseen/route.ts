import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Row = {
  id: string
  created_at: string
  amount: number
  order_number: string | null
  delivery_orders: { customers: { name: string | null } | { name: string | null }[] | null } | { customers: { name: string | null } | { name: string | null }[] | null }[] | null
}

export async function GET() {
  // Only notify for payments that matched a dashboard order. Unmatched payments
  // (ad-hoc payment-link sales, order-number typos, deleted orders) never raise
  // a dashboard notification.
  const { data, error } = await supabaseAdmin
    .from('stripe_payments')
    .select('id, created_at, amount, order_number, delivery_orders(customers(name))')
    .is('acknowledged_at', null)
    .not('order_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = ((data || []) as Row[]).map((row) => {
    const order = Array.isArray(row.delivery_orders) ? row.delivery_orders[0] : row.delivery_orders
    const customer = order && (Array.isArray(order.customers) ? order.customers[0] : order.customers)
    return { id: row.id, amount: Number(row.amount || 0), order_number: row.order_number || '', customer_name: customer?.name || null, created_at: row.created_at }
  })

  return NextResponse.json({ total: items.length, items })
}
