import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { normalizeMobileAu } from '@/lib/format'
import { runReplyAutomations } from '@/lib/automations'
import { sendEmail } from '@/lib/email'
import { brandConfig, type Brand } from '@/lib/brand'

// Emails the staff member who owns this conversation (the last person to text
// this customer/number, per sms_messages.sent_by) that a reply came in — if they
// have the toggle on. Never throws: a missing/failed email must not stop the
// webhook from storing the reply.
// Returns a short status string describing what happened, so the outcome can be
// recorded on the message row for diagnosis (we can't read this app's server
// logs). Never throws.
async function notifyOwningStaff(customerId: string | null, phone: string, content: string, origin: string): Promise<string> {
  try {
    // The Messages-tool owner is whoever last sent a FREE-FORM message (no
    // order/template) in this conversation. Replies to dashboard order SMS are
    // handled there, so they don't trigger a Messages email. We match on the
    // customer AND on the phone (a reply may be matched to a customer while the
    // outbound went to a typed number, or vice versa) with two simple queries,
    // then take the most recent — robust to phone strings that would trip up a
    // combined .or() filter.
    const ownerBase = () => supabaseAdmin
      .from('sms_messages')
      .select('sent_by, created_at, brand')
      .eq('direction', 'outbound')
      .is('order_id', null)
      .is('template_id', null)
      .not('sent_by', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
    type Owner = { sent_by: string; created_at: string; brand: string | null }
    const candidates: Owner[] = []
    if (customerId) {
      const { data } = await ownerBase().eq('customer_id', customerId)
      if (data?.[0]) candidates.push(data[0] as Owner)
    }
    if (phone) {
      const { data } = await ownerBase().eq('phone', phone)
      if (data?.[0]) candidates.push(data[0] as Owner)
    }
    candidates.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    const sentBy = candidates[0]?.sent_by
    if (!sentBy) return 'notify: no free-form owner'

    const { data: staff } = await supabaseAdmin
      .from('app_users')
      .select('email, full_name, is_active, sms_notify_email')
      .eq('id', sentBy)
      .maybeSingle()
    if (!staff) return 'notify: owner row missing'
    if (staff.is_active === false) return 'notify: owner inactive'
    if (staff.sms_notify_email === false) return 'notify: owner opted out'
    if (!staff.email) return 'notify: owner has no email'

    const who = phone || 'a customer'
    const link = `${origin.replace(/\/$/, '')}/messages`
    // Send from the owning store's verified sender (the same one the paid-
    // confirmation emails use), since EMAIL_FROM isn't set globally. Fall back to
    // whichever store's sender is configured.
    const ownerBrand = candidates[0]?.brand as Brand | null
    const from = (ownerBrand ? brandConfig(ownerBrand).emailFrom : '')
      || brandConfig('transforma').emailFrom
      || brandConfig('bca').emailFrom
      || undefined
    try {
      await sendEmail({
        to: staff.email as string,
        subject: `New SMS reply from ${who}`,
        text: `${who} replied:\n\n"${content}"\n\nOpen your messages to reply:\n${link}\n\n(You're getting this because you last texted this number. Turn these off in Messages.)`,
        from
      })
      return `notify: emailed ${staff.email}`
    } catch (sendError) {
      return `notify: send FAILED: ${sendError instanceof Error ? sendError.message : 'unknown'}`.slice(0, 250)
    }
  } catch (error) {
    console.error('[sms-inbound] notify failed', error)
    return `notify: error: ${error instanceof Error ? error.message : 'unknown'}`.slice(0, 250)
  }
}

// MessageMedia inbound/delivery webhook. Payload field names vary by account
// template, so we read tolerantly. Secure by setting SMS_WEBHOOK_SECRET and
// pointing MessageMedia at /api/sms/inbound?secret=YOUR_SECRET

type AnyRecord = Record<string, unknown>

// A webhook value that is just an un-substituted template variable, e.g.
// "$moContent" or "$moContent,$mtContent" (happens when a field doesn't apply to
// the event that fired, like delivery reports having no inbound content).
function isUnresolvedToken(v: string): boolean {
  return v.split(',').every((part) => /^\$[A-Za-z][\w.]*$/.test(part.trim()))
}

function pick(obj: AnyRecord, keys: string[]): string {
  for (const key of keys) {
    const value = obj[key]
    if (value === undefined || value === null) continue
    const s = String(value).trim()
    if (s === '' || isUnresolvedToken(s)) continue
    return s
  }
  return ''
}

function authorised(request: NextRequest) {
  // Accept the legacy secret or either brand's secret, so both the BCA and
  // Transforma MessageMedia accounts can post replies to this one endpoint.
  const secrets = [process.env.SMS_WEBHOOK_SECRET, process.env.BCA_SMS_WEBHOOK_SECRET, process.env.TRANSFORMA_SMS_WEBHOOK_SECRET]
    .map((s) => (s || '').trim())
    .filter(Boolean)
  if (!secrets.length) return true
  const url = new URL(request.url)
  const provided = (url.searchParams.get('secret') || request.headers.get('x-webhook-secret') || '').trim()
  return secrets.includes(provided)
}

type Match = { customer_id: string | null; order_id: string | null; template_id: string | null }

async function findCustomer(normalizedPhone: string, originalMessageId: string): Promise<Match> {
  // Most reliable: the reply references the original outbound message id.
  if (originalMessageId) {
    const { data } = await supabaseAdmin
      .from('sms_messages')
      .select('customer_id, order_id, template_id')
      .eq('provider_message_id', originalMessageId)
      .not('customer_id', 'is', null)
      .limit(1)
    if (data && data[0]) return { customer_id: data[0].customer_id as string, order_id: (data[0].order_id as string) || null, template_id: (data[0].template_id as string) || null }
  }

  if (!normalizedPhone) return { customer_id: null, order_id: null, template_id: null }

  // Next: the most recent outbound message to this number (its template is the
  // one the customer is replying to).
  const { data: prior } = await supabaseAdmin
    .from('sms_messages')
    .select('customer_id, order_id, template_id')
    .eq('phone', normalizedPhone)
    .not('customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
  if (prior && prior[0]) return { customer_id: prior[0].customer_id as string, order_id: (prior[0].order_id as string) || null, template_id: (prior[0].template_id as string) || null }

  // Fallback: match a customer by the last 9 digits of their stored phone.
  const last9 = normalizedPhone.replace(/\D/g, '').slice(-9)
  if (last9.length >= 8) {
    const { data: customers } = await supabaseAdmin.from('customers').select('id, phone').limit(5000)
    const hit = (customers || []).find((c) => String(c.phone || '').replace(/\D/g, '').slice(-9) === last9)
    if (hit) return { customer_id: hit.id as string, order_id: null, template_id: null }
  }

  return { customer_id: null, order_id: null, template_id: null }
}

async function handleReply(reply: AnyRecord, origin: string) {
  const content = pick(reply, ['content', 'message', 'body', 'text'])
  const source = pick(reply, ['source_number', 'source', 'from', 'originator', 'sender', 'mobile'])
  // A real customer reply always has message text. Events with no content
  // (e.g. delivery reports, or fields that didn't resolve) are not replies.
  if (!content) return false
  if (!source) return false

  const originalMessageId = pick(reply, ['message_id', 'in_reply_to', 'original_message_id'])
  const providerId = pick(reply, ['reply_id', 'id']) || originalMessageId || null

  // Drop exact duplicates (same provider message id already stored) so a webhook
  // delivered twice doesn't double-fire automations.
  if (providerId) {
    const { data: dupe } = await supabaseAdmin
      .from('sms_messages')
      .select('id')
      .eq('direction', 'inbound')
      .eq('provider_message_id', providerId)
      .limit(1)
      .maybeSingle()
    if (dupe) return false
  }
  const normalizedPhone = normalizeMobileAu(source)
  // Store the reply at OUR server-receipt time, not the provider's timestamp.
  // A reply always arrives after the message it answers, and our outbound sends
  // are stamped on this same clock — so this keeps every thread in causal order.
  // The provider (MessageMedia) clock can run behind ours and otherwise sort a
  // reply above the very text that prompted it.
  const date = new Date().toISOString()

  const { customer_id, order_id, template_id } = await findCustomer(normalizedPhone, originalMessageId)

  if (!customer_id) console.warn('[sms-inbound] unmatched reply', { source, normalizedPhone, originalMessageId })
  else console.log('[sms-inbound] reply matched', { normalizedPhone, customer_id })

  // Resolve which order the reply is about: the matched message's order, else
  // the customer's most recent awaiting order (delivery flow), else their most
  // recent order.
  let targetOrderId = order_id
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
    else {
      const { data: recent } = await supabaseAdmin
        .from('delivery_orders')
        .select('id')
        .eq('customer_id', customer_id)
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (recent?.id) targetOrderId = recent.id as string
    }
  }

  // Run the unified automations engine: reply-to-template rules (scoped to the
  // template the customer is replying to) and global keyword rules, first match
  // wins. This is the single place all reply behaviour is configured.
  if (targetOrderId) {
    try {
      const result = await runReplyAutomations(targetOrderId, template_id, content)
      console.log('[sms-inbound] automation', { targetOrderId, template_id, ...result })
    } catch (e) {
      console.error('[sms-inbound] automation error', e)
    }
  }

  const { data: inserted } = await supabaseAdmin.from('sms_messages').insert({
    customer_id,
    order_id: targetOrderId,
    direction: 'inbound',
    phone: normalizedPhone || source,
    body: content || '(no content)',
    status: 'received',
    provider_message_id: providerId,
    created_at: date
  }).select('id').maybeSingle()

  // Let the staff member who owns this thread know a reply landed, and record
  // the outcome on the row (diagnostic — this app's server logs aren't visible).
  const notifyResult = await notifyOwningStaff(customer_id, normalizedPhone || source, content, origin)
  if (inserted?.id) await supabaseAdmin.from('sms_messages').update({ error: notifyResult }).eq('id', inserted.id)
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

  const origin = new URL(request.url).origin
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
      } else if (await handleReply(reply, origin)) {
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
      } else if (await handleReply(root, origin)) {
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
