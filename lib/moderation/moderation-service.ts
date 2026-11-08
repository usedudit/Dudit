import { redis } from "@/lib/redis"
import { Ratelimit } from "@upstash/ratelimit"

// ============================================================================
// CONFIG
// ============================================================================
const CF_API = "https://api.cloudflare.com/client/v4"
const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || ""
const CF_TOKEN = process.env.CLOUDFLARE_AI_TOKEN || ""
const CF_MODEL = "@cf/meta/llama-guard-3-8b"
// Workers AI tem cold start irregular: já medimos de 300ms até ~23s no mesmo
// modelo. O formulário não pode pagar 12s, então tentamos por 3s e, se estourar,
// o chamador agenda uma re-checagem em background (Trigger.dev) — timeout nunca
// mais significa "não moderou".
const CF_TIMEOUT_MS = Number(process.env.MODERATION_AI_TIMEOUT_MS) || 3_000
/** Timeout generoso para a re-checagem em background, onde ninguém está esperando. */
export const MODERATION_BACKGROUND_TIMEOUT_MS = 20_000

const CACHE_VERSION = "v2"
const CACHE_TTL = 60 * 60 * 24 * 7 // 7 dias
const MAX_TEXT_LENGTH = 10_000

// 40 textos/min por usuário. O valor anterior (10/min) era compartilhado por
// TODOS os usuários através da chave fixa "system-internal", o que desligava a
// moderação do app inteiro assim que alguém publicava 10 itens.
const ratelimiter = new Ratelimit({
  redis,
  analytics: false,
  limiter: Ratelimit.slidingWindow(40, "1 m"),
})

// Taxonomia oficial do Llama Guard 3 (S1..S14).
// A versão anterior usava um mapa inventado (s1 = "Violência", s10 = "Linguagem
// abusiva"), então racismo aparecia para o usuário como "Linguagem abusiva".
const SAFETY_CATEGORIES: Record<string, string> = {
  s1: "Crimes violentos",
  s2: "Crimes não violentos",
  s3: "Crimes sexuais",
  s4: "Exploração sexual infantil",
  s5: "Difamação",
  s6: "Conselho especializado",
  s7: "Violação de privacidade",
  s8: "Propriedade intelectual",
  s9: "Armas indiscriminadas",
  s10: "Discurso de ódio",
  s11: "Automutilação",
  s12: "Conteúdo sexual",
  s13: "Manipulação eleitoral",
  s14: "Abuso de interpretador de código",
}

// ============================================================================
// HELPERS
// ============================================================================

/** Normaliza para comparação: minúsculas, sem acento, sem espaços duplicados. */
const normalizeText = (s: string) => s.normalize("NFKC").toLowerCase().trim().replace(/\s+/g, " ")

/**
 * Normaliza para a blocklist: sem acento, com "leet speak" desfeito
 * (v1ado -> viado, $eu -> seu) e só alfanuméricos separados por espaço.
 */
function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4@]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b")
    .replace(/[9]/g, "g")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

const truncate = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s)

// ============================================================================
// CAMADA 0: BLOCKLIST LOCAL (pt-BR)
// ============================================================================
// O Llama Guard 3 é treinado majoritariamente em inglês e erra muito em
// português ("preto imundo" e "mulher só serve pra lavar louça" passam como
// `safe`). Esta camada é determinística, não depende de rede e cobre os casos
// mais óbvios. Não substitui a IA — roda antes dela.

/** Termos que praticamente não têm uso legítimo em um marketplace. */
const HARD_TOKENS = new Set([
  // homofobia / transfobia
  "viado", "viada", "viadinho", "viadagem", "traveco", "baitola", "boiola",
  "bichinha", "sapatao",
  // racismo
  "crioulo", "crioula", "macumbeiro", "macumbeira",
  // capacitismo
  "retardado", "retardada", "mongoloide", "mongolao", "aleijado", "aleijada",
  // misoginia
  "vagabunda", "vadia", "piranha", "putinha",
  // neonazismo
  "nazista", "neonazista",
])

/** Frases candidatas — normalizadas automaticamente na carga do módulo. */
const RAW_HARD_PHRASES = [
  "preto imundo", "preto nojento", "preto safado", "preto lixo",
  "judeu sujo", "judeu de merda", "judeu lixo",
  "nordestino lixo", "nordestino burro", "nordestino preguiçoso",
  "volta pra africa", "volta para a africa", "volta pra senzala",
  "lugar de mulher e na cozinha", "mulher so serve",
  "heil hitler", "sieg heil", "morte aos judeus", "morte aos negros",
  "morte aos viados", "morte aos gays",
  "estuprar", "estupro corretivo",
]

const HARD_PHRASES = RAW_HARD_PHRASES.map(normalizeForMatch)

export type LocalVerdict = { blocked: boolean; category?: string; matched?: string }

