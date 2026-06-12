"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { revalidatePath } from "next/cache"

export async function getPickupPaymentPolicyAction() {
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }
  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_delivery", user)

  const { data: partner } = await supabase
    .from("partners")
    .select("pickup_payment_policy")
    .eq("id", ctx.partnerId)
    .single()

  if (!partner) {
    return { error: "Parceiro não encontrado" }
  }

  return {
    pickupPaymentPolicy: partner.pickup_payment_policy || "require_online_payment",
  }
}

export async function updatePickupPaymentPolicyAction(
  policy: "allow_pickup_payment" | "require_online_payment",
) {
  await requireRateLimit(RateLimitCategory.PAYMENT)

  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const ctx = await getCurrentPartnerContext()
  if (!ctx) return { error: "Contexto de ERP não encontrado" }

  await requirePartnerAccessWithPermission(ctx.partnerId, "settings", "settings_delivery", user)

  const { error } = await supabase
    .from("partners")
    .update({ pickup_payment_policy: policy })
    .eq("id", ctx.partnerId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/settings")
  return { success: true }
}
