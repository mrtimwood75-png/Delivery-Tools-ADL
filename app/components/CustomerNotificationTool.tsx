'use client'

import { ChangeEvent, useMemo, useState } from 'react'
import { parseTourTotals, NotificationRow } from '@/lib/parseTourTotals'

const priceFormats = ['Auto detect', '$2,500.65', '$2.500,65']
const viewFilters = ['Show All', 'Hide Zero Balances', 'Hide Orders With Balance']

export default function CustomerNotificationTool() {
  const [rows, setRows] = useState<NotificationRow[]>([])
  const [priceFormat, setPriceFormat] = useState('Auto detect')
  const [viewFilter, setViewFilter] = useState('Show All')
  const [status, setStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isBusy, setIsBusy] = useState(false)

  const visibleRows = useMemo(() => {
    if (viewFilter === 'Hide Zero Balances') return rows.filter((row) => Number(row.balance_payable || 0) > 0)
    if (viewFilter === 'Hide Orders With Balance') return rows.filter((row) => Number(row.balance_payable || 0) <= 0)
    return rows
  }, [rows, viewFilter])

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    const text = await file.text()
    const parsed = parseTourTotals(text, priceFormat)
    setRows(parsed)
    setStatus(`Rows detected: ${parsed.length}`)
  }

  function updateRow(orderNumber: string, field: keyof NotificationRow, value: string | number) {
    setRows((current) => current.map((row) => row.order_number === orderNumber ? { ...row, [field]: value } : row))
  }

  async function confirmImport() {
    setIsSaving(true)
    setStatus('Saving import...')
    try {
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows })
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Import failed')
      setStatus(`Import confirmed. Rows saved: ${result.imported}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Import failed')
    } finally {
      setIsSaving(false)
    }
  }

  async function createStripeLinks() {
    setIsBusy(true)
    setStatus('Creating Stripe links...')
    try {
      const response = await fetch('/api/stripe-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Stripe link update failed')
      setStatus(`Stripe links updated: ${result.updated}`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Stripe link update failed')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="card grid" style={{ boxShadow: 'none' }}>
      <div>
        <h2 style={{ margin: '0 0 8px' }}>Tour Totals</h2>
        <p className="muted" style={{ margin: 0 }}>Upload Tour Totals from Axapta, preview/edit rows, then confirm import.</p>
      </div>
      <div className="grid grid-2">
        <label>
          Source price format
          <select value={priceFormat} onChange={(event) => setPriceFormat(event.target.value)}>
            {priceFormats.map((format) => <option key={format}>{format}</option>)}
          </select>
        </label>
        <label>
          Upload Tour Totals text file
          <input type="file" accept=".txt,text/plain" onChange={handleFile} />
        </label>
      </div>

      {rows.length ? (
        <>
          <div className="grid grid-2">
            <label>
              View filter
              <select value={viewFilter} onChange={(event) => setViewFilter(event.target.value)}>
                {viewFilters.map((filter) => <option key={filter}>{filter}</option>)}
              </select>
            </label>
            <p className="muted" style={{ marginTop: 28 }}>Visible rows: {visibleRows.length} | Total rows: {rows.length}</p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
              <thead>
                <tr>{['Customer Name', 'Mobile', 'Order number', 'Balance payable', 'Payment Status'].map((heading) => <th key={heading} style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: 8 }}>{heading}</th>)}</tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.order_number}>
                    <td style={{ padding: 8 }}><input value={row.customer_name} onChange={(event) => updateRow(row.order_number, 'customer_name', event.target.value)} /></td>
                    <td style={{ padding: 8 }}><input value={row.mobile} onChange={(event) => updateRow(row.order_number, 'mobile', event.target.value)} /></td>
                    <td style={{ padding: 8 }}><input value={row.order_number} onChange={(event) => updateRow(row.order_number, 'order_number', event.target.value.toUpperCase())} /></td>
                    <td style={{ padding: 8 }}><input type="number" min="0" step="0.01" value={row.balance_payable} onChange={(event) => updateRow(row.order_number, 'balance_payable', Number(event.target.value || 0))} /></td>
                    <td style={{ padding: 8 }}>{row.payment_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-2">
            <button type="button" onClick={confirmImport} disabled={!rows.length || isSaving}>{isSaving ? 'Saving...' : 'Confirm Import'}</button>
            <button type="button" onClick={createStripeLinks} disabled={isBusy}>Add / Update Stripe Links</button>
          </div>
        </>
      ) : null}

      {status ? <p className="muted">{status}</p> : null}
    </section>
  )
}
