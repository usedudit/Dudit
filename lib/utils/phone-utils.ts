/**
 * Phone utilities for Brazilian mobile numbers.
 * Storage format: +5511998765432 (E.164)
 * Display format: (11) 99876-5432
 */

/**
 * Remove everything except digits
 */
export function getPhoneDigits(phone: string): string {
  return phone.replace(/\D/g, "")
}

/**
 * Format digits to Brazilian mobile display
 * 11998765432 -> (11) 99876-5432
 */
export function formatBrazilMobile(phone: string): string {
  const digits = getPhoneDigits(phone).slice(0, 11)

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
  const digits = getPhoneDigits(phone).slice(0, 10)

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
  const digits = getPhoneDigits(phone)

  if (!digits) return ""

  if (digits.startsWith("55") && digits.length === 13) {
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

  let digits = getPhoneDigits(e164)

  if (digits.startsWith("55")) {
    digits = digits.slice(2)
  }

  return formatBrazilMobile(digits)
}

/**
 * Validate Brazilian mobile number
 */
export function isValidBrazilMobile(phone: string): boolean {
  const digits = getPhoneDigits(phone)

  return digits.length === 11 && digits[2] === "9"
}

/**
 * Validate Brazilian landline number
 */
export function isValidBrazilLandline(phone: string): boolean {
  const digits = getPhoneDigits(phone)

  return digits.length === 10
}

/**
 * Auto-detect and format Brazilian phone number
 * Handles: +5511998765432, 5511998765432, 11998765432, (11) 99876-5432, 1134567890
 * Returns: (11) 99876-5432 for mobile, (11) 3456-7890 for landline
 */
export function formatBrazilPhone(phone: string): string {
  if (!phone) return ""

  let digits = getPhoneDigits(phone)

  if (!digits) return ""

  // Remove leading 0 (domestic trunk prefix)
  if (digits.startsWith("0") && digits.length > 10) {
    digits = digits.slice(1)
  }

  // Remove country code 55
  if (digits.startsWith("55") && (digits.length === 13 || digits.length === 12)) {
    digits = digits.slice(2)
  }

  // Mobile: 11 digits with 9 in 3rd position
  if (digits.length === 11 && digits[2] === "9") {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  }

  // Landline: 10 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
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
