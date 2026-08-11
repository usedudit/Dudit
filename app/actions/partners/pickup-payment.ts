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

  const { data: store } = await supabase
    .from("stores")
    .select("pickup_payment_policy")
    .eq("partner_id", ctx.partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!store) {
    return { error: "Loja não encontrada" }
  }

  return {
    pickupPaymentPolicy: store.pickup_payment_policy || "require_online_payment",
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
    .from("stores")
    .update({ pickup_payment_policy: policy })
    .eq("partner_id", ctx.partnerId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/configuracoes")
  return { success: true }
}
