/**
 * Extracts an 8-digit Brazilian CEP from a free-form address string.
 * Pure helper - safe to import from client components.
 */
export function extractPostalCodeFromAddress(address: string | null | undefined): string {
  const raw = (address || "").trim()
  const trailing = raw.match(/(\d{5})-?(\d{3})\s*$/)
  if (trailing) return `${trailing[1]}${trailing[2]}`
  const anyCep = raw.match(/\b(\d{5})-?(\d{3})\b/)
  return anyCep ? `${anyCep[1]}${anyCep[2]}` : ""
}
