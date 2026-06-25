import type { NextRequest } from 'next/server'
import { auth } from '@/auth'

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
