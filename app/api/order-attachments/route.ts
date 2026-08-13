import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestUser } from '@/lib/apiAuth'
import { ORDER_ATTACHMENTS_BUCKET } from '@/lib/orderAttachments'

export const runtime = 'nodejs'

// GET — list attachments. Any signed-in user (Order Tools needs the list to
// show optional docs; the middleware already requires a session).
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabaseAdmin
    .from('order_attachments')
    .select('id, name, mode, sort_order, active, created_at')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ attachments: data || [] })
}

// POST — upload a new attachment PDF (admin only). multipart: file, name, mode.
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No PDF uploaded.' }, { status: 400 })
    if (file.type && file.type !== 'application/pdf') return NextResponse.json({ error: 'File must be a PDF.' }, { status: 400 })

    const name = String(form.get('name') || file.name || 'Attachment').trim().replace(/\.pdf$/i, '') || 'Attachment'
    const mode = String(form.get('mode') || 'optional') === 'always' ? 'always' : 'optional'

    const filePath = `${crypto.randomUUID()}.pdf`
    const bytes = new Uint8Array(await file.arrayBuffer())
    const up = await supabaseAdmin.storage.from(ORDER_ATTACHMENTS_BUCKET).upload(filePath, bytes, { contentType: 'application/pdf', upsert: false })
    if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })

    const { data, error } = await supabaseAdmin
      .from('order_attachments')
      .insert({ name, file_path: filePath, mode })
      .select('id, name, mode, sort_order, active, created_at')
      .single()
    if (error) {
      await supabaseAdmin.storage.from(ORDER_ATTACHMENTS_BUCKET).remove([filePath]).catch(() => {})
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ attachment: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed.' }, { status: 500 })
  }
}

// PATCH — update name / mode / active / sort_order (admin only).
export async function PATCH(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 })

  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    const update: Record<string, unknown> = {}
    if ('name' in body) update.name = String(body.name || '').trim() || 'Attachment'
    if ('mode' in body) update.mode = body.mode === 'always' ? 'always' : 'optional'
    if ('active' in body) update.active = !!body.active
    if ('sort_order' in body) update.sort_order = Number(body.sort_order) || 0
    if (!Object.keys(update).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('order_attachments')
      .update(update)
      .eq('id', id)
      .select('id, name, mode, sort_order, active, created_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ attachment: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 })
  }
}

// DELETE — remove an attachment and its stored file (admin only).
export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 })

  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })

    const { data: row } = await supabaseAdmin.from('order_attachments').select('file_path').eq('id', id).maybeSingle()
    const { error } = await supabaseAdmin.from('order_attachments').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (row?.file_path) await supabaseAdmin.storage.from(ORDER_ATTACHMENTS_BUCKET).remove([row.file_path]).catch(() => {})
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed.' }, { status: 500 })
  }
}
