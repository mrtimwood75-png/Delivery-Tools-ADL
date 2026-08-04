import type { NextRequest } from 'next/server'
import { auth } from '@/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Server-side auth guard for API routes. Identity comes from the NextAuth
// session (also enforced by middleware); we re-read it here so a route can use
// the caller's email/role. The request arg is accepted for call-site
// compatibility but unused — the session is read from cookies. Returns null
// when there is no valid session.
export async function getRequestUser(_request?: NextRequest) {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) return null
  return {
    id: email,
    email,
    isAdmin: !!session?.user?.isAdmin,
    store: session?.user?.store ?? null
  }
}

// Like getRequestUser, but resolves the caller's app_users ROW (uuid + prefs).
// The Messages inbox keys ownership off sms_messages.sent_by, which is the
// app_users uuid — the session only carries the email — so routes that write or
// filter by sent_by need this. Returns null when there is no active app_user.
export async function getRequestAppUser() {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase()
  if (!email) return null
  const { data } = await supabaseAdmin
    .from('app_users')
    .select('id, email, role, is_active, sms_notify_email')
    .eq('email', email)
    .maybeSingle()
  if (!data || data.is_active === false) return null
  return {
    id: data.id as string,
    email: (data.email as string) || email,
    isAdmin: data.role === 'admin',
    notifyEmail: data.sms_notify_email !== false
  }
}
