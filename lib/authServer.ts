import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Node-only auth helpers. Kept out of the edge-safe auth.config.ts and imported
// lazily from the NextAuth callbacks so the middleware bundle never pulls in the
// service-role client.

// Verify an email/password against Supabase Auth (the password store the admin
// "Users" screen writes to) without creating a browser session. Returns the
// canonical email on success, or null.
export async function verifyPassword(email: string, password: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return null
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.user?.email) return null
  return data.user.email.toLowerCase()
}

export type AllowedUser = {
  email: string
  role: string
  store: string | null
  canDashboard: boolean
  canPayments: boolean
  isAdmin: boolean
}

// Server-side allowlist. A sign-in is only permitted if the email maps to an
// active app_users row. Fail-closed: any error or miss returns null (deny).
export async function lookupAllowedUser(email: string): Promise<AllowedUser | null> {
  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('email, role, is_active, store, can_access_dashboard, can_access_payments')
    .eq('email', email.toLowerCase())
    .eq('is_active', true)
    .maybeSingle()
  if (error || !data) return null
  const role = data.role || 'standard'
  return {
    email: data.email,
    role,
    store: data.store ?? null,
    canDashboard: data.can_access_dashboard !== false,
    canPayments: data.can_access_payments === true,
    isAdmin: role === 'admin'
  }
}
