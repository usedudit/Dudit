import { redis } from "@/lib/redis"
import { normalizeSearchQuery } from "@/lib/search/normalize"
import { isBotSearch } from "@/lib/search/bot-detection"
import type {
    SearchTelemetryInput,
    DemandEventInput,
    ZeroResultTerm,
    MarketplaceDemandMetrics,
} from "@/lib/types/analytics"

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { isBotSearch }
export type {
    SearchTelemetryInput,
    DemandEventInput,
    ZeroResultTerm,
    MarketplaceDemandMetrics,
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

function cleanCitySlug(slug?: string | null): string | null {
    if (!slug) return null
    const s = slug.toLowerCase().trim()
    if (s === "brasil" || s.startsWith("estado-")) return null
    return s
}

/**
 * Intelligent categorization suggestion based on search keyword and demand type
 */
function inferCategoryFromQuery(term: string, demandType?: string): string {
    const t = term.toLowerCase()
    if (t.includes("marmita") || t.includes("comida") || t.includes("lanche") || t.includes("pizza") || t.includes("hamburg") || t.includes("sushi") || t.includes("acai") || t.includes("restaurante") || t.includes("doce") || t.includes("bolo") || t.includes("cafe") || t.includes("bebida")) {
        return "Alimentação & Gastronomia"
    }
    if (t.includes("iphone") || t.includes("celular") || t.includes("computador") || t.includes("notebook") || t.includes("tela") || t.includes("bateria") || t.includes("conserto") || t.includes("assistencia") || t.includes("fone") || t.includes("carregador") || t.includes("tablet")) {
        return "Assistência Técnica & Informática"
    }
    if (t.includes("roupa") || t.includes("vestido") || t.includes("camisa") || t.includes("tenis") || t.includes("sapato") || t.includes("calca") || t.includes("biquini") || t.includes("moda") || t.includes("lingerie") || t.includes("bolsa") || t.includes("acessorio")) {
        return "Moda & Vestuário"
    }
    if (t.includes("corte") || t.includes("cabelo") || t.includes("barba") || t.includes("unha") || t.includes("sobrancelha") || t.includes("manicure") || t.includes("pedicure") || t.includes("depilacao") || t.includes("estetica") || t.includes("massagem") || t.includes("barbearia") || t.includes("salao")) {
        return "Beleza, Barbearia & Estética"
    }
    if (t.includes("eletricista") || t.includes("encanador") || t.includes("pedreiro") || t.includes("pintor") || t.includes("marceneiro") || t.includes("ar condicionado") || t.includes("limpeza") || t.includes("diarista") || t.includes("frete") || t.includes("guincho") || t.includes("reforma")) {
        return "Serviços Gerais & Reformas"
    }
    if (t.includes("pet") || t.includes("racao") || t.includes("banho e tosa") || t.includes("veterinario") || t.includes("cachorro") || t.includes("gato") || t.includes("animal")) {
        return "Pet Shop & Veterinária"
    }
    if (t.includes("mecanic") || t.includes("pneu") || t.includes("oleo") || t.includes("oficina") || t.includes("funilaria") || t.includes("lava rapido") || t.includes("moto") || t.includes("carro") || t.includes("autopeca")) {
        return "Automotivo & Mecânica"
    }
    if (t.includes("farmacia") || t.includes("remedio") || t.includes("dentista") || t.includes("psicolog") || t.includes("nutricion") || t.includes("fisioterap") || t.includes("academia") || t.includes("personal") || t.includes("pilates")) {
        return "Saúde, Bem-estar & Fitness"
    }

    if (demandType?.includes("contratar")) {
        return "Serviços & Contratações"
    }
    if (demandType?.includes("loja") || demandType?.includes("empresa")) {
        return "Lojas & Negócios Locais"
    }
    if (demandType?.includes("comprar")) {
        return "Comércio & Produtos"
    }

    return "Comércio Local & Geral"
}

// ─── Recording Telemetry (Fire-and-Forget, Non-blocking) ────────────────────

export async function recordMarketplaceSearchTelemetry(input: SearchTelemetryInput): Promise<void> {
    try {
        const rawQuery = input.query ? input.query.trim() : ""
        if (!rawQuery) return

        // Skip bot/scanner searches to keep analytics clean
        if (isBotSearch(rawQuery)) return

        const normalizedTerm = normalizeSearchQuery(rawQuery).slice(0, 100)
        if (!normalizedTerm) return

        const dateStr = formatDateKey()
        const cleanCity = cleanCitySlug(input.citySlug)
        const cityPrefix = cleanCity ? `city:${cleanCity}:` : ""

        // Multi / Pipeline operations in Redis
        const p = redis.pipeline()

        // 1. Daily global counters
        p.incr(`ddt:search:${dateStr}:total`)
        p.expire(`ddt:search:${dateStr}:total`, TELEMETRY_TTL_SECONDS)

        if (cleanCity) {
            p.incr(`ddt:search:${cityPrefix}${dateStr}:total`)
            p.expire(`ddt:search:${cityPrefix}${dateStr}:total`, TELEMETRY_TTL_SECONDS)
        }

        if (input.hasResults) {
            p.incr(`ddt:search:${dateStr}:with_results`)
            p.expire(`ddt:search:${dateStr}:with_results`, TELEMETRY_TTL_SECONDS)

            if (cleanCity) {
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

            if (cleanCity) {
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
        const cleanCity = cleanCitySlug(input.citySlug)
        const cityPrefix = cleanCity ? `city:${cleanCity}:` : ""

        const p = redis.pipeline()

        if (input.type === "whatsapp_click" || input.type === "phone_click") {
            p.incr(`ddt:demand:${dateStr}:contacts`)
            p.expire(`ddt:demand:${dateStr}:contacts`, TELEMETRY_TTL_SECONDS)

            if (cleanCity) {
                p.incr(`ddt:demand:${cityPrefix}${dateStr}:contacts`)
                p.expire(`ddt:demand:${cityPrefix}${dateStr}:contacts`, TELEMETRY_TTL_SECONDS)
            }

            if (input.partnerId) {
                p.incr(`ddt:partner:${input.partnerId}:${dateStr}:contacts`)
                p.expire(`ddt:partner:${input.partnerId}:${dateStr}:contacts`, TELEMETRY_TTL_SECONDS)
            }
        }

        if (input.type === "explicit_demand") {
            const rawTerm = ((input.metadata?.term as string) || "").trim().slice(0, 100)
            const rawDemandType = ((input.metadata?.demandType as string) || "").trim()

            if (rawTerm) {
                const displayEntry = rawDemandType ? `${rawDemandType}: ${rawTerm}` : rawTerm
                const monthStr = dateStr.slice(0, 7)

                // 1. Contador e lista de demandas explícitas
                p.incr(`ddt:demand:${dateStr}:explicit`)
                p.expire(`ddt:demand:${dateStr}:explicit`, TELEMETRY_TTL_SECONDS)

                p.zincrby(`ddt:demand:${dateStr}:explicit_terms`, 1, displayEntry)
                p.expire(`ddt:demand:${dateStr}:explicit_terms`, TELEMETRY_TTL_SECONDS)

                // 2. Unificação com as buscas e demandas gerais da plataforma (resultado zero atendido)
                p.incr(`ddt:search:${dateStr}:total`)
                p.expire(`ddt:search:${dateStr}:total`, TELEMETRY_TTL_SECONDS)

                p.incr(`ddt:search:${dateStr}:zero_results`)
                p.expire(`ddt:search:${dateStr}:zero_results`, TELEMETRY_TTL_SECONDS)

                p.zincrby(`ddt:search:${dateStr}:zero_terms`, 1, displayEntry)
                p.expire(`ddt:search:${dateStr}:zero_terms`, TELEMETRY_TTL_SECONDS)

                p.zincrby(`ddt:search:${monthStr}:zero_terms`, 1, displayEntry)
                p.expire(`ddt:search:${monthStr}:zero_terms`, TELEMETRY_TTL_SECONDS * 2)

                // 3. Granularidade por cidade (se houver cidade selecionada)
                if (cleanCity) {
                    p.incr(`ddt:demand:${cityPrefix}${dateStr}:explicit`)
                    p.expire(`ddt:demand:${cityPrefix}${dateStr}:explicit`, TELEMETRY_TTL_SECONDS)

                    p.zincrby(`ddt:demand:${cityPrefix}${dateStr}:explicit_terms`, 1, displayEntry)
                    p.expire(`ddt:demand:${cityPrefix}${dateStr}:explicit_terms`, TELEMETRY_TTL_SECONDS)

                    p.incr(`ddt:search:${cityPrefix}${dateStr}:total`)
                    p.expire(`ddt:search:${cityPrefix}${dateStr}:total`, TELEMETRY_TTL_SECONDS)

                    p.incr(`ddt:search:${cityPrefix}${dateStr}:zero_results`)
                    p.expire(`ddt:search:${cityPrefix}${dateStr}:zero_results`, TELEMETRY_TTL_SECONDS)

                    p.zincrby(`ddt:search:${cityPrefix}${dateStr}:zero_terms`, 1, displayEntry)
                    p.expire(`ddt:search:${cityPrefix}${dateStr}:zero_terms`, TELEMETRY_TTL_SECONDS)

                    p.zincrby(`ddt:search:${cityPrefix}${monthStr}:zero_terms`, 1, displayEntry)
                    p.expire(`ddt:search:${cityPrefix}${monthStr}:zero_terms`, TELEMETRY_TTL_SECONDS * 2)
                }
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
        const cleanCity = cleanCitySlug(citySlug)
        const cityPrefix = cleanCity ? `city:${cleanCity}:` : ""

        const p = redis.pipeline()

        // Batch fetch all daily metrics (searches, results, contacts, explicit demands)
        for (const d of dayKeys) {
            p.get(`ddt:search:${cityPrefix}${d}:total`)
            p.get(`ddt:search:${cityPrefix}${d}:with_results`)
            p.get(`ddt:search:${cityPrefix}${d}:zero_results`)
            p.get(`ddt:demand:${cityPrefix}${d}:contacts`)
            p.get(`ddt:demand:${cityPrefix}${d}:explicit`)
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
            const baseIdx = i * 5

            const rawT = Number(results[baseIdx] || 0)
            const rawW = Number(results[baseIdx + 1] || 0)
            const rawZ = Number(results[baseIdx + 2] || 0)
            const rawC = Number(results[baseIdx + 3] || 0)
            const rawE = Number(results[baseIdx + 4] || 0)

            const w = rawW
            const z = Math.max(rawZ, rawE)
            const t = Math.max(rawT, w + z)
            const c = rawC

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

        // Fetch top zero-result keywords AND explicit demands across the period
        const termsMap = new Map<string, { count: number; demandType?: string; cleanTerm: string }>()

        const termPipeline = redis.pipeline()
        for (const d of dayKeys) {
            // Get zero terms
            termPipeline.zrange(`ddt:search:${cityPrefix}${d}:zero_terms`, 0, 30, {
                rev: true,
                withScores: true,
            })
            // Also get explicit demand terms
            termPipeline.zrange(`ddt:demand:${cityPrefix}${d}:explicit_terms`, 0, 30, {
                rev: true,
                withScores: true,
            })
        }

        const termResults = await termPipeline.exec()

        for (const res of termResults) {
            if (Array.isArray(res)) {
                for (let j = 0; j < res.length; j += 2) {
                    const rawMember = typeof res[j] === "string" ? res[j] : (res[j] as any)?.member
                    const score = typeof res[j + 1] === "number" ? res[j + 1] : Number((res[j] as any)?.score || 0)

                    if (rawMember && score > 0) {
                        let cleanTerm = String(rawMember).trim()
                        let demandType: string | undefined = undefined

                        const knownPrefixes = [
                            { prefix: "Quero comprar: ", type: "Quero comprar" },
                            { prefix: "Quero contratar: ", type: "Quero contratar" },
                            { prefix: "Quero encontrar loja/empresa: ", type: "Quero encontrar loja" },
                            { prefix: "Quero encontrar loja: ", type: "Quero encontrar loja" },
                            { prefix: "Quero encontrar empresa: ", type: "Quero encontrar loja" },
                            { prefix: "Quero encontrar: ", type: "Quero encontrar loja" },
                            { prefix: "comprar: ", type: "Quero comprar" },
                            { prefix: "contratar: ", type: "Quero contratar" },
                            { prefix: "loja: ", type: "Quero encontrar loja" },
                            { prefix: "encontrar: ", type: "Quero encontrar loja" },
                        ]

                        for (const p of knownPrefixes) {
                            if (cleanTerm.toLowerCase().startsWith(p.prefix.toLowerCase())) {
                                demandType = p.type
                                cleanTerm = cleanTerm.slice(p.prefix.length).trim()
                                break
                            }
                        }

                        const mapKey = cleanTerm.toLowerCase()
                        const existing = termsMap.get(mapKey)
                        if (existing) {
                            existing.count += score
                            if (!existing.demandType && demandType) {
                                existing.demandType = demandType
                            }
                        } else {
                            termsMap.set(mapKey, {
                                cleanTerm,
                                demandType,
                                count: score,
                            })
                        }
                    }
                }
            }
        }

        const sortedTerms: ZeroResultTerm[] = Array.from(termsMap.values())
            .map(({ cleanTerm, demandType, count }) => ({
                term: cleanTerm,
                count,
                demandType,
                suggestedCategory: inferCategoryFromQuery(cleanTerm, demandType),
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
