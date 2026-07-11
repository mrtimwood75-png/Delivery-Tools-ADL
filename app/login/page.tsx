'use client'

import { FormEvent, useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import BrandLogos from '@/components/BrandLogos'

// One deployment, three domains. The door(s) shown depend on the host:
//   payments-bca   -> BoConcept Microsoft only
//   payments-trans -> Transforma Microsoft only
//   dashboard      -> both Microsoft doors (mixed staff)
const BCA_HOST = 'payments-bca.vercel.app'
const TRANS_HOST = 'payments-trans.vercel.app'

const msButtonStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  background: '#fff',
  color: '#1a1a1a',
  border: '1px solid #d9d9d9'
} as const

const MS_LOGO = 'https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.svg'

export default function LoginPage() {
  const [host, setHost] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    const h = window.location.host.split(':')[0].toLowerCase()
    setHost(h)
    if (h === BCA_HOST) document.title = 'Customer Payments (BCA)'
    else if (h === TRANS_HOST) document.title = 'Customer Payments (Transforma)'
    if (new URLSearchParams(window.location.search).get('pw') === '1') setShowPw(true)
  }, [])

  const isBca = host === BCA_HOST
  const isTrans = host === TRANS_HOST
  const isDashboard = host !== '' && !isBca && !isTrans
  const title = isBca ? 'BoConcept Adelaide' : isTrans ? 'Transforma' : 'Warehouse Dashboard (ADL)'
  const dest = isBca || isTrans ? '/payment-link' : '/database'
  const showBoConcept = isBca || isDashboard
  const showTransforma = isTrans || isDashboard

  async function passwordLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Signing in…')
    const res = await signIn('credentials', { email: email.trim().toLowerCase(), password, redirect: false })
    if (!res || res.error) {
      setStatus('Invalid email or password, or your account has no access.')
      return
    }
    window.location.href = dest
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center' }}>
      <div className="card grid" style={{ width: 'min(460px, 100%)' }}>
        <div>
          <div style={{ marginBottom: 10 }}><BrandLogos height={26} /></div>
          <p className="muted" style={{ margin: 0 }}>{title}</p>
          <h1 style={{ margin: '4px 0 8px' }}>Sign in</h1>
          <p className="muted" style={{ margin: 0 }}>Sign in with your Microsoft account.</p>
        </div>

        {host === '' ? null : (
          <div className="grid" style={{ gap: 10 }}>
            {showBoConcept ? (
              <button type="button" onClick={() => signIn('entra-bca', { callbackUrl: dest })} style={msButtonStyle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MS_LOGO} alt="" width={18} height={18} />
                Sign in with Microsoft (BoConcept)
              </button>
            ) : null}
            {showTransforma ? (
              <button type="button" onClick={() => signIn('entra-transforma', { callbackUrl: dest })} style={msButtonStyle}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={MS_LOGO} alt="" width={18} height={18} />
                Sign in with Microsoft (Transforma)
              </button>
            ) : null}
          </div>
        )}

        {showPw ? (
          <form className="grid" onSubmit={passwordLogin} style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>Emergency staff password sign-in.</p>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
            <button type="submit">Login</button>
          </form>
        ) : null}

        {status ? <p className="muted">{status}</p> : null}
      </div>
    </main>
  )
}
