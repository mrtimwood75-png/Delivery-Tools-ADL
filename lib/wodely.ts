import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { brandForSource, brandConfig, type Brand } from '@/lib/brand'

// Push delivery jobs to Wodely. Ported from the Wodely converter's task-push half:
// build one task per order, dedupe against existing Wodely tasks, then create.

type WodelyPackage = { productId?: string; productDesc?: string; orderId: string; quantity: number; price: number }

// Wodely merchant ids per brand (overridable by env).
function merchantId(brand: Brand): string {
  return brand === 'transforma'
    ? (process.env.WODELY_MERCHANT_TRANSFORMA || '8644fbc2-0420-4b54-8521-64c02a341949')
    : (process.env.WODELY_MERCHANT_BCA || '954bc139-aade-4a41-8e8f-23b5c50b1cc2')
}

function createUrl() {
  return (process.env.WODELY_TASK_CREATE_URL || 'https://api.wodely.com/v2/tasks').replace(/\/$/, '')
}
function searchUrl() {
  return (process.env.WODELY_TASK_SEARCH_URL || process.env.WODELY_TASK_LIST_URL || 'https://api.wodely.com/v2/tasks/search').replace(/\/$/, '')
}
function headers() {
  const apiKey = (process.env.WODELY_API_KEY || '').trim()
  if (!apiKey) throw new Error('Missing WODELY_API_KEY')
  return { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Basic ${apiKey}` }
}

function clean(v: unknown): string {
  return v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim()
}
function prune(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v === '') continue
    out[k] = v
  }
  return out
}

type OrderRow = {
  id: string
  order_number: string
  payment_due: number | null
  service_time: number | null
  salesperson: string | null
  order_notes: string | null
  delivery_date: string | null
  delivery_time_from: string | null
  delivery_time_to: string | null
  source: string | null
  customers: { name: string | null; phone: string | null; address: string | null; street_address: string | null; suburb: string | null; state: string | null; postcode: string | null } | Array<Record<string, string | null>> | null
  delivery_order_items: Array<{ product_code: string | null; product_name: string | null; quantity: number | null }> | null
}

function customerOf(order: OrderRow) {
  return Array.isArray(order.customers) ? order.customers[0] : order.customers
}

function buildAddress(c: ReturnType<typeof customerOf>): string {
  if (!c) return ''
  const line = [clean(c.street_address) || clean(c.address)].filter(Boolean)
  const tail = [clean(c.suburb), clean(c.state), clean(c.postcode)].filter(Boolean).join(' ')
  return [line.join(', '), tail].filter(Boolean).join(', ')
}

// Adelaide's UTC offset for a given YYYY-MM-DD (DST-aware: +10:30 ACDT Oct–Apr,
// +09:30 ACST otherwise). The delivery window must carry this offset — otherwise
// Wodely reads the naive time as UTC and the 23:59 end rolls into the next day
// (a 3 Sep booking showed as 4/9).
function adelaideOffset(ymd: string): string {
  const dt = new Date(`${ymd}T12:00:00Z`)
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Adelaide', timeZoneName: 'longOffset' })
    .formatToParts(dt).find((p) => p.type === 'timeZoneName')?.value || ''
  const m = name.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
  if (!m) return '+09:30'
  return `${m[1]}${m[2].padStart(2, '0')}:${(m[3] || '00').padStart(2, '0')}`
}

type BuiltPayload = { orderId: string; payload: Record<string, unknown> } | { orderId: string; error: string }

function buildPayload(order: OrderRow): BuiltPayload {
  const orderId = clean(order.order_number)
  const brand = brandForSource(order.source)
  const cfg = brandConfig(brand)
  const c = customerOf(order)
  const recipientName = clean(c?.name)
  const destinationAddress = buildAddress(c)
  const deliveryDate = clean(order.delivery_date)

  const packages: WodelyPackage[] = (order.delivery_order_items || [])
    .map((it) => prune({ productId: clean(it.product_code), productDesc: clean(it.product_name), orderId, quantity: Number(it.quantity || 0), price: 0 }) as unknown as WodelyPackage)
    .filter((p) => clean(p.productId) || clean(p.productDesc))

  // Delivery window on the booked day, in the local timezone. Use the order's
  // requested times if set, otherwise default 08:00 (after) and 19:00 (before).
  const hhmm = (t: string | null, fallback: string) => { const m = clean(t).match(/^(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : fallback }
  const fromTime = hhmm(order.delivery_time_from, '08:00')
  const toTime = hhmm(order.delivery_time_to, '19:00')
  const tz = deliveryDate ? adelaideOffset(deliveryDate) : ''
  const after = deliveryDate ? `${deliveryDate}T${fromTime}:00${tz}` : null
  const before = deliveryDate ? `${deliveryDate}T${toTime}:00${tz}` : null
  const taskDesc = [cfg.displayName, orderId, recipientName].filter(Boolean).join(' - ')

  const payload = prune({
    taskDesc,
    externalKey: orderId,
    externalId: orderId,
    merchantId: merchantId(brand),
    afterDateTime: after,
    beforeDateTime: before,
    destinationAddress,
    recipientName,
    recipientPhone: clean(c?.phone) || null,
    serviceTime: String(Math.max(0, Math.round(Number(order.service_time || 0)))),
    amountDue: Number(order.payment_due || 0),
    tag1: clean(order.order_notes) || null,
    tag4: clean(order.salesperson) || null,
    packages
  })

  if (!orderId) return { orderId, error: 'missing order number' }
  if (!destinationAddress) return { orderId, error: 'missing delivery address' }
  if (!recipientName) return { orderId, error: 'missing recipient name' }
  if (!packages.length) return { orderId, error: 'no product lines' }
  return { orderId, payload }
}

// -----------------------
// existing-task dedupe
// -----------------------
function asTasks(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  if (!body || typeof body !== 'object') return []
  const b = body as Record<string, unknown>
  for (const key of ['tasks', 'data', 'items', 'results', 'records', 'rows', 'list']) {
    if (Array.isArray(b[key])) return (b[key] as unknown[]).filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  }
  if (['id', 'taskId', 'externalKey', 'externalId', 'recipientName'].some((k) => k in b)) return [b]
  return []
}
function lastIdOf(body: unknown, tasks: Record<string, unknown>[]): string {
  if (body && typeof body === 'object') {
    for (const k of ['lastId', 'lastID', 'last_id', 'nextLastId']) {
      const v = clean((body as Record<string, unknown>)[k]); if (v) return v
    }
  }
  const last = tasks[tasks.length - 1]
  if (last) for (const k of ['id', 'taskId', 'taskID', '_id']) { const v = clean(last[k]); if (v) return v }
  return ''
}
function isCancelled(task: Record<string, unknown>): boolean {
  const text = ['status', 'taskStatus', 'statusName', 'state'].map((k) => clean(task[k])).join(' ').toLowerCase()
  if (text.includes('cancel')) return true
  const id = clean(task.taskStatusId || task.statusId).toLowerCase()
  return id === 'cancelled' || id === 'canceled'
}
function orderIdsOf(task: Record<string, unknown>): string[] {
  const out: string[] = []
  const walk = (v: unknown) => {
    if (v && typeof v === 'object') {
      if (Array.isArray(v)) return v.forEach(walk)
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (['externalKey', 'externalId', 'orderId', 'order_id', 'salesOrder', 'reference'].includes(k) && clean(val)) out.push(clean(val).toLowerCase())
        if (val && typeof val === 'object') walk(val)
      }
    }
  }
  walk(task)
  const blob = JSON.stringify(task)
  const re = /\bos-\d+\b|\b\d{5,8}\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(blob)) !== null) out.push(m[0].toLowerCase())
  return out
}

async function existingOrderIds(): Promise<{ ids: Set<string>; taskCount: number; hadError: boolean }> {
  const url = searchUrl()
  const h = headers()
  const start = new Date(); start.setHours(0, 0, 0, 0)
  const end = new Date(Date.now() + 62 * 86400000)
  const base = { limit: 100, startDateTime: start.toISOString(), endDateTime: end.toISOString() }
  const variants: Record<string, unknown>[] = [base, { ...base, taskStatusId: '50' }]

  const all: Record<string, unknown>[] = []
  let hadError = false
  for (const variant of variants) {
    let lastId = ''
    const seen = new Set<string>()
    for (let page = 0; page < 50; page++) {
      const payload = lastId ? { ...variant, lastId } : variant
      let res: Response
      try {
        res = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(payload) })
      } catch { hadError = true; break }
      if (!res.ok) { hadError = true; break }
      const body = await res.json().catch(() => ({}))
      const tasks = asTasks(body)
      if (!tasks.length) break
      all.push(...tasks)
      const next = lastIdOf(body, tasks)
      if (!next || seen.has(next)) break
      seen.add(next); lastId = next
    }
  }

  const ids = new Set<string>()
  for (const t of all) { if (!isCancelled(t)) orderIdsOf(t).forEach((id) => ids.add(id)) }
  return { ids, taskCount: all.length, hadError }
}

export type WodelyPushResult = {
  created: number
  skipped: number
  failed: number
  archived: number
  archivedIds: string[]
  results: Array<{ orderId: string; status: 'created' | 'skipped' | 'failed'; reason?: string }>
}

export async function pushOrdersToWodely(ids: string[]): Promise<WodelyPushResult> {
  const results: WodelyPushResult['results'] = []
  if (!ids.length) return { created: 0, skipped: 0, failed: 0, archived: 0, archivedIds: [], results }

  const { data, error } = await supabaseAdmin
    .from('delivery_orders')
    .select('id, order_number, payment_due, service_time, salesperson, order_notes, delivery_date, delivery_time_from, delivery_time_to, source, customers(name, phone, address, street_address, suburb, state, postcode), delivery_order_items(product_code, product_name, quantity)')
    .in('id', ids)
  if (error) throw new Error(error.message)

  // Map order number -> internal id so we can archive what lands in Wodely.
  const idByOrderNumber = new Map<string, string>()
  for (const row of (data as unknown as OrderRow[])) {
    const num = clean(row.order_number).toLowerCase()
    if (num) idByOrderNumber.set(num, row.id)
  }

  const built = (data as unknown as OrderRow[]).map(buildPayload)

  // Dedupe against Wodely. Abort only if the lookup errored AND returned nothing
  // (a broken lookup is how duplicates were created before); an empty-but-clean
  // result is fine for first use.
  const existing = await existingOrderIds()
  if (existing.taskCount === 0 && existing.hadError) {
    throw new Error('Wodely task lookup failed — push stopped to prevent duplicates. Check WODELY_API_KEY / search URL.')
  }

  const url = createUrl()
  const h = headers()
  const seenInBatch = new Set<string>()

  for (const item of built) {
    const key = item.orderId.toLowerCase()
    if ('error' in item) { results.push({ orderId: item.orderId, status: 'failed', reason: item.error }); continue }
    if (!key) { results.push({ orderId: item.orderId, status: 'failed', reason: 'missing order number' }); continue }
    if (seenInBatch.has(key) || existing.ids.has(key)) { results.push({ orderId: item.orderId, status: 'skipped', reason: 'already in Wodely' }); continue }
    seenInBatch.add(key)
    try {
      const res = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(item.payload) })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        results.push({ orderId: item.orderId, status: 'failed', reason: `HTTP ${res.status} ${text.slice(0, 200)}`.trim() })
      } else {
        results.push({ orderId: item.orderId, status: 'created' })
      }
    } catch (e) {
      results.push({ orderId: item.orderId, status: 'failed', reason: e instanceof Error ? e.message : 'request failed' })
    }
  }

  // Mark every order that is now in Wodely (freshly created, or skipped because
  // it was already there) as exported so it moves to the Exported tab.
  const archivedIds: string[] = []
  for (const r of results) {
    if (r.status !== 'created' && r.status !== 'skipped') continue
    const internal = idByOrderNumber.get(r.orderId.toLowerCase())
    if (internal) archivedIds.push(internal)
  }
  if (archivedIds.length) {
    const { error: archiveError } = await supabaseAdmin
      .from('delivery_orders')
      .update({ exported_at: new Date().toISOString() })
      .in('id', archivedIds)
      .is('exported_at', null)
    if (archiveError) throw new Error(`Pushed to Wodely but could not mark exported: ${archiveError.message}`)
  }

  return {
    created: results.filter((r) => r.status === 'created').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    failed: results.filter((r) => r.status === 'failed').length,
    archived: archivedIds.length,
    archivedIds,
    results
  }
}
