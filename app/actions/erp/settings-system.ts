"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/permissions/access"
import { revalidatePath } from "next/cache"
import { DEFAULT_POLICY } from "@/lib/returns/policy"

export async function getPartnerTimezoneAction(partnerId: string) {
  try {
    await requirePermission(partnerId, "settings", "view")
    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("stores")
      .select("timezone")
      .eq("partner_id", partnerId)
      .limit(1)
      .maybeSingle()
    if (error) return { success: false as const, error: error.message }
    return { success: true as const, timezone: data?.timezone || "America/Sao_Paulo" }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function updatePartnerTimezoneAction(partnerId: string, timezone: string) {
  try {
    await requirePermission(partnerId, "settings", "view")
    const supabase = await getSupabaseServerClient()
    const { error } = await supabase
      .from("stores")
      .update({ timezone })
      .eq("partner_id", partnerId)
    if (error) return { success: false as const, error: error.message }
    revalidatePath("/erp/configuracoes")
    return { success: true as const }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function getSystemSettingsAction(partnerId: string) {
  try {
    await requirePermission(partnerId, "settings", "view")
    const supabase = createAdminClient()

    const [{ data: storeData, error: storeError }, { data: policyData }] = await Promise.all([
      supabase.from("stores").select("timezone").eq("partner_id", partnerId).limit(1).maybeSingle(),
      supabase.from("partner_return_policies").select("receipt_message, receipt_show_policy_block").eq("partner_id", partnerId).maybeSingle(),
    ])

    if (storeError) return { success: false as const, error: storeError.message }

    return {
      success: true as const,
      timezone: storeData?.timezone || "America/Sao_Paulo",
      receiptMessage: (policyData?.receipt_message as string | null) ?? null,
      receiptShowPolicyBlock: (policyData?.receipt_show_policy_block as boolean | null) ?? true,
    }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function updateSystemSettingsAction(
  partnerId: string,
  data: {
    timezone: string
    receiptMessage?: string | null
    receiptShowPolicyBlock?: boolean
  }
) {
  try {
    await requirePermission(partnerId, "settings", "view")
    const supabase = createAdminClient()

    // 1. Update timezone in stores
    const { error: storeError } = await supabase
      .from("stores")
      .update({ timezone: data.timezone })
      .eq("partner_id", partnerId)

    if (storeError) throw storeError

    // 2. Update/upsert receipt settings in partner_return_policies
    const { data: existingPolicy } = await supabase
      .from("partner_return_policies")
      .select("id")
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (existingPolicy) {
      const { error: policyError } = await supabase
        .from("partner_return_policies")
        .update({
          receipt_message: data.receiptMessage || null,
          receipt_show_policy_block: data.receiptShowPolicyBlock ?? true,
          updated_at: new Date().toISOString(),
        })
        .eq("partner_id", partnerId)

      if (policyError) throw policyError
    } else {
      const { error: policyError } = await supabase
        .from("partner_return_policies")
        .insert({
          partner_id: partnerId,
          legal_online_regret_days: DEFAULT_POLICY.legalOnlineRegretDays,
          legal_durable_product_days: DEFAULT_POLICY.legalDurableProductDays,
          legal_non_durable_product_days: DEFAULT_POLICY.legalNonDurableProductDays,
          accepts_size_exchange: DEFAULT_POLICY.acceptsSizeExchange,
          accepts_color_exchange: DEFAULT_POLICY.acceptsColorExchange,
          accepts_store_credit: DEFAULT_POLICY.acceptsStoreCredit,
          accepts_in_person_return: DEFAULT_POLICY.acceptsInPersonReturn,
          accepts_shipping_return: DEFAULT_POLICY.acceptsShippingReturn,
          shipping_payer: DEFAULT_POLICY.shippingPayer,
          commercial_deadline_days: DEFAULT_POLICY.commercialDeadlineDays,
          additional_warranty_days: DEFAULT_POLICY.additionalWarrantyDays,
          commercial_notes: DEFAULT_POLICY.commercialNotes,
          full_policy_text: DEFAULT_POLICY.fullPolicyText,
          receipt_message: data.receiptMessage || null,
          receipt_show_policy_block: data.receiptShowPolicyBlock ?? true,
          sla_response_days: DEFAULT_POLICY.slaResponseDays,
          updated_at: new Date().toISOString(),
        })

      if (policyError) throw policyError
    }

    revalidatePath("/erp/configuracoes")
    return { success: true as const }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

