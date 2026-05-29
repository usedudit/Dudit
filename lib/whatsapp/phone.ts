/**
 * Normalizes Brazilian phone numbers to E.164 (digits only, with country code 55).
 */
export function normalizePhoneToE164(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, "")
  if (!digits) return null
  if (digits.startsWith("0")) digits = digits.slice(1)
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`
  }
  if (digits.length < 12) return null
  return digits
}

export function formatPhoneDisplay(e164: string): string {
  const d = e164.replace(/\D/g, "")
  if (d.length < 12) return e164
  const local = d.startsWith("55") ? d.slice(2) : d
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  }
  return e164
}
