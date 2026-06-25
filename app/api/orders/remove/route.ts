import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type OrderLookupRow = {
  id: string
  customer_id: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ids = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)).filter(Boolean) : []

    if (!ids.length) return NextResponse.json({ error: 'No orders selected.' }, { status: 400 })

    const { data: orders, error: lookupError } = await supabaseAdmin
      .from('delivery_orders')
      .select('id, customer_id')
      .in('id', ids)

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

    const customerIds = Array.from(new Set(((orders || []) as OrderLookupRow[]).map((order) => order.customer_id).filter((id): id is string => Boolean(id))))

    const { error: itemError } = await supabaseAdmin
      .from('delivery_order_items')
      .delete()
      .in('order_id', ids)

    if (itemError) return NextResponse.json({ error: itemError.message }, { status: 500 })

    const { error: orderError } = await supabaseAdmin
      .from('delivery_orders')
      .delete()
      .in('id', ids)

    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 })

    if (customerIds.length) {
      const { data: remaining, error: remainingError } = await supabaseAdmin
        .from('delivery_orders')
        .select('customer_id')
        .in('customer_id', customerIds)

      if (remainingError) return NextResponse.json({ error: remainingError.message }, { status: 500 })

      const stillUsed = new Set(((remaining || []) as OrderLookupRow[]).map((order) => order.customer_id).filter((id): id is string => Boolean(id)))
      const orphanCustomerIds = customerIds.filter((id) => !stillUsed.has(id))

      if (orphanCustomerIds.length) {
        const { error: customerError } = await supabaseAdmin
          .from('customers')
          .delete()
          .in('id', orphanCustomerIds)

        if (customerError) return NextResponse.json({ error: customerError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ removed: ids.length })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Remove failed.' }, { status: 500 })
  }
}
