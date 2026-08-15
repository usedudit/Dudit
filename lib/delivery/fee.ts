import { getSaoPauloDateComponents } from "@/lib/utils/formatters"

export type DeliveryRuleType = "fixed" | "multiplier"

export type DeliverySettings = {
  storeId?: string | null
  baseFee: number
  includedKm: number
  extraKmPrice: number
  maxDeliveryKm: number | null
  isDeliveryEnabled: boolean
  isPickupEnabled: boolean
  freeDeliveryThreshold: number | null
  deliveryPayer: "customer" | "seller"
}

export type DeliveryFeeRule = {
  id: string
  startTime: string
  endTime: string
  type: DeliveryRuleType
  value: number
  isActive: boolean
}

export type DeliveryBreakdown = {
  baseFee: number
  distanceFee: number
  timeFixedAdjustments: number
  timeMultiplierFactor: number
  timeAdjustmentTotal: number
  appliedRuleIds: string[]
  distanceKm: number
  originalFee?: number
  deliverySubsidy?: number
  deliveryPayer?: "customer" | "seller"
  isOutsideRadius?: boolean
  maxDeliveryKm?: number | null
  outsideRadiusWarning?: string
  isFreeByThreshold?: boolean
  freeDeliveryThreshold?: number | null
  freeDeliveryReason?: "threshold" | "coupon"
  hasRatesConfigured?: boolean
}

export function hasDeliveryRatesConfigured(
  settings?: any | null,
  rules?: any[] | null,
): boolean {
  if (!settings) return false
  const baseFee = Number(settings.baseFee ?? settings.base_fee ?? 0)
  const includedKm = Number(settings.includedKm ?? settings.included_km ?? 0)
  const extraKmPrice = Number(settings.extraKmPrice ?? settings.extra_km_price ?? 0)
  const maxDeliveryKm = settings.maxDeliveryKm ?? settings.max_delivery_km
  const freeDeliveryThreshold = settings.freeDeliveryThreshold ?? settings.free_delivery_threshold
  const deliveryPayer = settings.deliveryPayer ?? settings.delivery_payer

  if (baseFee > 0) return true
  if (includedKm > 0) return true
  if (extraKmPrice > 0) return true
  if (maxDeliveryKm != null && Number(maxDeliveryKm) > 0) return true
  if (freeDeliveryThreshold != null && Number(freeDeliveryThreshold) > 0) return true
  if (deliveryPayer === "seller") return true
  if (rules && Array.isArray(rules) && rules.some((r) => (r.isActive ?? r.is_active ?? true) && Number(r.value || 0) > 0)) {
    return true
  }
  return false
}

