import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeMobileAu } from '@/lib/format'
import { sendAutoReply, sendOrderTemplate } from '@/lib/sms'

// MessageMedia inbound/delivery webhook. Payload field names vary by account
// template, so we read tolerantly. Secure by setting SMS_WEBHOOK_SECRET and
// pointing MessageMedia at /api/sms/inbound?secret=YOUR_SECRET

type AnyRecord = Record<string, unknown>

function pick(obj: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

function authorised(request: NextRequest) {
  const secret = process.env.SMS_WEBHOOK_SECRET
  if (!secret) return true
  const url = new URL(request.url)
  const provided = url.searchParams.get('secret') || request.headers.get('x-webhook-secret') || ''
  return provided === secret
}

type Match = { customer_id: string | null; order_id: string | null; purpose: string | null }

async function findCustomer(normalizedPhone: string, originalMessageId: string): Promise<Match> {
  // Most reliable: the reply references the original outbound message id.
  if (originalMessageId) {
    const { data } = await supabaseAdmin
      .from('sms_messages')
      .select('customer_id, order_id, purpose')
      .eq('provider_message_id', originalMessageId)
      .not('customer_id', 'is', null)
      .limit(1)
    if (data && data[0]) return { customer_id: data[0].customer_id as string, order_id: (data[0].order_id as string) || null, purpose: (data[0].purpose as string) || null }
  }

  if (!normalizedPhone) return { customer_id: null, order_id: null, purpose: null }

  // Next: a previous message to/from this exact normalized number (most recent outbound purpose wins).
  const { data: prior } = await supabaseAdmin
    .from('sms_messages')
    .select('customer_id, order_id, purpose')
    .eq('phone', normalizedPhone)
    .not('customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  if (prior && prior[0]) return { customer_id: prior[0].customer_id as string, order_id: (prior[0].order_id as string) || null, purpose: (prior[0].purpose as string) || null }

  // Fallback: match a customer by the last 9 digits of their stored phone.
  const last9 = normalizedPhone.replace(/\D/g, '').slice(-9)
  if (last9.length >= 8) {
    const { data: customers } = await supabaseAdmin.from('customers').select('id, phone').limit(5000)
    const hit = (customers || []).find((c) => String(c.phone || '').replace(/\D/g, '').slice(-9) === last9)
    if (hit) return { customer_id: hit.id as string, order_id: null, purpose: null }
  }

  return { customer_id: null, order_id: null, purpose: null }
}

// Reads the customer's reply and decides whether it confirms or rejects the delivery date.
// Only a clear yes/no flips the light; anything ambiguous is left for a human to action.
function interpretReply(content: string): 'confirm' | 'reject' | 'unclear' {
  const normalized = String(content || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()

  // False friends: phrases that START with "no" but actually mean "that's fine" (very common locally).
  // Catch these before the first-word check so they aren't read as a rejection.
  if (/^no\s+(worries|worry|probs|prob|problem|problems|dramas|drama|stress|issue|issues)\b/.test(normalized)) return 'confirm'

  const token = normalized.split(' ')[0] || ''
  if (['1', 'yes', 'y', 'yeah', 'yep', 'yup', 'confirm', 'confirmed', 'ok', 'okay', 'correct', 'good', 'sure', 'perfect'].includes(token)) return 'confirm'
  if (['2', 'no', 'n', 'nope', 'nah', 'reject', 'cancel', 'wrong'].includes(token)) return 'reject'
  return 'unclear'
}

// Admin-configurable keyword rules: when a reply STARTS WITH a rule's keyword
// (the first word of the message, case-insensitive), optionally set the order
// status and auto-send a reply template. Returns true if a rule fired (so the
// caller can avoid double-handling).
async function applyKeywordRules(content: string, orderId: string | null): Promise<boolean> {
  if (!orderId) return false
  const firstWord = String(content || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/)[0] || ''
  if (!firstWord) return false

  const { data: rules } = await supabaseAdmin
    .from('sms_reply_rules')
    .select('keyword, reply_template_id, set_status, set_light')
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
  if (!rules || !rules.length) return false

  const rule = rules.find((r) => firstWord === String(r.keyword || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
  if (!rule) return false

  // Apply status and/or traffic-light changes the admin configured for this keyword.
  const update: Record<string, unknown> = {}
  if (rule.set_status) update.order_status = rule.set_status
  if (rule.set_light) { update.delivery_confirmation = rule.set_light; update.delivery_confirmation_at = new Date().toISOString() }
  if (Object.keys(update).length) {
    await supabaseAdmin.from('delivery_orders').update(update).eq('id', orderId)
  }
  if (rule.reply_template_id) {
    const { data: tpl } = await supabaseAdmin.from('notification_templates').select('id, template_text').eq('id', rule.reply_template_id).maybeSingle()
    if (tpl) {
      const result = await sendOrderTemplate(orderId, tpl, `keyword:${rule.keyword}`)
      console.log('[sms-inbound] keyword rule', { orderId, keyword: rule.keyword, ...result })
    }
  } else {
    console.log('[sms-inbound] keyword rule (status only)', { orderId, keyword: rule.keyword, set_status: rule.set_status })
  }
  return true
}

// Applies the traffic-light state AND the configured customer status for the order.
async function applyDeliveryConfirmation(orderId: string, decision: 'confirm' | 'reject') {
  const update: Record<string, unknown> = {
    delivery_confirmation: decision === 'confirm' ? 'confirmed' : 'rejected',
    delivery_confirmation_at: new Date().toISOString()
  }
  const key = decision === 'confirm' ? 'delivery_confirmed_status' : 'delivery_rejected_status'
  const { data: setting } = await supabaseAdmin.from('app_settings').select('setting_value').eq('setting_key', key).maybeSingle()
  const statusName = String(setting?.setting_value || '').trim()
  if (statusName) update.order_status = statusName
  await supabaseAdmin.from('delivery_orders').update(update).eq('id', orderId)
  console.log('[sms-inbound] delivery confirmation', { orderId, decision, statusName: statusName || '(unchanged)' })
}

async function handleReply(reply: AnyRecord) {
  const content = pick(reply, ['content', 'message', 'body', 'text'])
  const source = pick(reply, ['source_number', 'source', 'from', 'originator', 'sender', 'mobile'])
  if (!content && !source) return false

  const originalMessageId = pick(reply, ['message_id', 'in_reply_to', 'original_message_id'])
  const providerId = pick(reply, ['reply_id', 'id']) || originalMessageId || null
  const normalizedPhone = normalizeMobileAu(source)
  const dateRaw = pick(reply, ['date_received', 'timestamp', 'received_timestamp', 'date'])
  const date = dateRaw && !Number.isNaN(new Date(dateRaw).getTime()) ? new Date(dateRaw).toISOString() : new Date().toISOString()

  const { customer_id, order_id, purpose } = await findCustomer(normalizedPhone, originalMessageId)

  if (!customer_id) console.warn('[sms-inbound] unmatched reply', { source, normalizedPhone, originalMessageId })
  else console.log('[sms-inbound] reply matched', { normalizedPhone, customer_id })

  // The delivery traffic light is ONLY touched when the reply answers a
  // delivery-booking template — identified by the matched outbound message's
  // purpose tag. A reply to any other SMS (including future yes/no templates
  // that are NOT tagged "Delivery booking") never affects the light, so there
  // is no cross-talk between message types.
  let targetOrderId = order_id
  let handledByDelivery = false
  if (purpose === 'delivery_booking') {
    // If the matched delivery message carried no order, use the customer's most recent awaiting order.
    if (!targetOrderId && customer_id) {
      const { data: awaiting } = await supabaseAdmin
        .from('delivery_orders')
        .select('id')
        .eq('customer_id', customer_id)
        .eq('delivery_confirmation', 'awaiting')
        .order('delivery_confirmation_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (awaiting?.id) targetOrderId = awaiting.id as string
    }
    if (targetOrderId) {
      const decision = interpretReply(content)
      // Clear yes/no flips the light + status; anything unclear stays awaiting and shows as an unread reply.
      if (decision !== 'unclear') {
        handledByDelivery = true
        await applyDeliveryConfirmation(targetOrderId, decision)
        // Automated follow-up: send the template tagged for this outcome, if one exists.
        const replyPurpose = decision === 'confirm' ? 'delivery_confirmed_reply' : 'delivery_rejected_reply'
        const result = await sendAutoReply(targetOrderId, replyPurpose)
        console.log('[sms-inbound] auto-reply', { targetOrderId, replyPurpose, ...result })
      } else {
        console.log('[sms-inbound] delivery reply unclear — left awaiting for human', { targetOrderId, content })
      }
    }
  }

  // General keyword rules (e.g. "DEBIT" -> send bank details) run for any other reply.
  if (!handledByDelivery) {
    let keywordOrderId = order_id
    if (!keywordOrderId && customer_id) {
      const { data: recent } = await supabaseAdmin
        .from('delivery_orders')
        .select('id')
        .eq('customer_id', customer_id)
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (recent?.id) keywordOrderId = recent.id as string
    }
    if (keywordOrderId) {
      await applyKeywordRules(content, keywordOrderId)
      if (!targetOrderId) targetOrderId = keywordOrderId
    }
  }

  await supabaseAdmin.from('sms_messages').insert({
    customer_id,
    order_id: targetOrderId,
    direction: 'inbound',
    phone: normalizedPhone || source,
    body: content || '(no content)',
    status: 'received',
    provider_message_id: providerId,
    created_at: date
  })
  return true
}

async function handleDeliveryReport(report: AnyRecord) {
  const messageId = pick(report, ['message_id', 'id', 'original_message_id'])
  const status = pick(report, ['status', 'delivery_report_status', 'dsr_status'])
  if (!messageId || !status) return false
  await supabaseAdmin
    .from('sms_messages')
    .update({ status: status.toLowerCase() })
    .eq('provider_message_id', messageId)
    .eq('direction', 'outbound')
  return true
}

export async function POST(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  console.log('[sms-inbound] payload', JSON.stringify(body).slice(0, 800))

  const root = (Array.isArray(body) ? { items: body } : body) as AnyRecord
  const replies = (Array.isArray(root.replies) ? root.replies : Array.isArray(root.items) ? root.items : []) as AnyRecord[]
  const deliveryReports = (Array.isArray(root.delivery_reports) ? root.delivery_reports : []) as AnyRecord[]

  let received = 0
  let receipts = 0

  try {
    for (const reply of replies) {
      // An item array may mix replies and delivery reports — route by shape.
      if (pick(reply, ['status', 'delivery_report_status', 'dsr_status']) && !pick(reply, ['content', 'message', 'body'])) {
        if (await handleDeliveryReport(reply)) receipts += 1
      } else if (await handleReply(reply)) {
        received += 1
      }
    }
    for (const report of deliveryReports) {
      if (await handleDeliveryReport(report)) receipts += 1
    }

    // Single-object reply (no wrapping array).
    if (!replies.length && !deliveryReports.length && !Array.isArray(body)) {
      if (pick(root, ['status', 'delivery_report_status', 'dsr_status']) && !pick(root, ['content', 'message', 'body'])) {
        if (await handleDeliveryReport(root)) receipts += 1
      } else if (await handleReply(root)) {
        received += 1
      }
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Webhook processing failed.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, received, receipts })
}

export async function GET() {
  // Lets MessageMedia (or you) verify the endpoint is live.
  return NextResponse.json({ ok: true, endpoint: 'sms-inbound' })
}
