export const MARKETPLACE_TYPES = ["produtos", "servicos", "vitrines", "tudo", "planos"] as const

export type MarketplaceSearchType = typeof MARKETPLACE_TYPES[number]

export function parseMarketplaceType(value: any): MarketplaceSearchType {
    return MARKETPLACE_TYPES.includes(value) ? value : "tudo"
}