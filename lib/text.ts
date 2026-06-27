// Convert ALL-CAPS text to proper/title case (e.g. "MR MARK OREL" -> "Mr Mark
// Orel", "12 SMITH ST" -> "12 Smith St"). Strings that already contain a
// lowercase letter are returned unchanged, so intentional casing (brand names,
// "McDonald", already-clean data) is never clobbered.
export function toProperCase(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text || /[a-z]/.test(text)) return text
  return text.replace(/[A-Za-zÀ-ÿ]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}

// Strip a leading honorific/title from a customer name, leaving just the name.
// Handles single ("Mr Mark Orel" -> "Mark Orel") and combined titles
// ("Mr & Mrs John And Thalia Sheahan" -> "John And Thalia Sheahan").
const TITLE_RE = /^(?:(?:mr|mrs|ms|mx|miss|mstr|master|dr|prof|messrs|sir|madam|lady)\.?(?:\s*(?:&|and|\/|,)\s*|\s+))+/i
export function stripCustomerTitle(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const stripped = text.replace(TITLE_RE, '').trim()
  // Never blank out a name that was nothing but a title.
  return stripped || text
}
