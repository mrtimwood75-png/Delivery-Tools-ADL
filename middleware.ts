import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Endpoints that must stay reachable without a logged-in user:
//  - Stripe + MessageMedia webhooks (verified by their own signatures)
//  - the customer-facing success page's session lookup
const PUBLIC_API = [
  '/api/stripe-webhook',
  '/api/sms/inbound',
  '/api/payment-link/session',
  // Transforma sync self-guards (Bearer CRON_SECRET or a logged-in user) so the
  // Vercel cron can reach it without a session cookie.
  '/api/import/transforma'
]

function isPublicApi(pathname: string, method: string) {
  if (PUBLIC_API.some((p) => pathname === p || pathname.startsWith(p + '/'))) return true
  // The root layout reads density prefs before any login, so allow that GET.
  if (pathname === '/api/settings' && method === 'GET') return true
  return false
}

// Validate the Supabase access token against the auth server. Uses only public
// config (URL + anon key); a valid token returns 200 from /auth/v1/user.
async function tokenIsValid(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon || !token) return false
  try {
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` }
    })
    return res.ok
  } catch {
    return false
  }
}

// Pages allowed to render on the dedicated payments host — the tool itself, the
// shared admin page (admins only, enforced in-app), the public customer
// success/cancel pages, and the login screen. Everything else is rewritten to
// the tool so the delivery dashboard is never reachable there.
function allowedOnPaymentsHost(pathname: string) {
  return pathname === '/payment-link'
    || pathname === '/admin' || pathname.startsWith('/admin/')
    || pathname.startsWith('/pay/')
    || pathname === '/login'
}

// Single site-wide gate: (1) require a valid Supabase session for every /api/*
// call except allowlisted webhooks, and (2) when served on the dedicated
// payments domain, expose only the payment tool — not the dashboard.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname.startsWith('/api/')) {
    if (isPublicApi(pathname, request.method)) return NextResponse.next()
    const token = request.cookies.get('sb-access-token')?.value || ''
    if (!(await tokenIsValid(token))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  const host = (request.headers.get('host') || '').split(':')[0]
  const paymentsHost = (process.env.PAYMENTS_HOST || '').split(':')[0]
  if (paymentsHost && host === paymentsHost && !allowedOnPaymentsHost(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/payment-link'
    return NextResponse.rewrite(url)
  }

  return NextResponse.next()
}

// Run on all routes except Next internals and static assets.
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|BoConcept-Logo.svg).*)'] }
