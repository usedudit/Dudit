import { normalizeSearchQuery } from "./normalize"

export type SearchIntentType = "product" | "service" | "mixed"
export type TimePeriod = "morning" | "afternoon" | "evening" | "any"
export type SearchUrgency = "high" | "normal"

export interface ParsedTimeWindow {
  /** Data alvo no formato YYYY-MM-DD (horário de Brasília) */
  targetDate: string
  /** Dia da semana em inglês compatível com OpeningHoursData */
  dayOfWeekKey: "sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday"
  /** Período do dia detectado */
  period: TimePeriod
  /** Início da janela em minutos desde 00:00 */
  startMinutes: number
  /** Fim da janela em minutos desde 00:00 */
  endMinutes: number
  /** Rótulo legível em PT-BR (ex: "amanhã de manhã", "hoje à tarde") */
  label: string
}

export interface ParsedSearchIntent {
  rawQuery: string
  /** Query limpa sem enchimentos naturais e expressões de tempo */
  cleanQuery: string
  /** Intenção principal detectada */
  intent: SearchIntentType
  /** Confiança da classificação determinística (0 a 1) */
  confidence: number
  /** Janela de agendamento/atendimento detectada, se houver */
  timeWindow: ParsedTimeWindow | null
  /** Nível de urgência detectado */
  urgency: SearchUrgency
  /** Termos/categorias de vitrines relacionadas (ex: pneu -> borracharia, automotivo) */
  relatedTerms: string[]
  /** Indica se a query se beneficia de fallback de IA (linguagem natural / problema aberto) */
  needsAiFallback: boolean
  /** Origem da interpretação */
  source: "rules" | "ai" | "ai_cache"
  /** Termos alternativos sugeridos pela IA (quando aplicável) */
  aiSuggestedTerms?: string[]
  /** Categorias sugeridas pela IA (quando aplicável) */
  aiSuggestedCategories?: string[]
}

const DAYS_OF_WEEK: ParsedTimeWindow["dayOfWeekKey"][] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
]

const WEEKDAY_PATTERNS: { pattern: RegExp; targetDay: number; label: string }[] = [
  { pattern: /\b(domingo)\b/g, targetDay: 0, label: "domingo" },
  { pattern: /\b(segunda(?:-feira)?)\b/g, targetDay: 1, label: "segunda-feira" },
  { pattern: /\b(terca(?:-feira)?)\b/g, targetDay: 2, label: "terça-feira" },
  { pattern: /\b(quarta(?:-feira)?)\b/g, targetDay: 3, label: "quarta-feira" },
  { pattern: /\b(quinta(?:-feira)?)\b/g, targetDay: 4, label: "quinta-feira" },
  { pattern: /\b(sexta(?:-feira)?)\b/g, targetDay: 5, label: "sexta-feira" },
  { pattern: /\b(sabado)\b/g, targetDay: 6, label: "sábado" },
]

/** Frases de enchimento típicas de busca em linguagem natural em PT-BR */
const FILLER_PHRASES: RegExp[] = [
  /\b(?:oi|ola|por favor|pfv)\b/g,
  /\b(?:eu\s+)?(?:estou|to)\s+(?:precisando|procurando|buscando)\s+(?:de\s+)?(?:um|uma|uns|umas)?\b/g,
  /\b(?:preciso|necessito|quero|procuro|busco)\s+(?:contratar|comprar|achar|encontrar|agendar|marcar)?\s*(?:de\s+)?(?:um|uma|uns|umas)?\b/g,
  /\b(?:onde\s+(?:encontro|encontrar|comprar|compro|achar|acho|tem|fazem|faz))\b/g,
  /\b(?:alguem\s+(?:faz|vende|indica|recomenda|conserta|instala))\b/g,
  /\b(?:me\s+)?(?:indica|indique|recomenda|recomende)\s+(?:um|uma)?\b/g,
  /\b(?:perto\s+de\s+mim|aqui\s+perto|por\s+perto|na\s+minha\s+cidade|na\s+regiao|mais\s+proximo|mais\s+proxima)\b/g,
  /\b(?:com\s+urgencia|urgente|urgentemente|emergencia|rapido|para\s+ja|pra\s+ja)\b/g,
]

