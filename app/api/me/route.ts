import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email') || ''

  if (!email) {
    return NextResponse.json({ user: null, isAdmin: false, canAccessSettings: false, canAccessDashboard: false, canAccessPayments: false })
  }

  const { data, error } = await supabaseAdmin
    .from('app_users')
    .select('email, full_name, role, is_active, can_access_dashboard, can_access_payments')
    .eq('email', email.toLowerCase())
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
