/**
 * Regras de enquadramento tributário usadas pelo Dudit.
 *
 * Escopo do produto: MEI + Pessoa Física. Não há suporte a ME/EPP do Simples
 * (CRT 1/2) nem a emissão de documento fiscal.
 *
 * Referências:
 *  - MEI é SIMEI, CRT 4, e não pode ter filial (um único CNPJ).
 *  - Limite MEI: R$ 81.000 (até 2026), R$ 110.000 (2027), R$ 140.000 (2028).
 *  - Nanoempreendedor: 50% do limite MEI e fora do IBS/CBS (LC 214/2025, art. 26, IV).
 *  - Excesso de até 20% mantém o MEI com DAS complementar; acima disso há
 *    desenquadramento retroativo.
 */

export type TaxProfile = "nao_informado" | "mei" | "nano" | "pf_contribuinte"

export const TAX_PROFILES: TaxProfile[] = ["nao_informado", "mei", "nano", "pf_contribuinte"]

export interface TaxProfileMeta {
  label: string
  shortLabel: string
  description: string
  /** Precisa de CNPJ para operar regularmente. */
  requiresCnpj: boolean
  /** Tem limite anual de faturamento monitorado. */
  hasRevenueLimit: boolean
  /** Emite documento fiscal (ou precisa informar o número no pedido). */
  issuesFiscalDocument: boolean
  /** CRT esperado na NF-e. */
  crt: string | null
}

export const TAX_PROFILE_META: Record<TaxProfile, TaxProfileMeta> = {
  nao_informado: {
    label: "Ainda não informado",
    shortLabel: "Não informado",
    description: "Complete o perfil para liberar o monitor de limite e as regras fiscais.",
    requiresCnpj: false,
    hasRevenueLimit: false,
    issuesFiscalDocument: false,
    crt: null,
  },
  mei: {
    label: "MEI — Microempreendedor Individual",
    shortLabel: "MEI",
    description:
      "Optante pelo SIMEI (CRT 4). Recolhe DAS fixo mensal, com IBS/CBS embutidos. Dispensado de NF-e para consumidor final PF; obrigado para cliente PJ.",
    requiresCnpj: true,
    hasRevenueLimit: true,
    issuesFiscalDocument: true,
    crt: "4",
  },
  nano: {
    label: "Nanoempreendedor (Pessoa Física)",
    shortLabel: "Nanoempreendedor",
    description:
      "Pessoa física com faturamento abaixo de 50% do limite do MEI e sem opção pelo MEI. Não é contribuinte de IBS/CBS e é dispensada de CNPJ e documento fiscal.",
    requiresCnpj: false,
    hasRevenueLimit: true,
    issuesFiscalDocument: false,
    crt: null,
  },
  pf_contribuinte: {
    label: "Pessoa Física contribuinte (CNPJ técnico)",
    shortLabel: "PF contribuinte",
    description:
      "Pessoa física que atua de forma habitual ou ultrapassou o limite do nanoempreendedor. Precisa de CNPJ técnico e emite documento fiscal desde 01/01/2027.",
    requiresCnpj: true,
    hasRevenueLimit: false,
    issuesFiscalDocument: true,
    crt: "3",
  },
}

const MEI_LIMIT_BY_YEAR: Record<number, number> = {
  2026: 81_000,
  2027: 110_000,
  2028: 140_000,
}

/** Limite do MEI para o ano. Anos posteriores seguem o último valor conhecido. */
export function getMeiAnnualLimit(year: number): number {
  if (MEI_LIMIT_BY_YEAR[year]) return MEI_LIMIT_BY_YEAR[year]
  if (year < 2026) return 81_000
  return 140_000
}

/** Nanoempreendedor = 50% do limite do MEI. */
export function getNanoAnnualLimit(year: number): number {
  return Math.round(getMeiAnnualLimit(year) / 2)
}

export function getDefaultAnnualLimit(profile: TaxProfile, year: number): number | null {
  if (profile === "mei") return getMeiAnnualLimit(year)
  if (profile === "nano") return getNanoAnnualLimit(year)
  return null
}

/**
 * No ano de abertura o limite é proporcional aos meses restantes (inclui o mês
 * de abertura). Fora do ano de abertura, retorna o limite cheio.
 */
