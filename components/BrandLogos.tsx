'use client'

import { useEffect, useState } from 'react'
import { paymentBrandForHost } from '@/lib/host'

const BCA_LOGO = '/BoConcept-Logo.svg'
const TRANSFORMA_LOGO = '/transforma-logo.png'

// Brand mark(s) by host: the BoConcept payment app shows BoConcept, the
// Transforma payment app shows Transforma, and the shared dashboard shows both.
// Rendered client-side (host is only known then) with nothing until mounted, so
// a payment app never briefly flashes the other brand.
export default function BrandLogos({ height = 28 }: { height?: number }) {
  const [host, setHost] = useState<string | null>(null)
  useEffect(() => { setHost(window.location.host) }, [])

  if (host === null) return <span style={{ display: 'inline-block', height }} aria-hidden />

  const brand = paymentBrandForHost(host)
  const logos = brand === 'transforma' ? [TRANSFORMA_LOGO] : brand === 'bca' ? [BCA_LOGO] : [BCA_LOGO, TRANSFORMA_LOGO]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.55) }}>
      {logos.map((src, index) => (
        <span key={src} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.55) }}>
          {index > 0 ? <span style={{ width: 1, height: Math.round(height * 0.85), background: 'var(--border-strong)' }} /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" style={{ height, width: 'auto', display: 'block' }} />
        </span>
      ))}
    </span>
  )
}
