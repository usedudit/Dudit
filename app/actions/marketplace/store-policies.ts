"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_POLICY, normalizePolicyRow, buildDefaultPolicyText } from "@/lib/returns/policy"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { resolveMarketplaceCapabilities } from "@/lib/marketplace-capabilities"

export async function getPartnerReturnPolicyPublicAction(partnerId: string) {
  try {
    const supabase = getAdminClient()

    const [{ data: policyRow }, { data: store }, plan, capabilities] = await Promise.all([
      supabase.from("partner_return_policies").select("*").eq("partner_id", partnerId).maybeSingle(),
      supabase.from("stores").select("id, name, phone, business_info").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
      getPartnerPlan(partnerId).catch(() => null),
      resolveMarketplaceCapabilities(partnerId),
    ])

    // business_info do parceiro manda; o da loja é só fallback legado.
    const planSlug = plan?.slug || "free"
    const hasReturnsModule = capabilities.returnsViaDudit

    if (policyRow) {
      const policy = normalizePolicyRow(policyRow, partnerId)
      if (!policy.fullPolicyText.trim()) {
        policy.fullPolicyText = buildDefaultPolicyText(store?.name)
      }
      return successResponse({
        policy,
        storeName: store?.name || null,
        phone: store?.phone || capabilities.whatsappPhone,
        hasReturnsModule,
        planSlug,
        orderFlow: capabilities.baseOrderFlow,
      })
    }

    const policy = {
      partnerId,
      ...DEFAULT_POLICY,
      fullPolicyText: buildDefaultPolicyText(store?.name),
    }
    return successResponse({
      policy,
      storeName: store?.name || null,
      phone: store?.phone || capabilities.whatsappPhone,
      hasReturnsModule,
      planSlug,
      orderFlow: capabilities.baseOrderFlow,
      isDefault: true,
    })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao carregar políticas da loja")
  }
}

