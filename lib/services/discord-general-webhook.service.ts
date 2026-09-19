import "server-only"

// ============================================================================
// Discord Webhook - Eventos Gerais do Sistema
// Canal: DISCORD_GENERAL_WEBHOOK_URL
// ============================================================================

const GENERAL_URL = () => process.env.DISCORD_GENERAL_WEBHOOK_URL

const DISCORD_VALID_PREFIX = "https://discord.com/api/webhooks/"

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

function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
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

// --- Solicitação de Reembolso ---

export async function sendRefundRequested(payload: {
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
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const resLabels: Record<string, { emoji: string; label: string }> = {
    refund: { emoji: "💰", label: "Reembolso" },
    exchange: { emoji: "🔄", label: "Troca" },
    store_credit: { emoji: "🎫", label: "Vale-compra" },
  }
  const resInfo = resLabels[payload.resolution] || resLabels.refund

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "📋 Tipo", value: `${resInfo.emoji} **${resInfo.label}**`, inline: true },
    { name: "👤 Cliente", value: payload.customerName ? `${payload.customerName} (${maskEmail(payload.customerEmail)})` : maskEmail(payload.customerEmail), inline: true },
  ]

  if (payload.orderNumber) fields.push({ name: "📦 Pedido", value: payload.orderNumber, inline: true })
  if (payload.refundValue) fields.push({ name: "💵 Valor", value: `**${formatBRL(payload.refundValue)}**`, inline: true })
  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.storeName) fields.push({ name: "🏪 Loja", value: payload.storeName, inline: true })
  fields.push({ name: "📝 Motivo", value: truncate(payload.reason), inline: false })

  if (payload.items && payload.items.length > 0) {
    const itemsList = payload.items.slice(0, 5).map(i => `• ${truncate(i.name, 60)} (x${i.quantity}) - ${formatBRL(i.price)}`).join("\n")
    fields.push({ name: "📋 Itens", value: truncate(itemsList, 500), inline: false })
  }

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: `${resInfo.emoji} Nova Solicitação de ${resInfo.label}`,
      color: 0x3b82f6,
      fields,
      footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime(payload.createdAt)}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- SLA Vencido ---

export async function sendSlaExpired(payload: {
  returnRequestId: string
  orderNumber?: string
  partnerId: string
  partnerName?: string
  storeName?: string
  customerEmail?: string
  daysOverdue: number
  slaDueAt?: string
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "⏰ Dias em Atraso", value: `**${payload.daysOverdue} dias**`, inline: true },
    { name: "📅 Prazo Original", value: formatDateTime(payload.slaDueAt), inline: true },
  ]

  if (payload.orderNumber) fields.push({ name: "📦 Pedido", value: payload.orderNumber, inline: true })
  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.storeName) fields.push({ name: "🏪 Loja", value: payload.storeName, inline: true })
  if (payload.customerEmail) fields.push({ name: "👤 Cliente", value: maskEmail(payload.customerEmail), inline: true })

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "⏰ SLA de Resposta Vencido",
      color: 0xef4444,
      fields,
      footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime()}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Reembolso Processado ---

export async function sendRefundProcessed(payload: {
  returnRequestId: string
  orderNumber?: string
  partnerId?: string
  partnerName?: string
  resolution: string
  refundAmount: number
  refundStatus: "APPROVED" | "FAILED" | "PROCESSING"
  processedBy?: string
  createdAt?: string
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const statusConfig: Record<string, { emoji: string; color: number; label: string }> = {
    APPROVED: { emoji: "✅", color: 0x10b981, label: "Aprovado" },
    FAILED: { emoji: "❌", color: 0xef4444, label: "Falhou" },
    PROCESSING: { emoji: "⏳", color: 0xf59e0b, label: "Processando" },
  }
  const status = statusConfig[payload.refundStatus] || statusConfig.PROCESSING

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "📊 Status", value: `${status.emoji} **${status.label}**`, inline: true },
    { name: "💵 Valor", value: `**${formatBRL(payload.refundAmount)}**`, inline: true },
    { name: "📋 Resolução", value: payload.resolution, inline: true },
  ]

  if (payload.orderNumber) fields.push({ name: "📦 Pedido", value: payload.orderNumber, inline: true })
  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.processedBy) fields.push({ name: "👨‍💼 Processado por", value: payload.processedBy, inline: true })

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: `${status.emoji} Reembolso ${status.label}`,
      color: status.color,
      fields,
      footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime(payload.createdAt)}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Reembolso de Alto Valor ---

export async function sendHighValueRefund(payload: {
  returnRequestId: string
  orderNumber?: string
  refundAmount: number
  threshold: number
  partnerId?: string
  partnerName?: string
  customerEmail?: string
  requiresPassword?: boolean
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const isCritical = payload.threshold >= 2000
  const emoji = isCritical ? "🚨" : "🔒"
  const label = isCritical ? "CRÍTICO" : "ALTO"

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "⚠️ Nível", value: `${emoji} **${label}**`, inline: true },
    { name: "💵 Valor", value: `**${formatBRL(payload.refundAmount)}**`, inline: true },
  ]

  if (payload.requiresPassword) fields.push({ name: "🔐 Senha", value: "Requerida", inline: true })
  if (payload.orderNumber) fields.push({ name: "📦 Pedido", value: payload.orderNumber, inline: true })
  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.customerEmail) fields.push({ name: "👤 Cliente", value: maskEmail(payload.customerEmail), inline: true })

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: `${emoji} Reembolso de Alto Valor`,
      color: isCritical ? 0xef4444 : 0xf97316,
      fields,
      footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime()}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Exclusão de Conta ---

