import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

const TOKEN_TTL_SECONDS = 30 * 60

function getSecret(): string | null {
  return process.env.CHECKOUT_FULFILLMENT_SECRET?.trim() || process.env.MP_WEBHOOK_SECRET?.trim() || null
}

function signatureFor(subscriptionId: string, expiresAt: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`${subscriptionId}.${expiresAt}`)
    .digest("base64url")
}

export function createCheckoutFulfillmentToken(subscriptionId: string): string | null {
  const secret = getSecret()
  if (!secret || !subscriptionId) return null

  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  return `${expiresAt}.${signatureFor(subscriptionId, expiresAt, secret)}`
}

export function verifyCheckoutFulfillmentToken(subscriptionId: string, token: string): boolean {
  const secret = getSecret()
  if (!secret || !subscriptionId || !token || token.length > 256) return false

  const separator = token.indexOf(".")
  if (separator <= 0 || separator === token.length - 1) return false

  const expiresAt = Number(token.slice(0, separator))
  const receivedSignature = token.slice(separator + 1)
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false

  const expectedSignature = signatureFor(subscriptionId, expiresAt, secret)
  const received = Buffer.from(receivedSignature)
  const expected = Buffer.from(expectedSignature)
  return received.length === expected.length && timingSafeEqual(received, expected)
}
