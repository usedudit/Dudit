"use server"

import { requireUser } from "@/lib/auth/authorization"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/permissions/access"
import { revalidatePath } from "next/cache"
import { DEFAULT_POLICY } from "@/lib/returns/policy"
import {
  type SalesSettings,
  type ReceiptSettings,
  DEFAULT_SALES_SETTINGS,
  DEFAULT_RECEIPT_SETTINGS,
} from "@/lib/sales/sales-settings-types"

/**
 * Sanitizes and validates sales settings payload before persisting.
 */
function sanitizeSalesSettings(input: Partial<SalesSettings>): Partial<SalesSettings> {
  const sanitized: Partial<SalesSettings> = {}

  if (input.maxDiscountPercent !== undefined) {
    if (input.maxDiscountPercent === null) {
      sanitized.maxDiscountPercent = 100
    } else {
      const parsed = Number(input.maxDiscountPercent)
      sanitized.maxDiscountPercent = isNaN(parsed) ? 100 : Math.max(0, Math.min(100, parsed))
    }
  }

  if (input.defaultMarginPercent !== undefined) {
    if (input.defaultMarginPercent === null) {
      sanitized.defaultMarginPercent = 30
    } else {
      const parsed = Number(input.defaultMarginPercent)
      sanitized.defaultMarginPercent = isNaN(parsed) ? 30 : Math.max(0, Math.min(100, parsed))
    }
  }

  if (input.allowNegativeStock !== undefined) {
    sanitized.allowNegativeStock = Boolean(input.allowNegativeStock)
  }

  if (input.requireSeller !== undefined) {
    sanitized.requireSeller = Boolean(input.requireSeller)
  }

  if (input.allowCustomItemPrice !== undefined) {
    sanitized.allowCustomItemPrice = Boolean(input.allowCustomItemPrice)
  }

  if (input.quoteValidityDays !== undefined) {
    const days = Math.floor(Number(input.quoteValidityDays))
    sanitized.quoteValidityDays = isNaN(days) || days < 0 ? 15 : days
  }

  if (input.autoCancelManualOrdersHours !== undefined) {
    const validHours = [0, 24, 48, 72, 168]
    const hours = Number(input.autoCancelManualOrdersHours)
    sanitized.autoCancelManualOrdersHours = validHours.includes(hours) ? hours : 0
  }

  if (input.defaultReceiptFormat !== undefined) {
    sanitized.defaultReceiptFormat = input.defaultReceiptFormat === "a4" ? "a4" : "thermal"
  }

  return sanitized
}

/**
 * Retrieves partner-level global sales settings.
 * Accessible to owner and admin roles.
 */
export async function getSalesSettingsAction(partnerId: string) {
  try {
    await requireUser()
    const { roleId } = await requirePermission(partnerId, "settings", "view")

    // Only owner and admin are allowed to view/manage sales settings
    if (roleId !== "owner" && roleId !== "admin") {
      return { success: false as const, error: "Acesso restrito a administradores e proprietários." }
    }

    const supabase = createAdminClient()

    const { data: partnerData, error } = await supabase
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .single()

    if (error || !partnerData) {
      return { success: false as const, error: "Parceiro não encontrado." }
    }

    const rawSettings = (partnerData.business_info && typeof partnerData.business_info === "object")
      ? (partnerData.business_info as any).salesSettings
      : null

    const settings: SalesSettings = {
      maxDiscountPercent: typeof rawSettings?.maxDiscountPercent === "number"
        ? Math.max(0, Math.min(100, rawSettings.maxDiscountPercent))
        : DEFAULT_SALES_SETTINGS.maxDiscountPercent,
      defaultMarginPercent: typeof rawSettings?.defaultMarginPercent === "number"
        ? Math.max(0, Math.min(100, rawSettings.defaultMarginPercent))
        : DEFAULT_SALES_SETTINGS.defaultMarginPercent,
      allowNegativeStock: typeof rawSettings?.allowNegativeStock === "boolean"
        ? rawSettings.allowNegativeStock
        : DEFAULT_SALES_SETTINGS.allowNegativeStock,
      requireSeller: typeof rawSettings?.requireSeller === "boolean"
        ? rawSettings.requireSeller
        : DEFAULT_SALES_SETTINGS.requireSeller,
      allowCustomItemPrice: typeof rawSettings?.allowCustomItemPrice === "boolean"
        ? rawSettings.allowCustomItemPrice
        : DEFAULT_SALES_SETTINGS.allowCustomItemPrice,
      quoteValidityDays: typeof rawSettings?.quoteValidityDays === "number"
        ? rawSettings.quoteValidityDays
        : DEFAULT_SALES_SETTINGS.quoteValidityDays,
      autoCancelManualOrdersHours: typeof rawSettings?.autoCancelManualOrdersHours === "number"
        ? rawSettings.autoCancelManualOrdersHours
        : DEFAULT_SALES_SETTINGS.autoCancelManualOrdersHours,
      defaultReceiptFormat: rawSettings?.defaultReceiptFormat === "a4" ? "a4" : "thermal",
    }

    return { success: true as const, data: settings }
  } catch (e: any) {
    return { success: false as const, error: e.message || "Erro ao carregar configurações de vendas." }
  }
}

