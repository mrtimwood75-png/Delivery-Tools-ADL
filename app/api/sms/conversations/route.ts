import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'
import { paymentBrandForHost } from '@/lib/host'

// The caller's own SMS conversations — their private inbox. This is the
// Messages *tool's* channel, kept separate from the dashboard's order/delivery
// SMS: a conversation only belongs here when the staff member sent a FREE-FORM
// message in it through this tool (no order_id, no template_id) from THIS store
// (brand). The thread view then shows that customer's full history for context.

type Msg = {
  id: string
  customer_id: string | null
  phone: string | null
  direction: string
  body: string
  status: string | null
  created_at: string
  read_at: string | null
}

type Conversation = {
  key: string
  customerId: string | null
  phone: string | null
  name: string
  lastBody: string
  lastDirection: string
  lastAt: string
  unread: number
  unmatched: boolean
}

export async function GET(request: NextRequest) {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = paymentBrandForHost(request.headers.get('host'))

  // Which conversations has this staff member started through this tool? Only
  // free-form sends (no order/template) count, and — on a payment host — only
  // this store's brand, so each app shows just its own threads.
  let mineQuery = supabaseAdmin
    .from('sms_messages')
    .select('customer_id, phone')
    .eq('sent_by', me.id)
    .is('order_id', null)
    .is('template_id', null)
    .limit(5000)
  if (brand) mineQuery = mineQuery.eq('brand', brand)
  const { data: mine, error: mineError } = await mineQuery
  if (mineError) return NextResponse.json({ error: mineError.message }, { status: 500 })

  const customerIds = new Set<string>()
  const phones = new Set<string>()
  for (const row of mine || []) {
    if (row.customer_id) customerIds.add(String(row.customer_id))
    else if (row.phone) phones.add(String(row.phone))
  }

  if (!customerIds.size && !phones.size) return NextResponse.json({ conversations: [] })

  // Pull every message in those conversations (matched by customer, unmatched by
  // phone), newest first, then fold to one row per conversation in JS.
  const messages: Msg[] = []
  if (customerIds.size) {
    const { data, error } = await supabaseAdmin
      .from('sms_messages')
      .select('id, customer_id, phone, direction, body, status, created_at, read_at')
      .in('customer_id', Array.from(customerIds))
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    messages.push(...((data || []) as Msg[]))
  }
  if (phones.size) {
    const { data, error } = await supabaseAdmin
      .from('sms_messages')
      .select('id, customer_id, phone, direction, body, status, created_at, read_at')
      .is('customer_id', null)
      .in('phone', Array.from(phones))
      .order('created_at', { ascending: false })
      .limit(5000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    messages.push(...((data || []) as Msg[]))
  }

  // Display names come ONLY from names staff saved inside the Messages tool
  // (sms_contacts), keyed by phone — never the customer's delivery-DB name.
  const msgPhones = new Set<string>()
  for (const m of messages) if (m.phone) msgPhones.add(m.phone)
  const nameByPhone = new Map<string, string>()
  if (msgPhones.size) {
    const { data: contacts } = await supabaseAdmin
      .from('sms_contacts')
      .select('phone, display_name')
      .in('phone', Array.from(msgPhones))
    for (const c of contacts || []) if (c.display_name) nameByPhone.set(String(c.phone), c.display_name as string)
  }

  const byKey = new Map<string, Conversation>()
  for (const m of messages) {
    const matched = !!m.customer_id
    const key = matched ? `c:${m.customer_id}` : `p:${m.phone}`
    let conv = byKey.get(key)
    if (!conv) {
      conv = {
        key,
        customerId: m.customer_id,
        phone: m.phone,
        name: (m.phone && nameByPhone.get(m.phone)) || m.phone || 'Unknown number',
        lastBody: m.body,
        lastDirection: m.direction,
        lastAt: m.created_at,
        unread: 0,
        unmatched: !matched
      }
      byKey.set(key, conv)
    }
    // messages are newest-first, so the first seen per key is the latest.
    if (m.direction === 'inbound' && !m.read_at) conv.unread += 1
  }

  // Drop threads the caller has hidden ("deleted" from their inbox), unless a
  // newer message has arrived since they hid it (so a fresh reply isn't lost).
  const { data: hidden } = await supabaseAdmin
    .from('sms_hidden_threads')
    .select('phone, hidden_at')
    .eq('user_id', me.id)
  const hiddenByPhone = new Map<string, string>()
  for (const h of hidden || []) hiddenByPhone.set(String(h.phone), String(h.hidden_at))

  const conversations = Array.from(byKey.values())
    .filter((c) => {
      const h = c.phone ? hiddenByPhone.get(c.phone) : undefined
      return !h || new Date(c.lastAt).getTime() > new Date(h).getTime()
    })
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  return NextResponse.json({ conversations })
}
