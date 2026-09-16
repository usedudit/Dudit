import "server-only"

import {
  sendDiscordEmbed,
  maskEmail,
  maskId,
  formatBRL,
  truncate,
  formatDateTime,
  type DiscordEmbed,
} from "./discord-webhook.service"

// ============================================================================
// Discord Webhook - Eventos Gerais do Sistema
// Canal: DISCORD_GENERAL_WEBHOOK_URL
// ============================================================================

// --- Solicitação de Reembolso ---

export interface RefundRequestedPayload {
  returnRequestId: string
  orderNumber?: string
  customerId: string
  customerEmail?: string
  customerName?: string
  partnerId?: string
  partnerName?: string
  storeName?: string
  resolution: "refund" | "exchange" | "store_credit"
  reason: string
  refundValue?: number
  items?: Array<{ name: string; quantity: number; price: number }>
  createdAt?: string
}

export async function sendRefundRequested(
  payload: RefundRequestedPayload
): Promise<{ success: boolean; error?: string }> {
  const resolutionLabels: Record<string, { emoji: string; label: string }> = {
    refund: { emoji: "💰", label: "Reembolso" },
    exchange: { emoji: "🔄", label: "Troca" },
    store_credit: { emoji: "🎫", label: "Vale-compra" },
  }

  const resInfo = resolutionLabels[payload.resolution] || resolutionLabels.refund

  const fields: DiscordEmbed["fields"] = [
    {
      name: "📋 Tipo",
      value: `${resInfo.emoji} **${resInfo.label}**`,
      inline: true,
    },
    {
      name: "👤 Cliente",
      value: payload.customerName
        ? `${payload.customerName} (${maskEmail(payload.customerEmail)})`
        : maskEmail(payload.customerEmail),
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

  if (payload.refundValue) {
    fields.push({
      name: "💵 Valor",
      value: `**${formatBRL(payload.refundValue)}**`,
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

  if (payload.storeName) {
    fields.push({
      name: "🏪 Loja",
      value: payload.storeName,
      inline: true,
    })
  }

  fields.push({
    name: "📝 Motivo",
    value: truncate(payload.reason),
    inline: false,
  })

  if (payload.items && payload.items.length > 0) {
    const itemsList = payload.items
      .slice(0, 5)
      .map(i => `• ${truncate(i.name, 60)} (x${i.quantity}) - ${formatBRL(i.price)}`)
      .join("\n")
    fields.push({
      name: "📋 Itens",
      value: truncate(itemsList, 500),
      inline: false,
    })
  }

  const embed: DiscordEmbed = {
    title: `${resInfo.emoji} Nova Solicitação de ${resInfo.label}`,
    color: 0x3b82f6,
    fields,
    footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}

// --- SLA Vencido ---

export interface SlaExpiredPayload {
  returnRequestId: string
  orderNumber?: string
  partnerId: string
  partnerName?: string
  storeName?: string
  customerId?: string
  customerEmail?: string
  daysOverdue: number
  slaDueAt?: string
  createdAt?: string
}

export async function sendSlaExpired(
  payload: SlaExpiredPayload
): Promise<{ success: boolean; error?: string }> {
  const fields: DiscordEmbed["fields"] = [
    {
      name: "⏰ Dias em Atraso",
      value: `**${payload.daysOverdue} dias**`,
      inline: true,
    },
    {
      name: "📅 Prazo Original",
      value: formatDateTime(payload.slaDueAt),
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

  if (payload.customerEmail) {
    fields.push({
      name: "👤 Cliente",
      value: maskEmail(payload.customerEmail),
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: "⏰ SLA de Resposta Vencido",
    color: 0xef4444,
    fields,
    footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime()}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}

// --- Reembolso Processado ---

export interface RefundProcessedPayload {
  returnRequestId: string
  orderNumber?: string
  partnerId?: string
  partnerName?: string
  resolution: string
  refundAmount: number
  refundStatus: "APPROVED" | "FAILED" | "PROCESSING"
  processedBy?: string
  createdAt?: string
}

export async function sendRefundProcessed(
  payload: RefundProcessedPayload
): Promise<{ success: boolean; error?: string }> {
  const statusConfig: Record<string, { emoji: string; color: number; label: string }> = {
    APPROVED: { emoji: "✅", color: 0x10b981, label: "Aprovado" },
    FAILED: { emoji: "❌", color: 0xef4444, label: "Falhou" },
    PROCESSING: { emoji: "⏳", color: 0xf59e0b, label: "Processando" },
  }

  const status = statusConfig[payload.refundStatus] || statusConfig.PROCESSING

  const fields: DiscordEmbed["fields"] = [
    {
      name: "📊 Status",
      value: `${status.emoji} **${status.label}**`,
      inline: true,
    },
    {
      name: "💵 Valor",
      value: `**${formatBRL(payload.refundAmount)}**`,
      inline: true,
    },
    {
      name: "📋 Resolução",
      value: payload.resolution,
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
      name: "🏢 Parceiro",
      value: payload.partnerName
        ? `${payload.partnerName} (${maskId(payload.partnerId)})`
        : maskId(payload.partnerId),
      inline: true,
    })
  }

  if (payload.processedBy) {
    fields.push({
      name: "👨‍💼 Processado por",
      value: payload.processedBy,
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: `${status.emoji} Reembolso ${status.label}`,
    color: status.color,
    fields,
    footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}

// --- Reembolso de Alto Valor (Segurança) ---

export interface HighValueRefundPayload {
  returnRequestId: string
  orderNumber?: string
  refundAmount: number
  threshold: number
  partnerId?: string
  partnerName?: string
  customerEmail?: string
  requiresPassword?: boolean
}

export async function sendHighValueRefund(
  payload: HighValueRefundPayload
): Promise<{ success: boolean; error?: string }> {
  const isCritical = payload.threshold >= 2000
  const emoji = isCritical ? "🚨" : "🔒"
  const label = isCritical ? "CRÍTICO" : "ALTO"

  const fields: DiscordEmbed["fields"] = [
    {
      name: "⚠️ Nível",
      value: `${emoji} **${label}** (${payload.threshold >= 2000 ? ">= R$2.000" : ">= R$300"})`,
      inline: true,
    },
    {
      name: "💵 Valor",
      value: `**${formatBRL(payload.refundAmount)}**`,
      inline: true,
    },
  ]

  if (payload.requiresPassword) {
    fields.push({
      name: "🔐 Senha",
      value: "Requerida",
      inline: true,
    })
  }

  if (payload.orderNumber) {
    fields.push({
      name: "📦 Pedido",
      value: payload.orderNumber,
      inline: true,
    })
  }

  if (payload.partnerName) {
    fields.push({
      name: "🏢 Parceiro",
      value: `${payload.partnerName} (${maskId(payload.partnerId)})`,
      inline: true,
    })
  }

  if (payload.customerEmail) {
    fields.push({
      name: "👤 Cliente",
      value: maskEmail(payload.customerEmail),
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: `${emoji} Reembolso de Alto Valor`,
    color: isCritical ? 0xef4444 : 0xf97316,
    fields,
    footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime()}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}

// --- Exclusão de Conta ---

export interface AccountDeletedPayload {
  userId: string
  userEmail?: string
  userName?: string
  partnerId?: string
  partnerName?: string
  reason?: string
  requestedAt?: string
  completedAt?: string
}

export async function sendAccountDeleted(
  payload: AccountDeletedPayload
): Promise<{ success: boolean; error?: string }> {
  const fields: DiscordEmbed["fields"] = [
    {
      name: "👤 Usuário",
      value: payload.userName
        ? `${payload.userName} (${maskEmail(payload.userEmail)})`
        : maskEmail(payload.userEmail),
      inline: false,
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

  if (payload.reason) {
    fields.push({
      name: "📝 Motivo",
      value: truncate(payload.reason),
      inline: false,
    })
  }

  const embed: DiscordEmbed = {
    title: "🗑️ Conta Excluída",
    color: 0x6b7280,
    fields,
    footer: { text: `User: ${maskId(payload.userId)} • ${formatDateTime(payload.completedAt || payload.requestedAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}

// --- Mudança de Plano ---

export interface PlanChangedPayload {
  userId: string
  userEmail?: string
  userName?: string
  partnerId: string
  partnerName?: string
  storeName?: string
  previousPlan: string
  newPlan: string
  changeType: "upgrade" | "downgrade" | "cancellation"
  effectiveAt?: string
  createdAt?: string
}

export async function sendPlanChanged(
  payload: PlanChangedPayload
): Promise<{ success: boolean; error?: string }> {
  const changeConfig: Record<string, { emoji: string; color: number; label: string }> = {
    upgrade: { emoji: "⬆️", color: 0x10b981, label: "Upgrade" },
    downgrade: { emoji: "⬇️", color: 0xf59e0b, label: "Downgrade" },
    cancellation: { emoji: "🚫", color: 0xef4444, label: "Cancelamento" },
  }

  const config = changeConfig[payload.changeType] || changeConfig.upgrade

  const fields: DiscordEmbed["fields"] = [
    {
      name: "📊 Tipo",
      value: `${config.emoji} **${config.label}**`,
      inline: true,
    },
    {
      name: "📋 Plano",
      value: `${payload.previousPlan} → **${payload.newPlan}**`,
      inline: false,
    },
    {
      name: "👤 Usuário",
      value: payload.userName
        ? `${payload.userName} (${maskEmail(payload.userEmail)})`
        : maskEmail(payload.userEmail),
      inline: true,
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

  if (payload.effectiveAt) {
    fields.push({
      name: "📅 Vigência",
      value: formatDateTime(payload.effectiveAt),
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: `${config.emoji} Plano ${config.label}`,
    color: config.color,
    fields,
    footer: { text: `Partner: ${maskId(payload.partnerId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}

// --- Pagamento Falhou ---

export interface PaymentFailedPayload {
  orderId?: string
  orderNumber?: string
  partnerId?: string
  partnerName?: string
  storeName?: string
  customerEmail?: string
  paymentId?: string
  amount?: number
  errorCode?: string
  errorMessage?: string
  provider?: string
  createdAt?: string
}

export async function sendPaymentFailed(
  payload: PaymentFailedPayload
): Promise<{ success: boolean; error?: string }> {
  const fields: DiscordEmbed["fields"] = []

  if (payload.amount) {
    fields.push({
      name: "💵 Valor",
      value: `**${formatBRL(payload.amount)}**`,
      inline: true,
    })
  }

  if (payload.orderNumber) {
    fields.push({
      name: "📦 Pedido",
      value: payload.orderNumber,
      inline: true,
    })
  }

  if (payload.provider) {
    fields.push({
      name: "💳 Provedor",
      value: payload.provider,
      inline: true,
    })
  }

  if (payload.errorCode || payload.errorMessage) {
    fields.push({
      name: "❌ Erro",
      value: truncate(`${payload.errorCode ? `[${payload.errorCode}] ` : ""}${payload.errorMessage || "Erro desconhecido"}`),
      inline: false,
    })
  }

  if (payload.paymentId) {
    fields.push({
      name: "🔑 Payment ID",
      value: maskId(payload.paymentId),
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

  if (payload.storeName) {
    fields.push({
      name: "🏪 Loja",
      value: payload.storeName,
      inline: true,
    })
  }

  if (payload.customerEmail) {
    fields.push({
      name: "👤 Cliente",
      value: maskEmail(payload.customerEmail),
      inline: true,
    })
  }

  const embed: DiscordEmbed = {
    title: "❌ Pagamento Falhou",
    color: 0xef4444,
    fields,
    footer: { text: `Order: ${maskId(payload.orderId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}

// --- Troca Criada ---

export interface ExchangeCreatedPayload {
  returnRequestId: string
  exchangeOrderId: string
  orderNumber?: string
  partnerId?: string
  partnerName?: string
  customerEmail?: string
  items?: Array<{ name: string; quantity: number }>
  shortfallAmount?: number
  surplusAmount?: number
  createdAt?: string
}

export async function sendExchangeCreated(
  payload: ExchangeCreatedPayload
): Promise<{ success: boolean; error?: string }> {
  const fields: DiscordEmbed["fields"] = [
    {
      name: "🔄 Pedido de Troca",
      value: maskId(payload.exchangeOrderId),
      inline: true,
    },
  ]

  if (payload.orderNumber) {
    fields.push({
      name: "📦 Pedido Original",
      value: payload.orderNumber,
      inline: true,
    })
  }

  if (payload.partnerName) {
    fields.push({
      name: "🏢 Parceiro",
      value: `${payload.partnerName} (${maskId(payload.partnerId)})`,
      inline: true,
    })
  }

  if (payload.customerEmail) {
    fields.push({
      name: "👤 Cliente",
      value: maskEmail(payload.customerEmail),
      inline: true,
    })
  }

  if (payload.shortfallAmount && payload.shortfallAmount > 0) {
    fields.push({
      name: "💵 Falta (cliente paga)",
      value: formatBRL(payload.shortfallAmount),
      inline: true,
    })
  }

  if (payload.surplusAmount && payload.surplusAmount > 0) {
    fields.push({
      name: "💵 Sobra (loja devolve)",
      value: formatBRL(payload.surplusAmount),
      inline: true,
    })
  }

  if (payload.items && payload.items.length > 0) {
    const itemsList = payload.items
      .slice(0, 5)
      .map(i => `• ${truncate(i.name, 60)} (x${i.quantity})`)
      .join("\n")
    fields.push({
      name: "📋 Itens",
      value: truncate(itemsList, 500),
      inline: false,
    })
  }

  const embed: DiscordEmbed = {
    title: "🔄 Nova Troca Criada",
    color: 0x8b5cf6,
    fields,
    footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime(payload.createdAt)}` },
    timestamp: new Date().toISOString(),
  }

  return sendDiscordEmbed("general", embed)
}
