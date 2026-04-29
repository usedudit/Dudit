"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { createAdminClient } from "@/lib/supabase/server"

interface ServiceMetadataResponse {
  categories: any[]
}

/**
 * Fetches all service metadata (categories) for a partner.
 * Categories are returned as a flat list but include parent_id for hierarchical processing.
 */
export async function getServiceMetadataAction(partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "services", "view")

    // Use admin client after authz check so invited ERP users bypass owner-only RLS.
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from("service_categories")
      .select("id, name, parent_id, is_active, created_at")
      .eq("partner_id", partnerId)
      .order("name")

    if (error) throw error

    return { success: true, data: { categories: data || [] } as ServiceMetadataResponse }
  } catch (error: any) {
    console.error("Error fetching service metadata:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Creates a new service category or subcategory.
 */
export async function createServiceCategoryAction(data: { partnerId: string, name: string, parentId?: string | null }) {
  try {
    await requirePartnerAccessWithPermission(data.partnerId, "services", "edit")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")

    // Security: Verify parent_id belongs to the same partner
    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("service_categories")
        .select("id")
        .eq("id", data.parentId)
        .eq("partner_id", data.partnerId)
        .single()

      if (pError || !parent) throw new Error("Categoria pai inválida.")
    }

    const { data: inserted, error } = await supabase
      .from("service_categories")
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

/**
 * Updates a service category or subcategory.
 */
export async function updateServiceCategoryAction(id: string, partnerId: string, data: { name?: string, parentId?: string | null, isActive?: boolean }) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "services", "edit")
    const supabase = await getSupabaseServerClient()

    // Security: Verify parent_id belongs to the same partner
    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("service_categories")
        .select("id")
        .eq("id", data.parentId)
        .eq("partner_id", partnerId)
        .single()

      if (pError || !parent) throw new Error("Categoria pai inválida.")
    }

    const payload: any = {}
    if (data.name !== undefined) payload.name = data.name.trim()
    if (data.parentId !== undefined) payload.parent_id = data.parentId
    if (data.isActive !== undefined) payload.is_active = data.isActive

    const { data: updated, error } = await supabase
      .from("service_categories")
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

/**
 * Deletes a service category or subcategory.
 */
export async function deleteServiceCategoryAction(id: string, partnerId: string) {
  try {
    await requirePartnerAccessWithPermission(partnerId, "services", "edit")
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase
      .from("service_categories")
      .delete()
      .eq("id", id)
      .eq("partner_id", partnerId)

    if (error) throw error

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
