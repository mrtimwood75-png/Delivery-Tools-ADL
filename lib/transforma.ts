import { XMLParser } from 'fast-xml-parser'
import type { ImportRow } from '@/lib/ingestOrders'

// Port of the Transforma "Options API" ingest half of the Wodely converter
// (wodely_app.py). Pulls sales-order lines, headers, payments and contacts out
// of the Options XML API and folds them into one normalized ImportRow per order
// for ingestRows(). The Wodely push half is intentionally NOT ported.

const EXCLUDED_TRANSFORMA_SKUS = new Set(['ZHEADING', 'ZDELIVERY', 'ZDISCOUNT', 'ZDESIGNREBATE'])

type OptionsRecord = Record<string, string>

// -----------------------
// generic helpers
// -----------------------
function clean(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).replace(/ /g, ' ').split(/\s+/).join(' ').replace(/^[ ,\t\r\n]+|[ ,\t\r\n]+$/g, '')
}

function cleanMultiline(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return text.split('\n').map((line) => clean(line)).filter(Boolean).join('\n')
}

function firstNonBlank(values: unknown[]): string {
  for (const value of values) {
    const text = clean(value)
    if (text) return text
  }
  return ''
}

function toFloat(value: unknown): number {
  let text = clean(value)
  if (!text) return 0
  text = text.replace(/ /g, '')
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/,/g, '')
  } else {
    text = /\d+,\d+$/.test(text) ? text.replace(/\./g, '').replace(/,/g, '.') : text.replace(/,/g, '')
  }
  const n = Number(text)
  return Number.isFinite(n) ? n : 0
}

function toInt(value: unknown): number {
  return Math.round(toFloat(value))
}

function joinNonBlank(parts: unknown[], sep = ', '): string {
  return parts.map((p) => clean(p)).filter(Boolean).join(sep)
}

function parseDateText(value: unknown): Date | null {
  const text = clean(value)
  if (!text) return null
  // DD/MM/YYYY, DD-MM-YYYY, DD/MM/YY (day-first) and ISO YYYY-MM-DD.
  let m = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) {
    const [, d, mo, y] = m
    const dt = new Date(Number(y), Number(mo) - 1, Number(d))
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) {
    const [, y, mo, d] = m
    const dt = new Date(Number(y), Number(mo) - 1, Number(d))
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  m = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/)
  if (m) {
    const [, d, mo, y] = m
    const dt = new Date(2000 + Number(y), Number(mo) - 1, Number(d))
    return Number.isNaN(dt.getTime()) ? null : dt
  }
  return null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDisplayDate(value: unknown): string {
  const dt = parseDateText(value)
  return dt ? `${pad2(dt.getDate())}/${pad2(dt.getMonth() + 1)}/${dt.getFullYear()}` : clean(value)
}

// YYYY-MM-DD -> DD/MM/YYYY, the format the Options API expects in conditions.
function optionsToDate(isoDate: string): string {
  const m = isoDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (!m) throw new Error(`Invalid from date: ${isoDate}`)
  const [, y, mo, d] = m
  return `${pad2(Number(d))}/${pad2(Number(mo))}/${y}`
}

// Today's date in Adelaide, as YYYY-MM-DD.
function todayAdelaideIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Adelaide',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
  return parts // en-CA yields YYYY-MM-DD
}

// -----------------------
// money / phone
// -----------------------
function calculateOrderTotalFromLines(lines: OptionsRecord[]): number {
  let total = 0
  for (const line of lines) {
    const qty = toFloat(line.QTYORD)
    const priceExGst = toFloat(line.PRICE)
    const gstEach = toFloat(line.GSTDOLL)
    total += qty * (priceExGst + gstEach)
  }
  return Math.round(total * 100) / 100
}

function calculateCodAmount(header: OptionsRecord, lines: OptionsRecord[], paymentsTotal: number): number {
  // Options API line total inc GST = QTYORD * (PRICE + GSTDOLL); payments live in
  // DRTRAN/DRHIST as TYPE = "PA". COD never goes below zero.
  const lineTotal = calculateOrderTotalFromLines(lines)
  const headerTotal = toFloat(header.TOTAMOUNT)
  const orderTotal = lineTotal > 0 ? lineTotal : headerTotal
  return Math.max(Math.round((orderTotal - paymentsTotal) * 100) / 100, 0)
}

