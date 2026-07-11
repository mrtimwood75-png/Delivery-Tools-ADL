import type { Brand } from '@/lib/brand'

// One deployment serves three domains: the dashboard plus a payment app per
// brand. Which app a request is for is decided at runtime by its host. The two
// payment hosts default to the Adelaide Vercel domains but can be overridden by
// env (PAYMENTS_HOST_BCA / PAYMENTS_HOST_TRANSFORMA).
function norm(v: string | null | undefined): string {
  return (v || '').split(':')[0].trim().toLowerCase()
}

const BCA_HOST = norm(process.env.PAYMENTS_HOST_BCA) || 'payments-bca.vercel.app'
const TRANSFORMA_HOST = norm(process.env.PAYMENTS_HOST_TRANSFORMA) || 'payments-trans.vercel.app'

// The brand a payment host serves, or null for the dashboard host / anything else.
export function paymentBrandForHost(host: string | null | undefined): Brand | null {
  const h = norm(host)
  if (!h) return null
  if (h === BCA_HOST) return 'bca'
  if (h === TRANSFORMA_HOST) return 'transforma'
  return null
}

export function isPaymentHost(host: string | null | undefined): boolean {
  return paymentBrandForHost(host) !== null
}
