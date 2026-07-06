/**
 * Shared utility for generating static Pix BR Code payload according to BACEN standards.
 */
export function formatPixKey(key: string, type?: string | null): string {
  const trimmed = key.trim()

  // If the type is email or contains '@'
  if (type === "email" || trimmed.includes("@")) {
    return trimmed.toLowerCase()
  }

  // If type is random/EVP or looks like a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (type === "random" || uuidRegex.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  // Clean all non-digits
  const digits = trimmed.replace(/\D/g, "")

  // Validate phone patterns if no explicit type is provided
  // In Brazil, DDD is 2 digits (11-99), cell phones have 11 digits starting with 9, landlines have 10 digits.
  const isCellPhone = digits.length === 11 && /^[1-9]{2}9\d{8}$/.test(digits)
  const isLandline = digits.length === 10 && /^[1-9]{2}[2-8]\d{7}$/.test(digits)
  const isPhone = isCellPhone || isLandline

  // If phone number
  if (type === "phone" || (isPhone && !type)) {
    // If it already has the country code (55) at the beginning
    if (digits.length >= 12 && digits.startsWith("55")) {
      return `+${digits}`
    }
    // If it doesn't have country code (e.g., DDD + Number like 11999999999 or 1188888888)
    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`
    }
  }

  // For CPF (11 digits) or CNPJ (14 digits), or any other numeric key
  return digits
}

function getByteLength(str: string): number {
  return new TextEncoder().encode(str).length
}

function formatEMVTag(id: string, value: string): string {
  const lenStr = String(getByteLength(value)).padStart(2, "0")
  return `${id}${lenStr}${value}`
}

export function generateStaticPix(
  key: string,
  amount: number,
  merchantName: string,
  city: string,
  txId = "DUDIT",
  keyType?: string | null
): string {
  const cleanKey = formatPixKey(key, keyType)

  const cleanName = merchantName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .substring(0, 25)
    .trim()

  const cleanCity = (city || "SAO PAULO")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .substring(0, 15)
    .trim()

  let cleanTxId = (txId || "***").trim()
  if (cleanTxId !== "***") {
    cleanTxId = cleanTxId
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "") // No spaces in TXID
      .substring(0, 25)

    if (!cleanTxId) {
      cleanTxId = "***"
    }
  }

  // Build Merchant Account Info (ID 26)
  const guiTag = formatEMVTag("00", "br.gov.bcb.pix")
  const keyTag = formatEMVTag("01", cleanKey)
  const merchantAccountInfo = formatEMVTag("26", guiTag + keyTag)

  // Build Additional Data (ID 62)
  const txIdTag = formatEMVTag("05", cleanTxId)
  const additionalData = formatEMVTag("62", txIdTag)

  // Build main parts
  let payload = ""
  payload += formatEMVTag("00", "01") // Payload Format Indicator
  payload += merchantAccountInfo      // Merchant Account Info
  payload += formatEMVTag("52", "0000") // Merchant Category Code
  payload += formatEMVTag("53", "986")  // Transaction Currency
  
  if (amount > 0) {
    payload += formatEMVTag("54", amount.toFixed(2)) // Transaction Amount
  }
  
  payload += formatEMVTag("58", "BR")   // Country Code
  payload += formatEMVTag("59", cleanName) // Merchant Name
  payload += formatEMVTag("60", cleanCity) // Merchant City
  payload += additionalData             // Additional Data

  payload += "6304" // CRC16 indicator

  // Calculate CRC16 CCITT (False)
  let crc = 0xFFFF
  for (let i = 0; i < payload.length; i++) {
    const charCode = payload.charCodeAt(i)
    crc ^= (charCode << 8)
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF
      } else {
        crc = (crc << 1) & 0xFFFF
      }
    }
  }

  const crcString = crc.toString(16).toUpperCase().padStart(4, "0")
  return payload + crcString
}
