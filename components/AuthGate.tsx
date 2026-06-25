'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

// '/pay/' (with the trailing slash) keeps the public success/cancel pages open
// to customers without also exposing the logged-in '/payment-link' tool.
const publicPaths = ['/login', '/pay/']

// Mirror the Supabase access token into a cookie so the API middleware can
// verify requests server-side. Kept in sync as the session refreshes.
function syncTokenCookie(token: string | null) {
  if (typeof document === 'undefined') return
  if (token) document.cookie = `sb-access-token=${token}; path=/; max-age=3600; SameSite=Lax; Secure`
  else document.cookie = 'sb-access-token=; path=/; max-age=0; SameSite=Lax'
}

// Classify a route as the payment app, the shared admin page, or the dashboard.
function routeApp(pathname: string): 'payments' | 'admin' | 'dashboard' {
  if (pathname === '/payment-link' || pathname.startsWith('/payment-link/')) return 'payments'
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin'
  return 'dashboard'
}

export default function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [allowed, setAllowed] = useState(false)
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    // Keep the cookie fresh across token refresh / sign-out for any open tab.
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      syncTokenCookie(session?.access_token ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    let cancelled = false

    async function checkAccess() {
      setDenied(false)
      if (publicPaths.some((path) => pathname.startsWith(path))) {
        if (!cancelled) setAllowed(true)
        return
      }

      const { data } = await client.auth.getSession()
      const email = data.session?.user?.email || ''
      const token = data.session?.access_token || ''

      if (!email) {
        syncTokenCookie(null)
        window.localStorage.removeItem('delivery_tools_email')
        window.location.href = '/login'
        return
      }

      syncTokenCookie(token || null)
      window.localStorage.setItem('delivery_tools_email', email)

      // Per-app access. Fail open on a lookup error so a transient hiccup never
      // locks a logged-in user out.
      let isAdmin = false, canDashboard = true, canPayments = true
      try {
        const res = await fetch(`/api/me?email=${encodeURIComponent(email)}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
        if (res.ok) {
          const me = await res.json()
          isAdmin = !!me.isAdmin
          canDashboard = me.canAccessDashboard !== false
          canPayments = me.canAccessPayments !== false
        }
      } catch { /* fail open */ }

      const app = routeApp(pathname)
      const ok = app === 'admin' ? isAdmin : app === 'payments' ? canPayments : canDashboard

      if (!ok) {
        // Send them to an app they can use; if none, show an access notice.
        if (app !== 'payments' && canPayments) { window.location.href = '/payment-link'; return }
        if (app !== 'dashboard' && canDashboard) { window.location.href = '/database'; return }
        if (!cancelled) { setDenied(true); setAllowed(false) }
        return
      }

      if (!cancelled) setAllowed(true)
    }

    checkAccess()
    return () => { cancelled = true }
  }, [pathname])

  if (denied) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', padding: 20, textAlign: 'center', color: '#1a1a1a' }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600 }}>No access to this page</h1>
          <p style={{ color: '#6b6b6b' }}>Your account doesn&apos;t have access to this app. Please contact an administrator.</p>
        </div>
      </div>
    )
  }
  if (!allowed) return null
  return <>{children}</>
}
