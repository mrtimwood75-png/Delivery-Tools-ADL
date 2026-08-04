import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'

// Customer search for the "new message" composer. Returns customers with a
// mobile number matching the query by name or phone.
export async function GET(request: NextRequest) {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = (new URL(request.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ customers: [] })

  // Escape PostgREST ilike wildcards/commas in user input so the pattern is a
  // literal substring match, then wrap in %…%.
  const safe = q.replace(/[%,()]/g, ' ')
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, name, phone')
    .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
    .not('phone', 'is', null)
    .order('name', { ascending: true })
    .limit(20)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const customers = (data || []).filter((c) => String(c.phone || '').trim())
  return NextResponse.json({ customers })
}
