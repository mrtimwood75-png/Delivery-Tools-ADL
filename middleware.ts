import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'
import { authConfig } from '@/auth.config'
import { STORE, isPaymentStore } from '@/lib/store'
import { isReadOnly } from '@/lib/roles'

// Methods that change data. Read-only users are never allowed to use these.
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// The only mutations a read-only user may perform: sign in/out (NextAuth) and
// changing their own password.
function isSelfServiceApi(pathname: string) {
  return pathname.startsWith('/api/auth/') || pathname === '/api/account/password'
}

// Edge instance built from the edge-safe config (no DB imports at module load).
const { auth } = NextAuth(authConfig)

// API endpoints reachable without a logged-in user:
//  - NextAuth's own /api/auth/* endpoints
//  - Stripe + MessageMedia webhooks (verified by their own signatures)
//  - the customer-facing success page's session lookup
//  - the Transforma sync (self-guards: Bearer CRON_SECRET or a logged-in user)
//  - the one-time first-admin bootstrap (guarded by BOOTSTRAP_SECRET)
const PUBLIC_API = [
  '/api/stripe-webhook',
  '/api/sms/inbound',
  '/api/payment-link/session',
  '/api/import/transforma',
  '/api/bootstrap'
]

function isPublicApi(pathname: string, method: string) {
  if (pathname.startsWith('/api/auth/')) return true
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true
  // The root layout reads density prefs before any login, so allow that GET.
  if (pathname === '/api/settings' && method === 'GET') return true
  return false
}

function isPublicPage(pathname: string) {
  return pathname === '/login' || pathname.startsWith('/pay/')
}

// On a single-brand payment deployment, expose only the payment tool, the shared
// admin page, the public customer pages, login and the account page.
function allowedOnPaymentStore(pathname: string) {
  return pathname === '/payment-link'
    || pathname === '/admin' || pathname.startsWith('/admin/')
    || pathname.startsWith('/pay/')
    || pathname === '/login'
    || pathname === '/account'
}

// Single site-wide gate, server-side and fail-closed: require a valid (and
// allowlisted) session for every page and every /api/* call except the
// allowlisted webhooks; gate /admin to admins; and on a payment deployment keep
// the dashboard unreachable.
export default auth((request) => {
  const { pathname } = request.nextUrl
  const session = request.auth
  const user = session?.user

  if (pathname.startsWith('/api/')) {
    // Read-only users can never mutate data — even on otherwise-public API
    // endpoints (the Transforma sync, etc.). Sessionless callers (Stripe /
    // MessageMedia webhooks, the cron sync) have no role and are unaffected.
    if (MUTATING_METHODS.has(request.method) && isReadOnly(user?.role) && !isSelfServiceApi(pathname)) {
      return NextResponse.json({ error: 'Read-only access — you do not have permission to make changes.' }, { status: 403 })
    }
    if (isPublicApi(pathname, request.method)) return NextResponse.next()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.next()
  }

  if (isPublicPage(pathname)) return NextResponse.next()

  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if ((pathname === '/admin' || pathname.startsWith('/admin/')) && !user?.isAdmin) {
    const url = request.nextUrl.clone()
    url.pathname = isPaymentStore(STORE) ? '/payment-link' : '/database'
    return NextResponse.redirect(url)
  }

  if (isPaymentStore(STORE) && !allowedOnPaymentStore(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/payment-link'
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
})

// Run on all routes except Next internals and static assets.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|BoConcept-Logo.svg|transforma-logo.svg).*)'] }
