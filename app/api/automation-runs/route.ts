import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Recent automation activity for the admin log — the last 50 fires, with the
// order number resolved for display.
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('automation_runs')
    .select('id, automation_id, order_id, trigger_type, summary, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data || []
  const orderIds = Array.from(new Set(rows.map((r) => r.order_id).filter(Boolean))) as string[]
  const orderNumById: Record<string, string> = {}
  if (orderIds.length) {
    const { data: orders } = await supabaseAdmin.from('delivery_orders').select('id, order_number').in('id', orderIds)
    for (const o of orders || []) orderNumById[o.id as string] = (o.order_number as string) || ''
  }
  const runs = rows.map((r) => ({ ...r, order_number: r.order_id ? (orderNumById[r.order_id as string] || '') : '' }))
  return NextResponse.json({ runs }, { headers: { 'Cache-Control': 'no-store' } })
}