export function getProratedAnnualLimit(
  limit: number,
  year: number,
  openingDate?: string | null,
): number {
  if (!openingDate) return limit
  const opened = new Date(`${openingDate.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(opened.getTime())) return limit
  if (opened.getFullYear() !== year) return limit

  const monthsRemaining = 12 - opened.getMonth()
  if (monthsRemaining >= 12) return limit
  return Math.round((limit / 12) * monthsRemaining)
}

/** Margem de tolerância antes do desenquadramento retroativo. */
export const MEI_TOLERANCE_RATE = 0.2

export type RevenueLimitStatus = "sem_perfil" | "ok" | "atencao" | "limite" | "tolerancia" | "excedido"

export interface RevenueLimitSnapshot {
  status: RevenueLimitStatus
  limit: number | null
  toleranceLimit: number | null
  revenue: number
  percentage: number
  remaining: number | null
  toleranceRemaining: number | null
  /** Projeção de fechamento do ano com base no ritmo atual. */
  projectedAnnual: number | null
  /** Data estimada em que o limite será atingido (ISO), se o ritmo se mantiver. */
  projectedBreachDate: string | null
}

export function computeRevenueLimitSnapshot(params: {
  profile: TaxProfile
  limit: number | null
  revenue: number
  year: number
  /** Data de referência (default: hoje). */
  referenceDate?: Date
}): RevenueLimitSnapshot {
  const { limit, revenue } = params
  const referenceDate = params.referenceDate ?? new Date()
  const year = params.year

  if (!limit || limit <= 0) {
    return {
      status: "sem_perfil",
      limit: null,
      toleranceLimit: null,
      revenue,
      percentage: 0,
      remaining: null,
      toleranceRemaining: null,
      projectedAnnual: null,
      projectedBreachDate: null,
    }
  }

  const rawPercentage = (revenue / limit) * 100
  // Arredonda para baixo: com arredondamento normal um faturamento de 99,6%
  // apareceria como 100% e o status mudaria antes de o limite ser atingido.
  const percentage = Math.floor(rawPercentage)
  // A margem de 20% é regra do MEI (DAS complementar). Para o nanoempreendedor
  // o teto é seco: acima de 50% do limite do MEI ele deixa de ser nano.
  const toleranceRate = params.profile === "mei" ? MEI_TOLERANCE_RATE : 0
  const toleranceLimit = Math.round(limit * (1 + toleranceRate) * 100) / 100
  const remaining = Math.max(0, limit - revenue)
  const toleranceRemaining = Math.max(0, toleranceLimit - revenue)

  let status: RevenueLimitStatus = "ok"
  if (toleranceRate > 0) {
    if (revenue > toleranceLimit) status = "excedido"
    else if (revenue > limit) status = "tolerancia"
    else if (rawPercentage >= 100) status = "limite"
    else if (rawPercentage >= 80) status = "atencao"
  } else {
    if (revenue > limit) status = "excedido"
    else if (rawPercentage >= 100) status = "limite"
    else if (rawPercentage >= 80) status = "atencao"
  }

  // Projeção: só faz sentido se o ano já começou.
  const startOfYear = new Date(year, 0, 1)
  const endOfYear = new Date(year, 11, 31)
  const ref = referenceDate > endOfYear ? endOfYear : referenceDate
  const elapsedMs = ref.getTime() - startOfYear.getTime()
  const totalMs = endOfYear.getTime() - startOfYear.getTime()
  const elapsedShare = totalMs > 0 ? Math.min(Math.max(elapsedMs / totalMs, 0), 1) : 0

  let projectedAnnual: number | null = null
  let projectedBreachDate: string | null = null

  if (elapsedShare > 0.02) {
    projectedAnnual = Math.round(revenue / elapsedShare)
    if (revenue > 0 && revenue < limit) {
      const dailyRate = revenue / Math.max(1, Math.round(elapsedMs / 86_400_000))
      const daysToLimit = Math.round((limit - revenue) / dailyRate)
      const breach = new Date(ref.getTime() + daysToLimit * 86_400_000)
      projectedBreachDate = breach <= endOfYear ? breach.toISOString().slice(0, 10) : null
    }
  }

  return {
    status,
    limit,
    toleranceLimit,
    revenue,
    percentage,
    remaining,
    toleranceRemaining,
    projectedAnnual,
    projectedBreachDate,
  }
}

export function normalizeDocument(value?: string | null): string {
  return (value || "").replace(/\D/g, "")
}

export function formatDocument(value?: string | null, type?: "cnpj" | "cpf" | null): string {
  const digits = normalizeDocument(value)
  if (!digits) return ""
  if (type === "cpf" || digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  }
  return digits
}

export function detectDocumentType(value?: string | null): "cnpj" | "cpf" | null {
  const digits = normalizeDocument(value)
  if (digits.length === 14) return "cnpj"
  if (digits.length === 11) return "cpf"
  return null
}

export const REVENUE_LIMIT_STATUS_META: Record<
  RevenueLimitStatus,
  { label: string; tone: "green" | "orange" | "red" | "gray" }
> = {
  sem_perfil: { label: "Perfil não informado", tone: "gray" },
  ok: { label: "Dentro do limite", tone: "green" },
  atencao: { label: "Atenção ao limite", tone: "orange" },
  limite: { label: "Limite atingido", tone: "orange" },
  tolerancia: { label: "Na margem de tolerância", tone: "red" },
  excedido: { label: "Limite excedido", tone: "red" },
}
