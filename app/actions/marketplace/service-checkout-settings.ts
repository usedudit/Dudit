"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerPlan } from "@/lib/services/subscription.service"

export async function getServiceCheckoutSettingsAction(partnerId: string) {
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const { data: membership } = await supabase
    .from("partner_users")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) return { success: false, error: "Sem permissão." }

  const plan = await getPartnerPlan(partnerId)
  const depositFeatureAllowed = hasMinimumPlan(plan?.slug || "free", "crescer")

  const { data, error } = await supabase
    .from("partners")
    .select("service_deposit_enabled, service_deposit_type, service_deposit_percentage")
    .eq("id", partnerId)
    .single()

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    depositFeatureAllowed,
    settings: {
      depositEnabled: Boolean(data?.service_deposit_enabled),
      depositType: data?.service_deposit_type || "percentage",
      depositPercentage: Number(data?.service_deposit_percentage || 50),
    },
  }
}

export async function updateServiceCheckoutSettingsAction(input: {
  partnerId: string
  depositEnabled: boolean
  depositPercentage: 10 | 20 | 30 | 50
}) {
  const user = await requireUser()
  const supabase = await getSupabaseServerClient()

  const { data: membership } = await supabase
    .from("partner_users")
    .select("id")
    .eq("partner_id", input.partnerId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!membership) return { success: false, error: "Sem permissão." }

  const plan = await getPartnerPlan(input.partnerId)
  if (input.depositEnabled && !hasMinimumPlan(plan?.slug || "free", "crescer")) {
    return { success: false, error: "Entrada disponível apenas nos planos Crescer e Escalar." }
  }

  const { error } = await supabase
    .from("partners")
    .update({
      service_deposit_enabled: input.depositEnabled,
      service_deposit_type: "percentage",
      service_deposit_percentage: input.depositPercentage,
    })
    .eq("id", input.partnerId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
