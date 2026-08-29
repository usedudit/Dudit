import { redis } from "@/lib/redis"
import { normalizeSearchQuery } from "@/lib/search/normalize"

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SearchTelemetryInput {
    query: string
    hasResults: boolean
    resultsCount: number
    citySlug?: string | null
    itemType?: string
}

export interface DemandEventInput {
    type: "whatsapp_click" | "phone_click" | "quote_request" | "appointment_request" | "order_created"
    partnerId?: string | null
    storeId?: string | null
    citySlug?: string | null
    metadata?: Record<string, unknown>
}

export interface ZeroResultTerm {
    term: string
    count: number
    suggestedCategory?: string
}

export interface MarketplaceDemandMetrics {
    totalSearches: number
    searchesWithResults: number
    searchesWithoutResults: number
    contactClicks: number
    appointmentsCount: number
    ordersCount: number
    activeBusinessesCount: number
    businessesWithDemandCount: number
    topZeroResultTerms: ZeroResultTerm[]
    dailyTimeline: Array<{
        date: string
        totalSearches: number
        withResults: number
        withoutResults: number
        contacts: number
    }>
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const TELEMETRY_TTL_SECONDS = 60 * 60 * 24 * 90 // 90 days TTL

function formatDateKey(d: Date = new Date()): string {
    return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

function getDayKeys(startDate: Date, endDate: Date): string[] {
    const keys: string[] = []
    const cur = new Date(startDate)
    cur.setHours(0, 0, 0, 0)
    const end = new Date(endDate)
    end.setHours(23, 59, 59, 999)

    while (cur <= end) {
        keys.push(formatDateKey(cur))
        cur.setDate(cur.getDate() + 1)
    }
    return keys
}

/**
 * Intelligent categorization suggestion based on search keyword
 */
function inferCategoryFromQuery(term: string): string {
    const t = term.toLowerCase()
    if (t.includes("marmita") || t.includes("comida") || t.includes("lanche") || t.includes("pizza") || t.includes("hamburg") || t.includes("sushi") || t.includes("acai") || t.includes("restaurante") || t.includes("doce") || t.includes("bolo") || t.includes("cafe")) {
        return "Alimentação & Gastronomia"
    }
    if (t.includes("iphone") || t.includes("celular") || t.includes("computador") || t.includes("notebook") || t.includes("tela") || t.includes("bateria") || t.includes("conserto") || t.includes("assistencia") || t.includes("fone") || t.includes("carregador")) {
        return "Assistência Técnica & Informática"
    }
    if (t.includes("roupa") || t.includes("vestido") || t.includes("camisa") || t.includes("tenis") || t.includes("sapato") || t.includes("calca") || t.includes("biquini") || t.includes("moda") || t.includes("lingerie")) {
        return "Moda & Vestuário"
    }
    if (t.includes("corte") || t.includes("cabelo") || t.includes("barba") || t.includes("unha") || t.includes("sobrancelha") || t.includes("manicure") || t.includes("pedicure") || t.includes("depilacao") || t.includes("estetica") || t.includes("massagem")) {
        return "Beleza, Barbearia & Estética"
    }
    if (t.includes("eletricista") || t.includes("encanador") || t.includes("pedreiro") || t.includes("pintor") || t.includes("marceneiro") || t.includes("ar condicionado") || t.includes("limpeza") || t.includes("diarista") || t.includes("frete") || t.includes("guincho")) {
        return "Serviços Gerais & Reformas"
    }
    if (t.includes("pet") || t.includes("racao") || t.includes("banho e tosa") || t.includes("veterinario") || t.includes("cachorro") || t.includes("gato")) {
        return "Pet Shop & Veterinária"
    }
    if (t.includes("mecanic") || t.includes("pneu") || t.includes("oleo") || t.includes("oficina") || t.includes("funilaria") || t.includes("lava rapido") || t.includes("moto") || t.includes("carro")) {
        return "Automotivo & Mecânica"
    }
    if (t.includes("farmacia") || t.includes("remedio") || t.includes("dentista") || t.includes("psicolog") || t.includes("nutricion") || t.includes("fisioterap") || t.includes("academia") || t.includes("personal")) {
        return "Saúde, Bem-estar & Fitness"
    }
    return "Comércio Local & Geral"
}

// ─── Recording Telemetry (Fire-and-Forget, Non-blocking) ────────────────────

export async function recordMarketplaceSearchTelemetry(input: SearchTelemetryInput): Promise<void> {
    try {
        const rawQuery = input.query ? input.query.trim() : ""
        if (!rawQuery) return

        const normalizedTerm = normalizeSearchQuery(rawQuery).slice(0, 100)
        if (!normalizedTerm) return

        const dateStr = formatDateKey()
        const cityPrefix = input.citySlug ? `city:${input.citySlug}:` : ""

        // Multi / Pipeline operations in Redis
        const p = redis.pipeline()

        // 1. Daily global counters
        p.incr(`ddt:search:${dateStr}:total`)
        p.expire(`ddt:search:${dateStr}:total`, TELEMETRY_TTL_SECONDS)

        if (input.citySlug) {
            p.incr(`ddt:search:${cityPrefix}${dateStr}:total`)
            p.expire(`ddt:search:${cityPrefix}${dateStr}:total`, TELEMETRY_TTL_SECONDS)
        }

        if (input.hasResults) {
            p.incr(`ddt:search:${dateStr}:with_results`)
            p.expire(`ddt:search:${dateStr}:with_results`, TELEMETRY_TTL_SECONDS)

            if (input.citySlug) {
                p.incr(`ddt:search:${cityPrefix}${dateStr}:with_results`)
                p.expire(`ddt:search:${cityPrefix}${dateStr}:with_results`, TELEMETRY_TTL_SECONDS)
            }
        } else {
            p.incr(`ddt:search:${dateStr}:zero_results`)
            p.expire(`ddt:search:${dateStr}:zero_results`, TELEMETRY_TTL_SECONDS)

            // Track zero result terms in Sorted Set (auto-increment score)
            p.zincrby(`ddt:search:${dateStr}:zero_terms`, 1, normalizedTerm)
            p.expire(`ddt:search:${dateStr}:zero_terms`, TELEMETRY_TTL_SECONDS)

            // Monthly consolidated zero result terms for trend analysis
            const monthStr = dateStr.slice(0, 7) // YYYY-MM
            p.zincrby(`ddt:search:${monthStr}:zero_terms`, 1, normalizedTerm)
            p.expire(`ddt:search:${monthStr}:zero_terms`, TELEMETRY_TTL_SECONDS * 2)

            if (input.citySlug) {
                p.incr(`ddt:search:${cityPrefix}${dateStr}:zero_results`)
                p.expire(`ddt:search:${cityPrefix}${dateStr}:zero_results`, TELEMETRY_TTL_SECONDS)

                p.zincrby(`ddt:search:${cityPrefix}${dateStr}:zero_terms`, 1, normalizedTerm)
                p.expire(`ddt:search:${cityPrefix}${dateStr}:zero_terms`, TELEMETRY_TTL_SECONDS)

                p.zincrby(`ddt:search:${cityPrefix}${monthStr}:zero_terms`, 1, normalizedTerm)
                p.expire(`ddt:search:${cityPrefix}${monthStr}:zero_terms`, TELEMETRY_TTL_SECONDS * 2)
            }
        }

        await p.exec().catch((err) => {
            console.warn("[ANALYTICS_TELEMETRY] Redis pipeline failed gracefully:", err?.message)
        })
    } catch (err: any) {
        // Fail-safe: search must never fail because of analytics
        console.warn("[ANALYTICS_TELEMETRY] Error logging search telemetry:", err?.message)
    }
}

export async function recordDemandEventTelemetry(input: DemandEventInput): Promise<void> {
    try {
        const dateStr = formatDateKey()
        const cityPrefix = input.citySlug ? `city:${input.citySlug}:` : ""

        const p = redis.pipeline()

        if (input.type === "whatsapp_click" || input.type === "phone_click") {
            p.incr(`ddt:demand:${dateStr}:contacts`)
            p.expire(`ddt:demand:${dateStr}:contacts`, TELEMETRY_TTL_SECONDS)

            if (input.citySlug) {
                p.incr(`ddt:demand:${cityPrefix}${dateStr}:contacts`)
                p.expire(`ddt:demand:${cityPrefix}${dateStr}:contacts`, TELEMETRY_TTL_SECONDS)
            }

            if (input.partnerId) {
                p.incr(`ddt:partner:${input.partnerId}:${dateStr}:contacts`)
                p.expire(`ddt:partner:${input.partnerId}:${dateStr}:contacts`, TELEMETRY_TTL_SECONDS)
            }
        }

        await p.exec().catch((err) => {
            console.warn("[ANALYTICS_DEMAND] Redis pipeline failed gracefully:", err?.message)
        })
    } catch (err: any) {
        console.warn("[ANALYTICS_DEMAND] Error logging demand event:", err?.message)
    }
}

// ─── Querying Telemetry (Admin Panel) ───────────────────────────────────────

export async function getMarketplaceSearchStats(
    startDate: Date,
    endDate: Date,
    citySlug?: string | null
): Promise<{
    totalSearches: number
    searchesWithResults: number
    searchesWithoutResults: number
    contactClicks: number
    topZeroResultTerms: ZeroResultTerm[]
    dailyTimeline: Array<{
        date: string
        totalSearches: number
        withResults: number
        withoutResults: number
        contacts: number
    }>
}> {
    try {
        const dayKeys = getDayKeys(startDate, endDate)
        const cityPrefix = citySlug ? `city:${citySlug}:` : ""

        const p = redis.pipeline()

        // Batch fetch all daily metrics
        for (const d of dayKeys) {
            p.get(`ddt:search:${cityPrefix}${d}:total`)
            p.get(`ddt:search:${cityPrefix}${d}:with_results`)
            p.get(`ddt:search:${cityPrefix}${d}:zero_results`)
            p.get(`ddt:demand:${cityPrefix}${d}:contacts`)
        }

        const results = await p.exec()

        let totalSearches = 0
        let searchesWithResults = 0
        let searchesWithoutResults = 0
        let totalContacts = 0

        const dailyTimeline: Array<{
            date: string
            totalSearches: number
            withResults: number
            withoutResults: number
            contacts: number
        }> = []

        for (let i = 0; i < dayKeys.length; i++) {
            const dateStr = dayKeys[i]
            const baseIdx = i * 4

            const t = Number(results[baseIdx] || 0)
            const w = Number(results[baseIdx + 1] || 0)
            const z = Number(results[baseIdx + 2] || 0)
            const c = Number(results[baseIdx + 3] || 0)

            totalSearches += t
            searchesWithResults += w
            searchesWithoutResults += z
            totalContacts += c

            dailyTimeline.push({
                date: dateStr,
                totalSearches: t,
                withResults: w,
                withoutResults: z,
                contacts: c,
            })
        }

        // Fetch top zero-result keywords across the period
        // To combine sorted sets across days efficiently, fetch from daily keys or monthly keys
        const termsMap = new Map<string, number>()

        const termPipeline = redis.pipeline()
        for (const d of dayKeys) {
            // Get top 20 zero terms per day with scores (REV = highest first)
            termPipeline.zrange(`ddt:search:${cityPrefix}${d}:zero_terms`, 0, 20, {
                rev: true,
                withScores: true,
            })
        }

        const termResults = await termPipeline.exec()

        for (const res of termResults) {
            if (Array.isArray(res)) {
                // Upstash returns [member, score, member, score, ...] or [{ member, score }] depending on driver version
                for (let j = 0; j < res.length; j += 2) {
                    const term = typeof res[j] === "string" ? res[j] : (res[j] as any)?.member
                    const score = typeof res[j + 1] === "number" ? res[j + 1] : Number((res[j] as any)?.score || 0)

                    if (term && score > 0) {
                        const cur = termsMap.get(term) || 0
                        termsMap.set(term, cur + score)
                    }
                }
            }
        }

        const sortedTerms: ZeroResultTerm[] = Array.from(termsMap.entries())
            .map(([term, count]) => ({
                term,
                count,
                suggestedCategory: inferCategoryFromQuery(term),
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 30)

        return {
            totalSearches,
            searchesWithResults,
            searchesWithoutResults,
            contactClicks: totalContacts,
            topZeroResultTerms: sortedTerms,
            dailyTimeline,
        }
    } catch (err: any) {
        console.warn("[ANALYTICS_QUERY] Failed to fetch search analytics from Redis:", err?.message)
        return {
            totalSearches: 0,
            searchesWithResults: 0,
            searchesWithoutResults: 0,
            contactClicks: 0,
            topZeroResultTerms: [],
            dailyTimeline: [],
        }
    }
}