function extractPhoneFromText(...values: unknown[]): string {
  const combined = values.map((v) => clean(v)).filter(Boolean).join(' ')
  const mobile = combined.match(/\b04\d{2}\s?\d{3}\s?\d{3}\b/)
  if (mobile) return mobile[0].replace(/\s+/g, '')
  const landline = combined.match(/\b0[2378]\s?\d{4}\s?\d{4}\b/)
  if (landline) return landline[0].replace(/\s+/g, '')
  const generic = combined.match(/\b\d[\d\s]{7,14}\d\b/)
  if (generic) return generic[0].replace(/\s+/g, '')
  return ''
}

// -----------------------
// XML request / response
// -----------------------
function escapeXml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

type Condition = [field: string, type: string, value: string]

function buildRequestXml(
  clientKey: string,
  tableName: string,
  fields: string[],
  conditions: Condition[],
  { sortBy, maxRecords = 500, firstRecord = 1 }: { sortBy: string; maxRecords?: number; firstRecord?: number }
): string {
  const fieldsXml = fields.map((f) => `<field>${escapeXml(f)}</field>`).join('')
  const conditionsXml = conditions
    .map(([field, type, value]) => `<condition field="${escapeXml(field)}" type="${escapeXml(type)}">${escapeXml(value)}</condition>`)
    .join('')
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    `<request clientKey="${escapeXml(clientKey)}">` +
    `<table name="${escapeXml(tableName)}" sortBy="${escapeXml(sortBy)}" maxRecords="${maxRecords}" firstRecord="${firstRecord}" requestType="">` +
    `<fields>${fieldsXml}</fields>` +
    `<conditions>${conditionsXml}</conditions>` +
    `</table>` +
    `</request>`
  )
}

function extractXmlFromResponse(text: string): string {
  const cleaned = (text || '').replace(/^[﻿\r\n\t ]+/, '')
  const xmlStart = cleaned.indexOf('<?xml')
  const responseStart = cleaned.indexOf('<response')
  const starts = [xmlStart, responseStart].filter((x) => x >= 0)
  if (starts.length) return cleaned.slice(Math.min(...starts)).trim()
  return cleaned.trim()
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true
})

type ParsedResponse = Record<string, unknown>

async function postOptionsXml(xmlBody: string): Promise<ParsedResponse> {
  const optionsUrl = (process.env.OPTIONS_URL || '').trim()
  const clientKey = (process.env.OPTIONS_CLIENT_KEY || '').trim()
  if (!optionsUrl) throw new Error('Missing OPTIONS_URL')
  if (!clientKey) throw new Error('Missing OPTIONS_CLIENT_KEY')

  let lastError: unknown = null
  let lastResponseText = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60_000)
      let raw: string
      try {
        const response = await fetch(optionsUrl, {
          method: 'POST',
          body: Buffer.from(xmlBody, 'utf-8'),
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            Accept: 'text/xml, application/xml, text/plain, */*'
          },
          signal: controller.signal
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        raw = await response.text()
      } finally {
        clearTimeout(timeout)
      }
      lastResponseText = raw
      if (raw.toLowerCase().includes('routine maintenance')) {
        throw new Error('Options API is in routine maintenance mode.')
      }
      const xmlText = extractXmlFromResponse(raw)
      if (!xmlText) throw new Error('Options API returned an empty response.')
      const parsed = xmlParser.parse(xmlText) as ParsedResponse
      const response = (parsed.response ?? parsed) as ParsedResponse
      const errors = toArray(response.error as unknown).map((e) => clean(typeof e === 'object' && e ? (e as Record<string, unknown>)['#text'] : e)).filter(Boolean)
      if (errors.length) throw new Error(errors.join(' | '))
      return response
    } catch (exc) {
      lastError = exc
    }
  }
  const preview = lastResponseText ? lastResponseText.slice(0, 1500) : ''
  throw new Error(`Options API request failed after 3 attempts: ${lastError instanceof Error ? lastError.message : String(lastError)}\n\nLast raw response preview:\n${preview}`)
}

