import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'
import { normalizeMobileAu } from '@/lib/format'

// Set (or clear) a display name for a number, used only inside the Messages
// tool. This never touches the customer's delivery-database name — the inbox
// shows the number unless a name is saved here. Keyed by normalized phone.
export async function POST(request: NextRequest) {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { phone?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const phone = normalizeMobileAu(String(body.phone || '').trim())
  if (!phone) return NextResponse.json({ error: 'Missing phone.' }, { status: 400 })
  const name = String(body.name || '').trim()

  if (!name) {
    // Empty name clears it — the inbox falls back to showing the number.
    const { error } = await supabaseAdmin.from('sms_contacts').delete().eq('phone', phone)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, name: null })
  }

  const { error } = await supabaseAdmin
    .from('sms_contacts')
    .upsert({ phone, display_name: name, updated_at: new Date().toISOString() }, { onConflict: 'phone' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, name })
}
