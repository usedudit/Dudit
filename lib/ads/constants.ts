import type { AdSlot } from "@/lib/ads/types"

export const AD_SLOT_LIMITS: Record<AdSlot, number> = {
    home: 6,
    explore: 4,
    search: 2,
    detail: 1,
}

export const BRAZILIAN_UFS = [
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
    "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
    "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const

export const DEFAULT_COUNTRY = "BR"

export const AD_CACHE_TTL_SECONDS = 300
