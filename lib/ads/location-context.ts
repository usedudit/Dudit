import type { UserAdLocationContext } from "@/lib/ads/types"
import { DEFAULT_COUNTRY } from "@/lib/ads/constants"

type BuildContextParams = {
    lat?: number | null
    lng?: number | null
    citySlug?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
}

function normalizeCoord(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null
    return value
}

function buildCitySlugFromParts(city?: string | null, state?: string | null): string | null {
    if (!city || !state) return null
    const normalizedCity = city
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
    return `${normalizedCity}-${state.toLowerCase()}`
}

export function buildUserAdLocationContext(params: BuildContextParams): UserAdLocationContext {
    const lat = normalizeCoord(params.lat)
    const lng = normalizeCoord(params.lng)

    const rawCitySlug = params.citySlug?.toLowerCase().trim() || ""
    const isGenericSlug = !rawCitySlug || rawCitySlug === "brasil" || rawCitySlug === "vitrine" || rawCitySlug.startsWith("estado-")

    const cleanCitySlug = !isGenericSlug ? rawCitySlug : null
    const derivedCitySlug = cleanCitySlug || buildCitySlugFromParts(params.city, params.state)

    let state = params.state?.toUpperCase().trim() || null
    if (state === "BRASIL" || state === "VITRINE") {
        state = null
    }

    if (!state && derivedCitySlug) {
        const stateFromSlug = derivedCitySlug.split("-").pop()?.toUpperCase()
        if (stateFromSlug && stateFromSlug.length === 2) {
            state = stateFromSlug
        }
    }

    return {
        lat,
        lng,
        citySlug: derivedCitySlug,
        state,
        country: (params.country || DEFAULT_COUNTRY).toUpperCase(),
    }
}


export function buildAdCacheKey(context: UserAdLocationContext, slot: string, limit: number): string {
    const latKey = context.lat != null ? context.lat.toFixed(2) : "na"
    const lngKey = context.lng != null ? context.lng.toFixed(2) : "na"
    const cityKey = context.citySlug || "na"
    const stateKey = context.state || "na"
    return `ads:${slot}:${limit}:${cityKey}:${stateKey}:${latKey}:${lngKey}:${context.country}`
}
