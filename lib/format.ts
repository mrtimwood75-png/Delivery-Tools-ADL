export function parseAmount(value: string, priceFormat = 'Auto detect') {
  const raw = String(value || '').trim()
  if (!raw) return 0

  let cleaned = Array.from(raw)
    .filter((ch) => /[0-9.,-]/.test(ch))
    .join('')

  if (!cleaned || ['-', '.', ','].includes(cleaned)) return 0

  if (priceFormat === '$2,500.65') {
    cleaned = cleaned.replaceAll(',', '')
  } else if (priceFormat === '$2.500,65') {
    cleaned = cleaned.replaceAll('.', '').replaceAll(',', '.')
  } else {
    const lastDot = cleaned.lastIndexOf('.')
    const lastComma = cleaned.lastIndexOf(',')

    if (lastDot !== -1 && lastComma !== -1) {
      cleaned = lastDot > lastComma
        ? cleaned.replaceAll(',', '')
        : cleaned.replaceAll('.', '').replaceAll(',', '.')
    } else if (lastComma !== -1) {
      cleaned = cleaned.length - lastComma - 1 === 2
        ? cleaned.replaceAll(',', '.')
        : cleaned.replaceAll(',', '')
    } else if (lastDot !== -1 && cleaned.split('.').length > 2) {
      cleaned = cleaned.length - lastDot - 1 === 2
        ? cleaned.slice(0, lastDot).replaceAll('.', '') + cleaned.slice(lastDot)
        : cleaned.replaceAll('.', '')
    }
  }

  const amount = Number(cleaned)
  return Number.isFinite(amount) ? amount : 0
}

export function formatAmountAu(value: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD'
  }).format(Number(value || 0))
}

export function normalizeMobileAu(mobile: string) {
  // Work from digits only (drops +, spaces, and stray leading-+ artefacts like
  // "+0402..." which Sinch rejects as an invalid destination).
  const d = String(mobile || '').replace(/\D/g, '')
  if (!d) return ''
  if (d.startsWith('61')) return `+${d}`                     // 61.../+61... -> +61...
  if (d.startsWith('0')) return `+61${d.slice(1)}`           // 0402... or +0402... -> +61402...
  if (d.length === 9 && d.startsWith('4')) return `+61${d}`  // 402880663 -> +61402880663
  return `+${d}`
}
