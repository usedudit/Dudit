export type PricingAlertStatus = "loss" | "thin" | "ok"
export type PricingAlertCause = "price" | "promo"

export const DEFAULT_MARGIN_PERCENT = 30
export const MIN_MARGIN_THRESHOLD_PERCENT = 5

interface SalesSettingsLike {
    defaultMarginPercent?: unknown
}

interface BusinessInfoLike {
    salesSettings?: SalesSettingsLike | null
}

const toValidPercent = (value: unknown): number | null => {
    const parsed = typeof value === "string" ? Number(value) : value
    if (typeof parsed !== "number" || !Number.isFinite(parsed)) return null
    if (parsed < 0 || parsed > 100) return null
    return parsed
}

export function getDefaultMarginPercent(businessInfo: unknown): number {
    const settings = (businessInfo as BusinessInfoLike | null | undefined)?.salesSettings
    if (!settings) return DEFAULT_MARGIN_PERCENT

    const value = toValidPercent(settings.defaultMarginPercent)
    return value !== null ? value : DEFAULT_MARGIN_PERCENT
}

export function getMarginThresholdPercent(defaultMarginPercent: number): number {
    return Math.max(defaultMarginPercent / 2, MIN_MARGIN_THRESHOLD_PERCENT)
}

export function roundMoney(value: number): number {
    return Math.round(value * 100) / 100
}

export function getSuggestedPrice(costPrice: number, defaultMarginPercent: number): number {
    return roundMoney(costPrice * (1 + defaultMarginPercent / 100))
}

export function calculateMarginPercent(price: number, costPrice: number): number | null {
    if (!(price > 0)) return null
    return Math.round(((price - costPrice) / price) * 1000) / 10
}

function classifyPrice(price: number, costPrice: number, thresholdPercent: number): PricingAlertStatus {
    if (!(costPrice > 0)) return "ok"
    if (price <= costPrice) return "loss"
    const margin = calculateMarginPercent(price, costPrice)
    if (margin !== null && margin < thresholdPercent) return "thin"
    return "ok"
}

export interface PricingEvaluationInput {
    price: number
    costPrice: number
    promotionalPrice?: number | null
    variantMinPrice?: number | null
    hasVariants: boolean
}

export interface PricingEvaluation {
    status: PricingAlertStatus
    cause: PricingAlertCause
    basePrice: number
    effectivePrice: number
    marginPercent: number | null
    suggestedPrice: number
    lossPerUnit: number
    potentialGainPerUnit: number
}

export function evaluatePricing(
    input: PricingEvaluationInput,
    defaultMarginPercent: number,
    thresholdPercent: number
): PricingEvaluation {
    const costPrice = Number(input.costPrice) || 0
    const rawPrice = Number(input.price) || 0
    const variantMinPrice = input.variantMinPrice != null ? Number(input.variantMinPrice) : null
    const promoPrice = input.promotionalPrice != null ? Number(input.promotionalPrice) : 0

    const basePrice =
        input.hasVariants && variantMinPrice !== null && variantMinPrice > 0 ? variantMinPrice : rawPrice
    const promoActive = !input.hasVariants && promoPrice > 0 && promoPrice < basePrice
    const effectivePrice = promoActive ? promoPrice : basePrice

    const status = classifyPrice(effectivePrice, costPrice, thresholdPercent)
    const baseStatus = classifyPrice(basePrice, costPrice, thresholdPercent)
    const cause: PricingAlertCause = status !== "ok" && baseStatus === "ok" ? "promo" : "price"

    const suggestedPrice = getSuggestedPrice(costPrice, defaultMarginPercent)

    return {
        status,
        cause,
        basePrice,
        effectivePrice,
        marginPercent: calculateMarginPercent(effectivePrice, costPrice),
        suggestedPrice,
        lossPerUnit: costPrice > effectivePrice ? roundMoney(costPrice - effectivePrice) : 0,
        potentialGainPerUnit: suggestedPrice > effectivePrice ? roundMoney(suggestedPrice - effectivePrice) : 0,
    }
}

const STATUS_SEVERITY: Record<PricingAlertStatus, number> = { loss: 0, thin: 1, ok: 2 }

export function sortPricingAlerts<T extends { status: PricingAlertStatus; impact: number }>(alerts: T[]): T[] {
    return [...alerts].sort((a, b) => STATUS_SEVERITY[a.status] - STATUS_SEVERITY[b.status] || b.impact - a.impact)
}
