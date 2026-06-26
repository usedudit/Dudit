import "server-only"

import { decrypt } from "@/lib/cryptoService"
import type { PartnerWhatsappConnection, WhatsappProviderId } from "../types"
import { createMetaWhatsappProvider } from "./meta"
import { createEvolutionWhatsappProvider } from "./evolution"
import type { WhatsappProvider } from "./base"

export function createWhatsappProviderFromConnection(
  connection: PartnerWhatsappConnection,
): WhatsappProvider {
  switch (connection.provider as WhatsappProviderId) {
    case "meta": {
      if (!connection.access_token_encrypted) {
        throw new Error("Token de acesso WhatsApp não configurado")
      }
      const accessToken = decrypt(connection.access_token_encrypted, "whatsapp")
      if (!connection.phone_number_id) {
        throw new Error("Phone Number ID não configurado")
      }
      return createMetaWhatsappProvider({
        accessToken,
        phoneNumberId: connection.phone_number_id,
        webhookVerifyToken: connection.webhook_verify_token,
        webhookSecret: connection.webhook_secret,
      })
    }

    case "evolution": {
      if (!connection.api_key_encrypted) {
        throw new Error("API Key da Evolution não configurada")
      }
      if (!connection.api_url) {
        throw new Error("URL da Evolution API não configurada")
      }
      if (!connection.instance_name) {
        throw new Error("Nome da instância Evolution não configurado")
      }
      const apiKey = decrypt(connection.api_key_encrypted, "whatsapp")
      return createEvolutionWhatsappProvider({
        apiUrl: connection.api_url,
        apiKey,
        instanceName: connection.instance_name,
        webhookSecret: connection.evolution_webhook_secret,
      })
    }

    case "twilio":
      throw new Error(`Provedor ${connection.provider} ainda não implementado`)
    default:
      throw new Error(`Provedor desconhecido: ${connection.provider}`)
  }
}

