export const EXPORT_CHUNK_SIZE = 500
export const EXPORT_MAX_ROWS = 25_000

export const MODULE_SHEET_NAMES: Record<string, string> = {
  orders: "Pedidos",
  sales: "Vendas",
  products: "Produtos",
  customers: "Clientes",
  services: "Serviços",
  appointments: "Agendamentos",
  subscriptions: "Assinaturas",
  returns: "Devoluções",
  "stock-movements": "Mov. Estoque",
  transactions: "Transações",
  suppliers: "Fornecedores",
  "service-orders": "Ordens de Serviço",
  "cash-register": "Controle de Caixa",
  "xml-import": "Importação XML",
  quotes: "Orçamentos",
}

export const MODULE_FILENAME_NAMES: Record<string, string> = {
  orders: "pedidos",
  sales: "vendas",
  products: "produtos",
  customers: "clientes",
  services: "servicos",
  appointments: "agendamentos",
  subscriptions: "assinaturas",
  returns: "devolucoes",
  "stock-movements": "mov-estoque",
  transactions: "transacoes",
  suppliers: "fornecedores",
  "service-orders": "ordens-servico",
  "cash-register": "controle-caixa",
  "xml-import": "importacao-xml",
  quotes: "orcamentos",
}

export async function formatExportFilename(module: string, extension: string, partnerId?: string): Promise<string> {
  const name = MODULE_FILENAME_NAMES[module] || module
  const now = new Date()
  let tz = "America/Sao_Paulo"
  if (partnerId) {
    try {
      const { getPartnerTimezone } = await import("@/lib/date")
      tz = await getPartnerTimezone(partnerId)
    } catch {}
  }
  const brazil = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now)
  const parts: Record<string, string> = {}
  for (const p of brazil) parts[p.type] = p.value
  const dateStamp = `${parts.day}-${parts.month}-${parts.year}-${parts.hour}${parts.minute}`
  return `dudit-${name}-${dateStamp}.${extension}`
}
