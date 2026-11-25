import "server-only"
import { z } from "zod"
import { redis } from "@/lib/redis"
import { getAiProvider, type AiProvider } from "@/lib/ai/product-generation/providers"
import { normalizeSearchQuery } from "./normalize"
import type { ParsedSearchIntent } from "./intent-parser"

const AI_INTENT_CACHE_PREFIX = "dudit:search:ai_intent:v1:"
const AI_INTENT_REDIS_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 dias
const MEMORY_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hora
const MAX_MEMORY_ENTRIES = 500
const AI_TIMEOUT_MS = 1800

const AiSearchIntentSchema = z.object({
  intent: z.enum(["product", "service", "mixed"]).default("mixed"),
  searchTerms: z.array(z.string().trim().min(2).max(60)).max(4).default([]),
  categories: z.array(z.string().trim().min(2).max(40)).max(4).default([]),
})

type CachedAiIntent = z.infer<typeof AiSearchIntentSchema>

const memoryCache = new Map<string, { value: CachedAiIntent; expiresAt: number }>()

function hasConfiguredAiKey(): boolean {
  return Boolean(
    process.env.GROQ_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.OPENROUTER_API_KEY,
  )
}

function isRedisConfigured(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  return Boolean(url && !url.includes("build.stub"))
}

function pickFastAiProvider(): AiProvider {
  if (process.env.AI_SEARCH_PROVIDER) {
    return getAiProvider(process.env.AI_SEARCH_PROVIDER)
  }
  if (process.env.GROQ_API_KEY) {
    return getAiProvider("groq")
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return getAiProvider("gemini")
  }
  return getAiProvider("openrouter")
}

function buildCompactPrompt(rawQuery: string): string {
  return [
    "Você interpreta buscas curtas de um marketplace brasileiro local (produtos, serviços e lojas).",
    `Busca do usuário: "${rawQuery.slice(0, 140)}"`,
    "Responda APENAS um JSON válido sem markdown:",
    '{"intent":"product"|"service"|"mixed","searchTerms":["termo principal curto","termo alternativo"],"categories":["categoria ou tipo de loja"]}',
    "Regras: searchTerms deve ter 1 a 3 termos curtos em português que existam em anúncios reais (ex: 'meu chuveiro queimou' -> intent:'service', searchTerms:['eletricista','chuveiro'], categories:['eletrica','materiais eletricos']).",
  ].join("\n")
}

function extractJsonObject(rawText: string): unknown {
  const cleaned = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object in AI response")
  }
  return JSON.parse(cleaned.slice(start, end + 1))
}

function setMemoryCache(key: string, value: CachedAiIntent) {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const firstKey = memoryCache.keys().next().value
    if (firstKey) memoryCache.delete(firstKey)
  }
  memoryCache.set(key, { value, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS })
}

function mergeAiIntent(
  ruleIntent: ParsedSearchIntent,
  aiData: CachedAiIntent,
  source: "ai" | "ai_cache",
): ParsedSearchIntent {
  const cleanTerms = aiData.searchTerms
    .map((t) => normalizeSearchQuery(t))
    .filter((t) => t.length >= 2)

  const relatedSet = new Set<string>([
    ...ruleIntent.relatedTerms,
    ...aiData.categories.map((c) => normalizeSearchQuery(c)).filter(Boolean),
  ])

  // Se a regra já detectou janela de horário (ex: "amanhã de manhã"), preserva intent = service
  const resolvedIntent = ruleIntent.timeWindow ? "service" : aiData.intent

  return {
    ...ruleIntent,
    cleanQuery: cleanTerms[0] || ruleIntent.cleanQuery,
    intent: resolvedIntent,
    confidence: Math.max(ruleIntent.confidence, 0.8),
    relatedTerms: Array.from(relatedSet),
    source,
    aiSuggestedTerms: cleanTerms,
    aiSuggestedCategories: aiData.categories,
  }
}

export interface AiIntentFallbackDeps {
  getCache?: (key: string) => Promise<CachedAiIntent | null>
  setCache?: (key: string, value: CachedAiIntent) => Promise<void>
  generate?: (prompt: string) => Promise<string>
  isEnabled?: () => boolean
}

/**
 * Fallback cirúrgico de IA com cache em 2 níveis (RAM + Upstash Redis 30d).
 * Só executa quando `ruleIntent.needsAiFallback` é true ou `forceOnZeroResults` é true.
 * Nunca lança erro — em caso de falha ou timeout (1.8s), retorna `ruleIntent` intacto.
 */
export async function resolveAiSearchIntent(
  rawQuery: string,
  ruleIntent: ParsedSearchIntent,
  options: { forceOnZeroResults?: boolean; deps?: AiIntentFallbackDeps } = {},
): Promise<ParsedSearchIntent> {
  const shouldRun = Boolean(ruleIntent.needsAiFallback || options.forceOnZeroResults)
  if (!shouldRun) return ruleIntent

  const normalized = normalizeSearchQuery(rawQuery)
  if (!normalized || normalized.length < 4) return ruleIntent

  const cacheKey = `${AI_INTENT_CACHE_PREFIX}${normalized}`

  // 1. Cache em memória RAM (0ms)
  const memHit = memoryCache.get(cacheKey)
  if (memHit && memHit.expiresAt > Date.now()) {
    return mergeAiIntent(ruleIntent, memHit.value, "ai_cache")
  }

  const deps = options.deps

  // 2. Cache no Upstash Redis (~5ms)
  try {
    const cached = deps?.getCache
      ? await deps.getCache(cacheKey)
      : isRedisConfigured()
        ? await redis.get<CachedAiIntent>(cacheKey)
        : null

    if (cached) {
      const parsed = AiSearchIntentSchema.safeParse(cached)
      if (parsed.success) {
        setMemoryCache(cacheKey, parsed.data)
        return mergeAiIntent(ruleIntent, parsed.data, "ai_cache")
      }
    }
  } catch {
    // Redis indisponível nunca bloqueia a busca
  }

  // 3. Verifica se há chave de IA configurada antes de chamar LLM
  const enabled = deps?.isEnabled ? deps.isEnabled() : hasConfiguredAiKey()
  if (!enabled) return ruleIntent

  // 4. Chamada ultracurta com timeout estrito (1.8s)
  try {
    const prompt = buildCompactPrompt(rawQuery)
    const rawText = deps?.generate
      ? await deps.generate(prompt)
      : (
          await pickFastAiProvider().generate(prompt, undefined, {
            timeout: AI_TIMEOUT_MS,
          })
        ).text

    const parsed = AiSearchIntentSchema.safeParse(extractJsonObject(rawText))
    if (!parsed.success) return ruleIntent

    setMemoryCache(cacheKey, parsed.data)

    // Salva no Redis em background (best-effort)
    if (deps?.setCache) {
      await deps.setCache(cacheKey, parsed.data).catch(() => {})
    } else if (isRedisConfigured()) {
      redis.set(cacheKey, parsed.data, { ex: AI_INTENT_REDIS_TTL_SECONDS }).catch(() => {})
    }

    return mergeAiIntent(ruleIntent, parsed.data, "ai")
  } catch {
    return ruleIntent
  }
}

export function __clearAiIntentMemoryCacheForTests() {
  memoryCache.clear()
}
