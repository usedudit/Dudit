import { NextRequest, NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import { Ratelimit } from "@upstash/ratelimit"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getCurrentUser } from "@/lib/auth/authorization"

// ============================================================================
// CONFIG
// ============================================================================

// Mock Redis and Ratelimit for Next.js build time when env vars might be missing
const hasRedisConfig = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)

const redis = hasRedisConfig ? new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
}) : {
  get: async () => null,
  setex: async () => "OK"
} as any

const ratelimiter = hasRedisConfig ? new Ratelimit({
  redis: redis as any,
  analytics: false,
  limiter: Ratelimit.slidingWindow(5, "1 m"),
}) : {
  limit: async () => ({ success: true })
} as any

const CF_API = "https://api.cloudflare.com/client/v4"
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || ""
const CF_TOKEN = process.env.CLOUDFLARE_AI_TOKEN || ""

const CACHE_TTL = 60 * 60 * 24
const MAX_TEXTS = 5
const MAX_TEXT_LENGTH = 10_000

// ============================================================================
// SAFETY CATEGORY MAP - LLAMA GUARD 3
// ============================================================================
const SAFETY_CATEGORIES: Record<string, string> = {
  s1: "Violência",
  s2: "Violência extrema",
  s3: "Discurso de ódio",
  s4: "Assédio ou bullying",
  s5: "Conteúdo sexual",
  s6: "Exploração sexual de menores",
  s7: "Autoagressão",
  s8: "Conteúdo ilegal",
  s9: "Extremismo",
  s10: "Linguagem abusiva",
}

// ============================================================================
// HELPERS
// ============================================================================
const normalizeText = (s: string) =>
  s.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("")
}

// ============================================================================
// TEXT MODERATION - LLAMA GUARD 3
// ============================================================================
async function moderateTexts(texts: string[]) {
  console.log("[MODERATION TEXT] Batch size:", texts.length)

  const joined = texts
    .map((t, i) => `Texto ${i + 1}: ${t}`)
    .join("\n\n")

  const res = await fetch(
    `${CF_API}/accounts/${CF_ACCOUNT_ID}/ai/run/@cf/meta/llama-guard-3-8b`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: joined }],
      }),
    }
  )

  if (!res.ok) {
    const error = await res.text()
    console.error("[MODERATION TEXT] API Error:", res.status, error)
    return texts.map(t => ({ text: t, safe: true, categories: [] }))
  }

  const json = await res.json()
  const raw = (json?.result?.response || "").toLowerCase().trim()

  const lines = raw.split("\n").map((l: string) => l.trim()).filter(Boolean)

  const safe = lines[0] === "safe"

  const categories = safe
    ? []
    : lines.slice(1).map(
      (c: string) => SAFETY_CATEGORIES[c] || `Categoria desconhecida (${c})`
    )

  return texts.map(t => ({
    text: t,
    safe,
    categories,
  }))
}

// ============================================================================
// ROUTE
// ============================================================================
export const POST = async (req: NextRequest) => {
  try {
    console.log("[MODERATION] Starting...")
    const body = await req.json()
    const texts: string[] = Array.isArray(body.texts) ? body.texts : []

    if (!texts.length) {
      return NextResponse.json({ passed: true })
    }

    const payloadSize = JSON.stringify({ texts }).length
    if (payloadSize > 1_000_000) {
      console.warn("[MODERATION] Payload too large")
      return NextResponse.json({ passed: true })
    }

    const normalizedTexts = texts
      .slice(0, MAX_TEXTS)
      .filter(
        t =>
          typeof t === "string" &&
          t.length > 0 &&
          t.length <= MAX_TEXT_LENGTH
      )
      .map(normalizeText)

    const contentHash = await sha256(
      JSON.stringify({ texts: normalizedTexts })
    )

    const cacheKey = `moderation:text:v1:${contentHash}`
    const cached = await redis.get(cacheKey)

    if (cached) {
      console.log("[MODERATION] Cache HIT")
      return NextResponse.json(cached)
    }

    let rateKey = req.headers.get("x-forwarded-for") || "anon"

    try {
      const user = await getCurrentUser()
      if (user?.id) {
        rateKey = `user:${user.id}`
      }
      const supabase = await getSupabaseServerClient()
    } catch { }

    const rl = await ratelimiter.limit(rateKey)
    if (!rl.success) {
      return NextResponse.json(
        { error: "Rate limit excedido" },
        { status: 429 }
      )
    }

    const flaggedTexts: { text: string; categories: string[] }[] = []

    const results = await moderateTexts(normalizedTexts)

    for (const r of results) {
      if (!r.safe) {
        flaggedTexts.push({
          text: r.text,
          categories: r.categories,
        })
      }
    }

    const response =
      flaggedTexts.length > 0
        ? {
          passed: false,
          reason: `Texto: ${[
            ...new Set(flaggedTexts.flatMap(t => t.categories)),
          ].join(", ")}`,
          flaggedTexts,
        }
        : { passed: true }

    await redis.setex(cacheKey, CACHE_TTL, response)

    return NextResponse.json(response)
  } catch (err) {
    console.error("[MODERATION] Fatal:", err)
    return NextResponse.json({ passed: true })
  }
}
