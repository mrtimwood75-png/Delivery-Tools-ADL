'use client'

import { ChangeEvent, useState } from 'react'
import { parsePackingList, PackingListRow } from '@/lib/parsePackingList'

export default function PackingListImport() {
  const [rows, setRows] = useState<PackingListRow[]>([])
  const [status, setStatus] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const parsed = parsePackingList(text)
    setRows(parsed)
    const orders = new Set(parsed.map((row) => row.order_number)).size
    setStatus(parsed.length ? `Preview ready: ${parsed.length} line item${parsed.length === 1 ? '' : 's'} across ${orders} order${orders === 1 ? '' : 's'}.` : 'No packing list rows detected in that file.')
  }

  async function confirmImport() {
    if (isBusy || !rows.length) return
    setIsBusy(true)
    setStatus('Importing packing list...')
    try {
      const response = await fetch('/api/import-packing-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Packing list import failed')
      const parts = [`Imported ${result.imported} line items`, `${result.matchedOrders} order${result.matchedOrders === 1 ? '' : 's'} matched`, `${result.updatedCustomers} address${result.updatedCustomers === 1 ? '' : 'es'} updated`]
      if (result.unmatchedOrders?.length) parts.push(`Unmatched (import Tour Totals first): ${result.unmatchedOrders.join(', ')}`)
      setStatus(parts.join(' · '))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Packing list import failed')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="card grid" style={{ boxShadow: 'none' }}>
      <div>
        <h2 style={{ margin: '0 0 8px' }}>Packing List - Order</h2>
        <p className="muted" style={{ margin: 0 }}>Upload the Packing List report to fill in delivery addresses and product line items for orders already imported from Tour Totals. Matches on order number; line items are replaced.</p>
      </div>
      <label>
        Upload Packing List text file
        <input type="file" accept=".txt,text/plain" onChange={handleFile} />
      </label>

      {rows.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
            <thead>
              <tr>{['Order', 'Customer', 'Mobile', 'Product', 'Qty', 'Address', 'Suburb', 'State', 'Postcode', 'Notes'].map((heading) => <th key={heading} style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8, whiteSpace: 'nowrap' }}>{heading}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.order_number}-${index}`}>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{row.order_number}</td>
                  <td style={{ padding: 8 }}>{row.customer_name}</td>
                  <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{row.mobile}</td>
                  <td style={{ padding: 8 }}>{row.product_name || row.product_code}</td>
                  <td style={{ padding: 8 }}>{row.quantity}</td>
                  <td style={{ padding: 8 }}>{row.street_address}</td>
                  <td style={{ padding: 8 }}>{row.suburb}</td>
                  <td style={{ padding: 8 }}>{row.state}</td>
                  <td style={{ padding: 8 }}>{row.postcode}</td>
                  <td style={{ padding: 8 }}>{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div>
        <button type="button" onClick={confirmImport} disabled={isBusy || !rows.length}>{isBusy ? 'Importing...' : `Confirm Packing List Import${rows.length ? ` (${rows.length})` : ''}`}</button>
      </div>

      {status ? <p className="muted">{status}</p> : null}
    </section>
  )
}
