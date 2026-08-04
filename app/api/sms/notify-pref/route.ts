import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'

// Per-staff "email me when a customer replies" toggle for the Messages inbox.
export async function GET() {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ notifyEmail: me.notifyEmail })
}

export async function POST(request: NextRequest) {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { enabled?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }
  const enabled = Boolean(body.enabled)

  const { error } = await supabaseAdmin.from('app_users').update({ sms_notify_email: enabled }).eq('id', me.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notifyEmail: enabled })
}
