import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'
import { sendStaffSms, findCustomerIdByPhone } from '@/lib/sms'
import { normalizeMobileAu } from '@/lib/format'
import { paymentBrandForHost } from '@/lib/host'

// Free-form staff SMS: send a one-off text to a customer or a typed mobile from
// the Messages inbox. Sent through the host brand's MessageMedia account and
// logged with sent_by = the caller, so it lands in their private inbox.

export async function POST(request: NextRequest) {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { customerId?: string; phone?: string; body?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  let customerId = String(body.customerId || '').trim()
  const message = String(body.body || '').trim()
  if (!message) return NextResponse.json({ error: 'Message is blank.' }, { status: 400 })

  // Resolve the recipient number: a chosen customer's stored mobile, or a typed
  // number for someone not in the system yet.
  let toPhone = String(body.phone || '').trim()
  if (customerId) {
    const { data: customer, error } = await supabaseAdmin.from('customers').select('phone').eq('id', customerId).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!customer) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 })
    if (!toPhone) toPhone = String(customer.phone || '').trim()
  }
  if (!toPhone) return NextResponse.json({ error: 'No mobile number for this recipient.' }, { status: 400 })

  // A typed number that belongs to an existing customer should thread with that
  // customer (and their replies), not create a stray "unmatched" conversation.
  if (!customerId) {
    const matchedId = await findCustomerIdByPhone(toPhone)
    if (matchedId) customerId = matchedId
  }

  // Which brand's MessageMedia account/sender number to send from: the app the
  // staff member is using (its host). Falls back to legacy env creds off-host.
  const brand = paymentBrandForHost(request.headers.get('host')) || undefined

  const result = await sendStaffSms({
    toPhone,
    body: message,
    brand,
    customerId: customerId || null,
    sentBy: me.id
  })

  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 502 })
  const key = customerId ? `c:${customerId}` : `p:${normalizeMobileAu(toPhone)}`
  return NextResponse.json({ ok: true, key, customerId: customerId || null, phone: customerId ? null : normalizeMobileAu(toPhone), messageId: result.messageId })
}
