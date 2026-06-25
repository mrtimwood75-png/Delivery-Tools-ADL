import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Server-side auth guard for API routes. The browser holds a Supabase session
// (in localStorage), so the client sends its access token as a Bearer header and
// we validate it here. Returns the authenticated user, or null if the token is
// missing/invalid. This makes the endpoint require a real login rather than
// relying only on the client-side AuthGate, which does not protect the API.
export async function getRequestUser(request: NextRequest) {
  const header = request.headers.get('authorization') || ''
  let token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  // Fall back to the session cookie so same-origin pages (e.g. the admin page)
  // that don't set an Authorization header still authenticate.
  if (!token) token = request.cookies.get('sb-access-token')?.value || ''
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}
