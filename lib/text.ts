// Convert ALL-CAPS text to proper/title case (e.g. "MR MARK OREL" -> "Mr Mark
// Orel", "12 SMITH ST" -> "12 Smith St"). Strings that already contain a
// lowercase letter are returned unchanged, so intentional casing (brand names,
// "McDonald", already-clean data) is never clobbered.
export function toProperCase(value: unknown): string {
  const text = String(value ?? '').trim()
  if (!text || /[a-z]/.test(text)) return text
  return text.replace(/[A-Za-zÀ-ÿ]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
}