export function checkLocalBlocklist(text: string): LocalVerdict {
  const normalized = normalizeForMatch(text)
  if (!normalized) return { blocked: false }

  const padded = ` ${normalized} `

  for (const phrase of HARD_PHRASES) {
    if (padded.includes(` ${phrase} `)) {
      return { blocked: true, category: "Discurso de ódio", matched: phrase }
    }
  }

  for (const token of normalized.split(" ")) {
    if (HARD_TOKENS.has(token)) {
      return { blocked: true, category: "Discurso de ódio", matched: token }
    }
  }

  return { blocked: false }
}

// ============================================================================
// CAMADA 1: LLAMA GUARD (Cloudflare Workers AI)
// ============================================================================

type AiVerdict = { safe: boolean; categories: string[]; degraded: boolean }

/**
 * Classifica UM texto. Retorna `degraded: true` quando não foi possível falar
 * com a Cloudflare — nesse caso NÃO sabemos se é seguro, e o chamador decide.
 */
async function classifyWithAi(text: string, timeoutMs: number = CF_TIMEOUT_MS): Promise<AiVerdict> {
  if (!CF_ACCOUNT_ID || !CF_TOKEN) {
    console.error(
      "[MODERATION] CLOUDFLARE_ACCOUNT_ID ou CLOUDFLARE_AI_TOKEN ausente: moderação por IA desativada."
    )
    return { safe: true, categories: [], degraded: true }
  }

  try {
    const res = await fetch(`${CF_API}/accounts/${CF_ACCOUNT_ID}/ai/run/${CF_MODEL}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${CF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(
        `[MODERATION] Cloudflare AI respondeu ${res.status}. Token sem permissão "Workers AI" ou modelo indisponível.`,
        body.slice(0, 500)
      )
      return { safe: true, categories: [], degraded: true }
    }

    const json: any = await res.json()
    const raw = String(json?.result?.response ?? "").toLowerCase()

    const verdict = raw.match(/\b(safe|unsafe)\b/)?.[1]
    if (!verdict) {
      console.error("[MODERATION] Resposta inesperada do Llama Guard:", raw.slice(0, 200))
      return { safe: true, categories: [], degraded: true }
    }

    const safe = verdict === "safe"
    const codes = Array.from(new Set(raw.match(/\bs\d{1,2}\b/g) ?? []))

    return {
      safe,
      categories: safe ? [] : codes.map((c) => SAFETY_CATEGORIES[c] || c.toUpperCase()),
      degraded: false,
    }
  } catch (err: any) {
    const reason = err?.name === "TimeoutError" ? `timeout após ${timeoutMs}ms` : err?.message || String(err)
    console.error("[MODERATION] Falha ao chamar a Cloudflare AI:", reason)
    return { safe: true, categories: [], degraded: true }
  }
}

type PendingText = { original: string; normalized: string }
type ClassifiedText = { item: PendingText; verdict: AiVerdict }

/**
 * Classifica vários textos gastando o mínimo de chamadas possível:
 *  - 1 texto  → 1 chamada
 *  - N textos → 1 chamada com todos juntos.
 *
 * Só re-checa individualmente quando o conjunto vem `unsafe`, para saber qual
 * campo causou o bloqueio e não envenenar o cache com falso positivo nos campos
 * que estavam ok. Esse caso é raro (só quando algo é bloqueado).
 */
async function classifyTexts(pending: PendingText[], timeoutMs: number): Promise<ClassifiedText[]> {
  if (pending.length === 0) return []

  if (pending.length === 1) {
    const item = pending[0]
    return [{ item, verdict: await classifyWithAi(item.normalized, timeoutMs) }]
  }

  // Evita estourar o contexto do modelo juntando descrições gigantes.
  const combinedLength = pending.reduce((total, item) => total + item.normalized.length + 2, 0)
  if (combinedLength > 6_000) {
    return Promise.all(
      pending.map(async (item) => ({
        item,
        verdict: await classifyWithAi(item.normalized, timeoutMs),
      }))
    )
  }

  const combinedVerdict = await classifyWithAi(
    pending.map((p) => p.normalized).join("\n\n"),
    timeoutMs
  )

  if (combinedVerdict.degraded || combinedVerdict.safe) {
    return pending.map((item) => ({ item, verdict: combinedVerdict }))
  }

  return Promise.all(
    pending.map(async (item) => ({
      item,
      verdict: await classifyWithAi(item.normalized, timeoutMs),
    }))
  )
}

// ============================================================================
// CACHE (por texto — reaproveita entre produtos, reviews e lojas)
// ============================================================================

type CachedVerdict = { safe: boolean; categories: string[] }

async function readCache(key: string): Promise<CachedVerdict | null> {
  try {
    return await redis.get<CachedVerdict>(key)
  } catch (err: any) {
    // Cache indisponível não pode derrubar a moderação.
    console.warn("[MODERATION] Cache read falhou:", err?.message || err)
    return null
  }
}

async function writeCache(key: string, verdict: CachedVerdict): Promise<void> {
  try {
    await redis.setex(key, CACHE_TTL, verdict)
  } catch (err: any) {
    console.warn("[MODERATION] Cache write falhou:", err?.message || err)
  }
}

// ============================================================================
// FUNÇÃO EXPORTADA
// ============================================================================

export type ModerationResponse = {
  passed: boolean
  reason?: string
  flaggedTexts?: Array<{ text: string; categories: string[] }>
  /** true quando a IA não pôde ser consultada (rede, token, cota, rate limit) */
  degraded?: boolean
}

/**
 * Modera uma lista de textos.
 *
 * Estratégia:
 *  1. Blocklist local pt-BR (sempre roda, mesmo offline, custo zero)
 *  2. Cache por texto (Redis, 7 dias)
 *  3. Llama Guard 3 na Cloudflare — UMA chamada para todos os textos que não
 *     estão no cache. Se o conjunto vier `unsafe`, re-checa individualmente
 *     para atribuir o problema ao campo certo.
 *
 * Em falha de infraestrutura retorna `passed: true` + `degraded: true`. O
 * chamador deve usar `degraded` para agendar uma re-checagem em background
 * (ver `lib/moderation/deferred-moderation.ts`).
 */
export async function checkTextSafety(
  texts: string[],
  userId?: string,
  options?: { timeoutMs?: number; asyncMode?: boolean }
): Promise<ModerationResponse> {
  const cleaned = (texts ?? []).map((t) => (t ?? "").trim()).filter(Boolean)
  if (cleaned.length === 0) return { passed: true }

  const timeoutMs = options?.timeoutMs ?? CF_TIMEOUT_MS
  const flaggedTexts: Array<{ text: string; categories: string[] }> = []
  const pending: PendingText[] = []
  const seen = new Set<string>()

  for (const original of cleaned) {
    // Textos gigantes são ignorados (comportamento mantido do original).
    if (original.length > MAX_TEXT_LENGTH) continue

    const normalized = normalizeText(original)

    const local = checkLocalBlocklist(normalized)
    if (local.blocked) {
      flaggedTexts.push({ text: truncate(original), categories: [local.category || "Conteúdo impróprio"] })
      continue
    }

    if (seen.has(normalized)) continue
    seen.add(normalized)
    pending.push({ original, normalized })
  }

  let degraded = false

  // Rate limit por usuário: se estourar, ainda aplicamos a blocklist local,
  // mas não consultamos a IA (e não gravamos cache para não envenenar).
  if (userId && pending.length > 0) {
    try {
      const rl = await ratelimiter.limit(`moderation:text:${userId}`)
      if (!rl.success) {
        console.warn(`[MODERATION] Rate limit excedido para ${userId}; IA ignorada nesta requisição.`)
        degraded = true
        pending.length = 0
      }
    } catch (err: any) {
      console.warn("[MODERATION] Rate limit indisponível:", err?.message || err)
    }
  }

  if (pending.length > 0) {
    // 1. Cache em paralelo (1 GET por texto).
    const verdicts = new Map<string, AiVerdict>()
    await Promise.all(
      pending.map(async ({ normalized }) => {
        const cacheKey = `moderation:text:${CACHE_VERSION}:${await sha256(normalized)}`
        const cached = await readCache(cacheKey)
        if (cached) verdicts.set(normalized, { safe: cached.safe, categories: cached.categories, degraded: false })
      })
    )

    // 2. Só o que não está no cache vai para a IA. Se der para juntar tudo em
    // uma chamada, melhor: evita um segundo cold start e metade do custo.
    const uncached = pending.filter((p) => !verdicts.has(p.normalized))
    if (uncached.length > 0) {
      if (options?.asyncMode) {
        // Otimização assíncrona: textos novos não travam a requisição interativa.
        // Sinaliza degraded para que o chamador persista o item imediatamente e
        // agende a checagem profunda em background (via after() / Trigger.dev).
        degraded = true
      } else {
        const classified = await classifyTexts(uncached, timeoutMs)

        await Promise.all(
          classified.map(async ({ item, verdict }) => {
            verdicts.set(item.normalized, verdict)
            if (!verdict.degraded) {
              const cacheKey = `moderation:text:${CACHE_VERSION}:${await sha256(item.normalized)}`
              await writeCache(cacheKey, { safe: verdict.safe, categories: verdict.categories })
            }
          })
        )
      }
    }

    for (const { original, normalized } of pending) {
      const verdict = verdicts.get(normalized)
      if (!verdict) continue
      if (verdict.degraded) degraded = true
      if (!verdict.safe) {
        flaggedTexts.push({ text: truncate(original), categories: verdict.categories })
      }
    }
  }

  if (flaggedTexts.length > 0) {
    const allCategories = [...new Set(flaggedTexts.flatMap((t) => t.categories))]
    return {
      passed: false,
      reason: `Conteúdo não permitido: ${allCategories.join(", ")}`,
      flaggedTexts,
      degraded: degraded || undefined,
    }
  }

  return { passed: true, degraded: degraded || undefined }
}