function fieldObject(recordEl: Record<string, unknown>): OptionsRecord {
  const result: OptionsRecord = {}
  for (const field of toArray(recordEl.field as unknown)) {
    if (typeof field !== 'object' || field === null) continue
    const f = field as Record<string, unknown>
    const name = clean(f['@_name'])
    if (name) {
      const raw = f['#text']
      result[name] = raw === undefined || raw === null ? '' : String(raw)
    }
  }
  return result
}

function parseTableRecords(response: ParsedResponse, tableName: string): OptionsRecord[] {
  for (const table of toArray(response.table as unknown)) {
    if (typeof table !== 'object' || table === null) continue
    const t = table as Record<string, unknown>
    if (clean(t['@_name']) !== tableName) continue
    const records = t.records as Record<string, unknown> | undefined
    if (!records) return []
    return toArray(records.record as unknown)
      .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
      .map((r) => fieldObject(r))
  }
  return []
}

// -----------------------
// fetchers
// -----------------------
async function fetchLinesFromDate(fromDate: string): Promise<OptionsRecord[]> {
  const clientKey = (process.env.OPTIONS_CLIENT_KEY || '').trim()
  const xmlBody = buildRequestXml(
    clientKey,
    'DRSOLN',
    ['ORDNO', 'ACCDE', 'STOCKCODE', 'DESC', 'MEMODESC', 'OVERDESC', 'QTYORD', 'PRICE', 'GSTDOLL', 'BOOKOUT', 'DELIVTIME'],
    [['BOOKOUT', 'greaterOrEqualTo', optionsToDate(fromDate)]],
    { sortBy: 'ORDNO', maxRecords: 5000 }
  )
  return parseTableRecords(await postOptionsXml(xmlBody), 'DRSOLN')
}

async function fetchHeader(orderNo: string): Promise<OptionsRecord> {
  const clientKey = (process.env.OPTIONS_CLIENT_KEY || '').trim()
  const xmlBody = buildRequestXml(
    clientKey,
    'DRSOTR',
    ['ORDNO', 'ACCDE', 'AREA', 'CUSTNAME', 'DELNAME', 'CONTACT', 'DEL1', 'DEL2', 'DEL3', 'DEL4', 'TOTAMOUNT', 'PAID', 'TEMPPAID', 'IMESS', 'NOTES', 'SETUPNOTE', 'MAINTNOTE', 'DELNOTE'],
    [['ORDNO', 'equals', clean(orderNo)]],
    { sortBy: 'ORDNO', maxRecords: 1 }
  )
  const records = parseTableRecords(await postOptionsXml(xmlBody), 'DRSOTR')
  return records[0] || {}
}

async function fetchPaymentsForOrder(orderNo: string): Promise<number> {
  const clientKey = (process.env.OPTIONS_CLIENT_KEY || '').trim()
  const order = clean(orderNo)
  const fieldsXml = '<field>SALESORDER</field><field>ACCDE</field><field>TRANDTE</field><field>TYPE</field><field>TOTAMOUNT</field>'
  let tableXml = ''
  for (const tableName of ['DRTRAN', 'DRHIST']) {
    tableXml +=
      `<table name="${tableName}" sortBy="SALESORDER" maxRecords="0" firstRecord="1" requestType="">` +
      `<fields>${fieldsXml}</fields>` +
      '<conditions>' +
      `<condition field="SALESORDER" type="equals">${escapeXml(order)}</condition>` +
      '<condition field="TYPE" type="equals">PA</condition>' +
      '</conditions>' +
      '</table>'
  }
  const xmlBody = '<?xml version="1.0" encoding="utf-8"?>' + `<request clientKey="${escapeXml(clientKey)}">${tableXml}</request>`
  const root = await postOptionsXml(xmlBody)
  const records = [...parseTableRecords(root, 'DRTRAN'), ...parseTableRecords(root, 'DRHIST')]
  return Math.round(records.reduce((sum, r) => sum + toFloat(r.TOTAMOUNT), 0) * 100) / 100
}

