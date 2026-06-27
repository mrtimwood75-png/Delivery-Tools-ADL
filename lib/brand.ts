import { STORE } from '@/lib/store'

// A brand is the identity a customer bought from. On the dashboard it is chosen
// per order from delivery_orders.source; on a payment app it is fixed by the
// deployment. Every customer-facing channel (Stripe account, email from, SMS
// sender, display name) resolves through here.
export type Brand = 'bca' | 'transforma'

export type BrandConfig = {
  brand: Brand
  displayName: string
  logo: string
  emailFrom: string
  smsFrom: string
  smsApiKey: string
  smsApiSecret: string
  supportPhone: string
  supportEmail: string
  supportAddress: string
  bankName: string
  bankBsb: string
  bankAccount: string
  stripeSecretKey: string
  stripeWebhookSecret: string
}

function env(...names: string[]): string {
  for (const name of names) {
    const value = (process.env[name] || '').trim()
    if (value) return value
  }
  return ''
}

const PREFIX: Record<Brand, string> = { bca: 'BCA', transforma: 'TRANSFORMA' }
const DEFAULT_NAME: Record<Brand, string> = { bca: 'BoConcept Adelaide', transforma: 'Transforma' }
export const BRAND_LOGO: Record<Brand, string> = { bca: '/BoConcept-Logo.svg', transforma: '/transforma-logo.svg' }

// Per-brand env (e.g. BCA_STRIPE_SECRET_KEY) with a fall back to the legacy
// single-value names, so a single-brand payment deployment can use either.
export function brandConfig(brand: Brand): BrandConfig {
  const p = PREFIX[brand]
  return {
    brand,
    displayName: env(`${p}_DISPLAY_NAME`) || DEFAULT_NAME[brand],
    logo: BRAND_LOGO[brand],
    emailFrom: env(`${p}_EMAIL_FROM`, 'EMAIL_FROM'),
    smsFrom: env(`${p}_SMS_FROM`, 'MESSAGEMEDIA_SENDER_ID'),
    smsApiKey: env(`${p}_MESSAGEMEDIA_API_KEY`, 'MESSAGEMEDIA_API_KEY'),
    smsApiSecret: env(`${p}_MESSAGEMEDIA_API_SECRET`, 'MESSAGEMEDIA_API_SECRET'),
    supportPhone: env(`${p}_SUPPORT_PHONE`, 'NEXT_PUBLIC_SUPPORT_PHONE'),
    supportEmail: env(`${p}_SUPPORT_EMAIL`, `${p}_EMAIL_FROM`, 'EMAIL_FROM'),
    supportAddress: env(`${p}_SUPPORT_ADDRESS`, 'NEXT_PUBLIC_SUPPORT_ADDRESS'),
    bankName: env(`${p}_BANK_NAME`),
    bankBsb: env(`${p}_BANK_BSB`),
    bankAccount: env(`${p}_BANK_ACCOUNT`),
    stripeSecretKey: env(`${p}_STRIPE_SECRET_KEY`, 'STRIPE_SECRET_KEY'),
    stripeWebhookSecret: env(`${p}_STRIPE_WEBHOOK_SECRET`, 'STRIPE_WEBHOOK_SECRET')
  }
}

export function brandForSource(source: string | null | undefined): Brand {
  return source === 'transforma' ? 'transforma' : 'bca'
}

// The single brand this deployment serves, or null on the dual-brand dashboard.
export function deploymentBrand(): Brand | null {
  return STORE === 'bca' ? 'bca' : STORE === 'transforma' ? 'transforma' : null
}

// Brands that actually have a Stripe account configured on this deployment.
export function configuredBrands(): Brand[] {
  const fixed = deploymentBrand()
  if (fixed) return [fixed]
  return (['bca', 'transforma'] as Brand[]).filter((brand) => brandConfig(brand).stripeSecretKey)
}
