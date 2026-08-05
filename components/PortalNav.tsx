'use client'

import { useEffect, useRef, useState } from 'react'

// Top navigation shared by the Payments and Messages tools so staff can move
// between them without re-logging in (same deployment, same session). The
// Messages tab carries a badge with the caller's own unread reply count, and a
// short ping sounds whenever that count goes up (a new customer reply arrived).
export default function PortalNav({ active }: { active: 'payments' | 'messages' }) {
  const [unread, setUnread] = useState(0)
  const [muted, setMuted] = useState(false)
  const prevUnread = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)
  const mutedRef = useRef(false)
  useEffect(() => { mutedRef.current = muted }, [muted])

  // Restore the mute preference.
  useEffect(() => {
    try { setMuted(window.localStorage.getItem('sms_ping_muted') === '1') } catch { /* ignore */ }
  }, [])

  function ensureAudio(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!audioRef.current) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (Ctx) audioRef.current = new Ctx()
    }
    return audioRef.current
  }

  // Short two-tone ping via the Web Audio API — no asset needed (CSP-safe).
  function playPing() {
    if (mutedRef.current) return
    const ctx = ensureAudio()
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    const start = ctx.currentTime
    ;[880, 1245].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t = start + i * 0.16
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.17)
    })
  }

  // Browsers block audio until the user interacts; resume the context on the
  // first click/keypress so the ping can play thereafter.
  useEffect(() => {
    const resume = () => { const ctx = ensureAudio(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}) }
    window.addEventListener('click', resume)
    window.addEventListener('keydown', resume)
    return () => { window.removeEventListener('click', resume); window.removeEventListener('keydown', resume) }
  }, [])

  async function loadUnread() {
    try {
      const res = await fetch('/api/sms/conversations', { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      const total = (json.conversations || []).reduce((sum: number, c: { unread?: number }) => sum + (c.unread || 0), 0)
      setUnread(total)
      // Ping when the unread count rises — but never on the very first load.
      if (prevUnread.current !== null && total > prevUnread.current) playPing()
      prevUnread.current = total
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadUnread()
    const id = setInterval(loadUnread, 15000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleMute() {
    const next = !muted
    setMuted(next)
    try { window.localStorage.setItem('sms_ping_muted', next ? '1' : '0') } catch { /* ignore */ }
    if (!next) playPing() // sample the sound when turning it on
  }

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
    <nav style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginBottom: 22 }}>
      {tab('Payments', '/payment-link', active === 'payments')}
      {tab('Messages', '/messages', active === 'messages', unread)}
      <button
        type="button"
        onClick={toggleMute}
        title={muted ? 'Sound off — click to turn on' : 'Sound on — click to mute'}
        aria-label={muted ? 'Unmute reply sound' : 'Mute reply sound'}
        style={{
          width: 34, height: 34, minHeight: 0, padding: 0, borderRadius: 999,
          border: '1px solid #dcdbd8', background: 'transparent', color: '#4a4a4a',
          fontSize: 15, cursor: 'pointer', lineHeight: 1
        }}
      >
        {muted ? '🔇' : '🔔'}
      </button>
    </nav>
  )
}
