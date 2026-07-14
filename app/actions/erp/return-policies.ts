"use server"

import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import {
  buildDefaultPolicyText,
  DEFAULT_POLICY,
  normalizePolicyRow,
  type PartnerReturnPolicy,
} from "@/lib/returns/policy"

const MANAGE_ROLES = new Set(["owner", "admin", "manager"])

const policySchema = z.object({
  partnerId: z.string().uuid(),
  legalOnlineRegretDays: z.number().int().min(0).max(365),
  legalDurableProductDays: z.number().int().min(0).max(3650),
  legalNonDurableProductDays: z.number().int().min(0).max(3650),
  acceptsSizeExchange: z.boolean(),
  acceptsColorExchange: z.boolean(),
  acceptsStoreCredit: z.boolean(),
  acceptsInPersonReturn: z.boolean(),
  acceptsShippingReturn: z.boolean(),
  shippingPayer: z.enum(["customer", "seller", "case_by_case"]),
  commercialDeadlineDays: z.number().int().min(0).max(3650),
  additionalWarrantyDays: z.number().int().min(0).max(3650),
  commercialNotes: z.string().max(512).nullable().optional(),
  fullPolicyText: z.string().max(20000),
  receiptMessage: z.string().max(1000).nullable().optional(),
  receiptShowPolicyBlock: z.boolean(),
  slaResponseDays: z.number().int().min(1).max(90),
})

function assertManageRole(roleId: string) {
  if (!MANAGE_ROLES.has(String(roleId || "").toLowerCase())) {
    throw new Error("Sem permissão para editar políticas de devolução")
  }
}

export async function getPartnerReturnPolicyAction(partnerId: string) {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const access = await requirePermission(partnerId, "settings", "settings_returns")
    const supabase = createAdminClient()

    const [{ data: policyRow }, { data: partner }] = await Promise.all([
      supabase.from("partner_return_policies").select("*").eq("partner_id", partnerId).maybeSingle(),
      supabase.from("partners").select("store_name").eq("id", partnerId).maybeSingle(),
    ])

    if (policyRow) {
      const policy = normalizePolicyRow(policyRow, partnerId)
      if (!policy.fullPolicyText.trim()) {
        policy.fullPolicyText = buildDefaultPolicyText(partner?.store_name)
      }
      return successResponse({ policy, storeName: partner?.store_name || null })
    }

    const policy: PartnerReturnPolicy = {
      partnerId,
      ...DEFAULT_POLICY,
      fullPolicyText: buildDefaultPolicyText(partner?.store_name),
    }
    return successResponse({ policy, storeName: partner?.store_name || null, isDefault: true })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao carregar política")
  }
}

export async function upsertPartnerReturnPolicyAction(input: z.infer<typeof policySchema>) {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const parsed = policySchema.parse(input)
    const access = await requirePermission(parsed.partnerId, "settings", "settings_returns")
    assertManageRole(access.roleId)

    const supabase = createAdminClient()
    const payload = {
      partner_id: parsed.partnerId,
      legal_online_regret_days: parsed.legalOnlineRegretDays,
      legal_durable_product_days: parsed.legalDurableProductDays,
      legal_non_durable_product_days: parsed.legalNonDurableProductDays,
      accepts_size_exchange: parsed.acceptsSizeExchange,
      accepts_color_exchange: parsed.acceptsColorExchange,
      accepts_store_credit: parsed.acceptsStoreCredit,
      accepts_in_person_return: parsed.acceptsInPersonReturn,
      accepts_shipping_return: parsed.acceptsShippingReturn,
      shipping_payer: parsed.shippingPayer,
      commercial_deadline_days: parsed.commercialDeadlineDays,
      additional_warranty_days: parsed.additionalWarrantyDays,
      commercial_notes: sanitizeNotes(parsed.commercialNotes),
      full_policy_text: parsed.fullPolicyText.trim(),
      receipt_message: parsed.receiptMessage || null,
      receipt_show_policy_block: parsed.receiptShowPolicyBlock,
      sla_response_days: parsed.slaResponseDays,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from("partner_return_policies")
      .upsert(payload, { onConflict: "partner_id" })

    if (error) throw error
    return successResponse({ saved: true })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao salvar política")
  }
}

export async function getOrderReturnPolicySnapshotAction(partnerId: string, orderId: string) {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "orders", "view")
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("orders")
      .select("return_policy_snapshot, created_at")
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle()

    if (error) throw error
    if (!data) return errorResponse("Pedido não encontrado")

    return successResponse({
      snapshot: data.return_policy_snapshot,
      orderCreatedAt: data.created_at,
    })
  } catch (e: unknown) {
    return errorResponse(e instanceof Error ? e.message : "Erro ao carregar snapshot")
  }
}
