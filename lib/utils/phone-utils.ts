/**
 * Phone utilities for Brazilian mobile and landline numbers.
 * Storage format: (11) 99876-5432 or +5511998765432 (E.164)
 * Display format: (11) 99876-5432
 */

/**
 * Remove everything except digits
 */
export function getPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return ""
  return String(phone).replace(/\D/g, "")
}

/**
 * Clean phone string from XML/input, stripping leading zeros and country code
 */
export function extractCleanPhoneDigits(phone: string | null | undefined): string {
  if (!phone) return ""

  let digits = getPhoneDigits(phone)
  if (!digits || /^0+$/.test(digits)) return ""

  // If starts with 0800 or 0300, keep single leading 0
  if (digits.startsWith("0800") || digits.startsWith("0300")) {
    return digits
  }

  // Remove multiple leading zeros (e.g. 0011949820472 -> 11949820472, 011949820472 -> 11949820472)
  digits = digits.replace(/^0+/, "")

  // Remove country code 55 (Brazil) if present and followed by 10 or 11 digits
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2)
  }

  return digits
}

/**
 * Format digits to Brazilian mobile display
 * 11998765432 -> (11) 99876-5432
 */
export function formatBrazilMobile(phone: string): string {
  const digits = extractCleanPhoneDigits(phone).slice(0, 11)

  if (digits.length === 0) return ""
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

/**
 * Format digits to Brazilian landline display
 * 1134567890 -> (11) 3456-7890
 */
export function formatBrazilLandline(phone: string): string {
  const digits = extractCleanPhoneDigits(phone).slice(0, 10)

  if (digits.length === 0) return ""
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
}

/**
 * Convert to E.164 format
 * (11) 99876-5432 -> +5511998765432
 */
export function normalizePhoneToE164(phone: string): string {
  const digits = extractCleanPhoneDigits(phone)

  if (!digits) return ""

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`
  }

  return `+55${digits}`
}

/**
 * Convert E.164 to display format
 * +5511998765432 -> (11) 99876-5432
 */
export function formatE164ToDisplay(e164: string): string {
  if (!e164) return ""

  const digits = extractCleanPhoneDigits(e164)
  return formatBrazilPhone(digits)
}

/**
 * Validate Brazilian mobile number
 */
export function isValidBrazilMobile(phone: string): boolean {
  const digits = extractCleanPhoneDigits(phone)

  return digits.length === 11 && digits[2] === "9"
}

/**
 * Validate Brazilian landline number
 */
export function isValidBrazilLandline(phone: string): boolean {
  const digits = extractCleanPhoneDigits(phone)

  return digits.length === 10
}

/**
 * Auto-detect and format Brazilian phone number
 * Handles: 0011949820472, +5511998765432, 5511998765432, 11998765432, (11) 99876-5432, 1134567890, 08001234567
 * Returns: (11) 99876-5432 for mobile, (11) 3456-7890 for landline, 0800 123 4567 for 0800
 */
export function formatBrazilPhone(phone: string | null | undefined): string {
  if (!phone) return ""

  const digits = extractCleanPhoneDigits(phone)
  if (!digits) return ""

  // 0800 / 0300 numbers
  if (digits.startsWith("0800") || digits.startsWith("0300")) {
    if (digits.length >= 10) {
      return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`
    }
    return digits
  }

  // Mobile: 11 digits with 9 in 3rd position
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  // Landline: 10 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }

  // If greater than 11 digits, try taking the last 11 if mobile or last 10 if landline
  if (digits.length > 11) {
    const last11 = digits.slice(-11)
    if (last11[2] === "9") {
      return `(${last11.slice(0, 2)}) ${last11.slice(2, 7)}-${last11.slice(7)}`
    }
    const last10 = digits.slice(-10)
    return `(${last10.slice(0, 2)}) ${last10.slice(2, 6)}-${last10.slice(6)}`
  }

  // 8 or 9 digits local without DDD
  if (digits.length === 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`
  }
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`
  }

  // Fallback: try to format what we have
  if (digits.length > 2) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  }
  if (digits.length > 0) {
    return `(${digits}`
  }

  return ""
}

/**
 * Cleans and formats phone number from XML or external sources.
 * Returns formatted string like '(11) 94982-0472' or null if invalid/empty.
 */
export function cleanAndFormatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const formatted = formatBrazilPhone(phone)
  if (!formatted || formatted === "-" || formatted === "()") return null
  return formatted
}

/**
 * Cleans address complement, filtering out dummy/placeholder values like 'Nao consta', 'S/N', 'Sem complemento', etc.
 */
export function sanitizeAddressComplement(complement: string | null | undefined): string | null {
  if (!complement) return null
  const trimmed = String(complement).trim()
  if (!trimmed) return null

  const normalized = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const placeholders = new Set([
    "nao consta",
    "nao possui",
    "nao informado",
    "sem complemento",
    "sem compl",
    "sem",
    "s/c",
    "s/n",
    "sn",
    "nenhum",
    "nada",
    "null",
    "undefined",
    "-",
    ".",
    "--",
    "...",
    "nao",
    "n/a"
  ])

  if (placeholders.has(normalized)) {
    return null
  }

  return trimmed
}