/** Termos fortes de intenção de SERVIÇO (profissões e verbos de serviço) */
const SERVICE_KEYWORDS = new Set([
  "eletricista",
  "encanador",
  "hidraulico",
  "bombeiro",
  "mecanico",
  "mecanica",
  "borracheiro",
  "borracharia",
  "chaveiro",
  "guincho",
  "barbeiro",
  "barbearia",
  "cabeleireiro",
  "cabeleireira",
  "manicure",
  "pedicure",
  "sobrancelha",
  "depilacao",
  "esteticista",
  "massagista",
  "massagem",
  "diarista",
  "faxineira",
  "faxina",
  "limpeza",
  "lavagem",
  "lavanderia",
  "pintor",
  "pedreiro",
  "marceneiro",
  "serralheiro",
  "vidraceiro",
  "jardineiro",
  "paisagista",
  "dedetizacao",
  "dedetizadora",
  "desentupidora",
  "desentupimento",
  "tecnico",
  "conserto",
  "reparo",
  "manutencao",
  "instalacao",
  "instalar",
  "consertar",
  "arrumar",
  "trocar",
  "montador",
  "montagem",
  "frete",
  "carreto",
  "mudanca",
  "personal",
  "fisioterapeuta",
  "psicologo",
  "nutricionista",
  "dentista",
  "veterinario",
  "tosa",
  "adestrador",
  "fotografo",
  "filmagem",
  "buffet",
  "aluguel",
  "locacao",
  "aulas",
  "aula",
  "professor",
  "professora",
  "contador",
  "advogado",
  "agendamento",
  "agendar",
  "orcamento",
  "revisao",
  "alinhamento",
  "balanceamento",
  "funilaria",
  "martelinho",
  "higienizacao",
  "impermeabilizacao",
])

/** Termos/padrões fortes de intenção de PRODUTO */
const PRODUCT_PATTERNS: RegExp[] = [
  /\baro\s*\d{2}\b/,
  /\b\d{3}\/\d{2}\s*r?\d{2}\b/, // medida de pneu ex: 205/55 r16
  /\b\d+\s*(?:gb|tb|mb|ml|kg|g|l|w|v|mah|cm|mm|pol)\b/,
  /\b(?:comprar|novo|usado|seminovo|original|paralelo|kit|par\s+de|jogo\s+de)\b/,
]

/**
 * Mapa leve de associações produto/necessidade -> categorias e tipos de loja/serviço.
 * Funciona em 0ms sem IA e complementa `marketplace_synonym_groups` no Postgres.
 */
const DOMAIN_ASSOCIATIONS: Record<string, string[]> = {
  pneu: ["borracharia", "autocenter", "oficina mecanica", "automotivo"],
  pneus: ["borracharia", "autocenter", "oficina mecanica", "automotivo"],
  bateria: ["autoeletrica", "autocenter", "oficina mecanica", "automotivo"],
  oleo: ["oficina mecanica", "autocenter", "troca de oleo", "automotivo"],
  freio: ["oficina mecanica", "autocenter", "automotivo"],
  pastilha: ["oficina mecanica", "autocenter", "automotivo"],
  amortecedor: ["oficina mecanica", "autocenter", "automotivo"],
  chuveiro: ["eletricista", "materiais eletricos", "hidraulica"],
  tomada: ["eletricista", "materiais eletricos"],
  disjuntor: ["eletricista", "materiais eletricos"],
  vazamento: ["encanador", "hidraulica", "desentupidora"],
  torneira: ["encanador", "materiais de construcao", "hidraulica"],
  cano: ["encanador", "materiais de construcao", "hidraulica"],
  fechadura: ["chaveiro", "ferragens"],
  chave: ["chaveiro"],
  ar: ["ar condicionado", "refrigeracao", "climatizacao"],
  geladeira: ["refrigeracao", "assistencia tecnica"],
  celular: ["assistencia tecnica", "eletronicos", "informatica"],
  tela: ["assistencia tecnica", "celular", "informatica"],
  notebook: ["informatica", "assistencia tecnica"],
  bolo: ["confeitaria", "padaria", "doceria"],
  salgado: ["salgaderia", "buffet", "festas"],
  racao: ["pet shop", "agropecuaria"],
  cachorro: ["pet shop", "veterinario", "banho e tosa"],
  gato: ["pet shop", "veterinario"],
}

/** Padrões que indicam problema/linguagem natural aberta (candidato ao fallback de IA) */
const NATURAL_PROBLEM_PATTERNS: RegExp[] = [
  /\b(?:queimou|quebrou|parou|nao\s+liga|nao\s+funciona|vazando|entupiu|barulho|estragou|rasgou|furou|trincou|caiu)\b/,
  /\b(?:presente\s+para|presente\s+pra|ideia\s+de|algo\s+para|algo\s+pra|como\s+resolver)\b/,
]

