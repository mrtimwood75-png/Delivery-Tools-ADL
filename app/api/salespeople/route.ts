import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('salespeople')
    .select('id, code, name, email')
    .order('code', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ salespeople: data || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const code = String(body.code || '').trim()
    if (!code) return NextResponse.json({ error: 'Salesperson code is required.' }, { status: 400 })
    const payload = { code, name: String(body.name || '').trim() || null, email: String(body.email || '').trim().toLowerCase() || null, updated_at: new Date().toISOString() }
    const { data, error } = await supabaseAdmin
      .from('salespeople')
      .upsert(payload, { onConflict: 'code' })
      .select('id, code, name, email')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ salesperson: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('name' in body) update.name = String(body.name || '').trim() || null
    if ('email' in body) update.email = String(body.email || '').trim().toLowerCase() || null

    const { data, error } = await supabaseAdmin
      .from('salespeople')
      .update(update)
      .eq('id', id)
      .select('id, code, name, email')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ salesperson: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Update failed.' }, { status: 500 })
  }
}
