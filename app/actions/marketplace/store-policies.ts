"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { DEFAULT_POLICY, normalizePolicyRow, buildDefaultPolicyText } from "@/lib/returns/policy"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"

export async function getPartnerReturnPolicyPublicAction(partnerId: string) {
  try {
    const supabase = getAdminClient()

    const [{ data: policyRow }, { data: store }] = await Promise.all([
      supabase.from("partner_return_policies").select("*").eq("partner_id", partnerId).maybeSingle(),
      supabase.from("stores").select("name").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
    ])

    if (policyRow) {
      const policy = normalizePolicyRow(policyRow, partnerId)
      if (!policy.fullPolicyText.trim()) {
        policy.fullPolicyText = buildDefaultPolicyText(store?.name)
      }
      return successResponse({ policy, storeName: store?.name || null })
    }

    const policy = {
      partnerId,
      ...DEFAULT_POLICY,
      fullPolicyText: buildDefaultPolicyText(store?.name),
    }
    return successResponse({ policy, storeName: store?.name || null, isDefault: true })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao carregar políticas da loja")
  }
}
