import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0
const noStore = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('sms_reply_rules')
    .select('id, keyword, reply_template_id, set_status, set_light, is_active, sort_order')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rules: data || [] }, { headers: noStore })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const keyword = String(body.keyword || '').trim()
    if (!keyword) return NextResponse.json({ error: 'A keyword is required.' }, { status: 400 })

    const allowedLights = ['confirmed', 'awaiting', 'rejected']
    const row: Record<string, unknown> = {
      keyword,
      reply_template_id: body.reply_template_id || null,
      set_status: String(body.set_status || '').trim() || null,
      set_light: allowedLights.includes(String(body.set_light)) ? String(body.set_light) : null,
      is_active: body.is_active === undefined ? true : Boolean(body.is_active),
      updated_at: new Date().toISOString()
    }
    if (body.id) row.id = String(body.id)

    const { data, error } = await supabaseAdmin
      .from('sms_reply_rules')
      .upsert(row)
      .select('id, keyword, reply_template_id, set_status, set_light, is_active, sort_order')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ rule: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing rule id.' }, { status: 400 })
    const { error } = await supabaseAdmin.from('sms_reply_rules').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ deleted: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Delete failed.' }, { status: 500 })
  }
}
