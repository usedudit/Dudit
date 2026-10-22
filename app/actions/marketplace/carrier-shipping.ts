"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import {
  quoteCarrierFreightOptions,
  carrierReasonMessage,
  type CarrierFreightOption,
  type CarrierUnavailableReason,
} from "@/lib/services/shipping/carrier-checkout"

/**
 * Public checkout quote for carrier freight (SuperFrete). Used as a fallback
 * when the store's own delivery radius does not cover the customer address.
 */
export async function quoteCarrierFreightAction(input: {
  partnerId: string
  toPostalCode: string
}): Promise<
  | { success: true; options: CarrierFreightOption[]; fromPostalCode: string }
  | { success: false; error: string; reason: CarrierUnavailableReason }
> {
  await requireRateLimit(RateLimitCategory.CART)

  if (!input.partnerId) {
    return { success: false, error: "Loja inválida.", reason: "not_connected" }
  }

  try {
    const supabase = getAdminClient()
    const result = await quoteCarrierFreightOptions(supabase, {
      partnerId: input.partnerId,
      toPostalCode: input.toPostalCode,
    })
    if (!result.available) {
      return { success: false, error: carrierReasonMessage(result.reason), reason: result.reason }
    }
    return {
      success: true,
      options: result.options,
      fromPostalCode: result.fromPostalCode,
    }
  } catch {
    return { success: false, error: carrierReasonMessage("quote_failed"), reason: "quote_failed" }
  }
}
