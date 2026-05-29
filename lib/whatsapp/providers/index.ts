import "server-only"

import { decrypt } from "@/lib/cryptoService"
import type { PartnerWhatsappConnection, WhatsappProviderId } from "../types"
import { createMetaWhatsappProvider } from "./meta"
import type { WhatsappProvider } from "./base"

export function createWhatsappProviderFromConnection(
  connection: PartnerWhatsappConnection,
): WhatsappProvider {
  if (!connection.access_token_encrypted) {
    throw new Error("Token de acesso WhatsApp não configurado")
  }
  const accessToken = decrypt(connection.access_token_encrypted, "whatsapp")

  switch (connection.provider as WhatsappProviderId) {
    case "meta":
      if (!connection.phone_number_id) {
        throw new Error("Phone Number ID não configurado")
      }
      return createMetaWhatsappProvider({
        accessToken,
        phoneNumberId: connection.phone_number_id,
        webhookVerifyToken: connection.webhook_verify_token,
        webhookSecret: connection.webhook_secret,
      })
    case "evolution":
    case "twilio":
      throw new Error(`Provedor ${connection.provider} ainda não implementado`)
    default:
      throw new Error(`Provedor desconhecido: ${connection.provider}`)
  }
}
