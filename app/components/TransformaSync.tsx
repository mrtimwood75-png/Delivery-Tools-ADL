'use client'

import { useState } from 'react'

// Manual trigger for the Transforma Options-API ingest, alongside the BCA
// packing-list import. Also runs automatically every 20 minutes via cron.
export default function TransformaSync() {
  const [from, setFrom] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  async function sync() {
    setBusy(true)
    setStatus('Syncing from the Transforma Options API…')
    try {
      const qs = from ? `?from=${encodeURIComponent(from)}` : ''
      const response = await fetch(`/api/import/transforma${qs}`, { method: 'POST' })
      if (response.status === 404) {
        setStatus('Transforma sync is not enabled on this deployment (set ENABLE_TRANSFORMA_SYNC=true).')
        return
      }
      const result = await response.json()
      if (!response.ok) {
        setStatus(result.error || 'Sync failed.')
        return
      }
      setStatus(`Synced ${result.orderCount ?? 0} order(s) from ${result.fromDate}: ${result.created} created, ${result.updated} updated.`)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Sync failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card grid" style={{ boxShadow: 'none' }}>
      <div>
        <h2 style={{ margin: '0 0 8px' }}>Transforma Sync</h2>
        <p className="muted" style={{ margin: 0 }}>Pull orders straight from the Transforma Options API. This also runs automatically every 20 minutes. Orders are matched by order number and tagged Transforma; existing orders keep their dashboard status, dates and notes.</p>
      </div>
      <label>
        From date (optional)
        <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      </label>
      <div>
        <button type="button" onClick={sync} disabled={busy}>{busy ? 'Syncing…' : 'Sync Transforma now'}</button>
      </div>
      <p className="muted" style={{ margin: 0 }}>Leave the date blank to sync everything booked from today onward.</p>
      {status ? <p style={{ margin: 0, fontWeight: 600 }}>{status}</p> : null}
    </section>
  )
}
