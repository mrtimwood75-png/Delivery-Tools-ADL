'use client'

import { useEffect, useState } from 'react'

type Info = { paid: boolean; amount: number; customerName: string; orderNumber: string }

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(n || 0))

export default function PaymentSuccessPage() {
  const [info, setInfo] = useState<Info | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = 'Payment received — BoConcept'
    const sid = new URLSearchParams(window.location.search).get('session_id') || ''
    if (!sid) { setLoading(false); return }
    fetch(`/api/payment-link/session?session_id=${encodeURIComponent(sid)}`)
      .then((r) => r.json())
      .then((j) => { if (!j.error) setInfo(j) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: '#f4f3f1', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: '44px 36px', maxWidth: 460, width: '100%', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/BoConcept-Logo.svg" alt="BoConcept" style={{ height: 24, marginBottom: 28 }} />

        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#edf7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <span style={{ fontSize: 32, color: '#1e7d32', lineHeight: 1 }}>✓</span>
        </div>

        <h1 style={{ fontSize: 24, fontWeight: 600, margin: '0 0 10px' }}>Payment received</h1>
        <p style={{ color: '#6b6b6b', fontSize: 15, margin: '0 0 24px' }}>
          Thank you{info?.customerName ? `, ${info.customerName}` : ''}. Your payment has been processed successfully.
        </p>

        {loading ? (
          <p style={{ color: '#9a9a9a', fontSize: 14 }}>Loading your receipt…</p>
        ) : info ? (
          <div style={{ background: '#faf9f7', borderRadius: 12, padding: 18, textAlign: 'left' }}>
            {info.orderNumber && (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span style={{ color: '#6b6b6b', fontSize: 14 }}>Order</span>
                <span style={{ fontWeight: 600, fontSize: 14 }}>{info.orderNumber}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
              <span style={{ color: '#6b6b6b', fontSize: 14 }}>Amount paid</span>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{money(info.amount)}</span>
            </div>
          </div>
        ) : null}

        <p style={{ color: '#9a9a9a', fontSize: 13, marginTop: 28 }}>
          A receipt has been emailed to you by Stripe. You can close this window.
        </p>

        <div style={{ borderTop: '1px solid #eceae6', marginTop: 28, paddingTop: 20, color: '#6b6b6b', fontSize: 13, lineHeight: 1.6 }}>
          <div style={{ fontWeight: 600, color: '#1a1a1a' }}>BoConcept Brisbane</div>
          <div>977 Ann St, Fortitude Valley QLD 4006</div>
          <div>Ph: <a href="tel:+61735555922" style={{ color: '#1a1a1a' }}>07 3555 5922</a></div>
        </div>
      </div>
    </div>
  )
}
