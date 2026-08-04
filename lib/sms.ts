import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { formatAmountAu, normalizeMobileAu } from '@/lib/format'
import { brandConfig, brandForSource, type Brand } from '@/lib/brand'
import { getMerchantConfig } from '@/lib/merchant'

export type SmsCustomer = { name: string; phone: string | null; address: string | null; street_address: string | null; suburb: string | null; state: string | null; postcode: string | null }
export type OrderRow = {
  id: string
  order_number: string
  customer_id: string | null
  payment_due: number
  order_status: string | null
  goods_in_date: string | null
  goods_ready_date: string | null
  delivery_date: string | null
  salesperson: string | null
  stripe_link: string | null
  sms_status: string | null
  source: string | null
  customers: SmsCustomer | SmsCustomer[] | null
}

// Columns needed to fill any template merge field.
export const SMS_ORDER_SELECT = 'id, order_number, customer_id, payment_due, order_status, goods_in_date, goods_ready_date, delivery_date, salesperson, stripe_link, sms_status, source, customers(name, phone, address, street_address, suburb, state, postcode)'

function formatDateAu(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-AU')
}

// `merchant` lets callers pass DB-resolved details (Admin > Merchant details).
// When omitted, the brand's env config is used.
export type MerchantFields = { displayName: string; showroomPhone: string; warehousePhone: string; email: string; address: string; bankName: string; bankBsb: string; bankAccount: string }

export function buildMessage(order: OrderRow, templateText: string, merchant?: MerchantFields) {
  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const street = customer?.street_address || customer?.address || ''
  const fullAddress = [street, customer?.suburb, customer?.state, customer?.postcode].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
  const env = brandConfig(brandForSource(order.source))
  const m: MerchantFields = merchant || { displayName: env.displayName, showroomPhone: env.showroomPhone, warehousePhone: env.warehousePhone, email: env.supportEmail, address: env.supportAddress, bankName: env.bankName, bankBsb: env.bankBsb, bankAccount: env.bankAccount }
  return templateText
    .replaceAll('{merchant}', m.displayName)
    .replaceAll('{merchant_showroom_phone}', m.showroomPhone)
    .replaceAll('{merchant_phone}', m.showroomPhone)
    .replaceAll('{merchant_warehouse_phone}', m.warehousePhone)
    .replaceAll('{merchant_email}', m.email)
    .replaceAll('{merchant_address}', m.address)
    .replaceAll('{merchant_bank}', m.bankName)
    .replaceAll('{merchant_bsb}', m.bankBsb)
    .replaceAll('{merchant_account}', m.bankAccount)
    .replaceAll('{customer_name}', customer?.name || '')
    .replaceAll('{order_number}', order.order_number || '')
    .replaceAll('{salesperson}', order.salesperson || '')
    .replaceAll('{balance_payable}', formatAmountAu(Number(order.payment_due || 0)))
    .replaceAll('{payment_status}', Number(order.payment_due || 0) > 0 ? 'Unpaid' : 'Paid')
    .replaceAll('{order_status}', order.order_status || '')
    .replaceAll('{stripe_checkout_url}', order.stripe_link || '')
    .replaceAll('{mobile}', customer?.phone || '')
    .replaceAll('{street_address}', street)
    .replaceAll('{suburb}', customer?.suburb || '')
    .replaceAll('{state}', customer?.state || '')
    .replaceAll('{postcode}', customer?.postcode || '')
    .replaceAll('{address}', fullAddress)
    .replaceAll('{goods_in_date}', formatDateAu(order.goods_in_date))
    .replaceAll('{ready_after_date}', formatDateAu(order.goods_ready_date))
    .replaceAll('{delivery_date}', formatDateAu(order.delivery_date))
}

