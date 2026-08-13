import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOrderTemplate } from '@/lib/sms'
import { createOrderCheckoutLink } from '@/lib/stripeLinks'

// Unified "if this, then that" automation engine.
//
// One rule = a Trigger + Actions:
//   Triggers
//     template_sent      — fired when a given template is sent to an order
//     reply_keyword      — fired when a customer reply matches a keyword (global)
//     reply_to_template  — fired when a reply comes in to a given template
//   Match modes (reply triggers)
//     keyword | affirmative (yes-synonyms) | negative (no-synonyms) | any
//   Actions (any combination)
//     set order status · set delivery light · set prep status · send a template
//
// Precedence: rules are evaluated in sort_order; first match wins (replies).

export type AutomationRow = {
  id: string
  is_active: boolean
  sort_order: number
  trigger_type: 'template_sent' | 'reply_keyword' | 'reply_to_template' | 'status_set' | 'delivery_date_set' | 'delivery_date_cleared' | string
  trigger_template_id: string | null
  trigger_keyword: string | null
  trigger_status: string | null
  match_mode: string | null
  action_set_status: string | null
  action_set_light: string | null
  action_set_ready: string | null
  action_regenerate_link: boolean | null
  action_send_template_id: string | null
  payment_source: 'any' | 'dashboard' | 'showroom' | string | null
}

const AUTOMATION_SELECT =
  'id, is_active, sort_order, trigger_type, trigger_template_id, trigger_keyword, trigger_status, match_mode, action_set_status, action_set_light, action_set_ready, action_regenerate_link, action_send_template_id, payment_source'

// First word of a reply, lowercased and stripped of punctuation.
function firstWord(content: string): string {
  return String(content || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/)[0] || ''
}

