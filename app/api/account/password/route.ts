import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Self-service password change for the signed-in (password) user. Updates the
// Supabase Auth login that backs the dashboard Credentials provider. Microsoft
// (payment-app) users don't have a password here — their login is managed in
// their Microsoft tenant.
async function findAuthUserId(email: string): Promise<string | null> {
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data?.users?.length) return null
    const hit = data.users.find((user) => (user.email || '').toLowerCase() === email)
    if (hit) return hit.id
    if (data.users.length < 200) return null
  }
  return null
}

export async function POST(request: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase() || ''
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const password = String(body.password || '')
  if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })

  const id = await findAuthUserId(email)
  if (!id) return NextResponse.json({ error: 'No password login found for this account.' }, { status: 404 })

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
