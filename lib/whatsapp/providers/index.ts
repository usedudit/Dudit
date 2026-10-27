import "server-only"

import { decrypt } from "@/lib/cryptoService"
import { decryptWhatsappSecret } from "@/lib/whatsapp/secrets"
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
        webhookVerifyToken: decryptWhatsappSecret(connection.webhook_verify_token),
        webhookSecret: decryptWhatsappSecret(connection.webhook_secret),
      })
    }

    case "evolution": {
      const envApiUrl = process.env.EVOLUTION_API_URL?.trim()
      const envApiKey = process.env.EVOLUTION_API_KEY?.trim()

      const apiUrl = connection.api_url || envApiUrl
      const apiKeyEncrypted = connection.api_key_encrypted

      if (!apiUrl) {
        throw new Error("URL da Evolution API não configurada (nem no banco, nem em EVOLUTION_API_URL)")
      }
      if (!connection.instance_name) {
        throw new Error("Nome da instância Evolution não configurado")
      }

      // Use encrypted key from DB if available, otherwise fall back to env var
      const apiKey = apiKeyEncrypted
        ? decrypt(apiKeyEncrypted, "whatsapp")
        : envApiKey

      if (!apiKey) {
        throw new Error("API Key da Evolution não configurada (nem no banco, nem em EVOLUTION_API_KEY)")
      }

      return createEvolutionWhatsappProvider({
        apiUrl,
        apiKey,
        instanceName: connection.instance_name,
        webhookSecret: decryptWhatsappSecret(connection.evolution_webhook_secret),
      })
    }

    case "twilio":
      throw new Error(`Provedor ${connection.provider} ainda não implementado`)
    default:
      throw new Error(`Provedor desconhecido: ${connection.provider}`)
  }
}

