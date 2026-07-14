export type IriseItemRow = {
  order_number: string
  customer_name: string
  mobile: string
  street_address: string
  suburb: string
  state: string
  postcode: string
  delivery_notes: string
  product_name: string
  product_code: string
  quantity: number
  cubic_meters: number
  notes: string
}

function toOrder(value: string) {
  const text = String(value || '').trim().toUpperCase()
  return /^OS-[0-9]{4,}$/.test(text) ? text : ''
}

function toQty(value: string) {
  const parsed = Number(String(value || '1').replace(',', '.'))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function toNumber(value: string) {
  const parsed = Number(String(value || '0').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function cleanText(value: string) {
  return String(value || '')
    .replace(/�/g, 'x')
    .replace(/\uFFFD/g, 'x')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractValueBeforeUnit(parts: string[], unitLabel: string) {
  const unit = unitLabel.toLowerCase()
  for (let i = 1; i < parts.length; i += 1) {
    if (String(parts[i] || '').trim().toLowerCase() === unit) return parts[i - 1]
  }
  return '0'
}

function parseSuburbStatePostcode(value: string) {
  const match = cleanText(value).match(/^(.+?)\s*,?\s*([A-Z]{2,3})\s+(\d{4})$/i)
  return {
    suburb: match ? cleanText(match[1]) : '',
    state: match ? match[2].toUpperCase() : '',
    postcode: match ? match[3] : ''
  }
}

// A customer's details line is the "Australia … Sales order os-… Name …" row.
// It's the reliable anchor for a block; the address above it may span several
// lines (or be absent).
function detailsLineOffset(lines: string[], start: number, maxLook = 10) {
  for (let k = 1; k <= maxLook && start + k < lines.length; k += 1) {
    const raw = lines[start + k] || ''
    if (/\bsales order\b/i.test(raw) && /australia/i.test(raw)) return k
  }
  return -1
}

function isPhoneish(value: string) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 12
}

// A block starts on the address header (`mobile \t name \t …`) as long as a
// details line follows within a few lines. We no longer require the suburb to
// sit immediately under the header — that dropped multi-line and address-less
// customers, merging them into the previous order (and giving them its address).
function isCustomerStart(lines: string[], index: number) {
  const parts = (lines[index] || '').split('\t').map((part) => cleanText(part))
  if (parts.length < 3 || !isPhoneish(parts[0]) || !parts[1]) return false
  return detailsLineOffset(lines, index) !== -1
}

function recordSections(fileText: string) {
  const lines = String(fileText || '').split(/\r?\n/)
  const starts = lines.map((_, index) => isCustomerStart(lines, index) ? index : -1).filter((index) => index >= 0)
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length))
}

function headerDetails(blockLines: string[]) {
  const headerParts = (blockLines[0] || '').split('\t').map((part) => cleanText(part))
  const detailsIdx = detailsLineOffset(blockLines, 0)
  const upper = detailsIdx === -1 ? blockLines.length : detailsIdx

  // Address = the header's 3rd field plus every line up to the "Australia …"
  // details row (blank lines and lone "." placeholders skipped).
  const addrLines: string[] = []
  const firstField = cleanText(headerParts[2] || '')
  if (firstField && firstField !== '.') addrLines.push(firstField)
  for (let k = 1; k < upper; k += 1) {
    const t = cleanText(blockLines[k] || '')
    if (t && t !== '.') addrLines.push(t)
  }

  // The last "Suburb STATE 1234" line is the locality; earlier lines are street.
  let suburb = '', state = '', postcode = ''
  let streetLines = addrLines
  for (let k = addrLines.length - 1; k >= 0; k -= 1) {
    const parsed = parseSuburbStatePostcode(addrLines[k])
    if (parsed.state && parsed.postcode) {
      suburb = parsed.suburb
      state = parsed.state
      postcode = parsed.postcode
      streetLines = addrLines.slice(0, k)
      break
    }
  }
  // Fallback: a trailing bare 4-digit line is a postcode with no suburb/state.
  if (!postcode && streetLines.length && /^\d{4}$/.test(streetLines[streetLines.length - 1])) {
    postcode = streetLines[streetLines.length - 1]
    streetLines = streetLines.slice(0, -1)
  }

  return {
    mobile: headerParts[0] || '',
    customerName: headerParts[1] || '',
    streetAddress: streetLines.join(', '),
    suburb,
    state,
    postcode
  }
}

export function parseIriseItems(fileText: string): IriseItemRow[] {
  const rows: IriseItemRow[] = []

  for (const blockLines of recordSections(fileText)) {
    const details = headerDetails(blockLines)
    let orderNumber = ''
    let customerName = details.customerName
    let mobile = details.mobile
    let inItemSection = false

    for (const line of blockLines) {
      if (!line.trim()) continue
      const parts = line.split('\t').map((part) => cleanText(part))

      if (!inItemSection) {
        for (let i = 0; i < parts.length - 1; i += 1) {
          if (parts[i].toLowerCase() === 'sales order') {
            const candidate = toOrder(parts[i + 1])
            if (candidate) orderNumber = candidate
          }
          if (parts[i].toLowerCase() === 'name' && parts[i + 1]) customerName = parts[i + 1]
          if (parts[i].toLowerCase() === 'mobile phone' && parts[i + 1]) mobile = parts[i + 1]
          if (parts[i].toLowerCase() === 'customer account' && parts[i + 1] && !mobile) mobile = parts[i + 1]
        }
      }

      if (parts[0] === 'Location' && parts[4] === 'Item number') {
        inItemSection = true
        continue
      }

      if (parts[0] === 'Total volume') {
        inItemSection = false
        continue
      }

      if (inItemSection && orderNumber && parts[4] && parts[5]) {
        rows.push({
          order_number: orderNumber,
          customer_name: customerName,
          mobile,
          street_address: details.streetAddress,
          suburb: details.suburb,
          state: details.state,
          postcode: details.postcode,
          delivery_notes: '',
          product_code: parts[4],
          product_name: parts[5],
          quantity: toQty(parts[2]),
          cubic_meters: toNumber(extractValueBeforeUnit(parts, 'Cu M')),
          notes: ''
        })
      }
    }
  }

  return rows
}
