import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const KEY = 'delivery'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('email_templates')
    .select('key, subject, body, enabled')
    .eq('key', KEY)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data || { key: KEY, subject: '', body: '', enabled: false } })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const payload = {
      key: KEY,
      subject: String(body.subject || '').trim(),
      body: String(body.body || ''),
      enabled: Boolean(body.enabled),
      updated_at: new Date().toISOString()
    }
    const { data, error } = await supabaseAdmin
      .from('email_templates')
      .upsert(payload, { onConflict: 'key' })
      .select('key, subject, body, enabled')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}
