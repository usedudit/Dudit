import "server-only"

export interface DiscordFeedbackPayload {
  id: string
  type: "onboarding" | "help_article" | "general" | "bug"
  sentiment?: "positive" | "neutral" | "negative" | null
  message: string
  pageUrl?: string | null
  userEmail?: string | null
  userName?: string | null
  userId: string
  partnerName?: string | null
  partnerId?: string | null
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

const TYPE_CONFIG = {
  bug: {
    label: "Problema / Bug",
    emoji: "🐛",
    color: 0xef4444, // Red
  },
  onboarding: {
    label: "Onboarding ERP (7 dias)",
    emoji: "🚀",
    color: 0x8b5cf6, // Purple
  },
  help_article: {
    label: "Central de Ajuda",
    emoji: "📖",
    color: 0xf59e0b, // Amber
  },
  general: {
    label: "Feedback Geral",
    emoji: "💬",
    color: 0x10b981, // Emerald Green
  },
} as const

const SENTIMENT_CONFIG = {
  positive: { emoji: "🙂", label: "Positivo" },
  neutral: { emoji: "😐", label: "Neutro / Dificuldades" },
  negative: { emoji: "🙁", label: "Negativo / Problemas" },
} as const

/**
 * Sends a structured, sanitized notification to Discord via Webhook.
 * Safe server-side execution: errors are caught and logged without disrupting DB operations.
 */
export async function sendDiscordFeedbackNotification(
  payload: DiscordFeedbackPayload
): Promise<{ success: boolean; error?: string }> {
  const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK_URL

  if (!webhookUrl || !webhookUrl.startsWith("https://discord.com/api/webhooks/")) {
    // If webhook is not configured, silently return (or log in dev)
    if (process.env.NODE_ENV !== "production") {
      console.info("[discord-feedback] DISCORD_FEEDBACK_WEBHOOK_URL not configured. Skipping webhook.")
    }
    return { success: true }
  }

  try {
    const config = TYPE_CONFIG[payload.type] || TYPE_CONFIG.general
    const sentimentInfo = payload.sentiment ? SENTIMENT_CONFIG[payload.sentiment] : null

    const tz = payload.partnerId
      ? await import("@/lib/date/server").then(m => m.getPartnerTimezone(payload.partnerId!)).catch(() => "America/Sao_Paulo")
      : "America/Sao_Paulo"
    const formattedDate = new Date(payload.createdAt || Date.now()).toLocaleString("pt-BR", {
      timeZone: tz,
    })

    const fields: Array<{ name: string; value: string; inline?: boolean }> = []

    // 1. Tipo & Sentimento
    const typeAndSentiment = [
      `${config.emoji} **${config.label}**`,
      sentimentInfo ? `${sentimentInfo.emoji} ${sentimentInfo.label}` : null,
    ]
      .filter(Boolean)
      .join("  |  ")

    fields.push({
      name: "Categoria",
      value: typeAndSentiment,
      inline: false,
    })

    // 2. Usuário
    const userDisplay = payload.userName
      ? `${payload.userName} (${payload.userEmail || payload.userId})`
      : payload.userEmail || payload.userId

    fields.push({
      name: "👤 Usuário",
      value: userDisplay,
      inline: true,
    })

    // 3. Parceiro (se houver)
    if (payload.partnerName || payload.partnerId) {
      fields.push({
        name: "🏢 Parceiro / Loja",
        value: payload.partnerName ? `${payload.partnerName} (${payload.partnerId})` : payload.partnerId || "N/A",
        inline: true,
      })
    }

    // 4. Contexto do App (área, plano, role)
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

    // 5. Dispositivo / Ambiente
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

    // 6. Página URL
    if (payload.pageUrl) {
      fields.push({
        name: "🔗 Página",
        value: payload.pageUrl.length > 200 ? payload.pageUrl.slice(0, 197) + "..." : payload.pageUrl,
        inline: false,
      })
    }

    // 7. Mensagem (sanitizada e truncada a 1024 caracteres para caber no embed field do Discord)
    const trimmedMessage = payload.message.trim().slice(0, 1020)
    fields.push({
      name: "📝 Mensagem",
      value: trimmedMessage || "*(Sem mensagem de texto)*",
      inline: false,
    })

    const body = {
      username: "Dudit Feedback Bot",
      avatar_url: "https://dudit.com.br/icon-192x192.png",
      embeds: [
        {
          title: `${config.emoji} Novo Feedback Recebido: ${config.label}`,
          color: config.color,
          fields,
          footer: {
            text: `ID: ${payload.id} • Data: ${formattedDate}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    }

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000), // 5 seconds timeout
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown")
      console.error(`[discord-feedback] Webhook failed with status ${response.status}: ${errorText}`)
      return { success: false, error: `Status ${response.status}` }
    }

    return { success: true }
  } catch (err) {
    console.error("[discord-feedback] Failed to send Discord webhook:", err instanceof Error ? err.message : err)
    return { success: false, error: err instanceof Error ? err.message : "Webhook send error" }
  }
}
