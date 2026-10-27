import { createHash, randomBytes } from "crypto"

export function createRefundPublicToken(): string {
  return randomBytes(24).toString("hex")
}

export function hashRefundPublicToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex")
}

export function isRefundPublicTokenFormat(token: string): boolean {
  return /^[a-f0-9]{48}$/i.test(token)
}