/**
 * Updates partner-level global sales settings.
 * Restricted to owner and admin roles with strict payload sanitization.
 */
export async function updateSalesSettingsAction(
  partnerId: string,
  settings: Partial<SalesSettings>
) {
  try {
    await requireUser()
    const { roleId } = await requirePermission(partnerId, "settings", "settings_negocio")

    if (roleId !== "owner" && roleId !== "admin") {
      return { success: false as const, error: "Apenas proprietários e administradores podem alterar as configurações de vendas." }
    }

    const supabase = createAdminClient()

    // 1. Fetch current partner business_info
    const { data: partnerData, error: fetchError } = await supabase
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .single()

    if (fetchError || !partnerData) {
      return { success: false as const, error: "Parceiro não encontrado." }
    }

    const currentPartnerInfo = (partnerData.business_info && typeof partnerData.business_info === "object")
      ? partnerData.business_info
      : {}

    const sanitizedSettings = sanitizeSalesSettings(settings)

    const updatedPartnerSalesSettings = {
      ...(currentPartnerInfo.salesSettings || DEFAULT_SALES_SETTINGS),
      ...sanitizedSettings,
    }

    const { error: updateError } = await supabase
      .from("partners")
      .update({
        business_info: {
          ...currentPartnerInfo,
          salesSettings: updatedPartnerSalesSettings,
        },
      })
      .eq("id", partnerId)

    if (updateError) {
      throw updateError
    }

    revalidatePath("/erp/configuracoes")
    revalidatePath("/erp/pdv")
    revalidatePath("/erp/pedidos")

    return { success: true as const }
  } catch (e: any) {
    return { success: false as const, error: e.message || "Erro ao atualizar configurações de vendas." }
  }
}

/**
 * Retrieves partner-level receipt settings and return policies.
 */
export async function getReceiptSettingsAction(partnerId: string) {
  try {
    await requireUser()
    const { roleId } = await requirePermission(partnerId, "settings", "view")

    if (roleId !== "owner" && roleId !== "admin") {
      return { success: false as const, error: "Acesso restrito a administradores e proprietários." }
    }

    const supabase = createAdminClient()

    const [{ data: policyData }, { data: partnerData }] = await Promise.all([
      supabase
        .from("partner_return_policies")
        .select("receipt_message, receipt_show_policy_block, receipt_show_acknowledgment")
        .eq("partner_id", partnerId)
        .maybeSingle(),
      supabase
        .from("partners")
        .select("business_info")
        .eq("id", partnerId)
        .maybeSingle(),
    ])

    const rawSales = (partnerData?.business_info as any)?.salesSettings || {}

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
    return { success: false as const, error: e.message || "Erro ao carregar configurações de recibos." }
  }
}

/**
 * Updates partner-level receipt and printing settings.
 */
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
  }
) {
  try {
    await requireUser()
    const { roleId } = await requirePermission(partnerId, "settings", "settings_negocio")

    if (roleId !== "owner" && roleId !== "admin") {
      return { success: false as const, error: "Apenas proprietários e administradores podem alterar as configurações de recibos." }
    }

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

    // 2. Also persist visual receipt options in partner's salesSettings
    const { data: partnerData } = await supabase
      .from("partners")
      .select("business_info")
      .eq("id", partnerId)
      .single()

    const currentPartnerInfo = (partnerData?.business_info && typeof partnerData.business_info === "object")
      ? partnerData.business_info
      : {}

    const currentSales = currentPartnerInfo.salesSettings || DEFAULT_SALES_SETTINGS

    const updatedSalesSettings = {
      ...currentSales,
      ...(data.defaultReceiptFormat ? { defaultReceiptFormat: data.defaultReceiptFormat } : {}),
      ...(data.showStorePhone !== undefined ? { showStorePhone: data.showStorePhone } : {}),
      ...(data.showStoreAddress !== undefined ? { showStoreAddress: data.showStoreAddress } : {}),
      ...(data.showSellerName !== undefined ? { showSellerName: data.showSellerName } : {}),
    }

    await supabase
      .from("partners")
      .update({
        business_info: {
          ...currentPartnerInfo,
          salesSettings: updatedSalesSettings,
        },
      })
      .eq("id", partnerId)

    revalidatePath("/erp/configuracoes")
    revalidatePath("/erp/pdv")
    revalidatePath("/erp/pedidos")

    return { success: true as const }
  } catch (e: any) {
    return { success: false as const, error: e.message || "Erro ao salvar configurações de recibos." }
  }
}
