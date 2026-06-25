import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type UnreadRow = {
  customer_id: string | null
  order_id: string | null
  body: string
  created_at: string
  customers: { name: string | null } | { name: string | null }[] | null
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('sms_messages')
    .select('customer_id, order_id, body, created_at, customers(name)')
    .eq('direction', 'inbound')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as UnreadRow[]
  const byCustomer = new Map<string, { customer_id: string; customer_name: string; order_id: string | null; body: string; created_at: string; count: number }>()

  for (const row of rows) {
    if (!row.customer_id) continue
    const name = (Array.isArray(row.customers) ? row.customers[0]?.name : row.customers?.name) || 'Customer'
    const existing = byCustomer.get(row.customer_id)
    if (existing) existing.count += 1
    else byCustomer.set(row.customer_id, { customer_id: row.customer_id, customer_name: name, order_id: row.order_id, body: row.body, created_at: row.created_at, count: 1 })
  }

  return NextResponse.json({ total: rows.length, items: Array.from(byCustomer.values()) })
}
