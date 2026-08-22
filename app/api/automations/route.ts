import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SELECT =
  'id, is_active, sort_order, trigger_type, trigger_template_id, trigger_template_ids, trigger_keyword, trigger_status, match_mode, action_set_status, action_set_light, action_set_ready, action_regenerate_link, action_send_template_id, action_send_template_ids, payment_source'

function idList(arr: unknown, single: unknown): string[] {
  const raw = Array.isArray(arr) ? arr : (single ? [single] : [])
  return Array.from(new Set(raw.map((v) => String(v ?? '').trim()).filter(Boolean)))
}
// Template id(s) for the "send template(s)" action — new array or legacy single.
function sendTemplateIds(body: { action_send_template_ids?: unknown; action_send_template_id?: unknown }): string[] {
  return idList(body.action_send_template_ids, body.action_send_template_id)
}
// Template id(s) a rule triggers on — new array or legacy single.
function triggerTemplateIds(body: { trigger_template_ids?: unknown; trigger_template_id?: unknown }): string[] {
  return idList(body.trigger_template_ids, body.trigger_template_id)
}

const PAYMENT_SOURCES = new Set(['any', 'dashboard', 'showroom'])
function paymentSourceOf(v: unknown): string {
  const s = String(v ?? '').trim()
  return PAYMENT_SOURCES.has(s) ? s : 'any'
}

const TRIGGERS = new Set(['template_sent', 'reply_keyword', 'reply_to_template', 'status_set', 'delivery_date_set', 'delivery_date_cleared', 'payment_received'])
const REPLY_TRIGGERS = new Set(['reply_keyword', 'reply_to_template'])
const MATCH_MODES = new Set(['keyword', 'affirmative', 'negative', 'any'])
const LIGHTS = new Set(['confirmed', 'awaiting', 'rejected', 'none'])
const READY = new Set(['Ready', 'Not Ready'])

function clean(v: unknown): string {
  return String(v ?? '').trim()
}
function orNull(v: unknown): string | null {
  const s = clean(v)
  return s || null
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('automations')
    .select(SELECT)
    .order('sort_order', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ automations: data || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const trigger_type = clean(body.trigger_type)
    if (!TRIGGERS.has(trigger_type)) return NextResponse.json({ error: 'Choose a valid trigger.' }, { status: 400 })

    const trigger_template_ids = triggerTemplateIds(body)
    const trigger_template_id = trigger_template_ids[0] || null
    const trigger_keyword = orNull(body.trigger_keyword)
    const trigger_status = orNull(body.trigger_status)
    const match_mode = MATCH_MODES.has(clean(body.match_mode)) ? clean(body.match_mode) : null

    if ((trigger_type === 'template_sent' || trigger_type === 'reply_to_template') && trigger_template_ids.length === 0) {
      return NextResponse.json({ error: 'Pick at least one template for this trigger.' }, { status: 400 })
    }
    if (trigger_type === 'reply_keyword' && !trigger_keyword) {
      return NextResponse.json({ error: 'Enter the keyword for this trigger.' }, { status: 400 })
    }
    if (trigger_type === 'status_set' && !trigger_status) {
      return NextResponse.json({ error: 'Pick the status that triggers this rule.' }, { status: 400 })
    }

    const action_set_status = orNull(body.action_set_status)
    const action_set_light = LIGHTS.has(clean(body.action_set_light)) ? clean(body.action_set_light) : null
    const action_set_ready = READY.has(clean(body.action_set_ready)) ? clean(body.action_set_ready) : null
    const action_regenerate_link = Boolean(body.action_regenerate_link)
    const action_send_template_ids = sendTemplateIds(body)
    const action_send_template_id = action_send_template_ids[0] || null

    if (!action_set_status && !action_set_light && !action_set_ready && !action_regenerate_link && action_send_template_ids.length === 0) {
      return NextResponse.json({ error: 'Pick at least one action.' }, { status: 400 })
    }

    // New rules go to the end of the order.
    const { data: last } = await supabaseAdmin.from('automations').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
    const sort_order = (last?.sort_order ?? 0) + 1

    const { data, error } = await supabaseAdmin
      .from('automations')
      .insert({
        trigger_type,
        trigger_template_id: (trigger_type === 'template_sent' || trigger_type === 'reply_to_template') ? trigger_template_id : null,
        trigger_template_ids: (trigger_type === 'template_sent' || trigger_type === 'reply_to_template') ? trigger_template_ids : [],
        trigger_keyword: REPLY_TRIGGERS.has(trigger_type) ? trigger_keyword : null,
        trigger_status: trigger_type === 'status_set' ? trigger_status : null,
        match_mode: REPLY_TRIGGERS.has(trigger_type) ? (match_mode || (trigger_keyword ? 'keyword' : 'any')) : null,
        action_set_status,
        action_set_light,
        action_set_ready,
        action_regenerate_link,
        action_send_template_id,
        action_send_template_ids,
        payment_source: trigger_type === 'payment_received' ? paymentSourceOf(body.payment_source) : 'any',
        sort_order,
        is_active: true
      })
      .select(SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ automation: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = clean(body.id)
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })

    // Reorder: swap sort_order with the neighbour in the given direction.
    if (body.move === 'up' || body.move === 'down') {
      const { data: rows } = await supabaseAdmin.from('automations').select('id, sort_order').order('sort_order', { ascending: true })
      const list = rows || []
      const idx = list.findIndex((r) => r.id === id)
      if (idx < 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
      const swapIdx = body.move === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= list.length) return NextResponse.json({ ok: true })
      const a = list[idx]
      const b = list[swapIdx]
      await supabaseAdmin.from('automations').update({ sort_order: b.sort_order, updated_at: new Date().toISOString() }).eq('id', a.id)
      await supabaseAdmin.from('automations').update({ sort_order: a.sort_order, updated_at: new Date().toISOString() }).eq('id', b.id)
      return NextResponse.json({ ok: true })
    }

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('is_active' in body) update.is_active = Boolean(body.is_active)
    if ('action_set_status' in body) update.action_set_status = orNull(body.action_set_status)
    if ('action_set_light' in body) update.action_set_light = LIGHTS.has(clean(body.action_set_light)) ? clean(body.action_set_light) : null
    if ('action_set_ready' in body) update.action_set_ready = READY.has(clean(body.action_set_ready)) ? clean(body.action_set_ready) : null
    if ('action_regenerate_link' in body) update.action_regenerate_link = Boolean(body.action_regenerate_link)
    if ('action_send_template_ids' in body || 'action_send_template_id' in body) {
      const ids = sendTemplateIds(body)
      update.action_send_template_ids = ids
      update.action_send_template_id = ids[0] || null
    }
    if ('trigger_keyword' in body) update.trigger_keyword = orNull(body.trigger_keyword)
    if ('trigger_status' in body) update.trigger_status = orNull(body.trigger_status)
    if ('match_mode' in body) update.match_mode = MATCH_MODES.has(clean(body.match_mode)) ? clean(body.match_mode) : null
    if ('trigger_template_ids' in body || 'trigger_template_id' in body) {
      const ids = triggerTemplateIds(body)
      update.trigger_template_ids = ids
      update.trigger_template_id = ids[0] || null
    }
    if ('payment_source' in body) update.payment_source = paymentSourceOf(body.payment_source)

    const { data, error } = await supabaseAdmin.from('automations').update(update).eq('id', id).select(SELECT).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ automation: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const id = clean(body.id)
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    const { error } = await supabaseAdmin.from('automations').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed.' }, { status: 500 })
  }
}
