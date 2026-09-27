"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { computeMarketplaceCheckoutAmounts } from "@/lib/services/marketplace-checkout-amounts"

export async function getMarketplaceCheckoutAmountsAction(input: {
  cartItemIds: string[]
  deliveryType: "delivery" | "pickup"
  deliveryAddress: string
  destinationCoords?: { lat: number; lng: number } | null
  couponCode?: string | null
  payDepositOnly: boolean
  depositPercent: number
  depositAvailable: boolean
  carrierServiceId?: number | null
  destinationPostalCode?: string | null
}) {
  const user = await requireUser()

  if (!input.cartItemIds?.length) {
    return { success: false as const, error: "Carrinho vazio." }
  }

  const admin = getAdminClient()
  return computeMarketplaceCheckoutAmounts(admin, {
    userId: user.id,
    cartItemIds: input.cartItemIds,
    deliveryType: input.deliveryType,
    deliveryAddress: input.deliveryAddress || "",
    destinationCoords: input.destinationCoords,
    couponCode: input.couponCode,
    payDepositOnly: input.payDepositOnly,
    depositPercent: input.depositPercent,
    depositAvailable: input.depositAvailable,
    carrierServiceId: input.carrierServiceId,
    destinationPostalCode: input.destinationPostalCode,
  })
}
