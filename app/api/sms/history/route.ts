import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    let customerId = searchParams.get('customerId') || ''
    const orderId = searchParams.get('orderId') || ''

    if (!customerId && orderId) {
      const { data: order, error: orderError } = await supabaseAdmin
        .from('delivery_orders')
        .select('customer_id')
        .eq('id', orderId)
        .maybeSingle()
      if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })
      customerId = order?.customer_id || ''
    }

    if (!customerId) return NextResponse.json({ messages: [], customerId: '' })

    const { data, error } = await supabaseAdmin
      .from('sms_messages')
      .select('id, created_at, direction, phone, body, status, provider_message_id, order_id, error')
      .eq('customer_id', customerId)
      // Chronological, with deterministic tie-breaks: on an equal timestamp show
      // the customer's inbound before our outbound reply ('inbound' < 'outbound'),
      // then by id so repeated ties stay in a stable order.
      .order('created_at', { ascending: true })
      .order('direction', { ascending: true })
      .order('id', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ messages: data || [], customerId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load SMS history.' }, { status: 500 })
  }
}
