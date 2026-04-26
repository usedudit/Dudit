export type SellerCommissionType = "none" | "percentage_sale" | "fixed_per_sale"
export type DeliveryCommissionType = "fixed_per_delivery" | "percentage_delivery_fee" | "distance_based"
export type CommissionRole = "seller" | "delivery"
export type CommissionType = SellerCommissionType | DeliveryCommissionType

export type CalculateCommissionInput = {
  userId: string
  role: CommissionRole
  commissionType: CommissionType
  value: number
  saleAmount?: number
  deliveryFee?: number
}

function asMoney(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(Math.max(0, value) * 100) / 100
}

export function calculateCommission(input: CalculateCommissionInput): number {
  const amount = Math.max(0, Number(input.saleAmount || 0))
  const deliveryFee = Math.max(0, Number(input.deliveryFee || 0))
  const commissionValue = Math.max(0, Number(input.value || 0))

  if (input.role === "seller") {
    if (input.commissionType === "percentage_sale") return asMoney((amount * commissionValue) / 100)
    if (input.commissionType === "fixed_per_sale") return asMoney(commissionValue)
    return 0
  }

  if (input.commissionType === "fixed_per_delivery") return asMoney(commissionValue)
  if (input.commissionType === "percentage_delivery_fee") return asMoney((deliveryFee * commissionValue) / 100)

  // Reserved for future strategies (distance based, bonuses, etc.).
  return 0
}

export function partnerRoleToCommissionRole(role: string | null | undefined): CommissionRole {
  return String(role || "").toUpperCase() === "DELIVERY" ? "delivery" : "seller"
}
