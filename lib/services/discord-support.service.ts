import "server-only"

export type SupportCategory =
  | "duvida"
  | "bug"
  | "sugestao"
  | "problema-conta"
  | "problema-pedido"
  | "cobranca-plano"
  | "outro"

export interface DiscordSupportPayload {
  ticketId: string
  email: string
  category: SupportCategory
  description: string
  pageUrl?: string | null
  userId?: string | null
  userName?: string | null
  partnerId?: string | null
  partnerName?: string | null
  metadata?: {
    browser?: string
    screen?: string
    app_area?: string
    partner_plan?: string
    user_role?: string
    [key: string]: unknown
  }
  createdAt?: string | Date
}

const CATEGORY_CONFIG: Record<SupportCategory, { label: string; emoji: string; color: number }> = {
  duvida: { label: "Dúvida", emoji: "❓", color: 0x3b82f6 },
  bug: { label: "Bug / Problema Técnico", emoji: "🐛", color: 0xef4444 },
  sugestao: { label: "Sugestão", emoji: "💡", color: 0xf59e0b },
  "problema-conta": { label: "Problema com Conta", emoji: "👤", color: 0xf97316 },
  "problema-pedido": { label: "Problema com Pedido", emoji: "📦", color: 0x8b5cf6 },
  "cobranca-plano": { label: "Cobrança / Plano", emoji: "💳", color: 0x06b6d4 },
  outro: { label: "Outro", emoji: "📌", color: 0x6b7280 },
}

/**
 * Generates a ticket ID in the format #DUD-YYYYMMDD-XXXX
 */
export function generateTicketId(): string {
  const now = new Date()
  const date = now
    .toISOString()
    .slice(0, 10)
    .replace(/-/g, "")
  const random = Math.floor(1000 + Math.random() * 9000)
  return `#DUD-${date}-${random}`
}

/**
 * Sends a structured support ticket notification to Discord via Webhook.
 */
export async function sendDiscordSupportNotification(
  payload: DiscordSupportPayload
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.DISCORD_SUPPORT_WEBHOOK_URL

  if (!webhookUrl || !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[discord-support] DISCORD_SUPPORT_WEBHOOK_URL not configured. Skipping webhook.")
    }
    return { success: true }
  }

  try {
    const config = CATEGORY_CONFIG[payload.category] || CATEGORY_CONFIG.outro

    const tz = payload.partnerId
      ? await import("@/lib/date").then(m => m.getPartnerTimezone(payload.partnerId!)).catch(() => "America/Sao_Paulo")
      : "America/Sao_Paulo"
    const formattedDate = new Date(payload.createdAt || Date.now()).toLocaleString("pt-BR", {
      timeZone: tz,
    })

    const fields: Array<{ name: string; value: string; inline?: boolean }> = []

    fields.push({
      name: "📋 Categoria",
      value: `${config.emoji} **${config.label}**`,
      inline: false,
    })

    fields.push({
      name: "📧 E-mail de Contato",
      value: payload.email,
      inline: true,
    })

    if (payload.userId || payload.userName) {
      const userDisplay = payload.userName
        ? `${payload.userName} (${payload.userId || "N/A"})`
        : payload.userId || "N/A"
      fields.push({
        name: "👤 Usuário",
        value: userDisplay,
        inline: true,
      })
    }

    if (payload.partnerName || payload.partnerId) {
      fields.push({
        name: "🏢 Parceiro / Loja",
        value: payload.partnerName
          ? `${payload.partnerName} (${payload.partnerId})`
          : payload.partnerId || "N/A",
        inline: true,
      })
    }

    const contextItems: string[] = []
    if (payload.metadata?.app_area) contextItems.push(`**Área:** ${payload.metadata.app_area}`)
    if (payload.metadata?.partner_plan) contextItems.push(`**Plano:** ${payload.metadata.partner_plan}`)
    if (payload.metadata?.user_role) contextItems.push(`**Role:** ${payload.metadata.user_role}`)

    if (contextItems.length > 0) {
      fields.push({
        name: "📍 Contexto",
        value: contextItems.join("  |  "),
        inline: false,
      })
    }

    const deviceItems: string[] = []
    if (payload.metadata?.browser) deviceItems.push(`**Browser:** ${payload.metadata.browser}`)
    if (payload.metadata?.screen) deviceItems.push(`**Tela:** ${payload.metadata.screen}`)

    if (deviceItems.length > 0) {
      fields.push({
        name: "💻 Dispositivo",
        value: deviceItems.join("  |  "),
        inline: false,
      })
    }

    if (payload.pageUrl) {
      fields.push({
        name: "🔗 Página",
        value:
          payload.pageUrl.length > 200 ? payload.pageUrl.slice(0, 197) + "..." : payload.pageUrl,
        inline: false,
      })
    }

    const trimmedDescription = payload.description.trim().slice(0, 1020)
    fields.push({
      name: "📝 Descrição",
      value: trimmedDescription || "*(Sem descrição)*",
      inline: false,
    })

    const body = {
      username: "Dudit Suporte Bot",
      avatar_url: "https://dudit.com.br/icon-192x192.png",
      embeds: [
        {
          title: `${config.emoji} Novo Ticket de Suporte: ${payload.ticketId}`,
          color: config.color,
          fields,
          footer: {
            text: `Ticket: ${payload.ticketId} • Data: ${formattedDate}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown")
      console.error(`[discord-support] Webhook failed with status ${response.status}: ${errorText}`)
      return { success: false, error: `Status ${response.status}` }
    }

    return { success: true }
  } catch (err) {
    console.error("[discord-support] Failed to send Discord webhook:", err instanceof Error ? err.message : err)
    return { success: false, error: err instanceof Error ? err.message : "Webhook send error" }
  }
}
