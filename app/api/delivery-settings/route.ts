import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const KEYS = ['delivery_confirmed_status', 'delivery_rejected_status'] as const
const noStore = { 'Cache-Control': 'no-store, max-age=0' }

// Maps a customer SMS reply to the order status used on confirm / reject.
export async function GET() {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('setting_key, setting_value')
    .in('setting_key', KEYS as unknown as string[])

  const settings: Record<string, string> = {}
  for (const row of data || []) settings[row.setting_key] = row.setting_value || ''
  return NextResponse.json({
    confirmed_status: settings.delivery_confirmed_status || '',
    rejected_status: settings.delivery_rejected_status || ''
  }, { headers: noStore })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rows = [
      { setting_key: 'delivery_confirmed_status', setting_value: String(body.confirmed_status || '').trim() },
      { setting_key: 'delivery_rejected_status', setting_value: String(body.rejected_status || '').trim() }
    ]
    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert(rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })), { onConflict: 'setting_key' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ confirmed_status: rows[0].setting_value, rejected_status: rows[1].setting_value })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}
