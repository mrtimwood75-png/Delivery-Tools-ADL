import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmail } from '@/lib/email'
import { brandForSource, brandConfig } from '@/lib/brand'
import { getMerchantConfig } from '@/lib/merchant'

function formatDateAu(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-AU')
}

// Best-effort: email the order's salesperson that it has been delivered, using
// the admin-configured template. Sends from the order's own merchant address
// (Admin → Merchant details → Email). Optionally includes a proof-of-delivery
// link (from Wodely). Silently reports why it skipped if anything is missing.
export async function sendDeliveryEmail(
  orderId: string,
  opts: { podLink?: string } = {}
): Promise<{ ok: boolean; reason: string }> {
  const { data: order } = await supabaseAdmin
    .from('delivery_orders')
    .select('order_number, salesperson, delivery_date, source, customers(name)')
    .eq('id', orderId)
    .maybeSingle()
  if (!order || !order.salesperson) return { ok: false, reason: 'order has no salesperson' }

  const brand = brandForSource(order.source)
  const merchant = await getMerchantConfig(brand)
  const from = merchant.email
    ? `${merchant.displayName} <${merchant.email}>`
    : (brandConfig(brand).emailFrom || undefined)

  const { data: sp } = await supabaseAdmin
    .from('salespeople')
    .select('name, email')
    .eq('code', order.salesperson)
    .maybeSingle()
  if (!sp?.email) return { ok: false, reason: `no email set for salesperson "${order.salesperson}"` }

  const { data: tpl } = await supabaseAdmin
    .from('email_templates')
    .select('subject, body, enabled')
    .eq('key', 'delivery')
    .maybeSingle()
  if (!tpl) return { ok: false, reason: 'no delivery email template' }
  if (!tpl.enabled) return { ok: false, reason: 'delivery email is turned off in Admin' }

  const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers
  const podLink = String(opts.podLink || '').trim()
  const fill = (text: string) => String(text || '')
    .replaceAll('{order_number}', order.order_number || '')
    .replaceAll('{customer_name}', customer?.name || '')
    .replaceAll('{salesperson_code}', order.salesperson || '')
    .replaceAll('{salesperson_name}', sp.name || order.salesperson || '')
    .replaceAll('{delivery_date}', formatDateAu(order.delivery_date) || 'today')
    .replaceAll('{proof_of_delivery}', podLink)
    .replaceAll('{pod_link}', podLink)
    .replaceAll('{merchant}', merchant.displayName)
    .replaceAll('{merchant_email}', merchant.email)
    .replaceAll('{merchant_showroom_phone}', merchant.showroomPhone)
    .replaceAll('{merchant_warehouse_phone}', merchant.warehousePhone)
    .replaceAll('{merchant_address}', merchant.address)

  let body = fill(tpl.body)
  // If Wodely gave us a proof-of-delivery link but the template doesn't reference
  // it, append it so the salesperson always gets the link.
  if (podLink && !/\{proof_of_delivery\}|\{pod_link\}/.test(tpl.body || '')) {
    body += `\n\nProof of delivery: ${podLink}`
  }

  await sendEmail({ to: sp.email, subject: fill(tpl.subject), text: body, from })
  return { ok: true, reason: `sent to ${sp.email}` }
}
