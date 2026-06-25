import type { DefaultSession } from 'next-auth'

// App-specific fields carried on the session/JWT, derived from app_users.
declare module 'next-auth' {
  interface Session {
    user: {
      isAdmin?: boolean
      role?: string
      store?: string | null
      canDashboard?: boolean
      canPayments?: boolean
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    email?: string
    isAdmin?: boolean
    role?: string
    store?: string | null
    canDashboard?: boolean
    canPayments?: boolean
    appUserLoaded?: boolean
  }
}
