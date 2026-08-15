export type LocationContext = {
    scope: "city" | "state" | "country"
    city?: string | null
    state?: string | null
}

export interface LocationPartner {
    city?: string | null
    state?: string | null
    neighborhood?: string | null
    distance_km_formatted?: string | null
}

export function normalizeCityName(value: string | null | undefined): string {
    return String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
}

export function normalizeStateUf(value: string | null | undefined): string {
    return String(value || "").toUpperCase().trim()
}

/**
 * Rótulo de localização exibido abaixo do nome do vendedor nos cards:
 * - Contexto cidade + mesma cidade → bairro (ou distância como fallback)
 * - Contexto cidade + outra cidade do mesmo estado → nome da cidade
 * - Contexto cidade + outro estado → "Cidade, UF"
 * - Contexto estado → nome da cidade
 * - Contexto país → "Cidade, UF"
 */
export function getLocationLabel(partner: LocationPartner | null | undefined, context: LocationContext | null | undefined): string | null {
    if (!partner || !context) return null

    const sellerCity = normalizeCityName(partner.city)
    const sellerState = normalizeStateUf(partner.state)
    const ctxCity = normalizeCityName(context.city)
    const ctxState = normalizeStateUf(context.state)

    if (!sellerCity && !sellerState) return null

    if (context.scope === "country") {
        return sellerCity && sellerState ? `${partner.city}, ${sellerState}` : (partner.city || partner.state || null)
    }

    if (context.scope === "state") {
        if (sellerCity && ctxState && sellerState === ctxState) return partner.city || null
        return sellerCity && sellerState ? `${partner.city}, ${sellerState}` : (partner.city || null)
    }

    // scope === "city"
    if (sellerCity && ctxCity && sellerCity === ctxCity) {
        const neighborhood = String(partner.neighborhood || "").trim()
        if (neighborhood) return neighborhood
        const distance = partner.distance_km_formatted
        if (distance) return distance
        return partner.city || null
    }

    if (sellerCity && ctxState && sellerState === ctxState) return partner.city || null

    return sellerCity && sellerState ? `${partner.city}, ${sellerState}` : (partner.city || null)
}
