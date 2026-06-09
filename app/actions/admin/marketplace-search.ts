"use server"

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { normalizeSearchQuery } from "@/lib/search/normalize"
import { safeRevalidateTag } from "@/lib/utils/revalidation"

const SYNONYM_CACHE_TAG = "marketplace-synonyms"

export type SynonymGroupRow = {
  id: string
  name: string
  slug: string
  description: string | null
  category_keywords: string[]
  is_active: boolean
  created_at: string
  updated_at: string
  terms?: SynonymTermRow[]
}

export type SynonymTermRow = {
  id: string
  group_id: string
  term: string
  term_normalized: string
  is_active: boolean
}

async function revalidateSynonymCache() {
  await safeRevalidateTag(SYNONYM_CACHE_TAG)
}

export async function listMarketplaceSynonymGroupsAction(): Promise<SynonymGroupRow[]> {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  await requireAdmin("moderator")

  const supabase = getAdminClient()
  const { data: groups, error } = await supabase
    .from("marketplace_synonym_groups")
    .select("*")
    .order("name")

  if (error) throw new Error(error.message)

  const { data: terms } = await supabase
    .from("marketplace_synonym_terms")
    .select("*")
    .order("term")

  const termsByGroup = new Map<string, SynonymTermRow[]>()
  for (const term of terms || []) {
    const list = termsByGroup.get(term.group_id) || []
    list.push(term as SynonymTermRow)
    termsByGroup.set(term.group_id, list)
  }

  return (groups || []).map((g) => ({
    ...(g as SynonymGroupRow),
    terms: termsByGroup.get(g.id) || [],
  }))
}

export async function createMarketplaceSynonymGroupAction(input: {
  name: string
  slug: string
  description?: string | null
  categoryKeywords?: string[]
  terms?: string[]
}) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const admin = await requireAdmin("admin")

  const supabase = getAdminClient()
  const { data: group, error } = await supabase
    .from("marketplace_synonym_groups")
    .insert({
      name: input.name.trim(),
      slug: input.slug.trim().toLowerCase(),
      description: input.description?.trim() || null,
      category_keywords: input.categoryKeywords || [],
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)

  if (input.terms?.length) {
    await supabase.from("marketplace_synonym_terms").insert(
      input.terms.map((term) => ({
        group_id: group.id,
        term: term.trim(),
        term_normalized: normalizeSearchQuery(term),
      })),
    )
  }

  await adminAuditLog({
    adminUserId: admin.userId,
    actionType: AdminActionType.MARKETPLACE_SYNONYM_CHANGE,
    targetType: "marketplace_synonym_group",
    targetId: group.id,
    metadata: { name: group.name, slug: group.slug },
  })

  await revalidateSynonymCache()
  return { success: true, data: group }
}

export async function updateMarketplaceSynonymGroupAction(
  groupId: string,
  input: {
    name?: string
    description?: string | null
    categoryKeywords?: string[]
    isActive?: boolean
  },
) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const admin = await requireAdmin("admin")

  const supabase = getAdminClient()
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (input.name !== undefined) payload.name = input.name.trim()
  if (input.description !== undefined) payload.description = input.description?.trim() || null
  if (input.categoryKeywords !== undefined) payload.category_keywords = input.categoryKeywords
  if (input.isActive !== undefined) payload.is_active = input.isActive

  const { data, error } = await supabase
    .from("marketplace_synonym_groups")
    .update(payload)
    .eq("id", groupId)
    .select("*")
    .single()

  if (error) throw new Error(error.message)

  await adminAuditLog({
    adminUserId: admin.userId,
    actionType: AdminActionType.MARKETPLACE_SYNONYM_CHANGE,
    targetType: "marketplace_synonym_group",
    targetId: groupId,
    metadata: payload,
  })

  await revalidateSynonymCache()
  return { success: true, data }
}

export async function deleteMarketplaceSynonymGroupAction(groupId: string) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const admin = await requireAdmin("admin")

  const supabase = getAdminClient()
  const { error } = await supabase
    .from("marketplace_synonym_groups")
    .delete()
    .eq("id", groupId)

  if (error) throw new Error(error.message)

  await adminAuditLog({
    adminUserId: admin.userId,
    actionType: AdminActionType.MARKETPLACE_SYNONYM_CHANGE,
    targetType: "marketplace_synonym_group",
    targetId: groupId,
    metadata: { deleted: true },
  })

  await revalidateSynonymCache()
  return { success: true }
}

export async function addMarketplaceSynonymTermAction(groupId: string, term: string) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const admin = await requireAdmin("admin")

  const normalized = normalizeSearchQuery(term)
  if (!normalized) throw new Error("Termo inválido")

  const supabase = getAdminClient()
  const { data, error } = await supabase
    .from("marketplace_synonym_terms")
    .insert({
      group_id: groupId,
      term: term.trim(),
      term_normalized: normalized,
    })
    .select("*")
    .single()

  if (error) throw new Error(error.message)

  await adminAuditLog({
    adminUserId: admin.userId,
    actionType: AdminActionType.MARKETPLACE_SYNONYM_CHANGE,
    targetType: "marketplace_synonym_term",
    targetId: data.id,
    metadata: { groupId, term: term.trim() },
  })

  await revalidateSynonymCache()
  return { success: true, data }
}

export async function removeMarketplaceSynonymTermAction(termId: string) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  const admin = await requireAdmin("admin")

  const supabase = getAdminClient()
  const { error } = await supabase
    .from("marketplace_synonym_terms")
    .delete()
    .eq("id", termId)

  if (error) throw new Error(error.message)

  await adminAuditLog({
    adminUserId: admin.userId,
    actionType: AdminActionType.MARKETPLACE_SYNONYM_CHANGE,
    targetType: "marketplace_synonym_term",
    targetId: termId,
    metadata: { deleted: true },
  })

  await revalidateSynonymCache()
  return { success: true }
}

export async function setMarketplaceSynonymTermActiveAction(termId: string, isActive: boolean) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)
  await requireAdmin("admin")

  const supabase = getAdminClient()
  const { error } = await supabase
    .from("marketplace_synonym_terms")
    .update({ is_active: isActive })
    .eq("id", termId)

  if (error) throw new Error(error.message)
  await revalidateSynonymCache()
  return { success: true }
}
