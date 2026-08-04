import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'

// The caller's own SMS conversations — their private inbox. A conversation
// "belongs to" a staff member when they have sent at least one message in it
// (sms_messages.sent_by = them). Matched threads are keyed by customer; replies
// from a number we don't have a customer for are keyed by phone ("unmatched").
// Admins still only see their own here — oversight of all threads is separate.

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

export async function GET() {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Which conversations has this staff member taken part in?
  const { data: mine, error: mineError } = await supabaseAdmin
    .from('sms_messages')
    .select('customer_id, phone')
    .eq('sent_by', me.id)
    .limit(5000)
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

  // Names for the matched customers.
  const nameById = new Map<string, string>()
  if (customerIds.size) {
    const { data: customers } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .in('id', Array.from(customerIds))
    for (const c of customers || []) nameById.set(String(c.id), (c.name as string) || 'Customer')
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
        name: matched ? (nameById.get(String(m.customer_id)) || 'Customer') : (m.phone || 'Unknown number'),
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

  const conversations = Array.from(byKey.values()).sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1))
  return NextResponse.json({ conversations })
}
