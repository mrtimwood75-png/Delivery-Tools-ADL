'use client'

import { ReactNode, useEffect } from 'react'
import { SessionProvider, useSession } from 'next-auth/react'

// Mirror the signed-in email into the legacy localStorage key that existing
// client pages read, so the dashboard UI keeps working unchanged after the
// move to NextAuth. The server never trusts this value — it derives identity
// from the session on every request.
function EmailMirror() {
  const { data } = useSession()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const email = data?.user?.email
    if (email) window.localStorage.setItem('delivery_tools_email', email)
  }, [data])
  return null
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <EmailMirror />
      {children}
    </SessionProvider>
  )
}