function getBrazilDateParts(date: Date): { year: number; month: number; day: number; dayOfWeek: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  })
  const parts = formatter.formatToParts(date)
  const year = Number(parts.find((p) => p.type === "year")?.value ?? date.getUTCFullYear())
  const month = Number(parts.find((p) => p.type === "month")?.value ?? date.getUTCMonth() + 1)
  const day = Number(parts.find((p) => p.type === "day")?.value ?? date.getUTCDate())
  const weekdayShort = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase()
  const weekdayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  }
  const dayOfWeek = weekdayMap[weekdayShort.slice(0, 3)] ?? date.getUTCDay()
  return { year, month, day, dayOfWeek }
}

function addDaysToYmd(year: number, month: number, day: number, offsetDays: number): { ymd: string; dayOfWeek: number } {
  const utc = new Date(Date.UTC(year, month - 1, day + offsetDays, 12, 0, 0))
  const y = utc.getUTCFullYear()
  const m = String(utc.getUTCMonth() + 1).padStart(2, "0")
  const d = String(utc.getUTCDate()).padStart(2, "0")
  return { ymd: `${y}-${m}-${d}`, dayOfWeek: utc.getUTCDay() }
}

function extractTimeWindow(normalized: string, now: Date): { timeWindow: ParsedTimeWindow | null; stripped: string } {
  let stripped = normalized
  let dayOffset: number | null = null
  let dayLabel = ""

  const { year, month, day, dayOfWeek } = getBrazilDateParts(now)

  if (/\bdepois\s+de\s+amanha\b/.test(stripped)) {
    dayOffset = 2
    dayLabel = "depois de amanhã"
    stripped = stripped.replace(/\b(?:para\s+|pra\s+)?depois\s+de\s+amanha\b/g, " ")
  } else if (/\bamanha\b/.test(stripped)) {
    dayOffset = 1
    dayLabel = "amanhã"
    stripped = stripped.replace(/\b(?:para\s+|pra\s+)?amanha\b/g, " ")
  } else if (/\b(?:hoje|agora)\b/.test(stripped)) {
    dayOffset = 0
    dayLabel = "hoje"
    stripped = stripped.replace(/\b(?:para\s+|pra\s+)?(?:hoje|agora)\b/g, " ")
  } else {
    for (const wd of WEEKDAY_PATTERNS) {
      if (wd.pattern.test(stripped)) {
        wd.pattern.lastIndex = 0
        let diff = (wd.targetDay - dayOfWeek + 7) % 7
        if (diff === 0) diff = 7
        dayOffset = diff
        dayLabel = wd.label
        stripped = stripped.replace(new RegExp(`\\b(?:na\\s+|no\\s+|para\\s+|pra\\s+)?${wd.pattern.source}`, "g"), " ")
        break
      }
    }
  }

  let period: TimePeriod = "any"
  let periodLabel = ""
  let startMinutes = 8 * 60
  let endMinutes = 18 * 60

  if (/\b(?:de\s+manha|pela\s+manha|manha)\b/.test(stripped)) {
    period = "morning"
    periodLabel = "de manhã"
    startMinutes = 8 * 60
    endMinutes = 12 * 60
    stripped = stripped.replace(/\b(?:de\s+manha|pela\s+manha|manha)\b/g, " ")
  } else if (/\b(?:a\s+tarde|de\s+tarde|pela\s+tarde|tarde)\b/.test(stripped)) {
    period = "afternoon"
    periodLabel = "à tarde"
    startMinutes = 12 * 60
    endMinutes = 18 * 60
    stripped = stripped.replace(/\b(?:a\s+tarde|de\s+tarde|pela\s+tarde|tarde)\b/g, " ")
  } else if (/\b(?:a\s+noite|de\s+noite|pela\s+noite|noite)\b/.test(stripped)) {
    period = "evening"
    periodLabel = "à noite"
    startMinutes = 18 * 60
    endMinutes = 22 * 60
    stripped = stripped.replace(/\b(?:a\s+noite|de\s+noite|pela\s+noite|noite)\b/g, " ")
  }

  // Se não achou nem dia nem período, não há janela de tempo
  if (dayOffset === null && period === "any") {
    return { timeWindow: null, stripped: normalized }
  }

  // Se mencionou só período ("de manhã"), assume hoje
  const resolvedOffset = dayOffset ?? 0
  const resolvedDayLabel = dayLabel || "hoje"
  const { ymd, dayOfWeek: targetDow } = addDaysToYmd(year, month, day, resolvedOffset)

  const label = periodLabel ? `${resolvedDayLabel} ${periodLabel}` : resolvedDayLabel

  return {
    timeWindow: {
      targetDate: ymd,
      dayOfWeekKey: DAYS_OF_WEEK[targetDow],
      period,
      startMinutes,
      endMinutes,
      label,
    },
    stripped: stripped.replace(/\s+/g, " ").trim(),
  }
}

