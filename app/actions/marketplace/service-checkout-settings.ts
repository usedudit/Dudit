"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import {
  findMercadoPagoIntegration,
  isMercadoPagoConnected,
  mapToMpPartnerFields,
} from "@/lib/services/payments/mercadopago-integration"

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
    .select("service_deposit_enabled, service_deposit_type, service_deposit_percentage, partner_integrations(provider_slug, status, account_id)")
    .eq("id", partnerId)
    .single()

  if (error) return { success: false, error: error.message }

  const mpFields = mapToMpPartnerFields((data as any)?.partner_integrations)

  return {
    success: true,
    depositFeatureAllowed,
    settings: {
      depositEnabled: Boolean(data?.service_deposit_enabled),
      depositType: data?.service_deposit_type || "percentage",
      depositPercentage: Number(data?.service_deposit_percentage || 50),
      depositMpEnabled: Boolean(data?.service_deposit_enabled && mpFields.mp_user_id),
      mpConnected: !!mpFields.mp_user_id,
    },
  }
}

export async function updateServiceCheckoutSettingsAction(input: {
  partnerId: string
  depositEnabled: boolean
  depositPercentage: 10 | 20 | 30 | 50
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
    const partnerIntegration = await findMercadoPagoIntegration(supabase, input.partnerId)
    const mpConnected = isMercadoPagoConnected(partnerIntegration)
    if (!mpConnected) {
      return { success: false, error: "Para cobrar sinal obrigatório, conecte o Mercado Pago nas integrações." }
    }
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
