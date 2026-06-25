import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMessageMediaStatus } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Diagnostic: returns the live MessageMedia delivery status for recent sends
// (or one ?id=, or all for an ?orderId=). Helps tell "accepted" from "delivered".
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  const orderId = url.searchParams.get('orderId')
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 12), 1), 25)

  let rows: { provider_message_id: string | null; created_at: string; phone: string | null; body: string; status: string | null }[] = []
  if (id) {
    rows = [{ provider_message_id: id, created_at: '', phone: null, body: '', status: null }]
  } else {
    let query = supabaseAdmin
      .from('sms_messages')
      .select('provider_message_id, created_at, phone, body, status')
      .eq('direction', 'outbound')
      .not('provider_message_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (orderId) query = query.eq('order_id', orderId)
    const { data } = await query
    rows = data || []
  }

  const results = []
  for (const row of rows) {
    if (!row.provider_message_id) continue
    const mm = await getMessageMediaStatus(row.provider_message_id)
    results.push({
      message_id: row.provider_message_id,
      created_at: row.created_at,
      phone: row.phone,
      preview: String(row.body || '').slice(0, 40),
      our_status: row.status,
      delivery_status: mm.status,
      sent_to: mm.destination || null,
      sent_content: mm.content || null,
      error: mm.error || null
    })
  }
  return NextResponse.json({ results }, { headers: { 'Cache-Control': 'no-store' } })
}
