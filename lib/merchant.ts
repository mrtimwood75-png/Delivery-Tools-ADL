import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { brandConfig, type Brand } from '@/lib/brand'

// Customer-facing merchant details (name, contact, bank) used in SMS templates
// and the payment success page. Admin can edit these in the DB; any field left
// blank falls back to the brand's env config.
export type MerchantInfo = {
  brand: Brand
  displayName: string
  logo: string
  showroomPhone: string
  warehousePhone: string
  email: string
  address: string
  bankName: string
  bankBsb: string
  bankAccount: string
}

type Row = {
  brand: string
  display_name: string | null
  showroom_phone: string | null
  warehouse_phone: string | null
  email: string | null
  address: string | null
  bank_name: string | null
  bank_bsb: string | null
  bank_account: string | null
}

function merge(brand: Brand, row: Row | null): MerchantInfo {
  const cfg = brandConfig(brand)
  const pick = (v: string | null | undefined, fallback: string) => (String(v || '').trim() || fallback)
  return {
    brand,
    logo: cfg.logo,
    displayName: pick(row?.display_name, cfg.displayName),
    showroomPhone: pick(row?.showroom_phone, cfg.showroomPhone),
    warehousePhone: pick(row?.warehouse_phone, cfg.warehousePhone),
    email: pick(row?.email, cfg.supportEmail),
    address: pick(row?.address, cfg.supportAddress),
    bankName: pick(row?.bank_name, cfg.bankName),
    bankBsb: pick(row?.bank_bsb, cfg.bankBsb),
    bankAccount: pick(row?.bank_account, cfg.bankAccount)
  }
}

// Resolve one brand's merchant details (DB override, else env).
export async function getMerchantConfig(brand: Brand): Promise<MerchantInfo> {
  const { data } = await supabaseAdmin.from('merchant_settings').select('*').eq('brand', brand).maybeSingle()
  return merge(brand, (data as Row) || null)
}

// Resolve both brands at once (for the bulk SMS send).
export async function getAllMerchantConfigs(): Promise<Record<Brand, MerchantInfo>> {
  const { data } = await supabaseAdmin.from('merchant_settings').select('*')
  const byBrand = new Map<string, Row>()
  for (const r of (data as Row[]) || []) byBrand.set(r.brand, r)
  return {
    bca: merge('bca', byBrand.get('bca') || null),
    transforma: merge('transforma', byBrand.get('transforma') || null)
  }
}
