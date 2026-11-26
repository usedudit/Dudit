/**
 * Regras de frete grátis por estado (UF) e valor mínimo do pedido para envio
 * via transportadora (SuperFrete).
 *
 * Módulo puro (sem dependências de servidor) — seguro para importar em Client Components,
 * Server Actions e testes unitários.
 */

export const BRAZILIAN_STATES = [
  { uf: "AC", name: "Acre", region: "Norte" },
  { uf: "AL", name: "Alagoas", region: "Nordeste" },
  { uf: "AP", name: "Amapá", region: "Norte" },
  { uf: "AM", name: "Amazonas", region: "Norte" },
  { uf: "BA", name: "Bahia", region: "Nordeste" },
  { uf: "CE", name: "Ceará", region: "Nordeste" },
  { uf: "DF", name: "Distrito Federal", region: "Centro-Oeste" },
  { uf: "ES", name: "Espírito Santo", region: "Sudeste" },
  { uf: "GO", name: "Goiás", region: "Centro-Oeste" },
  { uf: "MA", name: "Maranhão", region: "Nordeste" },
  { uf: "MT", name: "Mato Grosso", region: "Centro-Oeste" },
  { uf: "MS", name: "Mato Grosso do Sul", region: "Centro-Oeste" },
  { uf: "MG", name: "Minas Gerais", region: "Sudeste" },
  { uf: "PA", name: "Pará", region: "Norte" },
  { uf: "PB", name: "Paraíba", region: "Nordeste" },
  { uf: "PR", name: "Paraná", region: "Sul" },
  { uf: "PE", name: "Pernambuco", region: "Nordeste" },
  { uf: "PI", name: "Piauí", region: "Nordeste" },
  { uf: "RJ", name: "Rio de Janeiro", region: "Sudeste" },
  { uf: "RN", name: "Rio Grande do Norte", region: "Nordeste" },
  { uf: "RS", name: "Rio Grande do Sul", region: "Sul" },
  { uf: "RO", name: "Rondônia", region: "Norte" },
  { uf: "RR", name: "Roraima", region: "Norte" },
  { uf: "SC", name: "Santa Catarina", region: "Sul" },
  { uf: "SP", name: "São Paulo", region: "Sudeste" },
  { uf: "SE", name: "Sergipe", region: "Nordeste" },
  { uf: "TO", name: "Tocantins", region: "Norte" },
] as const

export type BrazilianStateUf = (typeof BRAZILIAN_STATES)[number]["uf"]

export const BRAZILIAN_STATE_UFS = new Set<string>(BRAZILIAN_STATES.map((s) => s.uf))

export type CarrierFreeShippingAppliesTo = "cheapest" | "all"

export interface CarrierFreeShippingRule {
  id: string
  storeId?: string | null
  minOrderValue: number
  allStates: boolean
  states: BrazilianStateUf[]
  appliesTo: CarrierFreeShippingAppliesTo
  isActive: boolean
}

export interface CarrierFreeShippingEvaluation {
  destinationState: BrazilianStateUf | null
  /** Menor valor mínimo entre as regras ativas que cobrem o estado de destino (para barra de progresso). */
  applicableThreshold: number | null
  /** Se o pedido atingiu alguma regra ativa para o estado de destino. */
  isFree: boolean
  /** Se isFree = true, indica se zera apenas a opção mais barata ou todas. */
  appliesTo: CarrierFreeShippingAppliesTo | null
  /** Regra vencedora aplicada, se houver. */
  matchedRule: CarrierFreeShippingRule | null
}

/**
 * Faixas oficiais de CEP dos Correios (prefixo numérico de 5 dígitos -> UF).
 */
const CEP_PREFIX_RANGES: ReadonlyArray<[number, number, BrazilianStateUf]> = [
  [1000, 19999, "SP"],
  [20000, 28999, "RJ"],
  [29000, 29999, "ES"],
  [30000, 39999, "MG"],
  [40000, 48999, "BA"],
  [49000, 49999, "SE"],
  [50000, 56999, "PE"],
  [57000, 57999, "AL"],
  [58000, 58999, "PB"],
  [59000, 59999, "RN"],
  [60000, 63999, "CE"],
  [64000, 64999, "PI"],
  [65000, 65999, "MA"],
  [66000, 68899, "PA"],
  [68900, 68999, "AP"],
  [69000, 69299, "AM"],
  [69300, 69399, "RR"],
  [69400, 69899, "AM"],
  [69900, 69999, "AC"],
  [70000, 72799, "DF"],
  [72800, 72999, "GO"],
  [73000, 73699, "DF"],
  [73700, 76799, "GO"],
  [76800, 76999, "RO"],
  [77000, 77999, "TO"],
  [78000, 78899, "MT"],
  [78900, 78999, "RO"],
  [79000, 79999, "MS"],
  [80000, 87999, "PR"],
  [88000, 89999, "SC"],
  [90000, 99999, "RS"],
]

