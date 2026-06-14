import { getSaoPauloDateComponents } from "@/lib/utils/formatters"

export type DeliveryRuleType = "fixed" | "multiplier"

export type DeliverySettings = {
  baseFee: number
  includedKm: number
  extraKmPrice: number
  maxDeliveryKm: number | null
  isDeliveryEnabled: boolean
  isPickupEnabled: boolean
  freeDeliveryThreshold: number | null
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
}

export type CalculateDeliveryFeeInput = {
  distanceKm: number
  currentTime: Date
  settings: DeliverySettings
  rules: DeliveryFeeRule[]
  freeDeliveryCoupon?: boolean
  orderSubtotal?: number
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
  const maxDeliveryKm = input.settings.maxDeliveryKm == null ? null : Math.max(0, Number(input.settings.maxDeliveryKm))

  if (maxDeliveryKm != null && distanceKm > maxDeliveryKm) {
    throw new Error("Endereço fora do raio máximo de entrega.")
  }

  const freeDeliveryThreshold = input.settings.freeDeliveryThreshold == null ? null : Math.max(0, Number(input.settings.freeDeliveryThreshold))
  const orderSubtotal = input.orderSubtotal == null ? null : Math.max(0, Number(input.orderSubtotal))
  const isFreeByThreshold = freeDeliveryThreshold !== null && orderSubtotal !== null && orderSubtotal >= freeDeliveryThreshold

  if (input.freeDeliveryCoupon || isFreeByThreshold) {
    return {
      fee: 0,
      breakdown: {
        baseFee: roundMoney(baseFee),
        distanceFee: 0,
        timeFixedAdjustments: 0,
        timeMultiplierFactor: 1,
        timeAdjustmentTotal: roundMoney(-baseFee),
        appliedRuleIds: input.freeDeliveryCoupon ? ["coupon:free_delivery"] : ["threshold:free_delivery"],
        distanceKm: roundMoney(distanceKm),
      },
    }
  }

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
    },
  }
}
