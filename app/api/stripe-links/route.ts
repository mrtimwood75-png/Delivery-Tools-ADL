import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const stripeKey = process.env.STRIPE_SECRET_KEY
if (!stripeKey) throw new Error('Missing STRIPE_SECRET_KEY')

const stripe = new Stripe(stripeKey)

type StripeOrderRow = {
  id: string
  order_number: string
  payment_due: number
  stripe_link: string | null
  stripe_link_amount: number | null
  customers: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map((id: unknown) => String(id)).filter(Boolean) : []

    let query = supabaseAdmin
      .from('delivery_orders')
      .select('id, order_number, payment_due, stripe_link, stripe_link_amount, customers(name, phone)')
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
      const needsNewLink = !existingLink || Math.round(amount * 100) !== Math.round(priorAmount * 100)

      if (!needsNewLink) {
        reused += 1
        continue
      }

      const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
      const customerName = customer?.name || 'Customer'

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: order.order_number,
        line_items: [{
          price_data: {
            currency: 'aud',
            product_data: {
              name: `Order ${order.order_number}`,
              description: `Balance payment for ${customerName}`
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        success_url: process.env.STRIPE_SUCCESS_URL || 'https://boconcept.com.au',
        cancel_url: process.env.STRIPE_CANCEL_URL || 'https://boconcept.com.au',
        metadata: {
          customer_name: customerName,
          order_number: order.order_number,
          balance_payable: String(amount)
        }
      })

      const { error: updateError } = await supabaseAdmin
        .from('delivery_orders')
        .update({
          stripe_session_id: session.id,
          stripe_link: session.url,
          stripe_link_amount: amount
        })
        .eq('id', order.id)

      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
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
