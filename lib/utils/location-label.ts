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
 * Rótulo de localização inteligente exibido nos cards:
 * - Se estiver no escopo da cidade (scope === "city"):
 *   - Mesma cidade: NÃO exibe "Bairro, Cidade" para não poluir a interface. Retorna null (pois o usuário já sabe em qual cidade está e os cards mostram tempo/distância/frete).
 *   - Cidade vizinha / outra cidade do mesmo estado: exibe o nome da cidade de origem (ex: "Maringá") para o usuário saber que vem de fora.
 *   - Outro estado: exibe "Cidade, UF" (ex: "São Paulo, SP").
 * - Se estiver no escopo de estado (scope === "state"):
 *   - Mesmo estado: exibe o nome da cidade (ex: "Londrina").
 *   - Outro estado: exibe "Cidade, UF" (ex: "São Paulo, SP").
 * - Se estiver no escopo nacional (scope === "country"):
 *   - Exibe "Cidade, UF" (ex: "Londrina, PR").
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
        // Na mesma cidade onde o usuário está navegando, não repetimos a cidade nem o bairro,
        // pois a informação útil agora é tempo de entrega, distância e frete!
        return null
    }

    if (sellerCity && ctxState && sellerState === ctxState) return partner.city || null

    return sellerCity && sellerState ? `${partner.city}, ${sellerState}` : (partner.city || null)
}
