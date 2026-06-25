import type { NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id'
import { STORE } from '@/lib/store'

// Single-tenant Microsoft "doors". Each payment-app deployment uses exactly one.
const BCA_TENANT = '33d5a57b-89e6-4244-9bd7-5d807ea37140' // BoConcept Australia (BCB + BCA)
const TRANSFORMA_TENANT = '41cec85f-0532-4db4-960d-4d8c3323fb82' // Transforma

function entraIssuer(tenant: string) {
  return `https://login.microsoftonline.com/${tenant}/v2.0`
}

// Providers depend on the deployment: the dashboard uses email + password (a
// handful of mixed BCA/Transforma staff), each payment app uses its own
// single-tenant Microsoft door.
function buildProviders() {
  const providers = []

  if (STORE === 'dashboard') {
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
  }

  if (STORE === 'bca') {
    providers.push(
      MicrosoftEntraID({
        id: 'entra-bca',
        name: 'BoConcept',
        clientId: process.env.AZURE_BCA_CLIENT_ID || '',
        clientSecret: process.env.AZURE_BCA_CLIENT_SECRET || '',
        issuer: entraIssuer(BCA_TENANT)
      })
    )
  }

  if (STORE === 'transforma') {
    providers.push(
      MicrosoftEntraID({
        id: 'entra-transforma',
        name: 'Transforma',
        clientId: process.env.AZURE_TRANSFORMA_CLIENT_ID || '',
        clientSecret: process.env.AZURE_TRANSFORMA_CLIENT_SECRET || '',
        issuer: entraIssuer(TRANSFORMA_TENANT)
      })
    )
  }

  return providers
}

export const authConfig: NextAuthConfig = {
  providers: buildProviders(),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
  trustHost: true,
  callbacks: {
    // Server-side, fail-closed door check. Runs for every provider, every sign-in.
    async signIn({ user, profile }) {
      const email = String(
        user?.email || (profile as Record<string, unknown> | undefined)?.email || (profile as Record<string, unknown> | undefined)?.preferred_username || ''
      ).toLowerCase()
      if (!email) return false
      const { lookupAllowedUser } = await import('@/lib/authServer')
      const allowed = await lookupAllowedUser(email)
      if (!allowed) return false
      if (STORE === 'dashboard' && !allowed.canDashboard) return false
      if (STORE !== 'dashboard' && !allowed.canPayments) return false
      return true
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
