"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePermission } from "@/lib/permissions/access"
import { createAdminClient } from "@/lib/supabase/server"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeInput } from "@/lib/input-validator"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { safeRevalidateTag } from "@/lib/utils/revalidation"

function normalizeName(value: string) {
  return sanitizeInput(value, 150).trim().replace(/\s+/g, " ")
}

export type DreGroupType =
  | "receita_bruta"
  | "deducao_receita"
  | "custo_direto_cmv"
  | "despesa_comercial"
  | "despesa_administrativa"
  | "pro_labore"
  | "despesa_financeira"
  | "receita_financeira"
  | "nao_operacional"

export async function getFinancialCategoriesAction(partnerId: string) {
  try {
    await requirePermission(partnerId, "financial", "view")

    // Use admin client after authz check so invited ERP users can read data.
    const { data, error } = await getCachedErpPage(
      ["erp-financial-categories", partnerId],
      [TAGS.financialCategories(partnerId)],
      async () => {
        const supabase = createAdminClient()
        return supabase
          .from("financial_categories")
          .select("id, name, parent_id, is_active, created_at, category_type, dre_group")
          .eq("partner_id", partnerId)
          .order("name")
      },
      60,
    )

    if (error) throw error
    return { success: true, data: { categories: data || [] } }
  } catch (error: any) {
    console.error("Error fetching financial categories:", error)
    return { success: false, error: error.message }
  }
}

export async function createFinancialCategoryAction(data: {
  partnerId: string
  name: string
  parentId?: string | null
  categoryType?: "income" | "expense" | null
  dreGroup?: DreGroupType | null
}) {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

    await requirePermission(data.partnerId, "financial", "create")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")
    const normalizedName = normalizeName(data.name)

    let resolvedCategoryType: "income" | "expense" | null = data.categoryType ?? null
    let resolvedDreGroup: DreGroupType | null = data.dreGroup ?? null

    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("financial_categories")
        .select("id, category_type, dre_group")
        .eq("id", data.parentId)
        .eq("partner_id", data.partnerId)
        .single()

      if (pError || !parent) throw new Error("Categoria pai inválida.")
      resolvedCategoryType = (parent.category_type as "income" | "expense" | null) ?? null
      if (!resolvedDreGroup && parent.dre_group) {
        resolvedDreGroup = parent.dre_group as DreGroupType
      }
    }

    if (!resolvedCategoryType) {
      throw new Error("Selecione o tipo da categoria.")
    }

    const { data: duplicate } = await supabase
      .from("financial_categories")
      .select("id")
      .eq("partner_id", data.partnerId)
      .ilike("name", normalizedName)
      .limit(1)
      .maybeSingle()
    if (duplicate?.id) throw new Error("Já existe uma categoria com esse nome.")

    const { data: inserted, error } = await supabase
      .from("financial_categories")
      .insert({
        partner_id: data.partnerId,
        name: normalizedName,
        parent_id: data.parentId || null,
        category_type: resolvedCategoryType,
        dre_group: resolvedDreGroup,
      })
      .select("id, name, parent_id, is_active, created_at, category_type, dre_group")
      .single()

    if (error) throw error
    await safeRevalidateTag(TAGS.financialCategories(data.partnerId))
    return { success: true, data: inserted }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateFinancialCategoryAction(
  id: string,
  partnerId: string,
  data: {
    name?: string
    parentId?: string | null
    isActive?: boolean
    categoryType?: "income" | "expense" | null
    dreGroup?: DreGroupType | null
  },
) {
  try {
    await requirePermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("financial_categories")
        .select("id, category_type, dre_group")
        .eq("id", data.parentId)
        .eq("partner_id", partnerId)
        .single()

      if (pError || !parent) throw new Error("Categoria pai inválida.")
      data.categoryType = (parent.category_type as "income" | "expense" | null) ?? null
      if (data.dreGroup === undefined && parent.dre_group) {
        data.dreGroup = parent.dre_group as DreGroupType
      }
    }

    const payload: Record<string, unknown> = {}
    if (data.name !== undefined) {
      const normalizedName = normalizeName(data.name)
      const { data: duplicate } = await supabase
        .from("financial_categories")
        .select("id")
        .eq("partner_id", partnerId)
        .ilike("name", normalizedName)
        .neq("id", id)
        .limit(1)
        .maybeSingle()
      if (duplicate?.id) throw new Error("Já existe uma categoria com esse nome.")
      payload.name = normalizedName
    }
    if (data.parentId !== undefined) payload.parent_id = data.parentId
    if (data.isActive !== undefined) payload.is_active = data.isActive
    if (data.categoryType !== undefined) payload.category_type = data.categoryType
    if (data.dreGroup !== undefined) payload.dre_group = data.dreGroup

    const { data: updated, error } = await supabase
      .from("financial_categories")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("id, name, parent_id, is_active, created_at, category_type, dre_group")
      .single()

    if (error) throw error
    await safeRevalidateTag(TAGS.financialCategories(partnerId))
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteFinancialCategoryAction(id: string, partnerId: string) {
  try {
    await requirePermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase
      .from("financial_categories")
      .delete()
      .eq("id", id)
      .eq("partner_id", partnerId)

    if (error) throw error
    await safeRevalidateTag(TAGS.financialCategories(partnerId))
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