function stripFillerPhrases(text: string): string {
  let result = text.replace(/[.,!?;:]+/g, " ")
  for (const regex of FILLER_PHRASES) {
    result = result.replace(regex, " ")
  }
  // Remove preposições/artigos soltos que sobraram no início ou fim
  result = result
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:de|do|da|dos|das|um|uma|uns|umas|para|pra|com|em|no|na)\s+/g, "")
    .replace(/\s+(?:de|do|da|dos|das|para|pra|em|no|na)$/g, "")
    .trim()
  return result
}

/**
 * Parser determinístico (0ms, custo zero) para extrair intenção, janela de horário,
 * urgência e associações de categoria de uma busca em PT-BR.
 */
export function parseSearchIntent(rawQuery: string, now: Date = new Date()): ParsedSearchIntent {
  const normalized = normalizeSearchQuery(rawQuery || "")
  if (!normalized) {
    return {
      rawQuery: rawQuery || "",
      cleanQuery: "",
      intent: "mixed",
      confidence: 0,
      timeWindow: null,
      urgency: "normal",
      relatedTerms: [],
      needsAiFallback: false,
      source: "rules",
    }
  }

  const urgency: SearchUrgency = /\b(?:urgente|urgentemente|emergencia|agora|hoje|24h|rapido|para\s+ja|pra\s+ja)\b/.test(normalized)
    ? "high"
    : "normal"

  const { timeWindow, stripped: withoutTime } = extractTimeWindow(normalized, now)
  const cleanQuery = stripFillerPhrases(withoutTime) || withoutTime || normalized
  const tokens = cleanQuery.split(/\s+/).filter(Boolean)

  // Pontuação simples e transparente de intenção
  let serviceScore = 0
  let productScore = 0

  if (timeWindow) {
    serviceScore += 0.55
  }

  for (const token of tokens) {
    if (SERVICE_KEYWORDS.has(token)) {
      serviceScore += 0.6
    }
  }

  // Expressões compostas de serviço
  if (/\b(?:ar\s+condicionado|banho\s+e\s+tosa|troca\s+de|instalacao\s+de|conserto\s+de|manutencao\s+de|aula\s+de|aluguel\s+de)\b/.test(cleanQuery)) {
    serviceScore += 0.5
  }

  for (const pattern of PRODUCT_PATTERNS) {
    if (pattern.test(normalized)) {
      productScore += 0.45
    }
  }

  // Coleta associações de categoria/vitrine conhecidas
  const relatedSet = new Set<string>()
  for (const token of tokens) {
    const assoc = DOMAIN_ASSOCIATIONS[token]
    if (assoc) {
      for (const term of assoc) relatedSet.add(term)
    }
  }

  let intent: SearchIntentType = "mixed"
  let confidence = 0.5

  if (serviceScore >= 0.5 && serviceScore > productScore) {
    intent = "service"
    confidence = Math.min(0.95, 0.55 + serviceScore * 0.3)
  } else if (productScore >= 0.45 && productScore > serviceScore) {
    intent = "product"
    confidence = Math.min(0.9, 0.55 + productScore * 0.3)
  } else if (relatedSet.size > 0 && serviceScore === 0) {
    intent = "product"
    confidence = 0.7
  } else {
    intent = "mixed"
    confidence = 0.5
  }

  const hasProblemPattern = NATURAL_PROBLEM_PATTERNS.some((p) => p.test(normalized))
  const wordCount = normalized.split(/\s+/).filter(Boolean).length
  const needsAiFallback = hasProblemPattern || (wordCount >= 5 && serviceScore === 0 && productScore === 0 && relatedSet.size === 0)

  return {
    rawQuery,
    cleanQuery,
    intent,
    confidence: Number(confidence.toFixed(2)),
    timeWindow,
    urgency,
    relatedTerms: Array.from(relatedSet),
    needsAiFallback,
    source: "rules",
  }
}
