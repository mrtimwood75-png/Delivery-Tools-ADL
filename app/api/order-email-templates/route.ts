import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestUser } from '@/lib/apiAuth'

export const runtime = 'nodejs'

const SELECT = 'id, name, subject, body, attachment_ids, sort_order, active, created_at'

// GET — list templates (any signed-in user; Order Tools needs the picker).
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin
    .from('order_email_templates')
    .select(SELECT)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

function normIds(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  return []
}

// POST — create a template (admin only).
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  try {
    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Template name is required.' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('order_email_templates')
      .insert({
        name,
        subject: String(body.subject || '').trim(),
        body: String(body.body || ''),
        attachment_ids: normIds(body.attachment_ids)
      })
      .select(SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}

// PATCH — update (admin only).
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    const update: Record<string, unknown> = {}
    if ('name' in body) update.name = String(body.name || '').trim() || 'Template'
    if ('subject' in body) update.subject = String(body.subject || '').trim()
    if ('body' in body) update.body = String(body.body || '')
    if ('attachment_ids' in body) update.attachment_ids = normIds(body.attachment_ids)
    if ('active' in body) update.active = !!body.active
    if ('sort_order' in body) update.sort_order = Number(body.sort_order) || 0
    if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from('order_email_templates')
      .update(update)
      .eq('id', id)
      .select(SELECT)
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 })
  }
}

// DELETE — remove (admin only).
export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 })
  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    const { error } = await supabaseAdmin.from('order_email_templates').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed.' }, { status: 500 })
  }
}
