import "server-only"

import { decrypt } from "@/lib/cryptoService"

/** Reads encrypted values while tolerating existing plaintext rows during rollout. */
export function decryptWhatsappSecret(value: string | null | undefined): string | null {
  if (!value) return null
  return /^v\d+:/.test(value) ? decrypt(value, "whatsapp") : value
}
