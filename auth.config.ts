import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'

// Single-tenant Microsoft "doors". The dashboard shows both (mixed staff); each
// payment app shows only its own.
const BCA_TENANT = '33d5a57b-89e6-4244-9bd7-5d807ea37140' // BoConcept Australia (BCB + BCA)
const TRANSFORMA_TENANT = '41cec85f-0532-4db4-960d-4d8c3323fb82' // Transforma

function entraIssuer(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}/v2.0`
}

// This one deployment serves the dashboard and both payment apps by host, so it
// registers every provider that is configured. The login page shows the right
// door(s) per host. Each Microsoft provider is only registered when its client
// id + secret are present, so a missing var can never crash auth.
function buildProviders() {
  const providers = []

  if (process.env.AZURE_BCA_CLIENT_ID && process.env.AZURE_BCA_CLIENT_SECRET) {
    providers.push(
      MicrosoftEntraID({
        id: 'entra-bca',
        name: 'BoConcept',
        clientId: process.env.AZURE_BCA_CLIENT_ID,
        clientSecret: process.env.AZURE_BCA_CLIENT_SECRET,
        issuer: entraIssuer(BCA_TENANT)
      })
    )
  }

  if (process.env.AZURE_TRANSFORMA_CLIENT_ID && process.env.AZURE_TRANSFORMA_CLIENT_SECRET) {
    providers.push(
      MicrosoftEntraID({
        id: 'entra-transforma',
        name: 'Transforma',
        clientId: process.env.AZURE_TRANSFORMA_CLIENT_ID,
        clientSecret: process.env.AZURE_TRANSFORMA_CLIENT_SECRET,
        issuer: entraIssuer(TRANSFORMA_TENANT)
      })
    )
  }

  // Emergency staff password sign-in. Not shown in the UI by default (the login
  // page only surfaces it via ?pw=1) — a fallback so a Microsoft/Azure misconfig
  // can't lock everyone out of the live dashboard.
  providers.push(
    Credentials({
      name: 'Email and password',
      credentials: { email: { label: 'Email', type: 'email' }, password: { label: 'Password', type: 'password' } },
      authorize: async (credentials) => {
        const email = String(credentials?.email || '').trim().toLowerCase()
        const password = String(credentials?.password || '')
        if (!email || !password) return null
        // Lazy import keeps Supabase out of the edge bundle.
        const { verifyPassword } = await import('@/lib/authServer')
        const verified = await verifyPassword(email, password)
        if (!verified) return null
        return { id: verified, email: verified }
      }
    })
  )

  return providers
}

export const authConfig: NextAuthConfig = {
  providers: buildProviders(),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
  callbacks: {
    // Server-side, fail-closed door check. A valid sign-in must be an allowlisted
    // app_users row with access to *something*; per-host access (dashboard vs
    // payments) is then enforced in middleware, which knows the request host.
    async signIn({ user, profile }) {
      const email = String(
        user?.email || (profile as Record<string, unknown> | undefined)?.email || (profile as Record<string, unknown> | undefined)?.preferred_username || ''
      ).toLowerCase()
      if (!email) return false
      const { lookupAllowedUser } = await import('@/lib/authServer')
      const allowed = await lookupAllowedUser(email)
      if (!allowed) return false
      return !!(allowed.isAdmin || allowed.canDashboard || allowed.canPayments)
    },
    // Enrich the token from app_users once, at sign-in. Cached for the session.
    async jwt({ token, user, profile }) {
      const email = String(
        token.email || user?.email || (profile as Record<string, unknown> | undefined)?.email || (profile as Record<string, unknown> | undefined)?.preferred_username || ''
      ).toLowerCase()
      if (email && !token.appUserLoaded) {
        const { lookupAllowedUser } = await import('@/lib/authServer')
        const allowed = await lookupAllowedUser(email)
        token.email = email
        token.isAdmin = !!allowed?.isAdmin
        token.role = allowed?.role || 'standard'
        token.store = allowed?.store ?? null
        token.canDashboard = !!allowed?.canDashboard
        token.canPayments = !!allowed?.canPayments
        token.appUserLoaded = true
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.email = (token.email as string) || session.user.email
        session.user.isAdmin = !!token.isAdmin
        session.user.role = (token.role as string) || 'standard'
        session.user.store = (token.store as string | null) ?? null
        session.user.canDashboard = !!token.canDashboard
        session.user.canPayments = !!token.canPayments
      }
      return session
    }
  }
}