export async function sendAccountDeleted(payload: {
  userId: string
  userEmail?: string
  userName?: string
  partnerId?: string
  partnerName?: string
  reason?: string
  requestedAt?: string
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "👤 Usuário", value: payload.userName ? `${payload.userName} (${maskEmail(payload.userEmail)})` : maskEmail(payload.userEmail), inline: false },
  ]

  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.reason) fields.push({ name: "📝 Motivo", value: truncate(payload.reason), inline: false })

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "🗑️ Conta Excluída",
      color: 0x6b7280,
      fields,
      footer: { text: `User: ${maskId(payload.userId)} • ${formatDateTime(payload.requestedAt)}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Mudança de Plano ---

export async function sendPlanChanged(payload: {
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
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const changeConfig: Record<string, { emoji: string; color: number; label: string }> = {
    upgrade: { emoji: "⬆️", color: 0x10b981, label: "Upgrade" },
    downgrade: { emoji: "⬇️", color: 0xf59e0b, label: "Downgrade" },
    cancellation: { emoji: "🚫", color: 0xef4444, label: "Cancelamento" },
  }
  const config = changeConfig[payload.changeType] || changeConfig.upgrade

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "📊 Tipo", value: `${config.emoji} **${config.label}**`, inline: true },
    { name: "📋 Plano", value: `${payload.previousPlan} → **${payload.newPlan}**`, inline: false },
    { name: "👤 Usuário", value: payload.userName ? `${payload.userName} (${maskEmail(payload.userEmail)})` : maskEmail(payload.userEmail), inline: true },
  ]

  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.storeName) fields.push({ name: "🏪 Loja", value: payload.storeName, inline: true })
  if (payload.effectiveAt) fields.push({ name: "📅 Vigência", value: formatDateTime(payload.effectiveAt), inline: true })

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: `${config.emoji} Plano ${config.label}`,
      color: config.color,
      fields,
      footer: { text: `Partner: ${maskId(payload.partnerId)} • ${formatDateTime(payload.createdAt)}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Pagamento Falhou ---

export async function sendPaymentFailed(payload: {
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
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = []

  if (payload.amount) fields.push({ name: "💵 Valor", value: `**${formatBRL(payload.amount)}**`, inline: true })
  if (payload.orderNumber) fields.push({ name: "📦 Pedido", value: payload.orderNumber, inline: true })
  if (payload.provider) fields.push({ name: "💳 Provedor", value: payload.provider, inline: true })
  if (payload.errorCode || payload.errorMessage) fields.push({ name: "❌ Erro", value: truncate(`${payload.errorCode ? `[${payload.errorCode}] ` : ""}${payload.errorMessage || "Erro desconhecido"}`), inline: false })
  if (payload.paymentId) fields.push({ name: "🔑 Payment ID", value: maskId(payload.paymentId), inline: true })
  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.storeName) fields.push({ name: "🏪 Loja", value: payload.storeName, inline: true })
  if (payload.customerEmail) fields.push({ name: "👤 Cliente", value: maskEmail(payload.customerEmail), inline: true })

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "❌ Pagamento Falhou",
      color: 0xef4444,
      fields,
      footer: { text: `Order: ${maskId(payload.orderId)} • ${formatDateTime()}` },
      timestamp: new Date().toISOString(),
    }],
  })
}

// --- Troca Criada ---

export async function sendExchangeCreated(payload: {
  returnRequestId: string
  exchangeOrderId: string
  orderNumber?: string
  partnerId?: string
  partnerName?: string
  customerEmail?: string
  items?: Array<{ name: string; quantity: number }>
  shortfallAmount?: number
  surplusAmount?: number
}): Promise<{ success: boolean; error?: string }> {
  const url = GENERAL_URL()
  if (!isValidUrl(url)) return { success: true }

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "🔄 Pedido de Troca", value: maskId(payload.exchangeOrderId), inline: true },
  ]

  if (payload.orderNumber) fields.push({ name: "📦 Pedido Original", value: payload.orderNumber, inline: true })
  if (payload.partnerName) fields.push({ name: "🏢 Parceiro", value: `${payload.partnerName} (${maskId(payload.partnerId)})`, inline: true })
  if (payload.customerEmail) fields.push({ name: "👤 Cliente", value: maskEmail(payload.customerEmail), inline: true })
  if (payload.shortfallAmount && payload.shortfallAmount > 0) fields.push({ name: "💵 Falta (cliente paga)", value: formatBRL(payload.shortfallAmount), inline: true })
  if (payload.surplusAmount && payload.surplusAmount > 0) fields.push({ name: "💵 Sobra (loja devolve)", value: formatBRL(payload.surplusAmount), inline: true })

  if (payload.items && payload.items.length > 0) {
    const itemsList = payload.items.slice(0, 5).map(i => `• ${truncate(i.name, 60)} (x${i.quantity})`).join("\n")
    fields.push({ name: "📋 Itens", value: truncate(itemsList, 500), inline: false })
  }

  return postToDiscord(url, {
    username: "Dudit Sistema",
    avatar_url: "https://dudit.com.br/icon-192x192.png",
    embeds: [{
      title: "🔄 Nova Troca Criada",
      color: 0x8b5cf6,
      fields,
      footer: { text: `Request: ${maskId(payload.returnRequestId)} • ${formatDateTime()}` },
      timestamp: new Date().toISOString(),
    }],
  })
}
