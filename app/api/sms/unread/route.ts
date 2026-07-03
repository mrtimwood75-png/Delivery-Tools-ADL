import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type UnreadRow = {
  customer_id: string | null
  order_id: string | null
  phone: string | null
  body: string
  created_at: string
  customers: { name: string | null } | { name: string | null }[] | null
}

type UnreadItem = {
  customer_id: string | null
  customer_name: string
  order_id: string | null
  phone: string | null
  body: string
  created_at: string
  count: number
  unmatched: boolean
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('sms_messages')
    .select('customer_id, order_id, phone, body, created_at, customers(name)')
    .eq('direction', 'inbound')
    .is('read_at', null)
    .order('created_at', { ascending: false })
    .limit(300)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data || []) as UnreadRow[]
  // Group matched replies by customer, and unmatched replies (from a number not
  // yet in the dashboard) by phone number. Both are shown so the badge/list
  // agree and no real reply is silently dropped — unmatched ones just carry a
  // "customer not yet imported" flag for the UI.
  const items = new Map<string, UnreadItem>()

  let total = 0
  for (const row of rows) {
    const matched = Boolean(row.customer_id)
    const key = matched ? `c:${row.customer_id}` : row.phone ? `p:${row.phone}` : ''
    if (!key) continue // no customer and no sender number — nothing actionable
    total += 1
    const existing = items.get(key)
    if (existing) {
      existing.count += 1
      continue
    }
    const name = (Array.isArray(row.customers) ? row.customers[0]?.name : row.customers?.name) || (matched ? 'Customer' : 'Not yet imported')
    items.set(key, {
      customer_id: row.customer_id,
      customer_name: name,
      order_id: row.order_id,
      phone: row.phone || null,
      body: row.body,
      created_at: row.created_at,
      count: 1,
      unmatched: !matched
    })
  }

  return NextResponse.json({ total, items: Array.from(items.values()) })
}