export type CalculateDeliveryFeeInput = {
  distanceKm: number
  currentTime: Date
  settings: DeliverySettings
  rules: DeliveryFeeRule[]
  freeDeliveryCoupon?: boolean
  orderSubtotal?: number
  allowOutsideRadius?: boolean
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function toMinutes(time: string): number {
  const [h, m] = String(time || "00:00").split(":").map((v) => Number(v || 0))
  return (h * 60) + m
}

function isTimeInRange(currentMinutes: number, start: string, end: string): boolean {
  const startMinutes = toMinutes(start)
  const endMinutes = toMinutes(end)
  if (startMinutes === endMinutes) return true
  if (startMinutes < endMinutes) return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  return currentMinutes >= startMinutes || currentMinutes <= endMinutes
}

export function calculateDeliveryFee(input: CalculateDeliveryFeeInput): {
  fee: number
  breakdown: DeliveryBreakdown
} {
  const distanceKm = Number(input.distanceKm || 0)
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("Distância inválida para cálculo de entrega.")
  }

  const baseFee = Math.max(0, Number(input.settings.baseFee || 0))
  const includedKm = Math.max(0, Number(input.settings.includedKm || 0))
  const extraKmPrice = Math.max(0, Number(input.settings.extraKmPrice || 0))
  const maxDeliveryKmSetting = input.settings.maxDeliveryKm == null || Number(input.settings.maxDeliveryKm) <= 0
    ? null
    : Math.max(0, Number(input.settings.maxDeliveryKm))

  const effectiveMaxKm = maxDeliveryKmSetting != null
    ? maxDeliveryKmSetting
    : (includedKm > 0 ? includedKm : null)

  const isOutsideRadius = effectiveMaxKm != null && distanceKm > effectiveMaxKm
  if (isOutsideRadius && !input.allowOutsideRadius) {
    throw new Error("Endereço fora do raio máximo de entrega do vendedor.")
  }

  const outsideRadiusWarning = isOutsideRadius
    ? `Endereço fora do raio máximo de entrega da loja (${distanceKm} km / Máximo: ${effectiveMaxKm} km).`
    : undefined

  let fee = baseFee
  const extraDistanceKm = Math.max(0, distanceKm - includedKm)
  const distanceFee = extraDistanceKm * extraKmPrice
  fee += distanceFee

  const { hour, minute } = getSaoPauloDateComponents(input.currentTime)
  const nowMinutes = (hour * 60) + minute
  const activeRules = (input.rules || [])
    .filter((r) => r.isActive)
    .filter((r) => isTimeInRange(nowMinutes, r.startTime, r.endTime))

  const fixedRules = activeRules.filter((r) => r.type === "fixed")
  const multiplierRules = activeRules.filter((r) => r.type === "multiplier")

  let timeFixedAdjustments = 0
  for (const rule of fixedRules) {
    timeFixedAdjustments += Number(rule.value || 0)
  }
  fee += timeFixedAdjustments

  let timeMultiplierFactor = 1
  for (const rule of multiplierRules) {
    const multiplier = Number(rule.value || 0)
    timeMultiplierFactor *= multiplier
  }
  fee *= timeMultiplierFactor

  fee = Math.max(0, fee)
  const roundedFee = roundMoney(fee)
  const preTimeFee = baseFee + distanceFee

  const freeDeliveryThreshold = input.settings.freeDeliveryThreshold == null ? null : Math.max(0, Number(input.settings.freeDeliveryThreshold))
  const orderSubtotal = input.orderSubtotal == null ? null : Math.max(0, Number(input.orderSubtotal))
  const isFreeByThreshold = freeDeliveryThreshold !== null && orderSubtotal !== null && orderSubtotal >= freeDeliveryThreshold

  const hasRatesConfigured = hasDeliveryRatesConfigured(input.settings, input.rules)

  if (input.freeDeliveryCoupon || isFreeByThreshold) {
    return {
      fee: 0,
      breakdown: {
        baseFee: roundMoney(baseFee),
        distanceFee: roundMoney(distanceFee),
        timeFixedAdjustments: roundMoney(timeFixedAdjustments),
        timeMultiplierFactor: roundMoney(timeMultiplierFactor),
        timeAdjustmentTotal: roundMoney(roundedFee - preTimeFee),
        appliedRuleIds: input.freeDeliveryCoupon
          ? ["coupon:free_delivery", ...activeRules.map((r) => r.id)]
          : ["threshold:free_delivery", ...activeRules.map((r) => r.id)],
        distanceKm: roundMoney(distanceKm),
        originalFee: roundedFee,
        deliverySubsidy: roundedFee,
        deliveryPayer: "seller",
        isOutsideRadius,
        maxDeliveryKm: effectiveMaxKm,
        outsideRadiusWarning,
        isFreeByThreshold: Boolean(isFreeByThreshold),
        freeDeliveryThreshold,
        freeDeliveryReason: input.freeDeliveryCoupon ? "coupon" : "threshold",
        hasRatesConfigured,
      },
    }
  }

  if (input.settings.deliveryPayer === "seller") {
    return {
      fee: 0,
      breakdown: {
        baseFee: roundMoney(baseFee),
        distanceFee: roundMoney(distanceFee),
        timeFixedAdjustments: roundMoney(timeFixedAdjustments),
        timeMultiplierFactor: roundMoney(timeMultiplierFactor),
        timeAdjustmentTotal: roundMoney(roundedFee - preTimeFee),
        appliedRuleIds: [...activeRules.map((r) => r.id), "seller:subsidized_delivery"],
        distanceKm: roundMoney(distanceKm),
        originalFee: roundedFee,
        deliveryPayer: "seller",
        isOutsideRadius,
        maxDeliveryKm: effectiveMaxKm,
        outsideRadiusWarning,
        hasRatesConfigured,
      },
    }
  }

  return {
    fee: roundedFee,
    breakdown: {
      baseFee: roundMoney(baseFee),
      distanceFee: roundMoney(distanceFee),
      timeFixedAdjustments: roundMoney(timeFixedAdjustments),
      timeMultiplierFactor: roundMoney(timeMultiplierFactor),
      timeAdjustmentTotal: roundMoney(roundedFee - preTimeFee),
      appliedRuleIds: activeRules.map((r) => r.id),
      distanceKm: roundMoney(distanceKm),
      originalFee: roundedFee,
      deliveryPayer: "customer",
      isOutsideRadius,
      maxDeliveryKm: effectiveMaxKm,
      outsideRadiusWarning,
      hasRatesConfigured,
    },
  }
}
