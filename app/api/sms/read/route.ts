import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const customerId = String(body.customerId || '')
    const phone = String(body.phone || '')
    if (!customerId && !phone) return NextResponse.json({ error: 'Missing customerId or phone.' }, { status: 400 })

    // Matched replies are marked read by customer; unmatched replies (from a
    // number not yet imported) are dismissed by their sender phone number.
    let query = supabaseAdmin
      .from('sms_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('direction', 'inbound')
      .is('read_at', null)
    query = customerId ? query.eq('customer_id', customerId) : query.is('customer_id', null).eq('phone', phone)
    const { error } = await query

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Mark read failed.' }, { status: 500 })
  }
}