// Reads a yes/no reply. Only a clear yes/no resolves; anything else is unclear,
// so an affirmative/negative rule won't fire on an ambiguous message.
export function interpretYesNo(content: string): 'confirm' | 'reject' | 'unclear' {
  const normalized = String(content || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  // "no worries"/"no problem" mean yes locally — catch before the first-word check.
  if (/^no\s+(worries|worry|probs|prob|problem|problems|dramas|drama|stress|issue|issues)\b/.test(normalized)) return 'confirm'
  const token = normalized.split(' ')[0] || ''
  if (['1', 'yes', 'y', 'yeah', 'yep', 'yup', 'confirm', 'confirmed', 'ok', 'okay', 'correct', 'good', 'sure', 'perfect'].includes(token)) return 'confirm'
  if (['2', 'no', 'n', 'nope', 'nah', 'reject', 'cancel', 'wrong'].includes(token)) return 'reject'
  return 'unclear'
}

function replyMatches(a: AutomationRow, content: string): boolean {
  const mode = a.match_mode || (a.trigger_keyword ? 'keyword' : 'any')
  if (mode === 'any') return true
  if (mode === 'affirmative') return interpretYesNo(content) === 'confirm'
  if (mode === 'negative') return interpretYesNo(content) === 'reject'
  const kw = String(a.trigger_keyword || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  return Boolean(kw) && firstWord(content) === kw
}

// Apply a rule's actions to one order: status, delivery light, prep status, and
// an optional auto-sent template. Setting status to Delivered also archives it
// (mirrors the orders PATCH behaviour).
export async function applyAutomationActions(orderId: string, a: AutomationRow): Promise<void> {
  const update: Record<string, unknown> = {}
  if (a.action_set_status) {
    update.order_status = a.action_set_status
    if (a.action_set_status === 'Delivered') update.archived_at = new Date().toISOString()
  }
  if (a.action_set_ready === 'Ready' || a.action_set_ready === 'Not Ready') update.ready_status = a.action_set_ready
  if (a.action_set_light) {
    update.delivery_confirmation = a.action_set_light === 'none' ? null : a.action_set_light
    update.delivery_confirmation_at = new Date().toISOString()
  }
  if (Object.keys(update).length) {
    await supabaseAdmin.from('delivery_orders').update(update).eq('id', orderId)
  }
  // Mint a fresh Stripe link first, so a template sent below picks up the new
  // {stripe_checkout_url} (used by the "reply PAY for a new link" flow).
  if (a.action_regenerate_link) {
    try { await createOrderCheckoutLink(orderId) } catch (e) { console.error('[automation] regenerate link failed', orderId, e) }
  }
  if (a.action_send_template_id) {
    const { data: tpl } = await supabaseAdmin
      .from('notification_templates')
      .select('id, template_text')
      .eq('id', a.action_send_template_id)
      .maybeSingle()
    if (tpl) await sendOrderTemplate(orderId, tpl as { id: string; template_text: string }, `automation:${a.id}`)
  }
}

// Run all active "template sent" automations for a template against an order
// (used right after a template is sent). Actions are additive in sort order.
export async function runTemplateSent(orderId: string, templateId: string | null): Promise<number> {
  if (!orderId || !templateId) return 0
  const { data } = await supabaseAdmin
    .from('automations')
    .select(AUTOMATION_SELECT)
    .eq('is_active', true)
    .eq('trigger_type', 'template_sent')
    .eq('trigger_template_id', templateId)
    .order('sort_order', { ascending: true })
  const rows = (data || []) as AutomationRow[]
  for (const a of rows) await applyAutomationActions(orderId, a)
  return rows.length
}

// Run all active automations for a simple order event that carries no template
// or keyword condition (e.g. the delivery date being set or cleared). Actions
// are additive, applied in sort order.
//
// For payment_received, an optional paymentSource ('dashboard' = warehouse-
// generated link, 'showroom' = payment-app link) lets a rule target one source;
// rules left on 'any' fire for both.
export async function runSimpleTrigger(orderId: string, triggerType: string, paymentSource?: 'dashboard' | 'showroom'): Promise<number> {
  if (!orderId || !triggerType) return 0
  const { data } = await supabaseAdmin
    .from('automations')
    .select(AUTOMATION_SELECT)
    .eq('is_active', true)
    .eq('trigger_type', triggerType)
    .order('sort_order', { ascending: true })
  let rows = (data || []) as AutomationRow[]
  if (triggerType === 'payment_received' && paymentSource) {
    rows = rows.filter((a) => !a.payment_source || a.payment_source === 'any' || a.payment_source === paymentSource)
  }
  for (const a of rows) await applyAutomationActions(orderId, a)
  return rows.length
}

// Run all active "status set" automations whose target status matches the new
// order status (used when an order's status is changed). Actions are additive.
export async function runStatusSet(orderId: string, newStatus: string): Promise<number> {
  if (!orderId || !newStatus) return 0
  const { data } = await supabaseAdmin
    .from('automations')
    .select(AUTOMATION_SELECT)
    .eq('is_active', true)
    .eq('trigger_type', 'status_set')
    .eq('trigger_status', newStatus)
    .order('sort_order', { ascending: true })
  const rows = (data || []) as AutomationRow[]
  for (const a of rows) await applyAutomationActions(orderId, a)
  return rows.length
}

export type ReplyRunResult = { fired: boolean; automationId?: string; trigger?: string }

// Evaluate reply automations for an inbound message. reply_to_template rules
// (scoped to the template the customer is replying to) and global reply_keyword
// rules are considered together in sort order; the first match wins.
export async function runReplyAutomations(
  orderId: string,
  repliedTemplateId: string | null,
  content: string
): Promise<ReplyRunResult> {
  if (!orderId) return { fired: false }
  const { data } = await supabaseAdmin
    .from('automations')
    .select(AUTOMATION_SELECT)
    .eq('is_active', true)
    .in('trigger_type', ['reply_keyword', 'reply_to_template'])
    .order('sort_order', { ascending: true })
  const rows = (data || []) as AutomationRow[]

  for (const a of rows) {
    if (a.trigger_type === 'reply_to_template') {
      if (!repliedTemplateId || a.trigger_template_id !== repliedTemplateId) continue
      if (!replyMatches(a, content)) continue
    } else {
      // reply_keyword — global
      if (!replyMatches(a, content)) continue
    }
    await applyAutomationActions(orderId, a)
    return { fired: true, automationId: a.id, trigger: a.trigger_type }
  }
  return { fired: false }
}
