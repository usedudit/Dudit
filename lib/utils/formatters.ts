/**
 * Formatting utilities for a standardized display across the project.
 * Focuses on pt-BR locale.
 *
 * Date/time functions now delegate to lib/date for centralized timezone handling.
 */

import * as dateTz from "@/lib/date"

/**
 * Formats a number as BRL currency (R$ 0,00).
 */
export function formatCurrency(value: number | string): string {
  const amount = typeof value === "string" ? parseFloat(value) : value
  let formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount || 0)
  
  // Normalize output if the system locale fallback occurs
  if (formatted.includes("BRL")) {
    formatted = formatted.replace("BRL", "R$")
  }
  if (formatted.startsWith("$") && !formatted.startsWith("R$")) {
    formatted = formatted.replace("$", "R$")
  }
  return formatted
}

/**
 * Formats a date as DD/MM/YYYY.
 */
export function formatDate(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatDate(date)
}

/**
 * Robust string-based formatter from YYYY-MM-DD to DD-MM-YYYY without timezone shift.
 */
export function formatDateToBR(dateStr?: string | null): string {
  if (!dateStr) return ""
  const parts = dateStr.split("-")
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`
  }
  return dateStr
}

/**
 * Formats a date as "DD de Mês de YYYY, HH:mm" (Timezone: America/Sao_Paulo).
 */
export function formatFullDate(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatFullDate(date)
}

/**
 * Formats a date as "DD de Mês" (Timezone: America/Sao_Paulo).
 */
export function formatShortDate(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "dd 'de' MMMM")
}

/**
 * Formats a date with time: DD/MM/YYYY HH:mm.
 */
export function formatDateTime(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatDateTime(date)
}

/**
 * Formats a date as HH:mm (America/Sao_Paulo).
 */
export function formatTime(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatTime(date)
}

/**
 * Calendar-day difference: dueYmd (YYYY-MM-DD) minus "today" in America/Sao_Paulo.
 * 0 = vence hoje, 1 = vence amanhã, negative = already passed that calendar day.
 */
export function diffCalendarDaysInSaoPaulo(dueYmd: string): number {
  return dateTz.diffCalendarDays(dateTz.getTodayYmd(), dueYmd)
}

/** Hoje (calendário) em YYYY-MM-DD no fuso America/Sao_Paulo. */
export function getTodayYmdSaoPaulo(): string {
  return dateTz.getTodayYmd()
}

/**
 * Exibe data vinda do Postgres sem erro de "um dia antes":
 * valores `DATE` (YYYY-MM-DD) são o dia civil desejado; não usar `new Date("YYYY-MM-DD")` (UTC meia-noite).
 */
export function formatBrazilDateFromDbInput(
  value: string | null | undefined,
  variant: "dayMonthYear" | "dayMonth"
): string {
  return dateTz.formatBrazilDateFromDbInput(value, variant)
}

/**
 * Formats a date as DD/MM.
 */
export function formatDayMonth(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "dd/MM")
}

/**
 * Formats a date as a long month name (janeiro, fevereiro...).
 */
export function formatMonth(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "MMMM")
}

/**
 * Formats a date as YYYY.
 */
export function formatYear(date: Date | string | number): string {
  if (!date) return ""
  return dateTz.formatInTz(date, dateTz.getDefaultTimezone(), "yyyy")
}

/**
 * Parses a decimal value typed by the user. Accepts both pt-BR ("1,5")
 * and en-US ("1.5") separators. Empty/invalid input resolves to 0.
 */
export function parseDecimalInput(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (value === null || value === undefined) return 0

  let str = String(value).trim()
  if (!str) return 0

  str = str.replace(/[^\d,.-]/g, "")
  if (!str) return 0

  const lastComma = str.lastIndexOf(",")
  const lastDot = str.lastIndexOf(".")

  if (lastComma >= 0 && lastDot >= 0) {
    // The last separator is the decimal one; the other is a thousands separator.
    str = lastComma > lastDot
      ? str.replace(/\./g, "").replace(",", ".")
      : str.replace(/,/g, "")
  } else if (lastComma >= 0) {
    const parts = str.split(",")
    str = parts.length === 2 ? `${parts[0]}.${parts[1]}` : str.replace(/,/g, "")
  } else if ((str.match(/\./g) || []).length > 1) {
    str = str.replace(/\./g, "")
  }

  const parsed = Number(str)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Renders a value inside a decimal text input. Zero/empty values render as an
 * empty string so the placeholder is shown instead of a fake "0".
 */
export function formatDecimalInput(value: unknown): string {
  if (value === null || value === undefined) return ""
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value === 0) return ""
    return String(value).replace(".", ",")
  }
  const str = String(value).trim()
  return str
}

/**
 * Formats a number with pt-BR separators.
 */
export function formatNumber(
  value: number | string,
  minimumFractionDigits = 2,
  maximumFractionDigits = 2
): string {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(num || 0)
}

/**
 * Formats a string as CPF (000.000.000-00).
 */
export function formatCPF(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .replace(/(-\d{2})\d+?$/, "$1")
}

/**
 * Formats a string as CNPJ (00.000.000/0000-00).
 */
export function formatCNPJ(value: string): string {
  const clean = value.replace(/[^0-9A-Z]/gi, "").toUpperCase()
  return clean
    .replace(/^([0-9A-Z]{2})([0-9A-Z])/, "$1.$2")
    .replace(/^([0-9A-Z]{2}\.)([0-9A-Z]{3})([0-9A-Z])/, "$1$2.$3")
    .replace(/\.([0-9A-Z]{3})([0-9A-Z])/, ".$1/$2")
    .replace(/\/([0-9A-Z]{4})([0-9A-Z])/, "/$1-$2")
    .replace(/(-\d{2})[0-9A-Z]+?$/, "$1")
}

/**
 * Formats a string as CEP (00000-000).
 */
export function formatCEP(value: string): string {
  const digits = value.replace(/\D/g, "")
  return digits
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(-\d{3})\d+?$/, "$1")
}

/**
 * Formats a number as a percentage (0,00%).
 */
export function formatPercent(value: number | string, decimals = 2): string {
  const num = typeof value === "string" ? parseFloat(value) : value
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format((num || 0) / 100)
}

/**
 * Returns the suffix string corresponding to a billing unit.
 */
export function getBillingUnitSuffix(unit?: string | null): string {
  if (!unit) return ""
  switch (unit) {
    case "per_hour":
      return "/hora"
    case "per_day":
      return "/dia"
    case "per_week":
      return "/semana"
    case "per_month":
      return "/mês"
    case "per_year":
      return "/ano"
    default:
      return ""
  }
}

/**
 * Returns year, month, day, hour, minute, second and dayOfWeek in America/Sao_Paulo timezone.
 */
export function getSaoPauloDateComponents(date: Date = new Date()) {
  return dateTz.getDateComponents(date)
}

/**
 * Returns the timezone offset in minutes for America/Sao_Paulo for a given Date.
 * E.g., returns -180 (for UTC-3).
 */
export function getSaoPauloOffsetMinutes(date: Date = new Date()): number {
  try {
    const tzString = date.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" })
    const localString = date.toLocaleString("en-US", { timeZone: "UTC" })
    const tzDate = new Date(tzString)
    const localDate = new Date(localString)
    return Math.round((tzDate.getTime() - localDate.getTime()) / 60000)
  } catch {
    return -180 // Fallback to standard UTC-3
  }
}

/**
 * Creates a Date object representing the given calendar date/time in America/Sao_Paulo.
 * Handles DST correctly via Intl.
 */
export function createSaoPauloDate(year: number, month: number, day: number, hour: number, minute: number): Date {
  const ymd = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  const hm = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
  return dateTz.parseInTz(ymd, hm)
}

/**
 * Retorna o timezone IANA padrão da aplicação.
 * Lê de APP_DEFAULT_TIMEZONE (env) se definido, senão usa America/Sao_Paulo.
 * Isso permite trocar o timezone globalmente sem alterar código,
 * e futuramente pode ser sobrescrito por parceiro.
 */
export function getDefaultTimezone(): string {
  return dateTz.getDefaultTimezone()
}

/**
 * Interpreta uma data e hora no formato YYYY-MM-DD e HH:mm como horário
 * civil em um timezone IANA específico (padrão: getDefaultTimezone()).
 *
 * Retorna um objeto Date UTC equivalente.
 *
 * Ex: parseDateInTimezone("2026-06-29", "14:00", "America/Sao_Paulo")
 *     → Date representando 2026-06-29 17:00 UTC (14:00 BRT = UTC-3)
 *
 * Funciona para QUALQUER timezone IANA (America/New_York, Europe/Lisbon, etc.)
 * e respeita horário de verão automaticamente via Intl.
 */
export function parseDateInTimezone(dateStr: string, timeStr: string, timezone?: string): Date {
  return dateTz.parseInTz(dateStr, timeStr, timezone)
}

/**
 * Normaliza e formata a unidade de medida do produto.
 * Exemplos:
 *   formatUnit("UN") -> "un."
 *   formatUnit("UN", 5, "full") -> "unidades"
 *   formatUnit("KG") -> "kg"
 *   formatUnit("PC", 2, "full") -> "peças"
 */
export function formatUnit(unit?: string | null, quantity = 1, style: "short" | "full" = "short"): string {
  const raw = String(unit || "UN").trim()
  const clean = raw.toUpperCase()
  
  if (style === "full") {
    const isPlural = quantity !== 1
    switch (clean) {
      case "UN":
      case "UNIDADE":
      case "UND":
        return isPlural ? "unidades" : "unidade"
      case "PC":
      case "PECA":
      case "PEÇA":
        return isPlural ? "peças" : "peça"
      case "KG":
      case "QUILO":
        return isPlural ? "quilos" : "quilo"
      case "LT":
      case "LITRO":
        return isPlural ? "litros" : "litro"
      case "MT":
      case "M":
      case "METRO":
        return isPlural ? "metros" : "metro"
      case "CX":
      case "CAIXA":
        return isPlural ? "caixas" : "caixa"
      case "PT":
      case "PACOTE":
      case "PCT":
        return isPlural ? "pacotes" : "pacote"
      case "DZ":
      case "DUZIA":
      case "DÚZIA":
        return isPlural ? "dúzias" : "dúzia"
      case "PAR":
        return isPlural ? "pares" : "par"
      default:
        return raw.toLowerCase()
    }
  }

  switch (clean) {
    case "UN":
    case "UNIDADE":
    case "UND":
      return "un."
    case "PC":
    case "PECA":
    case "PEÇA":
      return "pc."
    case "KG":
    case "QUILO":
      return "kg"
    case "LT":
    case "LITRO":
      return "lt."
    case "MT":
    case "M":
    case "METRO":
      return "m"
    case "CX":
    case "CAIXA":
      return "cx."
    case "PT":
    case "PACOTE":
    case "PCT":
      return "pt."
    case "DZ":
    case "DUZIA":
    case "DÚZIA":
      return "dz."
    case "PAR":
      return "par"
    default:
      return raw.toLowerCase()
  }
}

/**
 * Formata a quantidade com sua unidade correspondente.
 * Ex: formatQuantityWithUnit(10, "KG") -> "10 kg"
 *     formatQuantityWithUnit(5, "UN", "full") -> "5 unidades"
 */
export function formatQuantityWithUnit(quantity: number | string, unit?: string | null, style: "short" | "full" = "short"): string {
  const qtyNum = typeof quantity === "string" ? parseFloat(quantity) || 0 : quantity
  const formattedUnit = formatUnit(unit, qtyNum, style)
  return `${quantity} ${formattedUnit}`
}

/**
 * Formata o preço unitário acompanhado da unidade (quando não for unidade padrão simples).
 * Ex: formatUnitPriceWithUnit(50, "KG") -> "R$ 50,00 / kg"
 *     formatUnitPriceWithUnit(50, "UN") -> "R$ 50,00"
 */
export function formatUnitPriceWithUnit(price: number | string, unit?: string | null): string {
  const formattedPrice = formatCurrency(price)
  const cleanUnit = formatUnit(unit, 1, "short")
  if (cleanUnit === "un.") {
    return formattedPrice
  }
  return `${formattedPrice} / ${cleanUnit}`
}

/**
 * Anonimiza um endereço de e-mail (ex: joao.silva@gmail.com -> j****a@gmail.com).
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email || typeof email !== "string") return ""
  const parts = email.trim().split("@")
  if (parts.length !== 2) return email
  const [name, domain] = parts
  if (!name) return email
  const maskedName = name.length > 2
    ? `${name[0]}****${name[name.length - 1]}`
    : `${name[0]}****`
  return `${maskedName}@${domain}`
}

/**
 * Anonimiza um nome de pessoa preservando as iniciais de cada nome
 * (ex: "Maria Silva" -> "M*** S***").
 */
export function maskPersonName(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return ""
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ""
  return words.map((word) => `${word[0].toUpperCase()}***`).join(" ")
}

const KNOWN_STATUS_LABELS: Record<string, string> = {
  // Service orders
  aberta: "Aberta",
  aguardando_aprovacao: "Aguardando Aprovação",
  aprovada: "Aprovada",
  em_andamento: "Em Andamento",
  aguardando_peca: "Aguardando Peça",
  concluida: "Concluída",
  entregue: "Entregue",
  cancelada: "Cancelada",
  // Quotes
  draft: "Rascunho",
  sent: "Enviado",
  pending_client: "Pendente do Cliente",
  viewed: "Visualizado",
  approved: "Aprovado",
  rejected: "Recusado",
  expired: "Expirado",
  converted_to_order: "Convertido em Pedido",
  // Orders
  pending: "Pendente",
  processing: "Em Processamento",
  completed: "Concluído",
  shipped: "Enviado",
  delivered: "Entregue",
  // Shipping labels (SuperFrete / order_shipments.status)
  released: "Aguardando postagem",
  posted: "Postado",
  in_transit: "Em trânsito",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  failed: "Falhou",
  not_sent: "Não enviado",
  preparing: "Em preparação",
}

export type TimelineViewer = "customer" | "seller" | "admin"

export interface ResolveTimelineActorParams {
  entry: {
    actor_user_id?: string | null
    actor_name?: string | null
    metadata?: Record<string, any> | null
    source?: string | null
    entry_type?: string | null
  }
  viewer: TimelineViewer
  orderCustomerName?: string | null
  storeName?: string | null
  buyerId?: string | null
}

/**
 * Resolve o nome de exibição do autor do evento para o histórico,
 * padronizado por perspectiva de visualização (cliente, vendedor ou admin).
 */
export function resolveTimelineActorName({
  entry,
  viewer,
  orderCustomerName,
  storeName,
  buyerId,
}: ResolveTimelineActorParams): string {
  const metadata = entry.metadata || {}
  const rawActor = String(entry.actor_name || "").toLowerCase()
  const isErpAction = entry.source === "erp" || metadata.source === "erp"
  const isDuditAction = !isErpAction && Boolean(
    entry.source === "admin" ||
    metadata.is_admin_action ||
    (metadata.dudit_action && (entry.source === "admin" || !entry.actor_user_id)) ||
    (rawActor.includes("dudit") && entry.source === "admin")
  )
  const isSystem = Boolean(
    (!entry.actor_user_id && !isDuditAction && !metadata.admin_actor_name && (!entry.actor_name || entry.actor_name.toLowerCase() === "sistema")) ||
    entry.actor_name?.toLowerCase() === "sistema" ||
    entry.source === "system" ||
    entry.source === "webhook"
  )
  const isCustomer = Boolean(
    !isDuditAction &&
    !isSystem &&
    ((buyerId && entry.actor_user_id === buyerId) ||
      metadata.is_buyer === true ||
      metadata.source === "marketplace" ||
      entry.source === "marketplace" ||
      entry.entry_type === "return_created" ||
      (orderCustomerName && entry.actor_name === orderCustomerName))
  )
  const isDriver = Boolean(
    !isDuditAction &&
    !isSystem &&
    !isCustomer &&
    (metadata.is_driver === true ||
      metadata.driver_id ||
      metadata.driver_action === true ||
      entry.source === "delivery_driver_app" ||
      entry.source === "delivery_driver" ||
      rawActor.includes("entregador") ||
      entry.entry_type === "delivery_payment_received" ||
      entry.entry_type === "SINGLE_ORDER_DELIVERED")
  )

  // 1. Ação da Equipe Dudit (Admin)
  if (isDuditAction) {
    if (viewer === "admin") {
      const rawAdmin =
        metadata.admin_actor_name ||
        (entry.actor_name && entry.actor_name.includes("(") ? entry.actor_name.replace(/.*?\((.*?)\).*/, "$1") : null)

      const trimmedAdmin = rawAdmin ? String(rawAdmin).trim() : null
      if (
        trimmedAdmin &&
        trimmedAdmin.toLowerCase() !== "admin" &&
        trimmedAdmin.toLowerCase() !== "equipe dudit"
      ) {
        return `Equipe Dudit (${trimmedAdmin})`
      }
      return "Equipe Dudit"
    }
    // Cliente e Vendedor sempre veem apenas "Equipe Dudit"
    return "Equipe Dudit"
  }

  // 2. Ação do Sistema Automático
  if (isSystem) {
    return "Sistema"
  }

  // 3. Ação do Cliente
  if (isCustomer) {
    if (viewer === "customer") {
      return "Você"
    }
    const customerDisplayName = orderCustomerName || (entry.actor_name && !entry.actor_name.toLowerCase().includes("dudit") ? entry.actor_name : "Cliente")
    return `${customerDisplayName} (Cliente)`
  }

  // 4. Ação do Entregador
  if (isDriver) {
    if (viewer === "customer") {
      return "Entregador"
    }
    const driverName = metadata.driver_name || entry.actor_name || "Entregador"
    return String(driverName).toLowerCase().includes("entregador")
      ? String(driverName)
      : `${driverName} (Entregador)`
  }

  // 5. Ação do Vendedor / Lojista
  const resolvedSellerActorName =
    entry.actor_name && !entry.actor_name.toLowerCase().includes("dudit")
      ? entry.actor_name
      : "Vendedor"

  if (viewer === "customer") {
    // Cliente nunca vê nome pessoal do colaborador da loja; vê o nome da loja ou "Vendedor"
    return storeName || "Vendedor"
  }
  if (viewer === "admin") {
    const staffName = resolvedSellerActorName
    return `${staffName} (Vendedor)`
  }
  // Vendedor no ERP vê o nome do usuário que fez a ação
  return resolvedSellerActorName
}

/**
 * Converte linhas de log técnicas em texto legível, neutro e padronizado em português,
 * para ser exibido igualmente para clientes, lojistas e administradores.
 */
export function humanizeTimelineChangeLine(line: string): string {
  if (!line || typeof line !== "string") return ""
  const trimmed = line.trim()
  if (!trimmed) return ""
  const lower = trimmed.toLowerCase()

  // Higieniza mensagens com prefixo 'Equipe Dudit' em eventos legados do pedido/solicitação
  if (lower.startsWith("equipe dudit alterou:")) {
    return trimmed.replace(/^equipe dudit alterou:\s*/i, "Alterou: ")
  }
  if (lower === "equipe dudit atualizou o pedido.") {
    return "Pedido atualizado."
  }
  if (lower.startsWith("equipe dudit alterou o status")) {
    return trimmed.replace(/^equipe dudit alterou o status/i, "Status alterado")
  }
  if (lower.startsWith("equipe dudit atualizou:")) {
    return trimmed.replace(/^equipe dudit atualizou:\s*/i, "Atualizou: ")
  }
  if (lower === "equipe dudit atualizou a solicitação.") {
    return "Solicitação atualizada."
  }
  if (lower.startsWith("equipe dudit atualizou a solicitação de devolução")) {
    return trimmed.replace(/^equipe dudit atualizou a solicitação de devolução/i, "Solicitação de devolução atualizada")
  }

  // 1. Linhas de status de entrega
  if (lower.includes("status de entrega") || lower.includes("status da entrega")) {
    const target = (
      trimmed.includes("->") || trimmed.includes("→")
        ? trimmed.split(/->|→/).pop()!
        : trimmed.replace(/^.*status\s+d[ea]\s+entrega:?\s*/i, "")
    ).trim().toLowerCase()

    if (target.includes("entregue") || target === "delivered") return "Pedido entregue."
    if (target.includes("saiu para entrega") || target.includes("em trânsito") || target.includes("em transito") || target === "in_transit") return "Pedido saiu para entrega."
    if (target.includes("retirada") || target.includes("disponível") || target.includes("disponivel") || target === "ready_for_pickup") return "Pedido pronto para retirada."
    if (target.includes("retirado") || target === "picked_up") return "Pedido retirado pelo cliente."
    if (target.includes("falha") || target.includes("não entregue") || target.includes("nao entregue") || target === "failed") return "Tentativa de entrega não realizada."
    if (target.includes("preparando") || target.includes("preparação") || target.includes("preparacao") || target.includes("separação") || target.includes("separacao") || target === "preparing") return "Pedido em separação."
    if (target.includes("cancelado") || target === "cancelled" || target === "canceled") return "Entrega do pedido cancelada."
    if (target.includes("não enviado") || target.includes("nao enviado") || target.includes("pendente") || target === "not_sent" || target === "pending") return "Pedido aguardando envio."
    if (target.includes("enviado") || target === "shipped" || target === "sent") return "Pedido enviado para entrega."
    return `Status de entrega: ${target}.`
  }

  // 2. Linhas de status de pagamento
  if (lower.includes("status de pagamento") || lower.includes("status do pagamento")) {
    const target = (
      trimmed.includes("->") || trimmed.includes("→")
        ? trimmed.split(/->|→/).pop()!
        : trimmed.replace(/^.*status\s+d[oe]\s+pagamento:?\s*/i, "")
    ).trim().toLowerCase()

    if (target.includes("pago") || target.includes("aprovado") || target.includes("concluído") || target.includes("concluido") || target === "paid" || target === "approved") return "Pagamento aprovado com sucesso."
    if (target.includes("cancelado") || target.includes("recusado") || target === "cancelled" || target === "failed") return "Pagamento cancelado."
    if (target.includes("reembolsado") || target.includes("estornado") || target === "refunded") return "Pagamento reembolsado."
    if (target.includes("pendente") || target.includes("aguardando") || target === "pending") return "Aguardando confirmação de pagamento."
    if (target.includes("análise") || target.includes("analise") || target.includes("processando") || target === "processing") return "Pagamento em análise."
    return `Status de pagamento: ${target}.`
  }

  // 3. Linhas de status de devolução / troca
  if (
    lower.includes("alterou status") ||
    lower.includes("status da solicitação") ||
    lower.includes("status de devolução") ||
    lower.includes("status de troca")
  ) {
    const target = (
      trimmed.includes("->") || trimmed.includes("→")
        ? trimmed.split(/->|→/).pop()!
        : trimmed.replace(/^.*status[^:]*:?\s*/i, "")
    ).trim().toLowerCase()

    if (target.includes("aprovad")) return "Solicitação de troca/devolução aprovada."
    if (target.includes("recusad") || target.includes("rejeitad")) return "Solicitação de troca/devolução recusada."
    if (target.includes("resolvid") || target.includes("concluíd") || target.includes("concluid")) return "Solicitação de troca/devolução concluída."
    if (target.includes("análise") || target.includes("analise")) return "Solicitação de troca/devolução em análise."
    if (target.includes("aguardando devolução") || target.includes("aguardando devolucao") || target.includes("item_return")) return "Aguardando devolução dos itens."
    if (target.includes("aguardando cliente") || target.includes("waiting_customer")) return "Solicitação aguardando retorno do cliente."
    if (target.includes("escalada") || target.includes("moderação") || target.includes("moderacao") || target.includes("escalated")) return "Solicitação escalada para moderação da Dudit."
    if (target.includes("expirad") || target.includes("expired")) return "Solicitação expirada."
  }

  // 4. Criação e atualização de devolução
  if (
    trimmed === "Solicitação criada" ||
    trimmed === "Solicitação criada." ||
    trimmed === "Solicitação de devolução criada" ||
    trimmed === "Solicitação de devolução criada." ||
    trimmed === "Solicitação de devolução criada pelo cliente" ||
    trimmed === "Solicitação de devolução criada pelo cliente."
  ) {
    return "Solicitação de troca/devolução criada."
  }

  if (trimmed.startsWith("Solicitação atualizada:") || trimmed.startsWith("Solicitação de devolução atualizada:") || trimmed === "Status da solicitação atualizado.") {
    return "Solicitação de troca/devolução atualizada."
  }

  // 5. Linhas de sinal (depósito) neutras para cliente, vendedor e admin
  if (lower.includes("sinal") && (lower.includes("cancel") || lower.includes("cancelado"))) {
    return "Cobrança de sinal cancelada."
  }
  if (lower.includes("sinal") && (lower.includes("gerad") || lower.includes("gerou"))) {
    return "Cobrança de sinal gerada via Mercado Pago."
  }
  if (lower.includes("sinal") && (lower.includes("confirm") || lower.includes("pago") || lower.includes("recebimento"))) {
    return "Pagamento do sinal confirmado com sucesso."
  }
  if (lower.includes("sinal") && (lower.includes("expir") || lower.includes("expirou"))) {
    return "Prazo para pagamento do sinal expirado."
  }

  // 6. Ações comuns de log
  if (lower.includes("alterou as observações do pedido")) {
    return "Observações do pedido atualizadas."
  }
  if (lower === "reembolso via mercado pago executado" || lower === "reembolso via mercado pago executado.") {
    return "Reembolso via Mercado Pago processado com sucesso."
  }
  if (trimmed === "criou registro.") return "Registro criado."
  if (trimmed === "atualizou informações.") return "Informações atualizadas."
  if (trimmed === "cancelou registro.") return "Registro cancelado."
  if (trimmed === "marcou como pago.") return "Marcado como pago."
  if (trimmed === "marcou como recebido.") return "Marcado como recebido."

  // 7. Padrão geral de transição de status antigo
  const statusTransitionRegex = /(?:status(?:\s+alterado)?[:\s]+)(?:["']?([a-zA-Z0-9_-]+)["']?)\s*(?:→|->|para)\s*(?:["']?([a-zA-Z0-9_-]+)["']?)/i
  const matchTransition = trimmed.match(statusTransitionRegex)
  if (matchTransition) {
    const rawOld = matchTransition[1]?.toLowerCase()
    const rawNew = matchTransition[2]?.toLowerCase()
    const oldLabel = KNOWN_STATUS_LABELS[rawOld] || matchTransition[1]
    const newLabel = KNOWN_STATUS_LABELS[rawNew] || matchTransition[2]
    return `Status alterado de "${oldLabel}" para "${newLabel}".`
  }

  const statusUpdatedRegex = /status(?:\s+(?:de\s+frete|da\s+etiqueta(?:\s+de\s+[a-zçãõáéíóú]+)?))?\s+(?:alterado|atualizado)\s+para:?\s*["']?([a-zA-Z0-9_-]+)["']?/i
  const matchUpdated = trimmed.match(statusUpdatedRegex)
  if (matchUpdated) {
    const rawNew = matchUpdated[1]?.toLowerCase()
    const newLabel = KNOWN_STATUS_LABELS[rawNew] || matchUpdated[1]
    if (newLabel) return `Status alterado para "${newLabel}".`
  }

  return trimmed
}



/**
 * Formats a delivery estimate range in pt-BR.
 * - Same min/max (or a single value): "Entrega em 10 dias" / "Entrega em 1 dia"
 * - Different range: "Entrega em 8 a 10 dias"
 * - Nothing available: "Prazo a confirmar"
 */
export function formatDeliveryDaysRange(
  minDays: number | null | undefined,
  maxDays: number | null | undefined
): string {
  const toInt = (v: number | null | undefined): number | null => {
    if (v == null || !Number.isFinite(Number(v))) return null
    return Math.round(Number(v))
  }
  let min = toInt(minDays)
  let max = toInt(maxDays)
  if (min != null && max != null && min > max) {
    const tmp = min
    min = max
    max = tmp
  }
  if (min != null && max != null && min !== max) {
    return `Entrega em ${min} a ${max} dias`
  }
  const single = min ?? max
  if (single != null) {
    return `Entrega em ${single} ${single === 1 ? "dia" : "dias"}`
  }
  return "Prazo a confirmar"
}
