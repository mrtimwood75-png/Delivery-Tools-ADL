import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const customerId = String(body.customerId || '')
    if (!customerId) return NextResponse.json({ error: 'Missing customerId.' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('sms_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('customer_id', customerId)
      .eq('direction', 'inbound')
      .is('read_at', null)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mark read failed.' }, { status: 500 })
  }
}
