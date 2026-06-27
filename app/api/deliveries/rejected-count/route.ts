import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Count of active orders currently marked as a rejected delivery date. The
// dashboard polls this and plays a sound when the number rises.
export async function GET() {
  const { count, error } = await supabaseAdmin
    .from('delivery_orders')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_confirmation', 'rejected')
    .is('archived_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ total: count || 0 }, { headers: { 'Cache-Control': 'no-store' } })
}
