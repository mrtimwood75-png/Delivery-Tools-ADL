import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeMobileAu } from '@/lib/format'
import { buildMessage, sendMessageMediaSms, SMS_ORDER_SELECT, type OrderRow } from '@/lib/sms'
import { brandForSource } from '@/lib/brand'
import { runTemplateSent } from '@/lib/automations'

function templateAudienceMatches(balance: number, audience: string) {
  const hasBalance = Number(balance || 0) > 0
  if (audience === 'Both') return true
  if (audience === 'Balance only') return hasBalance
  if (audience === 'Zero balance only') return !hasBalance
  return true
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const templateText = String(body.templateText || '').trim()
    const audience = String(body.audience || 'Both')
    const orderIds = Array.isArray(body.orderIds) ? body.orderIds.map((id: unknown) => String(id)).filter(Boolean) : []
    const orderNumbers = Array.isArray(body.orderNumbers) ? body.orderNumbers.map((n: unknown) => String(n).trim().toUpperCase()).filter(Boolean) : []
    const templateId = body.templateId ? String(body.templateId) : null
    const sentByEmail = body.sentByEmail ? String(body.sentByEmail).trim() : ''
    // Already-sent rows are skipped by default; resend lets an explicit selection send again.
    const resend = Boolean(body.resend)
    // A one-recipient send is a deliberate single message, so the bulk audience/link guards don't apply.
    const single = orderIds.length === 1

    if (!templateText) return NextResponse.json({ error: 'Message window is blank.' }, { status: 400 })
    if (!single && (audience === 'Zero balance only' || audience === 'Both') && templateText.includes('{stripe_checkout_url}')) {
      return NextResponse.json({ error: 'Message can send to zero-balance rows but contains stripe_checkout_url.' }, { status: 400 })
    }
    if (!orderIds.length && !orderNumbers.length) return NextResponse.json({ error: 'No recipients selected.' }, { status: 400 })

    let query = supabaseAdmin
      .from('delivery_orders')
      .select(SMS_ORDER_SELECT)

    if (orderIds.length) query = query.in('id', orderIds)
    else query = query.in('order_number', orderNumbers)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let sentBy: string | null = null
    if (sentByEmail) {
      const { data: user } = await supabaseAdmin.from('app_users').select('id').eq('email', sentByEmail).maybeSingle()
      sentBy = user?.id || null
    }

    // A delivery-booking template arms the traffic light (awaiting) so the reply can be interpreted.
    let purpose: string | null = null
    if (templateId) {
      const { data: tpl } = await supabaseAdmin.from('notification_templates').select('purpose').eq('id', templateId).maybeSingle()
      purpose = tpl?.purpose === 'delivery_booking' ? 'delivery_booking' : null
    }

    let sent = 0
    let failed = 0
    type LogRow = { customer_id: string | null; order_id: string; direction: string; phone: string; body: string; status: string; provider_message_id: string | null; template_id: string | null; sent_by: string | null; error: string | null; purpose: string | null }
    const logRows: LogRow[] = []
    const sentOrderIds: string[] = []

    for (const order of (data || []) as OrderRow[]) {
      const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
      const mobile = String(customer?.phone || '').trim()
      const amount = Number(order.payment_due || 0)
      const link = String(order.stripe_link || '').trim()
      const priorSms = String(order.sms_status || '')

      if (!single && !templateAudienceMatches(amount, audience)) continue
      if (!mobile) continue
      if (!resend && priorSms.startsWith('Sent')) continue

      if (!single && amount > 0 && !link && templateText.includes('{stripe_checkout_url}')) {
        await supabaseAdmin.from('delivery_orders').update({ sms_status: 'Failed (Missing Stripe link)' }).eq('id', order.id)
        failed += 1
        continue
      }

      const message = buildMessage(order, templateText)
      try {
        const messageId = await sendMessageMediaSms(mobile, message, brandForSource(order.source))
        const orderUpdate: Record<string, unknown> = { sms_status: `Sent (${messageId})`, date_sent: new Date().toISOString() }
        if (purpose === 'delivery_booking') { orderUpdate.delivery_confirmation = 'awaiting'; orderUpdate.delivery_confirmation_at = new Date().toISOString() }
        await supabaseAdmin
          .from('delivery_orders')
          .update(orderUpdate)
          .eq('id', order.id)
        logRows.push({ customer_id: order.customer_id, order_id: order.id, direction: 'outbound', phone: normalizeMobileAu(mobile), body: message, status: 'sent', provider_message_id: messageId, template_id: templateId, sent_by: sentBy, error: null, purpose })
        sentOrderIds.push(order.id)
        sent += 1
      } catch (innerError) {
        const errText = innerError instanceof Error ? innerError.message : 'SMS failed'
        await supabaseAdmin
          .from('delivery_orders')
          .update({ sms_status: `Failed (${errText})` })
          .eq('id', order.id)
        logRows.push({ customer_id: order.customer_id, order_id: order.id, direction: 'outbound', phone: normalizeMobileAu(mobile), body: message, status: 'failed', provider_message_id: null, template_id: templateId, sent_by: sentBy, error: errText, purpose })
        failed += 1
      }
    }

    if (logRows.length) await supabaseAdmin.from('sms_messages').insert(logRows)

    // Run any "when this template is sent" automations for each delivered message.
    if (templateId && sentOrderIds.length) {
      for (const oid of sentOrderIds) {
        try { await runTemplateSent(oid, templateId) } catch (e) { console.error('[automation] template_sent failed', oid, e) }
      }
    }

    return NextResponse.json({ sent, failed })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'SMS sending failed.' }, { status: 500 })
  }
}
