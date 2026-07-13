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
  // The Transforma wordmark is a tight, full-height mark, so at equal height it
  // reads much larger than the padded BoConcept mark. Scale it down only when
  // both show side by side (dashboard); solo on its own payment app it's full size.
  const TRANS_DUAL_SCALE = 0.66
  const logos = brand === 'transforma'
    ? [{ src: TRANSFORMA_LOGO, scale: 1 }]
    : brand === 'bca'
      ? [{ src: BCA_LOGO, scale: 1 }]
      : [{ src: BCA_LOGO, scale: 1 }, { src: TRANSFORMA_LOGO, scale: TRANS_DUAL_SCALE }]

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.55) }}>
      {logos.map((logo, index) => (
        <span key={logo.src} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.55) }}>
          {index > 0 ? <span style={{ width: 1, height: Math.round(height * 0.85), background: 'var(--border-strong)' }} /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo.src} alt="" style={{ height: Math.round(height * logo.scale), width: 'auto', display: 'block' }} />
        </span>
      ))}
    </span>
  )
}
