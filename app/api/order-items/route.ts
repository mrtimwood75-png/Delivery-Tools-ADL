import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const order_id = String(body.order_id || '')
    if (!order_id) return NextResponse.json({ error: 'Missing order id.' }, { status: 400 })

    const payload = {
      order_id,
      quantity: Number(body.quantity || 1),
      product_code: String(body.product_code || ''),
      product_name: String(body.product_name || 'New product line'),
      cubic_meters: Number(body.cubic_meters || 0),
      notes: String(body.notes || '')
    }

    const { data, error } = await supabaseAdmin
      .from('delivery_order_items')
      .insert(payload)
      .select('id, product_name, product_code, quantity, cubic_meters, notes')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Item create failed.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 })

    const update: Record<string, unknown> = {}
    if ('product_code' in body) update.product_code = String(body.product_code || '')
    if ('product_name' in body) update.product_name = String(body.product_name || '')
    if ('quantity' in body) update.quantity = Number(body.quantity || 1)
    if ('cubic_meters' in body) update.cubic_meters = Number(body.cubic_meters || 0)
    if ('notes' in body) update.notes = String(body.notes || '')

    const { data, error } = await supabaseAdmin
      .from('delivery_order_items')
      .update(update)
      .eq('id', id)
      .select('id')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ item: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Item update failed.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : [String(body.id || '')].filter(Boolean)
    if (!ids.length) return NextResponse.json({ error: 'Missing item id.' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from('delivery_order_items')
      .delete()
      .in('id', ids)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: ids.length, ids })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Item delete failed.' }, { status: 500 })
  }
}
