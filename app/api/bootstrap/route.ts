import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// One-time first-admin bootstrap, since every other route is behind the
// allowlist and the table starts empty. Guarded two ways: it requires the
// BOOTSTRAP_SECRET and only works while app_users is empty. Listed in middleware
// PUBLIC_API. Remove/rotate the secret once the first admin exists.
export async function POST(request: NextRequest) {
  const secret = (process.env.BOOTSTRAP_SECRET || '').trim()
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { count, error: countError } = await supabaseAdmin
    .from('app_users')
    .select('*', { count: 'exact', head: true })
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 })
  if ((count || 0) > 0) return NextResponse.json({ error: 'Already initialised.' }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  const email = String(body.email || '').trim().toLowerCase()
  const password = String(body.password || '')
  const fullName = String(body.full_name || '').trim()
  if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })

  const { error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError && !/already|registered|exists/i.test(createError.message)) {
    return NextResponse.json({ error: createError.message }, { status: 500 })
  }

  const { error } = await supabaseAdmin.from('app_users').insert({
    email,
    full_name: fullName || email,
    role: 'admin',
    is_active: true,
    can_access_dashboard: true,
    can_access_payments: true
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, email })
}
