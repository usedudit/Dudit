import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"

// ============================================================================
// CONFIG
// ============================================================================
const redis = new Redis({
  url: process.env.KV_REST_API_URL || 'https://build.stub',
  token: process.env.KV_REST_API_TOKEN || 'build-stub-token',
})

// Rate Limiter para chamadas internas (opcional, mas bom ter)
const ratelimiter = new Ratelimit({
  redis,
  analytics: false,
  limiter: Ratelimit.slidingWindow(10, "1 m"),
})

const CF_API = "https://api.cloudflare.com/client/v4"
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!
const CF_TOKEN = process.env.CLOUDFLARE_AI_TOKEN!
const CACHE_TTL = 60 * 60 * 24
const MAX_TEXT_LENGTH = 10_000

const SAFETY_CATEGORIES: Record<string, string> = {
  s1: "Violência", s2: "Violência extrema", s3: "Discurso de ódio",
  s4: "Assédio ou bullying", s5: "Conteúdo sexual", s6: "Exploração sexual de menores",
  s7: "Autoagressão", s8: "Conteúdo ilegal", s9: "Extremismo", s10: "Linguagem abusiva",
}

// ============================================================================
// HELPERS
// ============================================================================
const normalizeText = (s: string) => s.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

async function runLlamaGuard(texts: string[]) {
  const joined = texts.map((t, i) => `Texto ${i + 1}: ${t}`).join("\n\n")

  const res = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-guard-3-8b`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: joined }] }),
    }
  )

  if (!res.ok) {
    console.error("[MODERATION SERVICE] Cloudflare AI Error:", await res.text())
    // Fail Open: Se a IA falhar, deixa passar para não travar o app
    return texts.map(t => ({ text: t, safe: true, categories: [] }))
  }

  const json = await res.json()
  const raw = (json?.result?.response || "").toLowerCase().trim()
  const lines = raw.split("\n").map((l: string) => l.trim()).filter(Boolean)
  const safe = lines[0] === "safe"

  const categories = safe ? [] : lines.slice(1).map((c: string) => SAFETY_CATEGORIES[c] || c)

  return texts.map(t => ({ text: t, safe, categories }))
}

// ============================================================================
// FUNÇÃO EXPORTADA
// ============================================================================
export type ModerationResponse = { passed: boolean; reason?: string; flaggedTexts?: any[] }

export async function checkTextSafety(texts: string[], userId?: string): Promise<ModerationResponse> {
  if (!texts.length) return { passed: true }

  const normalizedTexts = texts
    .filter(t => t && t.length <= MAX_TEXT_LENGTH)
    .map(normalizeText)

  if (normalizedTexts.length === 0) return { passed: true }

  // 1. Cache
  const contentHash = await sha256(JSON.stringify({ texts: normalizedTexts }))
  const cacheKey = `moderation:text:v1:${contentHash}`
  const cached = await redis.get<ModerationResponse>(cacheKey)
  if (cached) return cached

  // 2. Rate Limit (apenas se passar userId)
  if (userId) {
    const rl = await ratelimiter.limit(`user:${userId}`)
    if (!rl.success) return { passed: true }
  }

  // 3. Moderação
  const results = await runLlamaGuard(normalizedTexts)
  const flaggedTexts = results.filter(r => !r.safe).map(r => ({ text: r.text, categories: r.categories }))

  const response = flaggedTexts.length > 0
    ? {
      passed: false,
      reason: `Texto impróprio: ${[...new Set(flaggedTexts.flatMap(t => t.categories))].join(", ")}`,
      flaggedTexts,
    }
    : { passed: true }

  await redis.setex(cacheKey, CACHE_TTL, response)
  return response
}