import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendDeliveryEmail } from '@/lib/deliveryEmail'
import { runStatusSet } from '@/lib/automations'

// Wodely "task completed" webhook. Wodely calls this when a driver marks a job
// complete; we flip the matching order to Delivered, email the salesperson (with
// the proof-of-delivery link), and fire any Delivered automations.
//
// Secure it by setting WODELY_WEBHOOK_SECRET and pointing Wodely's Webhook Post
// at /api/wodely/webhook?secret=YOUR_SECRET

type AnyRecord = Record<string, unknown>

function authorised(request: NextRequest) {
  const secret = (process.env.WODELY_WEBHOOK_SECRET || '').trim()
  if (!secret) return true
  const url = new URL(request.url)
  const provided = (url.searchParams.get('secret') || request.headers.get('x-webhook-secret') || '').trim()
  return provided === secret
}

function clean(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim()
}

// Pull the task object out of whatever wrapper Wodely uses.
function taskOf(body: unknown): AnyRecord {
  if (!body || typeof body !== 'object') return {}
  if (Array.isArray(body)) return (body[0] as AnyRecord) || {}
  const b = body as AnyRecord
  for (const key of ['task', 'data', 'payload', 'record']) {
    if (b[key] && typeof b[key] === 'object' && !Array.isArray(b[key])) return b[key] as AnyRecord
  }
  return b
}

// The order number is what we pushed as externalKey/externalId.
function orderRefOf(task: AnyRecord): string {
  for (const key of ['externalKey', 'externalId', 'external_key', 'external_id', 'reference', 'orderId', 'order_id', 'salesOrder']) {
    const v = clean(task[key])
    if (v) return v
  }
  return ''
}

function statusOf(task: AnyRecord): string {
  return ['status', 'taskStatus', 'statusName', 'state'].map((k) => clean(task[k])).join(' ').toLowerCase()
}

// Pull the first http(s) URL out of a value (handles a bare URL or an <a href>).
function extractUrl(v: unknown): string {
  const m = clean(v).match(/https?:\/\/[^\s"'<>]+/i)
  return m ? m[0] : ''
}

// Find a proof-of-delivery / tracking link anywhere in the payload: a URL under
// a key mentioning proof/pod/signature/receipt/tracking/link, else any URL found.
function proofLinkOf(root: unknown): string {
  let keyedHit = ''
  let anyUrl = ''
  const keyRe = /proof|pod|signature|receipt|tracking|link|hyperlink/i
  const walk = (v: unknown, key = '') => {
    if (keyedHit) return
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v as AnyRecord)) walk(val, k)
      return
    }
    const url = extractUrl(v)
    if (!url) return
    if (keyRe.test(key)) keyedHit = url
    else if (!anyUrl) anyUrl = url
  }
  walk(root)
  return keyedHit || anyUrl
}

async function POST_handler(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  console.log('[wodely-webhook] payload', JSON.stringify(body).slice(0, 800))

  const task = taskOf(body)
  const ref = orderRefOf(task)
  if (!ref) return NextResponse.json({ ok: true, matched: false, reason: 'no order reference in payload' })

  // Only act on completion. If a status is present and it isn't a completion,
  // ignore (some accounts fire one webhook for several events).
  const status = statusOf(task)
  if (status && !/complet|deliver|finish|done/.test(status)) {
    return NextResponse.json({ ok: true, matched: false, reason: `ignored status "${status}"` })
  }

  const podLink = proofLinkOf(body)

  const { data: order } = await supabaseAdmin
    .from('delivery_orders')
    .select('id, order_status, archived_at, delivery_email_sent_at')
    .ilike('order_number', ref)
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!order) return NextResponse.json({ ok: true, matched: false, reason: `no order matching "${ref}"` })

  // Idempotent: if it's already Delivered and the email already went, do nothing.
  if (order.order_status === 'Delivered' && order.delivery_email_sent_at) {
    return NextResponse.json({ ok: true, matched: true, alreadyDone: true })
  }

  await supabaseAdmin
    .from('delivery_orders')
    .update({ order_status: 'Delivered', archived_at: order.archived_at || new Date().toISOString() })
    .eq('id', order.id)

  // Fire any "status changed to Delivered" automations (light, etc.).
  try { await runStatusSet(order.id, 'Delivered') } catch (e) { console.error('[wodely-webhook] automation error', e) }

  let emailReason = 'skipped'
  if (!order.delivery_email_sent_at) {
    try {
      const result = await sendDeliveryEmail(order.id, { podLink })
      emailReason = result.reason
      if (result.ok) await supabaseAdmin.from('delivery_orders').update({ delivery_email_sent_at: new Date().toISOString() }).eq('id', order.id)
    } catch (e) {
      emailReason = e instanceof Error ? e.message : 'email failed'
    }
  }

  console.log('[wodely-webhook] delivered', { ref, orderId: order.id, podLink: podLink || '(none)', emailReason })
  return NextResponse.json({ ok: true, matched: true, delivered: true, podLink: podLink || null, email: emailReason })
}

export async function POST(request: NextRequest) {
  return POST_handler(request)
}

export async function GET() {
  // Lets Wodely (or you) verify the endpoint is live.
  return NextResponse.json({ ok: true, endpoint: 'wodely-webhook' })
}
