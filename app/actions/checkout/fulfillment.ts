"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { verifyCheckoutFulfillmentToken } from "@/lib/security/checkout-fulfillment-token"

export async function checkSubscriptionStatusAction(subscriptionId: string, checkoutToken: string) {
  const rateLimit = await requireRateLimit(RateLimitCategory.SUBSCRIPTION_CREATE)
  if (!rateLimit.success) return { error: rateLimit.error || "Muitas tentativas." }

  if (!subscriptionId || !verifyCheckoutFulfillmentToken(subscriptionId, checkoutToken)) {
    return { error: "Link de checkout inválido ou expirado." }
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from("recurring_subscriptions")
    .select("status")
    .eq("id", subscriptionId)
    .single()

  if (error) {
    return { error: "Não foi possível consultar a assinatura." }
  }

  return { status: data?.status }
}
