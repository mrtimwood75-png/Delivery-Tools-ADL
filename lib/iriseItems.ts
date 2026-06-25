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

function isCustomerStart(lines: string[], index: number) {
  const parts = lines[index].split('\t').map((part) => cleanText(part))
  const nextLine = cleanText(lines[index + 1] || '')
  const followingLine = cleanText(lines[index + 2] || '')
  return parts.length >= 3
    && Boolean(parts[0])
    && Boolean(parts[1])
    && Boolean(parts[2])
    && /\b[A-Z]{2,3}\s+\d{4}\b/i.test(nextLine)
    && followingLine.toLowerCase().includes('australia')
}

function recordSections(fileText: string) {
  const lines = String(fileText || '').split(/\r?\n/)
  const starts = lines.map((_, index) => isCustomerStart(lines, index) ? index : -1).filter((index) => index >= 0)
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length))
}

function headerDetails(blockLines: string[]) {
  const headerParts = (blockLines[0] || '').split('\t').map((part) => cleanText(part))
  const parsed = parseSuburbStatePostcode(blockLines[1] || '')
  return {
    mobile: headerParts[0] || '',
    customerName: headerParts[1] || '',
    streetAddress: headerParts[2] || '',
    suburb: parsed.suburb,
    state: parsed.state,
    postcode: parsed.postcode
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
