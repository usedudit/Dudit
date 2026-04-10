"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"

export async function getFinancialCategoriesAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "view")

    const supabase = await getSupabaseServerClient()
    const { data, error } = await supabase
      .from("financial_categories")
      .select("id, name, parent_id, is_active, created_at")
      .eq("partner_id", partnerId)
      .order("name")

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
}) {
  try {
    await requirePartnerAccessWithPermission(data.partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")

    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("financial_categories")
        .select("id")
        .eq("id", data.parentId)
        .eq("partner_id", data.partnerId)
        .single()

      if (pError || !parent) throw new Error("Categoria pai inválida.")
    }

    const { data: inserted, error } = await supabase
      .from("financial_categories")
      .insert({
        partner_id: data.partnerId,
        name: data.name.trim(),
        parent_id: data.parentId || null,
      })
      .select("id, name, parent_id, is_active, created_at")
      .single()

    if (error) throw error
    return { success: true, data: inserted }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function updateFinancialCategoryAction(
  id: string,
  partnerId: string,
  data: { name?: string; parentId?: string | null; isActive?: boolean },
) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("financial_categories")
        .select("id")
        .eq("id", data.parentId)
        .eq("partner_id", partnerId)
        .single()

      if (pError || !parent) throw new Error("Categoria pai inválida.")
    }

    const payload: Record<string, unknown> = {}
    if (data.name !== undefined) payload.name = data.name.trim()
    if (data.parentId !== undefined) payload.parent_id = data.parentId
    if (data.isActive !== undefined) payload.is_active = data.isActive

    const { data: updated, error } = await supabase
      .from("financial_categories")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("id, name, parent_id, is_active, created_at")
      .single()

    if (error) throw error
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteFinancialCategoryAction(id: string, partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "financial", "edit")
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase
      .from("financial_categories")
      .delete()
      .eq("id", id)
      .eq("partner_id", partnerId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
