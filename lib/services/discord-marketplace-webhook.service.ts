import "server-only"

import {
  sendDiscordEmbed,
  maskEmail,
  maskId,
  truncate,
  formatDateTime,
  type DiscordEmbed,
} from "./discord-webhook.service"

// ============================================================================
// Discord Webhook - Marketplace & Moderação
// Canal: DISCORD_MODERATION_WEBHOOK_URL
// ============================================================================

// --- Imagem Marcada (Moderação) ---

export interface ImageFlaggedPayload {
  imageUrl: string
  imageHash?: string
  categories: string[]
  confidence: number
  riskLevel: "medium" | "high"
  entityType?: "product" | "service" | "review" | "community_video"
  entityId?: string
  entityName?: string
  partnerId?: string
  partnerName?: string
  storeId?: string
  storeName?: string
  userId?: string
  userEmail?: string
}

export async function sendModerationImageFlagged(
  payload: ImageFlaggedPayload
): Promise<{ success: boolean; error?: string }> {
  const riskEmoji = payload.riskLevel === "high" ? "🚨" : "⚠️"
  const riskLabel = payload.riskLevel === "high" ? "ALTO" : "MÉDIO"
  const riskColor = payload.riskLevel === "high" ? 0xef4444 : 0xf59e0b

  const fields: DiscordEmbed["fields"] = [
    {
      name: "Nível de Risco",
      value: `${riskEmoji} **${riskLabel}** (${payload.confidence}%)`,
      inline: true,
    },
    {
      name: "Categorias",
      value: payload.categories.length > 0 ? payload.categories.join(", ") : "N/A",
      inline: true,
    },
  ]

  if (payload.entityType && payload.entityId) {
    const typeLabels: Record<string, string> = {
      product: "Produto",
      service: "Serviço",
      review: "Avaliação",
      community_video: "Vídeo",
    }
    fields.push({
      name: "📌 Entidade",
      value: `${typeLabels[payload.entityType] || payload.entityType}: ${payload.entityName || maskId(payload.entityId)}`,
      inline: false,
    })
  }

  if (payload.partnerName || payload.partnerId) {
    fields.push({
      name: "🏢 Parceiro",
      value: payload.partnerName
        ? `${payload.partnerName} (${maskId(payload.partnerId)})`
        : maskId(payload.partnerId),
      inline: true,
    })
  }

  if (payload.storeName) {
    fields.push({
      name: "🏪 Loja",
      value: payload.storeName,
      inline: true,
    })
  }

  if (payload.userEmail) {
    fields.push({
      name: "👤 Usuário",
      value: maskEmail(payload.userEmail),
      inline: true,
    })
  }

  if (payload.imageUrl) {
    const shortUrl = payload.imageUrl.length > 80 ? payload.imageUrl.slice(0, 77) + "..." : payload.imageUrl
    fields.push({
      name: "🖼️ Imagem",
      value: shortUrl,
      inline: false,
    })
  }

  const embed: DiscordEmbed = {
    title: `${riskEmoji} Imagem Marcada na Moderação`,
    color: riskColor,
    fields,
    footer: { text: `Hash: ${payload.imageHash || "N/A"} • ${formatDateTime()}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("moderation", embed)
}

// --- Denúncia Criada ---

export interface ReportCreatedPayload {
  returnRequestId: string
  reasonCode: string
  reasonLabel: string
  description?: string | null
  userId: string
  userEmail?: string
  userName?: string
  partnerId?: string
  partnerName?: string
  storeName?: string
  orderNumber?: string
  createdAt?: string
}

export async function sendMarketplaceReport(
  payload: ReportCreatedPayload
): Promise<{ success: boolean; error?: string }> {
  const severityMap: Record<string, { emoji: string; color: number }> = {
    scam_or_fraud: { emoji: "🚨", color: 0xef4444 },
    illegal_or_dangerous: { emoji: "🚨", color: 0xef4444 },
    counterfeit: { emoji: "🚨", color: 0xef4444 },
    harassment_or_hate: { emoji: "🚨", color: 0xef4444 },
    return_sla_violation: { emoji: "⏰", color: 0xef4444 },
    return_denied_unfairly: { emoji: "⚖️", color: 0xf97316 },
    seller_abuse: { emoji: "⚠️", color: 0xf97316 },
    copyright_violation: { emoji: "©️", color: 0xf59e0b },
    inappropriate_content: { emoji: "🚫", color: 0xf59e0b },
    fake_listing: { emoji: "📋", color: 0xf59e0b },
    return_abuse: { emoji: "🔄", color: 0x3b82f6 },
    spam_or_misleading: { emoji: "📢", color: 0x6b7280 },
    other: { emoji: "📌", color: 0x6b7280 },
  }

  const severity = severityMap[payload.reasonCode] || severityMap.other

  const fields: DiscordEmbed["fields"] = [
    {
      name: "📋 Motivo",
      value: `${severity.emoji} **${payload.reasonLabel}**`,
      inline: false,
    },
    {
      name: "👤 Denunciante",
      value: payload.userName
        ? `${payload.userName} (${maskEmail(payload.userEmail)})`
        : maskEmail(payload.userEmail),
      inline: true,
    },
  ]

  if (payload.orderNumber) {
    fields.push({
      name: "📦 Pedido",
      value: payload.orderNumber,
      inline: true,
    })
  }

  if (payload.partnerName || payload.partnerId) {
    fields.push({
      name: "🏢 Parceiro Denunciado",
      value: payload.partnerName
        ? `${payload.partnerName} (${maskId(payload.partnerId)})`
        : maskId(payload.partnerId),
      inline: true,
    })
  }

  if (payload.storeName) {
    fields.push({
      name: "🏪 Loja",
      value: payload.storeName,
      inline: true,
    })
  }

  if (payload.description) {
    fields.push({
      name: "📝 Descrição",
      value: truncate(payload.description),
      inline: false,
    })
  }

  const embed: DiscordEmbed = {
    title: `🚨 Nova Denúncia no Marketplace`,
    color: severity.color,
    fields,
    footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("moderation", embed)
}

// --- Review Suspeita ---

export interface SuspiciousReviewPayload {
  reviewId?: string
  userId: string
  userEmail?: string
  productId?: string
  productName?: string
  serviceId?: string
  serviceName?: string
  partnerId?: string
  partnerName?: string
  reason: string
  rating?: number
  createdAt?: string
}

export async function sendSuspiciousReview(
  payload: SuspiciousReviewPayload
): Promise<{ success: boolean; error?: string }> {
  const entityName = payload.productName || payload.serviceName || "N/A"
  const entityType = payload.productId ? "Produto" : "Serviço"

  const fields: DiscordEmbed["fields"] = [
    {
      name: "⚠️ Motivo",
      value: truncate(payload.reason),
      inline: false,
    },
    {
      name: "👤 Usuário",
      value: maskEmail(payload.userEmail),
      inline: true,
    },
    {
      name: `📌 ${entityType}`,
      value: truncate(entityName, 100),
      inline: true,
    },
  ]

  if (payload.rating) {
    fields.push({
      name: "⭐ Nota",
      value: `${payload.rating}/5`,
      inline: true,
    })
  }

  if (payload.partnerName || payload.partnerId) {
    fields.push({
      name: "🏢 Parceiro",
      value: payload.partnerName
        ? `${payload.partnerName} (${maskId(payload.partnerId)})`
        : maskId(payload.partnerId),
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: "🚩 Review Suspeita Detectada",
    color: 0xf97316,
    fields,
    footer: { text: `Review: ${maskId(payload.reviewId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("moderation", embed)
}

// --- Produto/Serviço Reportado ---

export interface ContentReportedPayload {
  entityType: "product" | "service"
  entityId: string
  entityName: string
  reasonCode: string
  reasonLabel: string
  reporterUserId: string
  reporterEmail?: string
  partnerId?: string
  partnerName?: string
  storeName?: string
  createdAt?: string
}

export async function sendContentReported(
  payload: ContentReportedPayload
): Promise<{ success: boolean; error?: string }> {
  const typeLabel = payload.entityType === "product" ? "Produto" : "Serviço"

  const fields: DiscordEmbed["fields"] = [
    {
      name: "📋 Motivo",
      value: payload.reasonLabel,
      inline: false,
    },
    {
      name: `📌 ${typeLabel}`,
      value: truncate(payload.entityName, 100),
      inline: false,
    },
    {
      name: "👤 Denunciante",
      value: maskEmail(payload.reporterEmail),
      inline: true,
    },
  ]

  if (payload.partnerName || payload.partnerId) {
    fields.push({
      name: "🏢 Parceiro",
      value: payload.partnerName
        ? `${payload.partnerName} (${maskId(payload.partnerId)})`
        : maskId(payload.partnerId),
      inline: true,
    })
  }

  if (payload.storeName) {
    fields.push({
      name: "🏪 Loja",
      value: payload.storeName,
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: `📢 ${typeLabel} Reportado`,
    color: 0xf59e0b,
    fields,
    footer: { text: `ID: ${maskId(payload.entityId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("moderation", embed)
}

// --- Vendedor com Risk Score Alto ---

export interface HighRiskSellerPayload {
  partnerId: string
  partnerName?: string
  storeName?: string
  riskScore: number
  triggerReason: string
  recentReports?: number
}

export async function sendHighRiskSeller(
  payload: HighRiskSellerPayload
): Promise<{ success: boolean; error?: string }> {
  const fields: DiscordEmbed["fields"] = [
    {
      name: "⚠️ Risk Score",
      value: `**${payload.riskScore}/100**`,
      inline: true,
    },
    {
      name: "📊 Motivo do Trigger",
      value: truncate(payload.triggerReason),
      inline: false,
    },
  ]

  if (payload.partnerName) {
    fields.push({
      name: "🏢 Parceiro",
      value: `${payload.partnerName} (${maskId(payload.partnerId)})`,
      inline: true,
    })
  }

  if (payload.storeName) {
    fields.push({
      name: "🏪 Loja",
      value: payload.storeName,
      inline: true,
    })
  }

  if (payload.recentReports) {
    fields.push({
      name: "📋 Denúncias Recentes",
      value: `${payload.recentReports} nos últimos 30 dias`,
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: "🚨 Vendedor com Risk Score Alto",
    color: 0xef4444,
    fields,
    footer: { text: `ID: ${maskId(payload.partnerId)} • ${formatDateTime()}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("moderation", embed)
}
