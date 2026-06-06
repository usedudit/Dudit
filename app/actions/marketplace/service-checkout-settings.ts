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
    .select("service_deposit_enabled, service_deposit_type, service_deposit_percentage, service_deposit_manual_enabled, service_deposit_mp_enabled, mp_user_id")
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
      depositManualEnabled: Boolean(data?.service_deposit_manual_enabled),
      depositMpEnabled: Boolean(data?.service_deposit_mp_enabled),
      mpConnected: !!data?.mp_user_id,
    },
  }
}

export async function updateServiceCheckoutSettingsAction(input: {
  partnerId: string
  depositEnabled: boolean
  depositPercentage: 10 | 20 | 30 | 50
  depositManualEnabled: boolean
  depositMpEnabled: boolean
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

  if (input.depositEnabled) {
    if (!input.depositManualEnabled && !input.depositMpEnabled) {
      return { success: false, error: "Selecione pelo menos um meio de recebimento do sinal (Mercado Pago ou Sinal Manual)." }
    }
    const { data: partnerRow } = await supabase
      .from("partners")
      .select("mp_user_id")
      .eq("id", input.partnerId)
      .single()
    const mpConnected = !!partnerRow?.mp_user_id
    if (!mpConnected && !input.depositManualEnabled) {
      return { success: false, error: "O sinal manual é obrigatório já que a loja não possui conexão com o Mercado Pago." }
    }
    if (!mpConnected && input.depositMpEnabled) {
      return { success: false, error: "Não é possível habilitar o Mercado Pago para o sinal, pois o Mercado Pago não está conectado." }
    }
  }

  const { error } = await supabase
    .from("partners")
    .update({
      service_deposit_enabled: input.depositEnabled,
      service_deposit_type: "percentage",
      service_deposit_percentage: input.depositPercentage,
      service_deposit_manual_enabled: input.depositManualEnabled,
      service_deposit_mp_enabled: input.depositMpEnabled,
    })
    .eq("id", input.partnerId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
