import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createOrderCheckoutLink } from '@/lib/stripeLinks'

type StripeOrderRow = {
  id: string
  payment_due: number
  stripe_link: string | null
  stripe_link_amount: number | null
  stripe_link_expires_at: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map((id: unknown) => String(id)).filter(Boolean) : []

    const origin = request.headers.get('origin') || `https://${request.headers.get('host') || 'delivery-tools-adl.vercel.app'}`

    let query = supabaseAdmin
      .from('delivery_orders')
      .select('id, payment_due, stripe_link, stripe_link_amount, stripe_link_expires_at')
      .gt('payment_due', 0)

    if (orderIds.length) query = query.in('id', orderIds)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const orders = (data || []) as StripeOrderRow[]
    let created = 0
    let reused = 0

    for (const order of orders) {
      const amount = Number(order.payment_due || 0)
      const priorAmount = Number(order.stripe_link_amount || 0)
      const existingLink = String(order.stripe_link || '').trim()
      const expiresAt = order.stripe_link_expires_at ? new Date(order.stripe_link_expires_at).getTime() : 0
      const expired = expiresAt > 0 && expiresAt <= Date.now()
      const needsNewLink = !existingLink || expired || Math.round(amount * 100) !== Math.round(priorAmount * 100)

      if (!needsNewLink) {
        reused += 1
        continue
      }

      const result = await createOrderCheckoutLink(order.id, origin)
      if (!result.ok) return NextResponse.json({ error: result.reason || 'Stripe link creation failed' }, { status: 500 })
      created += 1
    }

    return NextResponse.json({
      updated: created,
      created,
      reused,
      eligible: orders.length,
      selected: orderIds.length
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Stripe link update failed.' }, { status: 500 })
  }
}
