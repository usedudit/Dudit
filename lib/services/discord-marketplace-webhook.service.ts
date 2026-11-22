import "server-only"

// ============================================================================
// Discord Webhook - Marketplace & Moderação
// Canal: DISCORD_MODERATION_WEBHOOK_URL
// ============================================================================

const MODERATION_URL = () => process.env.DISCORD_MODERATION_WEBHOOK_URL
const GENERAL_URL = () => process.env.DISCORD_GENERAL_WEBHOOK_URL

const DISCORD_VALID_PREFIX = "https://discord.com/api/webhooks/"

const SITE_BASE_URL = () => process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"

function maskEmail(email: string | null | undefined): string {
  if (!email) return "N/A"
  const [local, domain] = email.split("@")
  if (!domain) return email
  const masked = local.length > 2 ? local[0] + "***" + local[local.length - 1] : local
  return `${masked}@${domain}`
}

function maskId(id: string | null | undefined): string {
  if (!id) return "N/A"
  if (id.length <= 4) return id
  return "***" + id.slice(-4)
}

function truncate(text: string, maxLen = 1020): string {
  return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text
}

function formatDateTime(date?: string | Date | null): string {
  if (!date) return "N/A"
  return new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

function isValidUrl(url: string | undefined | null): url is string {
  return !!url && url.startsWith(DISCORD_VALID_PREFIX)
}

async function postToDiscord(
  webhookUrl: string,
  body: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })

    if (response.ok) {
      return { success: true }
    }

    const errorText = await response.text().catch(() => "unknown")
    console.error(`[discord-webhook] Failed ${response.status}:`, errorText.slice(0, 300))
    return { success: false, error: `Status ${response.status}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error(`[discord-webhook] Exception:`, msg)
    return { success: false, error: msg }
  }
}

// --- Imagem Marcada (Moderação) ---

export async function sendModerationImageFlagged(payload: {
  imageUrl: string
  imageHash?: string
  categories: string[]
  confidence: number
  riskLevel: "medium" | "high"
  entityType?: string
  entityId?: string
  partnerId?: string
  userId?: string
}): Promise<{ success: boolean; error?: string }> {
  const url = MODERATION_URL()
  if (!isValidUrl(url)) return { success: true }

  const riskEmoji = payload.riskLevel === "high" ? "🚨" : "⚠️"
  const riskLabel = payload.riskLevel === "high" ? "ALTO" : "MÉDIO"
  const riskColor = payload.riskLevel === "high" ? 0xef4444 : 0xf59e0b

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Nível de Risco", value: `${riskEmoji} **${riskLabel}** (${payload.confidence}%)`, inline: true },
    { name: "Categorias", value: payload.categories.length > 0 ? payload.categories.join(", ") : "N/A", inline: true },
  ]

  if (payload.entityType) {
    const typeLabels: Record<string, string> = { product: "Produto", service: "Serviço", review: "Avaliação", community_video: "Vídeo" }
    fields.push({ name: "📌 Entidade", value: `${typeLabels[payload.entityType] || payload.entityType}: ${maskId(payload.entityId)}`, inline: false })
  }

  if (payload.partnerId) {
    fields.push({ name: "🏢 Parceiro", value: maskId(payload.partnerId), inline: true })
  }

  return postToDiscord(url, {
    username: "Dudit Moderação",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: `${riskEmoji} Imagem Marcada na Moderação`,
      color: riskColor,
      fields,
      footer: { text: `Hash: ${payload.imageHash?.slice(0, 16) || "N/A"} • ${formatDateTime()}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Texto Marcado (Re-checagem em background) ---

export async function sendModerationTextFlagged(payload: {
  entityType: string
  entityId: string
  partnerId?: string
  reason?: string
  categories?: string[]
}): Promise<{ success: boolean; error?: string }> {
  const url = MODERATION_URL()
  if (!isValidUrl(url)) return { success: true }

  const typeLabels: Record<string, string> = {
    product: "Produto",
    service: "Serviço",
    review: "Avaliação",
    community_video: "Vídeo da comunidade",
  }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    {
      name: "📌 Entidade",
      value: `${typeLabels[payload.entityType] || payload.entityType}: ${maskId(payload.entityId)}`,
      inline: true,
    },
  ]

  if (payload.partnerId) {
    fields.push({ name: "🏢 Parceiro", value: maskId(payload.partnerId), inline: true })
  }
  if (payload.categories?.length) {
    fields.push({ name: "Categorias", value: payload.categories.join(", "), inline: false })
  }
  if (payload.reason) {
    fields.push({ name: "Motivo", value: truncate(payload.reason), inline: false })
  }

  return postToDiscord(url, {
    username: "Dudit Moderação",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "🚨 Conteúdo reprovado na re-checagem",
      color: 0xef4444,
      description: "O item tinha sido publicado porque a IA estourou o timeout. A re-checagem em background reprovou e ele foi removido do marketplace.",
      fields,
      footer: { text: formatDateTime() },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Denúncia Criada ---

export async function sendMarketplaceReport(payload: {
  returnRequestId: string
  reasonCode: string
  reasonLabel: string
  description?: string | null
  userId: string
  userEmail?: string
  userName?: string
  partnerId?: string | null
  partnerName?: string | null
  partnerUrl?: string | null
  storeName?: string
  orderNumber?: string
  createdAt?: string
}): Promise<{ success: boolean; error?: string }> {
  const url = MODERATION_URL()
  if (!isValidUrl(url)) return { success: true }

  const severityMap: Record<string, { emoji: string; color: number }> = {
    scam_or_fraud: { emoji: "🚨", color: 0xef4444 },
    illegal_or_dangerous: { emoji: "🚨", color: 0xef4444 },
    counterfeit: { emoji: "🚨", color: 0xef4444 },
    harassment_or_hate: { emoji: "🚨", color: 0xef4444 },
    return_sla_violation: { emoji: "⏰", color: 0xef4444 },
    return_denied_unfairly: { emoji: "⚖️", color: 0xf97316 },
    seller_abuse: { emoji: "⚠️", color: 0xf97316 },
  }
  const severity = severityMap[payload.reasonCode] || { emoji: "📌", color: 0x6b7280 }

  const reporterValue = payload.userName
    ? `${payload.userName} (${payload.userEmail || "N/A"})`
    : payload.userEmail || "N/A"

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "📋 Motivo", value: `${severity.emoji} **${payload.reasonLabel}**`, inline: false },
    { name: "👤 Denunciante", value: truncate(reporterValue, 100), inline: true },
  ]

  if (payload.orderNumber) fields.push({ name: "📦 Pedido", value: payload.orderNumber, inline: true })
  if (payload.partnerName) {
    const partnerDisplay = payload.partnerUrl
      ? `[${payload.partnerName}](${payload.partnerUrl.startsWith("http") ? payload.partnerUrl : SITE_BASE_URL() + payload.partnerUrl})`
      : payload.partnerName
    fields.push({ name: "🏢 Parceiro Denunciado", value: `${partnerDisplay}${payload.partnerId ? ` (ID: ${payload.partnerId})` : ""}`, inline: false })
  }
  if (payload.storeName) fields.push({ name: "🏪 Loja", value: payload.storeName, inline: false })
  if (payload.description) fields.push({ name: "📝 Descrição", value: truncate(payload.description), inline: false })

  return postToDiscord(url, {
    username: "Dudit Moderação",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "🚨 Nova Denúncia no Marketplace",
      color: severity.color,
      fields,
      footer: { text: `Request: ${payload.returnRequestId} • ${formatDateTime(payload.createdAt)}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Review Suspeita ---

export async function sendSuspiciousReview(payload: {
  reviewId?: string
  userId: string
  userEmail?: string
  userName?: string
  productId?: string | null
  productName?: string
  serviceId?: string | null
  serviceName?: string
  partnerId?: string
  partnerName?: string | null
  reason: string
  rating?: number
  comment?: string | null
  productUrl?: string | null
  serviceUrl?: string | null
  partnerUrl?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const url = MODERATION_URL()
  if (!isValidUrl(url)) return { success: true }

  const entityName = payload.productName || payload.serviceName || "N/A"
  const entityType = payload.productId ? "Produto" : "Serviço"

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "⚠️ Motivo", value: truncate(payload.reason), inline: false },
    { name: "👤 Usuário", value: payload.userName ? `${payload.userName} (${payload.userEmail || "N/A"})` : payload.userEmail || "N/A", inline: true },
    { name: `📌 ${entityType}`, value: truncate(entityName, 100), inline: true },
  ]

  if (payload.rating) fields.push({ name: "⭐ Nota", value: `${payload.rating}/5`, inline: true })
  if (payload.comment) fields.push({ name: "💬 Comentário da Avaliação", value: truncate(payload.comment, 1000), inline: false })
  if (payload.partnerName) fields.push({ name: "🏢 Vendedor", value: `${payload.partnerName}${payload.partnerId ? ` (ID: ${payload.partnerId})` : ""}`, inline: true })

  const entityLink = payload.productUrl || payload.serviceUrl
  if (entityLink) {
    fields.push({ name: "🔗 Link", value: `[Clique aqui](${entityLink.startsWith("http") ? entityLink : SITE_BASE_URL() + entityLink})`, inline: true })
  }

  const footerParts = []
  if (payload.reviewId) footerParts.push(`Review ID: ${payload.reviewId}`)
  footerParts.push(formatDateTime())

  return postToDiscord(url, {
    username: "Dudit Moderação",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "🚩 Review Suspeita Detectada",
      color: 0xf97316,
      fields,
      footer: { text: footerParts.join(" • ") },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Conteúdo Reportado (Produto/Serviço/Vendedor/Avaliação) ---

export async function sendContentReported(payload: {
  entityType: string
  entityId: string
  entityName: string
  reasonCode: string
  reasonLabel: string
  reporterUserId: string
  reporterEmail?: string
  reporterName?: string
  description?: string | null
  entityUrl?: string | null
  partnerId?: string | null
  partnerName?: string | null
  partnerUrl?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const url = MODERATION_URL()
  if (!isValidUrl(url)) return { success: true }

  const typeLabels: Record<string, string> = {
    product: "Produto",
    service: "Serviço",
    partner: "Vendedor",
    review: "Avaliação",
    recurring_plan: "Assinatura",
    community_video: "Vídeo da comunidade",
  }

  const severityMap: Record<string, { emoji: string; color: number }> = {
    scam_or_fraud: { emoji: "🚨", color: 0xef4444 },
    illegal_or_dangerous: { emoji: "🚨", color: 0xef4444 },
    counterfeit: { emoji: "🚨", color: 0xef4444 },
    harassment_or_hate: { emoji: "🚨", color: 0xef4444 },
    copyright_violation: { emoji: "©️", color: 0xf59e0b },
    inappropriate_content: { emoji: "🚫", color: 0xf59e0b },
    fake_listing: { emoji: "📋", color: 0xf59e0b },
    spam_or_misleading: { emoji: "📢", color: 0x6b7280 },
  }
  const severity = severityMap[payload.reasonCode] || { emoji: "📌", color: 0x6b7280 }

  const reporterValue = payload.reporterName
    ? `${payload.reporterName} (${payload.reporterEmail || "N/A"})`
    : payload.reporterEmail || "N/A"

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "📋 Motivo", value: `${severity.emoji} **${payload.reasonLabel}**`, inline: false },
    { name: "📌 Tipo", value: typeLabels[payload.entityType] || payload.entityType, inline: true },
    { name: "👤 Denunciante", value: truncate(reporterValue, 100), inline: true },
  ]

  if (payload.entityName) {
    const fieldName = payload.entityType === "review" ? "💬 Comentário da Avaliação" : "🎯 Item Reportado"
    fields.push({ name: fieldName, value: truncate(payload.entityName, 100), inline: false })
  }

  if (payload.description) {
    fields.push({ name: "📝 Descrição da Denúncia", value: truncate(payload.description, 1000), inline: false })
  }

  if (payload.entityUrl) {
    fields.push({ name: "🔗 Link do Item", value: `[Clique aqui](${payload.entityUrl.startsWith("http") ? payload.entityUrl : SITE_BASE_URL() + payload.entityUrl})`, inline: false })
  }

  if (payload.partnerName) {
    const partnerDisplay = payload.partnerUrl
      ? `[${payload.partnerName}](${payload.partnerUrl.startsWith("http") ? payload.partnerUrl : SITE_BASE_URL() + payload.partnerUrl})`
      : payload.partnerName
    fields.push({ name: "🏢 Vendedor", value: `${partnerDisplay}${payload.partnerId ? ` (ID: ${payload.partnerId})` : ""}`, inline: false })
  }

  return postToDiscord(url, {
    username: "Dudit Moderação",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: `${severity.emoji} ${typeLabels[payload.entityType] || "Item"} Reportado`,
      color: severity.color,
      fields,
      footer: { text: `ID: ${payload.entityId} • ${formatDateTime()}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Vendedor com Risk Score Alto ---

export async function sendHighRiskSeller(payload: {
  partnerId: string
  partnerName?: string
  storeName?: string
  riskScore: number
  triggerReason: string
}): Promise<{ success: boolean; error?: string }> {
  const url = MODERATION_URL()
  if (!isValidUrl(url)) return { success: true }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "⚠️ Risk Score", value: `**${payload.riskScore}/100**`, inline: true },
    { name: "📊 Motivo do Trigger", value: truncate(payload.triggerReason), inline: false },
  ]

  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.storeName) fields.push({ name: "🏪 Loja", value: payload.storeName, inline: true })

  return postToDiscord(url, {
    username: "Dudit Moderação",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "🚨 Vendedor com Risk Score Alto",
      color: 0xef4444,
      fields,
      footer: { text: `ID: ${maskId(payload.partnerId)} • ${formatDateTime()}` },
      timestamp: new Date().toISOString(),
    }],
  })
}
