export type ServiceTravelFeeMode = "free" | "flat" | "per_km" | "tiered"

export type ServiceAttendanceSettings = {
    maxServiceKm: number | null
    travelFeeMode: ServiceTravelFeeMode
    freeTravelKm: number
    travelFlatFee: number
    travelPerKm: number
    travelTiers: Array<{ upToKm: number; fee: number }>
    enforceServiceArea: boolean
}

export type ServiceTravelFeeResult = {
    /** Taxa de deslocamento líquida (já descontivoque free_travel_km). */
    fee: number
    /** km de deslocamento cobrados (após o trecho gratuito). */
    chargedKm: number
    distanceKm: number | null
    outOfRadius: boolean
    mode: ServiceTravelFeeMode
}

const DEFAULT_SETTINGS: ServiceAttendanceSettings = {
    maxServiceKm: null,
    travelFeeMode: "free",
    freeTravelKm: 0,
    travelFlatFee: 0,
    travelPerKm: 0,
    travelTiers: [],
    enforceServiceArea: true,
}

export function normalizeServiceAttendanceSettings(
    raw: Record<string, unknown> | null | undefined,
): ServiceAttendanceSettings {
    if (!raw) return { ...DEFAULT_SETTINGS }
    const mode =
        (raw.travel_fee_mode as ServiceTravelFeeMode) ||
        (raw.travelFeeMode as ServiceTravelFeeMode) ||
        (raw.mode as ServiceTravelFeeMode)
    const validMode = mode && ["free", "flat", "per_km", "tiered"].includes(mode) ? mode : "free"
    let tiers: Array<{ upToKm: number; fee: number }> = []
    try {
        const parsed = JSON.parse(Array.isArray(raw.travel_tiers) ? JSON.stringify(raw.travel_tiers) : (raw.travel_tiers as string) || "[]")
        tiers = Array.isArray(parsed)
            ? parsed.map((t: any) => ({
                upToKm: Number(t?.upToKm ?? t?.up_to_km ?? 0),
                fee: Number(t?.fee ?? 0),
            }))
            : []
    } catch {
        tiers = []
    }
    return {
        maxServiceKm: raw.max_service_km != null ? Number(raw.max_service_km) : (raw.maxServiceKm != null ? Number(raw.maxServiceKm) : null),
        travelFeeMode: validMode,
        freeTravelKm: raw.free_travel_km != null ? Number(raw.free_travel_km) : (raw.freeTravelKm != null ? Number(raw.freeTravelKm) : 0),
        travelFlatFee: raw.travel_flat_fee != null ? Number(raw.travel_flat_fee) : (raw.travelFlatFee != null ? Number(raw.travelFlatFee) : 0),
        travelPerKm: raw.travel_per_km != null ? Number(raw.travel_per_km) : (raw.travelPerKm != null ? Number(raw.travelPerKm) : 0),
        travelTiers: tiers,
        enforceServiceArea: raw.enforce_service_area != null ? Boolean(raw.enforce_service_area) : (raw.enforceServiceArea != null ? Boolean(raw.enforceServiceArea) : true),
    }
}

/**
 * Calcula a taxa de deslocamento para um atendimento a domicílio a partir da
 * distância (km) entre a loja e o cliente.
 *
 * Regras:
 * - Se distanceKm for null, trata como fora do raio (não há como calcular).
 * - maxServiceKm != null: distância maior corta o serviço quando
 *   enforceServiceArea for true (outOfRadius=true, fee=0 → bloqueio).
 * - "free": taxa zero (até freeTravelKm grátis; acima continua zero - loja
 *   assume).
 * - "flat": travelFlatFee fixa (sempre que dentro do raio).
 * - "per_km": travelPerKm * km cobrados (após freeTravelKm).
 * - "tiered": percorre travel_tiers (ordenado por upToKm) e pega a tarifa da
 *   faixa em que chargedKm cai; se ultrapassar a última faixa, aplica a última.
 */
export function calculateServiceTravelFee(
    settings: ServiceAttendanceSettings | null | undefined,
    distanceKm: number | null,
): ServiceTravelFeeResult {
    const s = settings || DEFAULT_SETTINGS
    const safeDistance = distanceKm == null ? null : Number(distanceKm)
    const outOfRadius = safeDistance == null
        ? (s.maxServiceKm != null)   // distância desconhecida mas raio limitado => fora do raio
        : (s.maxServiceKm != null && safeDistance > s.maxServiceKm)

    if (safeDistance == null || outOfRadius) {
        return { fee: 0, chargedKm: 0, distanceKm: safeDistance ?? 0, outOfRadius: Boolean(outOfRadius), mode: s.travelFeeMode }
    }

    const chargedKm = Math.max(0, safeDistance - s.freeTravelKm)

    let fee = 0
    switch (s.travelFeeMode) {
        case "flat":
            fee = Number(s.travelFlatFee || 0)
            break
        case "per_km":
            fee = chargedKm * Number(s.travelPerKm || 0)
            break
        case "tiered": {
            const tiers = [...(s.travelTiers || [])].sort((a, b) => a.upToKm - b.upToKm)
            if (tiers.length > 0) {
                const match = tiers.find((t) => chargedKm <= t.upToKm) || tiers[tiers.length - 1]
                fee = Number(match?.fee || 0)
            }
            break
        }
        case "free":
        default:
            fee = 0
            break
    }

    return {
        fee: Math.round(fee * 100) / 100,
        chargedKm,
        distanceKm: safeDistance,
        outOfRadius: false,
        mode: s.travelFeeMode,
    }
}

export function isServiceWithinAttendanceRadius(
    settings: ServiceAttendanceSettings | null | undefined,
    distanceKm: number | null,
): boolean {
    if (distanceKm == null) return false
    const s = settings || DEFAULT_SETTINGS
    if (s.maxServiceKm == null) return true
    return Number(distanceKm) <= Number(s.maxServiceKm)
}
