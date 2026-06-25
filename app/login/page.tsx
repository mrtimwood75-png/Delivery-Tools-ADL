'use client'

import { FormEvent, useState } from 'react'
import { signIn } from 'next-auth/react'
import { STORE } from '@/lib/store'
import BrandLogos from '@/components/BrandLogos'

// Per deployment: the dashboard signs in with email + password; each payment app
// shows its own single Microsoft door.
const MICROSOFT = STORE === 'bca'
  ? { id: 'entra-bca', label: 'Sign in with Microsoft (BoConcept)' }
  : STORE === 'transforma'
    ? { id: 'entra-transforma', label: 'Sign in with Microsoft (Transforma)' }
    : null

// The dashboard is shared, so it shows both brands; each payment app shows its own.
const BRAND = STORE === 'transforma' ? 'Transforma' : STORE === 'bca' ? 'BoConcept Adelaide' : 'Adelaide Delivery'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Signing in…')
    const res = await signIn('credentials', { email: email.trim().toLowerCase(), password, redirect: false })
    if (!res || res.error) {
      setStatus('Invalid email or password, or your account has no access.')
      return
    }
    window.location.href = '/database'
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center' }}>
      <div className="card grid" style={{ width: 'min(460px, 100%)' }}>
        <div>
          <div style={{ marginBottom: 10 }}><BrandLogos height={26} /></div>
          <p className="muted" style={{ margin: 0 }}>{BRAND}</p>
          <h1 style={{ margin: '4px 0 8px' }}>Sign in</h1>
          <p className="muted" style={{ margin: 0 }}>
            {MICROSOFT ? 'Sign in with your Microsoft account.' : 'Sign in with your email and password.'}
          </p>
        </div>

        {MICROSOFT ? (
          <button
            type="button"
            onClick={() => signIn(MICROSOFT.id, { callbackUrl: '/payment-link' })}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fff', color: '#1a1a1a', border: '1px solid #d9d9d9' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.svg" alt="" width={18} height={18} />
            {MICROSOFT.label}
          </button>
        ) : (
          <form className="grid" onSubmit={login}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
            <button type="submit">Login</button>
          </form>
        )}

        {status ? <p className="muted">{status}</p> : null}
      </div>
    </main>
  )
}
