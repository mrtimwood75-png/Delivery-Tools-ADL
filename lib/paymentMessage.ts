import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { formatAmountAu } from '@/lib/format'
import type { Brand } from '@/lib/brand'

// Brand merchant fields usable in payment-app templates (same set as the
// dashboard templates). Passed in by callers that know the order's brand.
export type TemplateMerchant = { displayName?: string; showroomPhone?: string; warehousePhone?: string; email?: string; address?: string; bankName?: string; bankBsb?: string; bankAccount?: string }

function applyMerchant(text: string, m?: TemplateMerchant): string {
  const g = (v?: string) => v || ''
  return text
    .replaceAll('{merchant}', g(m?.displayName))
    .replaceAll('{merchant_showroom_phone}', g(m?.showroomPhone))
    .replaceAll('{merchant_phone}', g(m?.showroomPhone))
    .replaceAll('{merchant_warehouse_phone}', g(m?.warehousePhone))
    .replaceAll('{merchant_email}', g(m?.email))
    .replaceAll('{merchant_address}', g(m?.address))
    .replaceAll('{merchant_bank}', g(m?.bankName))
    .replaceAll('{merchant_bsb}', g(m?.bankBsb))
    .replaceAll('{merchant_account}', g(m?.bankAccount))
}

// The SMS sent to the customer with their payment link is editable by admins
// and stored in app_settings. Falls back to this default when unset.
export const SMS_TEMPLATE_KEY = 'payment_link_sms_template'
export const DEFAULT_SMS_TEMPLATE = 'Hi {customer_name}, please use this secure link to pay {amount}: {link}'

export async function getSmsTemplate(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', SMS_TEMPLATE_KEY)
    .maybeSingle()
  const value = String(data?.setting_value || '').trim()
  return value || DEFAULT_SMS_TEMPLATE
}

export function renderSmsTemplate(template: string, fields: { customerName: string; amount: number; orderNumber: string; link: string; salespersonName?: string }, merchant?: TemplateMerchant) {
  return applyMerchant(template, merchant)
    .replaceAll('{customer_name}', fields.customerName || '')
    .replaceAll('{amount}', formatAmountAu(fields.amount))
    .replaceAll('{order_number}', fields.orderNumber || '')
    .replaceAll('{salesperson_name}', fields.salespersonName || '')
    .replaceAll('{link}', fields.link || '')
}

// The email sent to the salesperson (return address) when a payment clears is
// also admin-editable. Subject and body are stored separately in app_settings.
export const EMAIL_SUBJECT_KEY = 'payment_link_email_subject'
export const EMAIL_BODY_KEY = 'payment_link_email_body'
export const DEFAULT_EMAIL_SUBJECT = 'Payment received — order {order_number} from {customer_name}'
export const DEFAULT_EMAIL_BODY = `Good news — a payment has been received.

Customer: {customer_name}
Order #: {order_number}
Amount paid: {amount}
Paid at: {paid_at}

{allocation_note}`

export async function getEmailTemplates(): Promise<{ subject: string; body: string }> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', [EMAIL_SUBJECT_KEY, EMAIL_BODY_KEY])
  const map = new Map((data || []).map((r) => [r.setting_key, String(r.setting_value || '')]))
  return {
    subject: (map.get(EMAIL_SUBJECT_KEY) || '').trim() || DEFAULT_EMAIL_SUBJECT,
    body: (map.get(EMAIL_BODY_KEY) || '').trim() || DEFAULT_EMAIL_BODY
  }
}

// {allocation_note} is filled by the webhook with the applied/not-applied
// sentence, so admins control the wording around it without owning the logic.
export function renderEmailTemplate(template: string, fields: { customerName: string; orderNumber: string; amount: number; paidAt: string; allocationNote: string; salespersonName?: string }, merchant?: TemplateMerchant) {
  return applyMerchant(template, merchant)
    .replaceAll('{customer_name}', fields.customerName || '')
    .replaceAll('{order_number}', fields.orderNumber || '')
    .replaceAll('{amount}', formatAmountAu(fields.amount))
    .replaceAll('{paid_at}', fields.paidAt || '')
    .replaceAll('{salesperson_name}', fields.salespersonName || '')
    .replaceAll('{allocation_note}', fields.allocationNote || '')
}

// Payment-success SMS — sent to the CUSTOMER when an ad-hoc payment-link payment
// clears that has no matching dashboard order (so the dashboard's own
// payment_received automation never fires for it). Brand-scoped so each payment
// app has its own wording, editable in that app's admin.
export const PAYMENT_SUCCESS_SMS_PREFIX = 'payment_success_sms_template'
export const DEFAULT_PAYMENT_SUCCESS_SMS = 'Hi {customer_name}, thanks — we have received your payment of {amount}. — {merchant}'

export function paymentSuccessSmsKey(brand: Brand): string {
  return `${PAYMENT_SUCCESS_SMS_PREFIX}_${brand}`
}

export async function getPaymentSuccessSms(brand: Brand): Promise<string> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('setting_value')
    .eq('setting_key', paymentSuccessSmsKey(brand))
    .maybeSingle()
  return String(data?.setting_value || '').trim() || DEFAULT_PAYMENT_SUCCESS_SMS
}

export function renderPaymentSuccessSms(template: string, fields: { customerName: string; amount: number; orderNumber: string; salespersonName?: string }, merchant?: TemplateMerchant) {
  return applyMerchant(template, merchant)
    .replaceAll('{customer_name}', fields.customerName || '')
    .replaceAll('{amount}', formatAmountAu(fields.amount))
    .replaceAll('{order_number}', fields.orderNumber || '')
    .replaceAll('{salesperson_name}', fields.salespersonName || '')
}
