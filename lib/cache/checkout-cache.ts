import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveCheckoutCartLines, type ResolveCartResult } from "@/lib/services/marketplace-cart-resolver"
import type { StoreFulfillmentCapabilities } from "@/lib/commerce/capabilities"
import {
  listActivePromotionsInBatch as rawListActivePromotionsInBatch,
  listActivePromotionsForMarketplaceAction as rawListActivePromotionsForMarketplaceAction,
} from "@/app/actions/shared/promotions"
import type { PricingPromotion } from "@/lib/types/promotion"

/**
 * Resolve the current database state without request memoization.
 * Callers that mutate cart_items must use this function afterwards.
 */
export async function resolveCheckoutCartLinesFresh(
  supabase: SupabaseClient,
  userId: string,
  cartItemIds: string[],
  storeCaps?: StoreFulfillmentCapabilities,
): Promise<ResolveCartResult> {
  return resolveCheckoutCartLines(supabase, userId, cartItemIds, storeCaps)
}

export const cachedResolveCheckoutCartLines = cache(
  async (
    supabase: SupabaseClient,
    userId: string,
    cartItemIds: string[],
    storeCaps?: StoreFulfillmentCapabilities,
  ): Promise<ResolveCartResult> => {
    return resolveCheckoutCartLinesFresh(supabase, userId, cartItemIds, storeCaps)
  },
)

export const cachedListActivePromotionsInBatch = cache(
  async (partnerIds: string[], customerId?: string | null): Promise<Record<string, any[]>> => {
    return rawListActivePromotionsInBatch(partnerIds, customerId)
  },
)

export const cachedListActivePromotionsForMarketplaceAction = cache(
  async (partnerId: string, customerId?: string | null): Promise<PricingPromotion[]> => {
    return rawListActivePromotionsForMarketplaceAction(partnerId, customerId)
  },
)
