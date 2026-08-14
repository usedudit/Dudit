import "server-only"
import { createHmac, timingSafeEqual } from "crypto"

type PaymentQuote = {
  userId: string
  partnerId: string
  maxAmount: number
  expiresAt: number
}

function getSecret() {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) throw new Error("Payment quote secret is not configured")
  return secret
}

function sign(payload: string) {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url")
}

export function issuePaymentQuote(input: Omit<PaymentQuote, "expiresAt">, ttlSeconds = 600) {
  const payload = Buffer.from(JSON.stringify({
    ...input,
    maxAmount: Math.round(input.maxAmount * 100) / 100,
    expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
  })).toString("base64url")
  return `${payload}.${sign(payload)}`
}

export function verifyPaymentQuote(token: string, expected: { userId: string; partnerId: string; amount: number }) {
  try {
    const [payload, signature] = token.split(".")
    if (!payload || !signature) return { valid: false as const, error: "Cotação de pagamento inválida." }
    const expectedSignature = sign(payload)
    if (signature.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return { valid: false as const, error: "Cotação de pagamento inválida." }
    }
    const quote = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PaymentQuote
    if (quote.userId !== expected.userId || quote.partnerId !== expected.partnerId) {
      return { valid: false as const, error: "Cotação de pagamento não pertence ao contexto atual." }
    }
    if (!Number.isFinite(quote.maxAmount) || quote.maxAmount <= 0 || quote.expiresAt < Math.floor(Date.now() / 1000)) {
      return { valid: false as const, error: "Cotação de pagamento expirada." }
    }
    if (expected.amount > quote.maxAmount + 0.01) {
      return { valid: false as const, error: "O valor do pagamento excede o total autorizado." }
    }
    return { valid: true as const, quote }
  } catch {
    return { valid: false as const, error: "Cotação de pagamento inválida." }
  }
}
