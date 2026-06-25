import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Identity for the client UI. Derived from the signed-in session — the legacy
// ?email= query param is ignored so it can't be spoofed.
export async function GET() {
  const session = await auth()
  const email = session?.user?.email?.toLowerCase() || ''

  if (!email) {
    return NextResponse.json({ user: null, isAdmin: false, canAccessSettings: false, canAccessDashboard: false, canAccessPayments: false })
  }

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('email, full_name, role, is_active, store, can_access_dashboard, can_access_payments')
    .eq('email', email)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const role = data?.role || 'standard'

  return NextResponse.json({
    user: data,
    isAdmin: role === 'admin',
    canAccessSettings: role === 'admin' || role === 'manager',
    canAccessDashboard: data ? data.can_access_dashboard !== false : false,
    canAccessPayments: data ? data.can_access_payments === true : false
  })
}
