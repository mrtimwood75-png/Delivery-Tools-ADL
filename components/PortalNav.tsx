'use client'

import { useEffect, useState } from 'react'

// Top navigation shared by the Payments and Messages tools so staff can move
// between them without re-logging in (same deployment, same session). The
// Messages tab carries a badge with the caller's own unread reply count.
export default function PortalNav({ active }: { active: 'payments' | 'messages' }) {
  const [unread, setUnread] = useState(0)

  async function loadUnread() {
    try {
      const res = await fetch('/api/sms/conversations', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      const total = (json.conversations || []).reduce((sum: number, c: { unread?: number }) => sum + (c.unread || 0), 0)
      setUnread(total)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadUnread()
    const id = setInterval(loadUnread, 30000)
    return () => clearInterval(id)
  }, [])

  const tab = (label: string, href: string, isActive: boolean, badge?: number): React.ReactNode => (
    <a
      href={href}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '8px 16px', borderRadius: 999, textDecoration: 'none',
        fontSize: 14, fontWeight: 600,
        background: isActive ? '#1a1a1a' : 'transparent',
        color: isActive ? '#fff' : '#4a4a4a',
        border: isActive ? '1px solid #1a1a1a' : '1px solid #dcdbd8'
      }}
    >
      {label}
      {badge ? (
        <span style={{
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
          background: '#d64545', color: '#fff', fontSize: 11, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
        }}>{badge > 99 ? '99+' : badge}</span>
      ) : null}
    </a>
  )

  return (
    <nav style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 22 }}>
      {tab('Payments', '/payment-link', active === 'payments')}
      {tab('Messages', '/messages', active === 'messages', unread)}
    </nav>
  )
}
