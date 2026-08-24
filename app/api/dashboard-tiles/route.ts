import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const SELECT = 'id, label, kind, value, criteria, tone, sort_order, is_active'
// The criteria a tile can count/filter on. Each maps to a dashboard filter key.
const KINDS = new Set(['customerStatus', 'customerStatusNot', 'deliveryLight', 'payment', 'ready', 'unreadOnly', 'paidUnbooked'])
const VALUE_KINDS = new Set(['customerStatus', 'customerStatusNot', 'deliveryLight', 'payment', 'ready'])
const noStore = { 'Cache-Control': 'no-store' }

function clean(v: unknown) { return String(v ?? '').trim() }

// A tile's criteria list (all AND-combined). Accepts the new `criteria` array or
// the legacy single kind/value, and drops anything invalid.
function normCriteria(body: { criteria?: unknown; kind?: unknown; value?: unknown }): { kind: string; value: string }[] {
  const raw: unknown[] = Array.isArray(body.criteria)
    ? body.criteria
    : (body.kind ? [{ kind: body.kind, value: body.value }] : [])
  const out: { kind: string; value: string }[] = []
  for (const c of raw) {
    const item = c as { kind?: unknown; value?: unknown }
    const kind = clean(item?.kind)
    if (!KINDS.has(kind)) continue
    const value = (kind === 'unreadOnly' || kind === 'paidUnbooked') ? 'yes' : clean(item?.value)
    if (VALUE_KINDS.has(kind) && !value) continue
    out.push({ kind, value })
  }
  return out
}

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
    const tone = clean(body.tone) || '#3a4a5a'
    const criteria = normCriteria(body)
    if (!label) return NextResponse.json({ error: 'A label is required.' }, { status: 400 })
    if (!criteria.length) return NextResponse.json({ error: 'Add at least one criteria.' }, { status: 400 })

    const { data: last } = await supabaseAdmin.from('dashboard_tiles').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sort_order = (last?.sort_order ?? 0) + 1

    const { data, error } = await supabaseAdmin
      .from('dashboard_tiles')
      .insert({ label, kind: criteria[0].kind, value: criteria[0].value, criteria, tone, sort_order, is_active: true })
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
    if ('tone' in body) update.tone = clean(body.tone) || '#3a4a5a'
    if ('is_active' in body) update.is_active = Boolean(body.is_active)
    if ('criteria' in body || 'kind' in body) {
      const criteria = normCriteria(body)
      if (!criteria.length) return NextResponse.json({ error: 'A tile needs at least one criteria.' }, { status: 400 })
      update.criteria = criteria
      update.kind = criteria[0].kind
      update.value = criteria[0].value
    }

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
