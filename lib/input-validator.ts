// Using regex-based sanitization instead, which is sufficient for our needs

function stripHtml(input: string): string {
  // Remove HTML tags
  let cleaned = input.replace(/<[^>]*>/g, "")

  // Decode common HTML entities
  cleaned = cleaned
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")

  // Remove any remaining HTML entities
  cleaned = cleaned.replace(/&[#a-z0-9]+;/gi, "")

  return cleaned
}

function sanitizeHtmlContent(input: string, allowedTags: string[] = []): string {
  if (allowedTags.length === 0) {
    return stripHtml(input)
  }

  // For allowed tags, we keep them but sanitize attributes
  const tagPattern = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi

  return input.replace(tagPattern, (match, tagName) => {
    if (allowedTags.includes(tagName.toLowerCase())) {
      // Keep safe tags, remove potentially dangerous attributes
      return match.replace(/\s(on\w+|javascript:|data:)/gi, "")
    }
    return "" // Remove disallowed tags
  })
}

export function sanitizeInput(input: string, maxLength = 500): string {
  if (!input || typeof input !== "string") return ""

  // Remove potentially dangerous characters
  const trimmed = input.trim().substring(0, maxLength)

  // Strip all HTML tags and entities
  return stripHtml(trimmed)
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email) && email.length <= 255
}

export function validateCPF(cpf: string): boolean {
  const cleanCPF = cpf.replace(/\D/g, "")

  if (cleanCPF.length !== 11) return false

  // Reject known invalid patterns
  if (/^(\d)\1{10}$/.test(cleanCPF)) return false

  // Validate first check digit
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number.parseInt(cleanCPF.charAt(i)) * (10 - i)
  }
  let checkDigit = 11 - (sum % 11)
  if (checkDigit >= 10) checkDigit = 0
  if (checkDigit !== Number.parseInt(cleanCPF.charAt(9))) return false

  // Validate second check digit
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += Number.parseInt(cleanCPF.charAt(i)) * (11 - i)
  }
  checkDigit = 11 - (sum % 11)
  if (checkDigit >= 10) checkDigit = 0
  if (checkDigit !== Number.parseInt(cleanCPF.charAt(10))) return false

  return true
}

export function validateCNPJ(cnpj: string): boolean {
  const cleanCNPJ = cnpj.replace(/\D/g, "")

  if (cleanCNPJ.length !== 14) return false

  // Reject known invalid patterns
  if (/^(\d)\1{13}$/.test(cleanCNPJ)) return false

  // Validate first check digit
  let sum = 0
  let weight = 5
  for (let i = 0; i < 12; i++) {
    sum += Number.parseInt(cleanCNPJ.charAt(i)) * weight
    weight = weight === 2 ? 9 : weight - 1
  }
  let checkDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (checkDigit !== Number.parseInt(cleanCNPJ.charAt(12))) return false

  // Validate second check digit
  sum = 0
  weight = 6
  for (let i = 0; i < 13; i++) {
    sum += Number.parseInt(cleanCNPJ.charAt(i)) * weight
    weight = weight === 2 ? 9 : weight - 1
  }
  checkDigit = sum % 11 < 2 ? 0 : 11 - (sum % 11)
  if (checkDigit !== Number.parseInt(cleanCNPJ.charAt(13))) return false

  return true
}

export function sanitizeObject(obj: any, allowedKeys: string[]): any {
  const sanitized: any = {}

  for (const key of allowedKeys) {
    if (key in obj) {
      if (typeof obj[key] === "string") {
        sanitized[key] = sanitizeInput(obj[key])
      } else {
        sanitized[key] = obj[key]
      }
    }
  }

  return sanitized
}

export function sanitizeHTML(input: string, maxLength = 10000): string {
  if (!input || typeof input !== "string") return ""

  const trimmed = input.trim().substring(0, maxLength)

  // Allow only safe HTML tags for rich text editing
  const allowedTags = ["p", "br", "strong", "em", "u", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "a"]
  return sanitizeHtmlContent(trimmed, allowedTags)
}

export function validateURL(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ["http:", "https:"].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function validatePhoneBR(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, "")
  return /^[1-9]{2}9?[0-9]{8}$/.test(cleanPhone)
}
