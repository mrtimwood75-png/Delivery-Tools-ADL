import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : []
    const orderNumbers = Array.isArray(body.orderNumbers) ? body.orderNumbers.map((id: unknown) => String(id).trim().toUpperCase()).filter(Boolean) : []
    const ready = body.ready !== false
    const ready_status = ready ? 'Ready' : 'Not Ready'

    if (!ids.length && !orderNumbers.length) return NextResponse.json({ error: 'No orders selected.' }, { status: 400 })

    let query = supabaseAdmin.from('delivery_orders').update({ ready_status })
    if (ids.length) query = query.in('id', ids)
    else query = query.in('order_number', orderNumbers)

    const { error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ updated: ids.length || orderNumbers.length, ready_status })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Ready status update failed.' }, { status: 500 })
  }
}
