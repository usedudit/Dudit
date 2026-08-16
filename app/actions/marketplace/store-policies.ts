"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_POLICY, normalizePolicyRow, buildDefaultPolicyText } from "@/lib/returns/policy"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { isSystemResourceActive } from "@/lib/system-resources"

export async function getPartnerReturnPolicyPublicAction(partnerId: string) {
  try {
    const supabase = getAdminClient()

    const [{ data: policyRow }, { data: store }, { data: partner }, plan] = await Promise.all([
      supabase.from("partner_return_policies").select("*").eq("partner_id", partnerId).maybeSingle(),
      supabase.from("stores").select("name, phone, business_info").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("partners").select("business_info").eq("id", partnerId).maybeSingle(),
      getPartnerPlan(partnerId).catch(() => null),
    ])

    const businessInfo = normalizeBusinessInfo(store?.business_info || partner?.business_info)
    const planSlug = plan?.slug || "free"
    const hasReturnsPlan = hasMinimumPlan(planSlug, "crescer")
    const hasReturnsModule = hasReturnsPlan && isSystemResourceActive(businessInfo, "returns")

    if (policyRow) {
      const policy = normalizePolicyRow(policyRow, partnerId)
      if (!policy.fullPolicyText.trim()) {
        policy.fullPolicyText = buildDefaultPolicyText(store?.name)
      }
      return successResponse({
        policy,
        storeName: store?.name || null,
        phone: store?.phone || null,
        hasReturnsModule,
        planSlug,
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
      phone: store?.phone || null,
      hasReturnsModule,
      planSlug,
      isDefault: true,
    })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao carregar políticas da loja")
  }
}

