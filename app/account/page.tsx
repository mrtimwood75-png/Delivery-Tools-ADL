'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

// Self-service password change for dashboard (password) users. Reads identity
// from the session via /api/me and updates the password through a server route.
export default function AccountPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    fetch('/api/me')
      .then((response) => response.json())
      .then((result) => {
        if (result?.user?.email) {
          setEmail(result.user.email)
          setReady(true)
        } else {
          setStatus('You are not signed in. Please log in again to change your password.')
        }
      })
      .catch(() => setStatus('Could not load your account.'))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 6) return setStatus('Password must be at least 6 characters.')
    if (password !== confirm) return setStatus('Passwords do not match.')
    setStatus('Updating password...')
    const response = await fetch('/api/account/password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) return setStatus(result.error || 'Could not update password.')
    setPassword('')
    setConfirm('')
    setStatus('Password updated. Use your new password next time you log in.')
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center' }}>
      <form className="card grid" style={{ width: 'min(460px, 100%)' }} onSubmit={submit}>
        <div>
          <h1 style={{ margin: '4px 0 8px' }}>Change Password</h1>
          <p className="muted" style={{ margin: 0 }}>{email ? `Signed in as ${email}` : 'Update your account password.'}</p>
        </div>
        <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" disabled={!ready} /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required autoComplete="new-password" disabled={!ready} /></label>
        <button type="submit" disabled={!ready}>Update Password</button>
        <Link href="/database" style={{ textDecoration: 'none' }}><button type="button" className="btn-secondary" style={{ width: '100%' }}>Back to dashboard</button></Link>
        {status ? <p className="muted">{status}</p> : null}
      </form>
    </main>
  )
}
