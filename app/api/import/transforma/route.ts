import { NextRequest, NextResponse } from 'next/server'
import { ingestRows } from '@/lib/ingestOrders'
import { fetchTransformaRows } from '@/lib/transforma'

// Allow long Options-API sweeps (many per-order round trips).
export const maxDuration = 300

// This route is listed in middleware PUBLIC_API, so it must guard itself:
// either a Bearer CRON_SECRET (the Vercel cron) or a logged-in dashboard user.
async function tokenIsValid(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon || !token) return false
  try {
    const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } })
    return res.ok
  } catch {
    return false
  }
}

async function authorize(request: NextRequest): Promise<boolean> {
  const cronSecret = (process.env.CRON_SECRET || '').trim()
  const auth = request.headers.get('authorization') || ''
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true
  const token = request.cookies.get('sb-access-token')?.value || ''
  return tokenIsValid(token)
}

async function runSync(request: NextRequest) {
  // Feature flag: hidden unless explicitly enabled for this deployment.
  if ((process.env.ENABLE_TRANSFORMA_SYNC || '').trim() !== 'true') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!(await authorize(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const from = request.nextUrl.searchParams.get('from') || undefined
    const { rows, orderCount, fromDate } = await fetchTransformaRows(from || undefined)
    const result = await ingestRows(rows, { source: 'transforma' })
    return NextResponse.json({ source: 'transforma', fromDate, orderCount, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Transforma sync failed.' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return runSync(request)
}

export async function POST(request: NextRequest) {
  return runSync(request)
}
