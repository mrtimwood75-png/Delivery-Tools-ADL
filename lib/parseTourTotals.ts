import { normalizeMobileAu, parseAmount } from './format'

export type NotificationRow = {
  send_sms: boolean
  customer_name: string
  salesperson: string
  mobile: string
  order_number: string
  balance_payable: number
  product_name: string
  product_code: string
  quantity: number
  street_address: string
  suburb: string
  state: string
  postcode: string
  delivery_notes: string
  stripe_session_id: string
  stripe_checkout_url: string
  stripe_link_amount: number
  sms_status: string
  payment_status: string
  date_sent: string
}

function firstValue(record: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]
    if (value && String(value).trim()) return String(value).trim()
  }
  return ''
}

function splitAddressLine(address: string) {
  const parts = String(address || '').split(',').map((part) => part.trim()).filter(Boolean)
  const street_address = parts[0] || ''
  const last = parts[parts.length - 1] || ''
  const match = last.match(/\b([A-Z]{2,3})\s+(\d{4})\b$/i)
  const state = match?.[1]?.toUpperCase() || ''
  const postcode = match?.[2] || ''
  const suburb = parts.length > 1 ? parts[parts.length - 2] || last.replace(/\b[A-Z]{2,3}\s+\d{4}\b/i, '').trim() : ''
  return { street_address, suburb, state, postcode }
}

export function parseTourTotals(fileText: string, priceFormat = 'Auto detect'): NotificationRow[] {
  const lines = String(fileText || '')
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim())

  if (!lines.length) return []

  const rows = lines.map((line) => line.split('\t'))
  const header = rows[0].map((col) => col.trim())
  const dataRows = rows.slice(1)

  return dataRows
    .filter((row) => row.length > 0 && !String(row[0] || '').trim().toLowerCase().startsWith('super grand total'))
    .map((row) => {
      const record: Record<string, string> = {}
      header.forEach((col, index) => {
        record[col] = String(row[index] || '').trim()
      })

      const balance = parseAmount(record['Balance due'] || '', priceFormat)
      const productName = firstValue(record, ['Item name', 'Item description', 'Description', 'Product name', 'Product', 'Item', 'Text'])
      const productCode = firstValue(record, ['Item number', 'Item No.', 'Item no.', 'Product number', 'Product code', 'SKU', 'Item id'])
      const quantityText = firstValue(record, ['Quantity', 'Qty', 'Sales quantity'])
      const quantity = Number(quantityText.replace(/[^0-9.-]/g, '')) || 1
      const fullAddress = firstValue(record, ['Delivery address', 'Address', 'Customer address', 'Street address', 'Ship-to address', 'Delivery location'])
      const parsedAddress = splitAddressLine(fullAddress)
      const street_address = firstValue(record, ['Street', 'Street address', 'Address 1', 'Delivery street']) || parsedAddress.street_address
      const suburb = firstValue(record, ['Suburb', 'City', 'Delivery suburb', 'Delivery city']) || parsedAddress.suburb
      const state = firstValue(record, ['State', 'Delivery state']) || parsedAddress.state
      const postcode = firstValue(record, ['Postcode', 'Postal code', 'Zip', 'Delivery postcode']) || parsedAddress.postcode

      return {
        send_sms: balance > 0,
        customer_name: record['Name'] || '',
        salesperson: firstValue(record, ['Recipient', 'Salesperson', 'Sales person', 'Worker']),
        mobile: normalizeMobileAu(record['Customer account'] || ''),
        order_number: String(record['Sales order'] || '').toUpperCase(),
        balance_payable: balance,
        product_name: productName || `Balance payable ${balance.toFixed(2)}`,
        product_code: productCode,
        quantity,
        street_address,
        suburb,
        state,
        postcode,
        delivery_notes: firstValue(record, ['Delivery notes', 'Notes', 'Instructions']),
        stripe_session_id: '',
        stripe_checkout_url: '',
        stripe_link_amount: balance > 0 ? balance : 0,
        sms_status: '',
        payment_status: balance > 0 ? 'Unpaid' : 'Paid',
        date_sent: ''
      }
    })
}
