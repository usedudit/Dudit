"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireMinimumPlan } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { createAdminClient } from "@/lib/supabase/server"

interface MetadataResponse {
  categories: any[]
  brands: any[]
  locations: any[]
}

/**
 * Fetches all product metadata (categories, brands, locations) for a partner.
 * Categories are returned as a flat list but include parent_id for hierarchical processing.
 */
export async function getProductMetadataAction(partnerId: string) {
  try {
    await requirePermission(partnerId, "products", "view")

    // Use admin client after authz check so invited ERP users bypass owner-only RLS.
    const supabase = createAdminClient()

    const [categoriesRes, brandsRes, locationsRes] = await Promise.all([
      supabase.from("product_categories").select("id, name, parent_id, is_active, created_at").eq("partner_id", partnerId).order("name"),
      supabase.from("brands").select("id, name, is_active, created_at").eq("partner_id", partnerId).order("name"),
      supabase.from("storage_locations").select("id, name, is_active, created_at").eq("partner_id", partnerId).order("name"),
    ])

    const data = {
      categories: categoriesRes.data || [],
      brands: brandsRes.data || [],
      locations: locationsRes.data || [],
    }

    return { success: true, data: data as MetadataResponse }
  } catch (error: any) {
    console.error("Error fetching product metadata:", error)
    return { success: false, error: error.message }
  }
}

/**
 * Revalidates the product metadata cache for a partner.
 */
export async function revalidateProductMetadata(partnerId: string) {
  // No-op. Real-time fetch in place since unstable_cache didn't support cookies()
}

/**
 * Creates a new product category or subcategory.
 */
export async function createCategoryAction(data: { partnerId: string, name: string, parentId?: string | null }) {
  try {
    await requireMinimumPlan(data.partnerId, "crescer")
    await requirePermission(data.partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")

    // Security: Verify parent_id belongs to the same partner
    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("product_categories")
        .select("id")
        .eq("id", data.parentId)
        .eq("partner_id", data.partnerId)
        .single()

      if (pError || !parent) throw new Error("Categoria pai inválida.")
    }

    const { data: inserted, error } = await supabase
      .from("product_categories")
      .insert({
        partner_id: data.partnerId,
        name: data.name.trim(),
        parent_id: data.parentId || null,
      })
      .select("id, name, parent_id, is_active, created_at")
      .single()

    if (error) throw error

    await revalidateProductMetadata(data.partnerId)
    return { success: true, data: inserted }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Creates a new brand.
 */
export async function createBrandAction(data: { partnerId: string, name: string }) {
  try {
    await requireMinimumPlan(data.partnerId, "crescer")
    await requirePermission(data.partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")

    const { data: inserted, error } = await supabase
      .from("brands")
      .insert({
        partner_id: data.partnerId,
        name: data.name.trim(),
      })
      .select("id, name, is_active, created_at")
      .single()

    if (error) throw error

    await revalidateProductMetadata(data.partnerId)
    return { success: true, data: inserted }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Creates a new storage location.
 */
export async function createLocationAction(data: { partnerId: string, name: string }) {
  try {
    await requireMinimumPlan(data.partnerId, "crescer")
    await requirePermission(data.partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    if (!data.name?.trim()) throw new Error("O nome é obrigatório.")

    const { data: inserted, error } = await supabase
      .from("storage_locations")
      .insert({
        partner_id: data.partnerId,
        name: data.name.trim(),
      })
      .select("id, name, is_active, created_at")
      .single()

    if (error) throw error

    await revalidateProductMetadata(data.partnerId)
    return { success: true, data: inserted }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Updates a product category or subcategory.
 */
export async function updateCategoryAction(id: string, partnerId: string, data: { name?: string, parentId?: string | null, isActive?: boolean }) {
  try {
    await requirePermission(partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    // Security: Verify parent_id belongs to the same partner
    if (data.parentId) {
      const { data: parent, error: pError } = await supabase
        .from("product_categories")
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
      .from("product_categories")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("id, name, parent_id, is_active, created_at")
      .single()

    if (error) throw error

    await revalidateProductMetadata(partnerId)
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Deletes a product category or subcategory.
 */
export async function deleteCategoryAction(id: string, partnerId: string) {
  try {
    await requirePermission(partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase
      .from("product_categories")
      .delete()
      .eq("id", id)
      .eq("partner_id", partnerId)

    if (error) throw error

    await revalidateProductMetadata(partnerId)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Updates a brand.
 */
export async function updateBrandAction(id: string, partnerId: string, data: { name?: string, isActive?: boolean }) {
  try {
    await requirePermission(partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    const payload: any = {}
    if (data.name !== undefined) payload.name = data.name
    if (data.isActive !== undefined) payload.is_active = data.isActive

    const { data: updated, error } = await supabase
      .from("brands")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("id, name, is_active, created_at")
      .single()

    if (error) throw error

    await revalidateProductMetadata(partnerId)
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Deletes a brand.
 */
export async function deleteBrandAction(id: string, partnerId: string) {
  try {
    await requirePermission(partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase
      .from("brands")
      .delete()
      .eq("id", id)
      .eq("partner_id", partnerId)

    if (error) throw error

    await revalidateProductMetadata(partnerId)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Updates a storage location.
 */
export async function updateLocationAction(id: string, partnerId: string, data: { name?: string, isActive?: boolean }) {
  try {
    await requirePermission(partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    const payload: any = {}
    if (data.name !== undefined) payload.name = data.name
    if (data.isActive !== undefined) payload.is_active = data.isActive

    const { data: updated, error } = await supabase
      .from("storage_locations")
      .update(payload)
      .eq("id", id)
      .eq("partner_id", partnerId)
      .select("id, name, is_active, created_at")
      .single()

    if (error) throw error

    await revalidateProductMetadata(partnerId)
    return { success: true, data: updated }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * Deletes a storage location.
 */
export async function deleteLocationAction(id: string, partnerId: string) {
  try {
    await requirePermission(partnerId, "products", "edit")
    const supabase = await getSupabaseServerClient()

    const { error } = await supabase
      .from("storage_locations")
      .delete()
      .eq("id", id)
      .eq("partner_id", partnerId)

    if (error) throw error

    await revalidateProductMetadata(partnerId)
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
