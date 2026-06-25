import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const roles = ['standard', 'manager', 'admin']

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

// Create (or, if it already exists, update the password of) the Supabase Auth
// login that backs this app_users profile. Email is pre-confirmed so the user
// can sign in immediately with the password the admin sets.
async function setAuthPassword(email: string, password: string) {
  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!createError && created?.user) return
  const existingId = await findAuthUserId(email)
  if (existingId) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(existingId, { password })
    if (error) throw new Error(error.message)
    return
  }
  throw new Error(createError?.message || 'Could not create login account.')
}

const USER_SELECT = 'id, email, full_name, role, is_active, can_access_dashboard, can_access_payments, created_at'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select(USER_SELECT)
    .order('email', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ users: data || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = String(body.email || '').trim().toLowerCase()
    const full_name = String(body.full_name || '').trim()
    const role = roles.includes(String(body.role || 'standard')) ? String(body.role || 'standard') : 'standard'
    const is_active = body.is_active !== false
    const password = String(body.password || '')

    if (!email) return NextResponse.json({ error: 'Email is required.' }, { status: 400 })
    if (password) {
      if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
      try {
        await setAuthPassword(email, password)
      } catch (authError) {
        return NextResponse.json({ error: authError instanceof Error ? authError.message : 'Could not set login password.' }, { status: 500 })
      }
    }

    const payload: Record<string, unknown> = { email, full_name, role, is_active }
    if ('can_access_dashboard' in body) payload.can_access_dashboard = Boolean(body.can_access_dashboard)
    if ('can_access_payments' in body) payload.can_access_payments = Boolean(body.can_access_payments)

    const { data, error } = await supabaseAdmin
      .from('app_users')
      .upsert(payload, { onConflict: 'email' })
      .select(USER_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'User save failed.' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'Missing user id.' }, { status: 400 })

    const password = String(body.password || '')
    if (password) {
      if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters.' }, { status: 400 })
      let email = String(body.email || '').trim().toLowerCase()
      if (!email) {
        const { data: existing } = await supabaseAdmin.from('app_users').select('email').eq('id', id).single()
        email = existing?.email || ''
      }
      if (!email) return NextResponse.json({ error: 'Could not find user email to reset password.' }, { status: 404 })
      try {
        await setAuthPassword(email, password)
      } catch (authError) {
        return NextResponse.json({ error: authError instanceof Error ? authError.message : 'Could not reset login password.' }, { status: 500 })
      }
    }

    const update: Record<string, unknown> = {}
    if ('email' in body) update.email = String(body.email || '').trim().toLowerCase()
    if ('full_name' in body) update.full_name = String(body.full_name || '').trim()
    if ('role' in body) update.role = roles.includes(String(body.role)) ? String(body.role) : 'standard'
    if ('is_active' in body) update.is_active = Boolean(body.is_active)
    if ('can_access_dashboard' in body) update.can_access_dashboard = Boolean(body.can_access_dashboard)
    if ('can_access_payments' in body) update.can_access_payments = Boolean(body.can_access_payments)

    if (!Object.keys(update).length) {
      const { data, error } = await supabaseAdmin.from('app_users').select(USER_SELECT).eq('id', id).single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ user: data, passwordReset: Boolean(password) })
    }

    const { data, error } = await supabaseAdmin
      .from('app_users')
      .update(update)
      .eq('id', id)
      .select(USER_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ user: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'User update failed.' }, { status: 500 })
  }
}
