import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'
import { normalizeMobileAu } from '@/lib/format'

// One conversation's full thread, for the Messages inbox. Ownership is enforced:
// the caller only sees a thread they've taken part in (they have a message with
// sent_by = them in it) — so it stays their private window. Opening a thread
// also marks its inbound messages read.

export async function GET(request: NextRequest) {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const customerId = (searchParams.get('customerId') || '').trim()
  const phone = customerId ? '' : normalizeMobileAu(searchParams.get('phone') || '')
  if (!customerId && !phone) return NextResponse.json({ error: 'Missing customerId or phone.' }, { status: 400 })

  // Ownership: has this staff member sent a free-form message (this tool) in
  // this conversation? Order/template sends belong to the dashboard, not here.
  let ownQuery = supabaseAdmin.from('sms_messages').select('id').eq('sent_by', me.id).is('order_id', null).is('template_id', null).limit(1)
  ownQuery = customerId ? ownQuery.eq('customer_id', customerId) : ownQuery.is('customer_id', null).eq('phone', phone)
  const { data: owned, error: ownError } = await ownQuery
  if (ownError) return NextResponse.json({ error: ownError.message }, { status: 500 })
  if (!owned || !owned.length) return NextResponse.json({ error: 'Not your conversation.' }, { status: 403 })

  // The thread itself, chronological with deterministic tie-breaks (inbound
  // before our outbound on an equal timestamp, then by id).
  let msgQuery = supabaseAdmin
    .from('sms_messages')
    .select('id, created_at, direction, phone, body, status, provider_message_id, order_id, error')
    .order('created_at', { ascending: true })
    .order('direction', { ascending: true })
    .order('id', { ascending: true })
  msgQuery = customerId ? msgQuery.eq('customer_id', customerId) : msgQuery.is('customer_id', null).eq('phone', phone)
  const { data: messages, error: msgError } = await msgQuery
  if (msgError) return NextResponse.json({ error: msgError.message }, { status: 500 })

  // The conversation's number (for a customer thread, taken from its messages).
  const convPhone = phone || (messages || []).map((m) => m.phone).find(Boolean) || ''

  // Label comes ONLY from a name saved inside the Messages tool (sms_contacts),
  // never the customer's delivery-DB name; otherwise show the number.
  let name = convPhone || 'Unknown number'
  if (convPhone) {
    const { data: contact } = await supabaseAdmin.from('sms_contacts').select('display_name').eq('phone', convPhone).maybeSingle()
    if (contact?.display_name) name = contact.display_name as string
  }

  // Opening the thread clears its unread inbound.
  let readQuery = supabaseAdmin
    .from('sms_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('direction', 'inbound')
    .is('read_at', null)
  readQuery = customerId ? readQuery.eq('customer_id', customerId) : readQuery.is('customer_id', null).eq('phone', phone)
  await readQuery

  return NextResponse.json({ name, customerId: customerId || null, phone: convPhone || null, messages: messages || [] })
}