// Send an SMS. When `brand` is given, the message goes out through THAT brand's
// MessageMedia account (its own API key/secret and sender number); otherwise the
// legacy single-account env vars are used.
export async function sendMessageMediaSms(toMobile: string, message: string, brand?: Brand) {
  const cfg = brand ? brandConfig(brand) : null
  const apiKey = cfg?.smsApiKey || process.env.MESSAGEMEDIA_API_KEY
  const apiSecret = cfg?.smsApiSecret || process.env.MESSAGEMEDIA_API_SECRET
  const senderId = (cfg?.smsFrom || process.env.MESSAGEMEDIA_SENDER_ID || '')
  const baseUrl = ((cfg?.smsBaseUrl || process.env.MESSAGEMEDIA_BASE_URL) || 'https://api.messagemedia.com').replace(/\/$/, '')

  if (!apiKey || !apiSecret) throw new Error('Missing MessageMedia credentials')

  const sms: Record<string, string> = {
    content: message,
    destination_number: normalizeMobileAu(toMobile),
    format: 'SMS'
  }

  if (senderId.trim()) sms.source_number = senderId.trim()

  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`
    },
    body: JSON.stringify({ messages: [sms] })
  })

  const text = await response.text()
  if (!response.ok) throw new Error(text || `MessageMedia HTTP ${response.status}`)

  const body = JSON.parse(text)
  const sent = body.messages?.[0]
  const messageId = sent?.message_id || sent?.messageId
  if (!messageId) throw new Error('MessageMedia response missing message id')
  return String(messageId)
}

// Asks MessageMedia for the current status of a sent message (delivered, enroute,
// rejected, expired, etc.). Never throws — returns 'unknown' with an error string.
export async function getMessageMediaStatus(messageId: string): Promise<{ status: string; content?: string; destination?: string; error?: string }> {
  const defaultBase = (process.env.MESSAGEMEDIA_BASE_URL || 'https://api.messagemedia.com').replace(/\/$/, '')
  // Try each configured account (a message id is only known to the account that
  // sent it), de-duped by API key, each with its own base URL.
  const creds: Array<{ apiKey: string; apiSecret: string; baseUrl: string }> = []
  const seen = new Set<string>()
  for (const brand of ['bca', 'transforma'] as Brand[]) {
    const cfg = brandConfig(brand)
    if (cfg.smsApiKey && cfg.smsApiSecret && !seen.has(cfg.smsApiKey)) {
      seen.add(cfg.smsApiKey)
      creds.push({ apiKey: cfg.smsApiKey, apiSecret: cfg.smsApiSecret, baseUrl: (cfg.smsBaseUrl || defaultBase).replace(/\/$/, '') })
    }
  }
  if (!creds.length) return { status: 'unknown', error: 'Missing MessageMedia credentials' }

  let lastError = ''
  for (const { apiKey, apiSecret, baseUrl } of creds) {
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    try {
      const res = await fetch(`${baseUrl}/v1/messages/${encodeURIComponent(messageId)}`, {
        headers: { Accept: 'application/json', Authorization: `Basic ${auth}` }
      })
      const text = await res.text()
      if (!res.ok) { lastError = text ? text.slice(0, 200) : `HTTP ${res.status}`; continue }
      const body = JSON.parse(text)
      return { status: String(body.status || 'unknown'), content: body.content, destination: body.destination_number }
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'lookup failed'
    }
  }
  return { status: 'unknown', error: lastError || 'lookup failed' }
}

// Sends a specific template to an order's customer and logs it. Never throws.
export async function sendOrderTemplate(orderId: string, tpl: { id: string; template_text: string }, purpose: string | null): Promise<{ ok: boolean; reason: string }> {
  const { data: order } = await supabaseAdmin
    .from('delivery_orders')
    .select(SMS_ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return { ok: false, reason: 'order not found' }

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const mobile = String(customer?.phone || '').trim()
  if (!mobile) return { ok: false, reason: 'customer has no mobile number' }

  // Send through the MessageMedia account of the brand the customer bought from,
  // and render merchant fields from that brand's (DB-overridable) details.
  const brand = brandForSource((order as { source?: string | null }).source)
  const merchant = await getMerchantConfig(brand)
  const message = buildMessage(order as unknown as OrderRow, tpl.template_text, merchant)
  const base = { customer_id: order.customer_id, order_id: order.id, direction: 'outbound', phone: normalizeMobileAu(mobile), body: message, template_id: tpl.id, purpose }
  try {
    const messageId = await sendMessageMediaSms(mobile, message, brand)
    await supabaseAdmin.from('sms_messages').insert({ ...base, status: 'sent', provider_message_id: messageId })
    return { ok: true, reason: `sent (${messageId})` }
  } catch (error) {
    const errText = error instanceof Error ? error.message : 'send failed'
    await supabaseAdmin.from('sms_messages').insert({ ...base, status: 'failed', provider_message_id: null, error: errText })
    return { ok: false, reason: errText }
  }
}

// Sends a free-form (non-template) SMS from a staff member to a customer or a
// typed mobile number, then logs it to sms_messages tagged with `sentBy` (the
// staff member's app_users id) so it shows in their private Messages inbox.
// Sends through `brand`'s MessageMedia account (the host brand of the app the
// staff member is using). Never throws — returns the outcome.
export async function sendStaffSms(params: {
  toPhone: string
  body: string
  brand?: Brand
  customerId?: string | null
  sentBy?: string | null
}): Promise<{ ok: boolean; reason: string; messageId?: string }> {
  const mobile = String(params.toPhone || '').trim()
  const text = String(params.body || '').trim()
  if (!mobile) return { ok: false, reason: 'No mobile number.' }
  if (!text) return { ok: false, reason: 'Message is blank.' }

  const base = {
    customer_id: params.customerId || null,
    order_id: null,
    direction: 'outbound',
    phone: normalizeMobileAu(mobile),
    body: text,
    template_id: null,
    sent_by: params.sentBy || null,
    purpose: null
  }
  try {
    const messageId = await sendMessageMediaSms(mobile, text, params.brand)
    await supabaseAdmin.from('sms_messages').insert({ ...base, status: 'sent', provider_message_id: messageId })
    return { ok: true, reason: `sent (${messageId})`, messageId }
  } catch (error) {
    const errText = error instanceof Error ? error.message : 'send failed'
    await supabaseAdmin.from('sms_messages').insert({ ...base, status: 'failed', provider_message_id: null, error: errText })
    return { ok: false, reason: errText }
  }
}

// Sends the active template tagged with `purpose` (e.g. delivery confirm/reject auto-replies).
export async function sendAutoReply(orderId: string, purpose: string): Promise<{ ok: boolean; reason: string }> {
  const { data: tpl } = await supabaseAdmin
    .from('notification_templates')
    .select('id, template_text')
    .eq('purpose', purpose)
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (!tpl) return { ok: false, reason: `no active template tagged "${purpose}"` }
  return sendOrderTemplate(orderId, tpl, purpose)
}
