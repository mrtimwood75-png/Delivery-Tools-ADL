'use client'

import { STORE } from '@/lib/store'

const BCA_LOGO = '/BoConcept-Logo.svg'
const TRANSFORMA_LOGO = '/transforma-logo.svg'

// Renders the brand mark(s) for this deployment: both BoConcept + Transforma on
// the shared dashboard, or the single brand on each payment app.
export default function BrandLogos({ height = 28 }: { height?: number }) {
  const logos = STORE === 'transforma'
    ? [TRANSFORMA_LOGO]
    : STORE === 'bca'
      ? [BCA_LOGO]
      : [BCA_LOGO, TRANSFORMA_LOGO]

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