async function fetchContact(accde: string, contactName = ''): Promise<OptionsRecord> {
  const clientKey = (process.env.OPTIONS_CLIENT_KEY || '').trim()
  const xmlBody = buildRequestXml(
    clientKey,
    'DRSCON',
    ['ACCDE', 'NAME', 'PHONE', 'MOBILE', 'EMAIL'],
    [['ACCDE', 'equals', clean(accde)]],
    { sortBy: 'NAME', maxRecords: 20 }
  )
  const records = parseTableRecords(await postOptionsXml(xmlBody), 'DRSCON')
  if (!records.length) return {}

  const wanted = clean(contactName).toLowerCase()
  if (wanted) {
    const named = records.find((r) => clean(r.NAME).toLowerCase() === wanted)
    if (named) return named
  }
  const withMobile = records.find((r) => clean(r.MOBILE))
  if (withMobile) return withMobile
  const withPhone = records.find((r) => clean(r.PHONE))
  if (withPhone) return withPhone
  return records[0]
}

// -----------------------
// map one order -> one ImportRow
// -----------------------
function mapOrderToImportRow(orderNo: string, lines: OptionsRecord[], header: OptionsRecord, contact: OptionsRecord, paymentsTotal: number): ImportRow | null {
  if (!lines.length) return null

  // First non-excluded line supplies the product fields for the order.
  const keptLine = lines.find((line) => {
    const sku = clean(line.STOCKCODE).toUpperCase()
    return sku && !EXCLUDED_TRANSFORMA_SKUS.has(sku)
  })
  if (!keptLine) return null

  const cod = calculateCodAmount(header, lines, paymentsTotal)
  const recipientName = clean(header.DELNAME) || clean(header.CUSTNAME)
  if (!recipientName) return null

  const phone = firstNonBlank([
    contact.MOBILE,
    contact.PHONE,
    extractPhoneFromText(header.CONTACT, header.DELNOTE, header.NOTES, header.SETUPNOTE, header.MAINTNOTE, header.IMESS)
  ])

  const sku = clean(keptLine.STOCKCODE).toUpperCase()
  const description = clean(keptLine.DESC) || clean(keptLine.MEMODESC) || clean(keptLine.OVERDESC) || sku

  return {
    order_number: clean(orderNo),
    customer_name: recipientName,
    salesperson: clean(header.AREA),
    mobile: phone,
    balance_payable: cod,
    product_code: sku,
    product_name: description,
    quantity: toInt(keptLine.QTYORD)
  }
}

export type TransformaResult = {
  rows: ImportRow[]
  orderCount: number
  fromDate: string
}

// Pull every order with a delivery booked on/after fromDate (default: today in
// Adelaide) and fold each into a single ImportRow ready for ingestRows().
export async function fetchTransformaRows(fromDate?: string): Promise<TransformaResult> {
  const from = clean(fromDate) || todayAdelaideIso()

  const lines = await fetchLinesFromDate(from)
  const grouped = new Map<string, OptionsRecord[]>()
  for (const line of lines) {
    const orderNo = clean(line.ORDNO)
    if (!orderNo) continue
    const list = grouped.get(orderNo)
    if (list) list.push(line)
    else grouped.set(orderNo, [line])
  }

  const rows: ImportRow[] = []
  const contactCache = new Map<string, OptionsRecord>()
  for (const orderNo of Array.from(grouped.keys()).sort()) {
    const orderLines = grouped.get(orderNo)!
    const header = await fetchHeader(orderNo)
    if (!Object.keys(header).length) continue

    const accde = clean(header.ACCDE) || clean(orderLines[0].ACCDE)
    const contactKey = `${accde}|${clean(header.CONTACT)}`
    if (!contactCache.has(contactKey)) {
      contactCache.set(contactKey, accde ? await fetchContact(accde, header.CONTACT) : {})
    }

    const paymentsTotal = await fetchPaymentsForOrder(orderNo)
    const row = mapOrderToImportRow(orderNo, orderLines, header, contactCache.get(contactKey) || {}, paymentsTotal)
    if (row) rows.push(row)
  }

  return { rows, orderCount: rows.length, fromDate: from }
}
