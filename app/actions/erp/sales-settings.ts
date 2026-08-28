"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/permissions/access"
import { revalidatePath } from "next/cache"
import { DEFAULT_POLICY } from "@/lib/returns/policy"
import {
  type SalesSettings,
  type ReceiptSettings,
  DEFAULT_SALES_SETTINGS,
} from "@/lib/sales/sales-settings-types"

export async function getSalesSettingsAction(partnerId: string, storeId?: string) {
  try {
    await requirePermission(partnerId, "settings", "view")
    const supabase = createAdminClient()

    let rawSettings: any = null

    if (storeId) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("business_info")
        .eq("id", storeId)
        .maybeSingle()

      if (storeData?.business_info && typeof storeData.business_info === "object") {
        rawSettings = (storeData.business_info as any).salesSettings
      }
    }

    if (!rawSettings) {
      const { data: partnerData } = await supabase
        .from("partners")
        .select("business_info")
        .eq("id", partnerId)
        .maybeSingle()

      if (partnerData?.business_info && typeof partnerData.business_info === "object") {
        rawSettings = (partnerData.business_info as any).salesSettings
      }
    }

    const settings: SalesSettings = {
      maxDiscountPercent: typeof rawSettings?.maxDiscountPercent === "number" ? rawSettings.maxDiscountPercent : DEFAULT_SALES_SETTINGS.maxDiscountPercent,
      allowNegativeStock: typeof rawSettings?.allowNegativeStock === "boolean" ? rawSettings.allowNegativeStock : DEFAULT_SALES_SETTINGS.allowNegativeStock,
      requireSeller: typeof rawSettings?.requireSeller === "boolean" ? rawSettings.requireSeller : DEFAULT_SALES_SETTINGS.requireSeller,
      allowCustomItemPrice: typeof rawSettings?.allowCustomItemPrice === "boolean" ? rawSettings.allowCustomItemPrice : DEFAULT_SALES_SETTINGS.allowCustomItemPrice,
      quoteValidityDays: typeof rawSettings?.quoteValidityDays === "number" ? rawSettings.quoteValidityDays : DEFAULT_SALES_SETTINGS.quoteValidityDays,
      autoCancelManualOrdersHours: typeof rawSettings?.autoCancelManualOrdersHours === "number" ? rawSettings.autoCancelManualOrdersHours : DEFAULT_SALES_SETTINGS.autoCancelManualOrdersHours,
      onlinePixExpirationMinutes: typeof rawSettings?.onlinePixExpirationMinutes === "number" ? rawSettings.onlinePixExpirationMinutes : DEFAULT_SALES_SETTINGS.onlinePixExpirationMinutes,
      defaultReceiptFormat: rawSettings?.defaultReceiptFormat === "a4" ? "a4" : "thermal",
    }

    return { success: true as const, data: settings }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function updateSalesSettingsAction(
  partnerId: string,
  settings: Partial<SalesSettings>,
  storeId?: string
) {
  try {
    await requirePermission(partnerId, "settings", "settings_negocio")
    const supabase = createAdminClient()

    // 1. Fetch existing partner business_info
    const { data: partnerData } = await supabase
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .single()

    const currentPartnerInfo = (partnerData?.business_info && typeof partnerData.business_info === "object")
      ? partnerData.business_info
      : {}

    const updatedPartnerSalesSettings = {
      ...(currentPartnerInfo.salesSettings || DEFAULT_SALES_SETTINGS),
      ...settings,
    }

    await supabase
      .from("partners")
      .update({
        business_info: {
          ...currentPartnerInfo,
          salesSettings: updatedPartnerSalesSettings,
        },
      })
      .eq("id", partnerId)

    // 2. If storeId provided, also update store business_info
    if (storeId) {
      const { data: storeData } = await supabase
        .from("stores")
        .select("business_info")
        .eq("id", storeId)
        .maybeSingle()

      if (storeData) {
        const currentStoreInfo = (storeData.business_info && typeof storeData.business_info === "object")
          ? storeData.business_info
          : {}

        await supabase
          .from("stores")
          .update({
            business_info: {
              ...currentStoreInfo,
              salesSettings: {
                ...(currentStoreInfo.salesSettings || updatedPartnerSalesSettings),
                ...settings,
              },
            },
          })
          .eq("id", storeId)
      }
    }

    revalidatePath("/erp/configuracoes")
    return { success: true as const }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function getReceiptSettingsAction(partnerId: string, storeId?: string) {
  try {
    await requirePermission(partnerId, "settings", "view")
    const supabase = createAdminClient()

    const [{ data: policyData }, { data: storeData }] = await Promise.all([
      supabase
        .from("partner_return_policies")
        .select("receipt_message, receipt_show_policy_block, receipt_show_acknowledgment")
        .eq("partner_id", partnerId)
        .maybeSingle(),
      storeId
        ? supabase.from("stores").select("business_info").eq("id", storeId).maybeSingle()
        : supabase.from("partners").select("business_info").eq("id", partnerId).maybeSingle(),
    ])

    const rawSales = (storeData?.business_info as any)?.salesSettings || {}

    return {
      success: true as const,
      data: {
        receiptMessage: (policyData?.receipt_message as string | null) ?? null,
        receiptShowPolicyBlock: (policyData?.receipt_show_policy_block as boolean | null) ?? true,
        receiptShowAcknowledgment: (policyData?.receipt_show_acknowledgment as boolean | null) ?? true,
        defaultReceiptFormat: (rawSales?.defaultReceiptFormat === "a4" ? "a4" : "thermal") as "thermal" | "a4",
        showStorePhone: rawSales?.showStorePhone !== false,
        showStoreAddress: rawSales?.showStoreAddress !== false,
        showSellerName: rawSales?.showSellerName !== false,
      },
    }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}

export async function updateReceiptSettingsAction(
  partnerId: string,
  data: {
    receiptMessage?: string | null
    receiptShowPolicyBlock?: boolean
    receiptShowAcknowledgment?: boolean
    defaultReceiptFormat?: "thermal" | "a4"
    showStorePhone?: boolean
    showStoreAddress?: boolean
    showSellerName?: boolean
  },
  storeId?: string
) {
  try {
    await requirePermission(partnerId, "settings", "settings_negocio")
    const supabase = createAdminClient()

    // 1. Update/upsert receipt settings in partner_return_policies
    const { data: existingPolicy } = await supabase
      .from("partner_return_policies")
      .select("partner_id")
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (existingPolicy) {
      const { error: policyError } = await supabase
        .from("partner_return_policies")
        .update({
          receipt_message: data.receiptMessage !== undefined ? data.receiptMessage : undefined,
          receipt_show_policy_block: data.receiptShowPolicyBlock !== undefined ? data.receiptShowPolicyBlock : true,
          receipt_show_acknowledgment: data.receiptShowAcknowledgment !== undefined ? data.receiptShowAcknowledgment : true,
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
          receipt_show_acknowledgment: data.receiptShowAcknowledgment ?? true,
          sla_response_days: DEFAULT_POLICY.slaResponseDays,
          updated_at: new Date().toISOString(),
        })

      if (policyError) throw policyError
    }

    // 2. Also persist visual receipt options in salesSettings
    if (data.defaultReceiptFormat !== undefined || data.showStorePhone !== undefined || data.showStoreAddress !== undefined || data.showSellerName !== undefined) {
      await updateSalesSettingsAction(partnerId, {
        ...(data.defaultReceiptFormat ? { defaultReceiptFormat: data.defaultReceiptFormat } : {}),
      }, storeId)
    }

    revalidatePath("/erp/configuracoes")
    return { success: true as const }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}
