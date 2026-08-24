import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const SELECT = 'id, label, kind, value, tone, sort_order, is_active'
// The criteria a tile can count/filter on. Each maps to a dashboard filter key.
const KINDS = new Set(['customerStatus', 'deliveryLight', 'payment', 'ready', 'unreadOnly', 'paidUnbooked'])
const noStore = { 'Cache-Control': 'no-store' }

function clean(v: unknown) { return String(v ?? '').trim() }

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('dashboard_tiles')
    .select(SELECT)
    .order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tiles: data || [] }, { headers: noStore })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const label = clean(body.label)
    const kind = clean(body.kind)
    const value = clean(body.value)
    const tone = clean(body.tone) || '#3a4a5a'
    if (!label) return NextResponse.json({ error: 'A label is required.' }, { status: 400 })
    if (!KINDS.has(kind)) return NextResponse.json({ error: 'Pick a valid criteria.' }, { status: 400 })
    // Value-bearing kinds need a value; unread/paid-unbooked are self-contained.
    if ((kind === 'customerStatus' || kind === 'deliveryLight' || kind === 'payment' || kind === 'ready') && !value) {
      return NextResponse.json({ error: 'Pick a value for this criteria.' }, { status: 400 })
    }
    const storedValue = (kind === 'unreadOnly' || kind === 'paidUnbooked') ? 'yes' : value

    const { data: last } = await supabaseAdmin.from('dashboard_tiles').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sort_order = (last?.sort_order ?? 0) + 1

    const { data, error } = await supabaseAdmin
      .from('dashboard_tiles')
      .insert({ label, kind, value: storedValue, tone, sort_order, is_active: true })
      .select(SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tile: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = clean(body.id)
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })

    if (body.move === 'up' || body.move === 'down') {
      const { data: rows } = await supabaseAdmin.from('dashboard_tiles').select('id, sort_order').order('sort_order', { ascending: true })
      const list = rows || []
      const idx = list.findIndex((r) => r.id === id)
      if (idx < 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
      const swapIdx = body.move === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= list.length) return NextResponse.json({ ok: true })
      const a = list[idx]; const b = list[swapIdx]
      await supabaseAdmin.from('dashboard_tiles').update({ sort_order: b.sort_order, updated_at: new Date().toISOString() }).eq('id', a.id)
      await supabaseAdmin.from('dashboard_tiles').update({ sort_order: a.sort_order, updated_at: new Date().toISOString() }).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('label' in body) update.label = clean(body.label)
    if ('kind' in body && KINDS.has(clean(body.kind))) update.kind = clean(body.kind)
    if ('value' in body) update.value = clean(body.value)
    if ('tone' in body) update.tone = clean(body.tone) || '#3a4a5a'
    if ('is_active' in body) update.is_active = Boolean(body.is_active)

    const { data, error } = await supabaseAdmin.from('dashboard_tiles').update(update).eq('id', id).select(SELECT).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ tile: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const id = clean(body.id)
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    const { error } = await supabaseAdmin.from('dashboard_tiles').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed.' }, { status: 500 })
  }
}
