import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Combine several orders into one: move all line items into the chosen primary
// order, then archive the source orders (non-destructive — items are moved, not
// deleted, and the source orders are kept in the archive marked as merged).
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const primaryId = String(body.primaryId || '')
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map((id: unknown) => String(id)).filter(Boolean) : []

    if (!primaryId) return NextResponse.json({ error: 'No primary order chosen.' }, { status: 400 })
    if (orderIds.length < 2) return NextResponse.json({ error: 'Select at least two orders to combine.' }, { status: 400 })
    if (!orderIds.includes(primaryId)) return NextResponse.json({ error: 'Primary order must be one of the selected orders.' }, { status: 400 })

    const { data: ordersData, error: lookupError } = await supabaseAdmin
      .from('delivery_orders')
      .select('id, order_number, order_notes')
      .in('id', orderIds)
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

    const primary = (ordersData || []).find((order) => order.id === primaryId)
    const sources = (ordersData || []).filter((order) => order.id !== primaryId)
    if (!primary || !sources.length) return NextResponse.json({ error: 'Could not resolve orders to combine.' }, { status: 400 })

    // Move every line item from the source orders onto the primary order.
    const { error: moveError } = await supabaseAdmin
      .from('delivery_order_items')
      .update({ order_id: primaryId })
      .in('order_id', sources.map((source) => source.id))
    if (moveError) return NextResponse.json({ error: moveError.message }, { status: 500 })

    // Retire the source orders (archived + cancelled, with a note).
    const now = new Date().toISOString()
    for (const source of sources) {
      await supabaseAdmin
        .from('delivery_orders')
        .update({ archived_at: now, order_status: 'Cancelled', order_notes: `Merged into ${primary.order_number}` })
        .eq('id', source.id)
    }

    // Note on the primary which orders were merged in.
    const mergedList = sources.map((source) => source.order_number).join(', ')
    const primaryNotes = [String(primary.order_notes || '').trim(), `Merged in: ${mergedList}`].filter(Boolean).join(' | ')
    await supabaseAdmin.from('delivery_orders').update({ order_notes: primaryNotes }).eq('id', primaryId)

    return NextResponse.json({ combined: sources.length, primary: primary.order_number })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Combine failed.' }, { status: 500 })
  }
}