/**
 * Resolve a UF brasileira (ex.: "SP", "PR") a partir de um CEP de 8 dígitos.
 * Retorna null se o CEP for inválido ou fora das faixas conhecidas.
 */
export function resolveStateFromCep(cep: string | null | undefined): BrazilianStateUf | null {
  const digits = String(cep || "").replace(/\D/g, "")
  if (digits.length !== 8) return null
  const prefix = Number(digits.slice(0, 5))
  if (!Number.isFinite(prefix)) return null
  for (const [min, max, uf] of CEP_PREFIX_RANGES) {
    if (prefix >= min && prefix <= max) return uf
  }
  return null
}

export function normalizeStateList(states: unknown): BrazilianStateUf[] {
  if (!Array.isArray(states)) return []
  const unique = new Set<BrazilianStateUf>()
  for (const item of states) {
    const uf = String(item || "").trim().toUpperCase()
    if (BRAZILIAN_STATE_UFS.has(uf)) {
      unique.add(uf as BrazilianStateUf)
    }
  }
  return Array.from(unique).sort()
}

export function evaluateCarrierFreeShipping(input: {
  destinationCep?: string | null
  destinationState?: string | null
  orderSubtotal?: number | null
  rules: CarrierFreeShippingRule[]
}): CarrierFreeShippingEvaluation {
  const explicitUf = String(input.destinationState || "").trim().toUpperCase()
  const destinationState: BrazilianStateUf | null = BRAZILIAN_STATE_UFS.has(explicitUf)
    ? (explicitUf as BrazilianStateUf)
    : resolveStateFromCep(input.destinationCep)

  const activeRules = (input.rules || []).filter((r) => r && r.isActive)
  if (activeRules.length === 0) {
    return {
      destinationState,
      applicableThreshold: null,
      isFree: false,
      appliesTo: null,
      matchedRule: null,
    }
  }

  const eligibleForDestination = activeRules.filter((rule) => {
    if (rule.allStates) return true
    if (!destinationState) return false
    return rule.states.includes(destinationState)
  })

  if (eligibleForDestination.length === 0) {
    return {
      destinationState,
      applicableThreshold: null,
      isFree: false,
      appliesTo: null,
      matchedRule: null,
    }
  }

  const sortedByThreshold = [...eligibleForDestination].sort(
    (a, b) => Number(a.minOrderValue) - Number(b.minOrderValue),
  )
  const applicableThreshold = Number(sortedByThreshold[0].minOrderValue)

  const subtotal =
    input.orderSubtotal != null && Number.isFinite(Number(input.orderSubtotal))
      ? Number(input.orderSubtotal)
      : null

  if (subtotal == null) {
    return {
      destinationState,
      applicableThreshold,
      isFree: false,
      appliesTo: null,
      matchedRule: null,
    }
  }

  const satisfied = sortedByThreshold.filter((r) => subtotal >= Number(r.minOrderValue))
  if (satisfied.length === 0) {
    return {
      destinationState,
      applicableThreshold,
      isFree: false,
      appliesTo: null,
      matchedRule: null,
    }
  }

  // Se alguma regra atingida libera todas as modalidades, ela prevalece sobre 'cheapest'.
  const allRule = satisfied.find((r) => r.appliesTo === "all")
  const matchedRule = allRule || satisfied[0]

  return {
    destinationState,
    applicableThreshold,
    isFree: true,
    appliesTo: matchedRule.appliesTo,
    matchedRule,
  }
}

export interface CarrierOptionWithPrice {
  price: number
  originalPrice?: number
  isFreeShipping?: boolean
  freeShippingRuleId?: string | null
}

/**
 * Aplica o resultado da avaliação de frete grátis sobre uma lista de opções
 * de transportadora (sem mutar o array original).
 */
export function applyCarrierFreeShippingToOptions<T extends CarrierOptionWithPrice>(
  options: readonly T[],
  evaluation: CarrierFreeShippingEvaluation,
): Array<T & CarrierOptionWithPrice> {
  if (!evaluation.isFree || options.length === 0) {
    return options.map((opt) => ({ ...opt }))
  }

  // Encontra o índice da opção mais barata
  let cheapestIndex = 0
  for (let i = 1; i < options.length; i++) {
    if (options[i].price < options[cheapestIndex].price) {
      cheapestIndex = i
    }
  }

  return options.map((opt, idx) => {
    const shouldZero = evaluation.appliesTo === "all" || idx === cheapestIndex
    if (!shouldZero) return { ...opt }
    return {
      ...opt,
      originalPrice: opt.originalPrice ?? opt.price,
      price: 0,
      isFreeShipping: true,
      freeShippingRuleId: evaluation.matchedRule?.id ?? null,
    }
  })
}
