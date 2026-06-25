import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { formatAmountAu } from '@/lib/format'

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

export function renderSmsTemplate(template: string, fields: { customerName: string; amount: number; orderNumber: string; link: string }) {
  return template
    .replaceAll('{customer_name}', fields.customerName || '')
    .replaceAll('{amount}', formatAmountAu(fields.amount))
    .replaceAll('{order_number}', fields.orderNumber || '')
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
export function renderEmailTemplate(template: string, fields: { customerName: string; orderNumber: string; amount: number; paidAt: string; allocationNote: string }) {
  return template
    .replaceAll('{customer_name}', fields.customerName || '')
    .replaceAll('{order_number}', fields.orderNumber || '')
    .replaceAll('{amount}', formatAmountAu(fields.amount))
    .replaceAll('{paid_at}', fields.paidAt || '')
    .replaceAll('{allocation_note}', fields.allocationNote || '')
}
