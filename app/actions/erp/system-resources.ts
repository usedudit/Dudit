"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { normalizeActiveResources } from "@/lib/system-resources"
import { TAGS } from "@/lib/utils/revalidation-tags"

export async function updateSystemResourcesAction(activeResources: string[]) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: "Nao autenticado" }

  const context = await getCurrentPartnerContext(user)
  if (!context) return { success: false, error: "ERP nao encontrado" }

  const canManage = context.roleId === "owner" || context.roleId === "admin"
  if (!canManage) {
    return { success: false, error: "Apenas proprietarios e administradores podem gerenciar recursos." }
  }

  const supabase = createAdminClient()
  const { data: partner, error: fetchError } = await supabase
    .from("partners")
    .select("business_info")
    .eq("id", context.partnerId)
    .maybeSingle()

  if (fetchError || !partner) {
    return { success: false, error: fetchError?.message || "Parceiro nao encontrado" }
  }

  const businessInfo = normalizeBusinessInfo(partner.business_info)
  const nextBusinessInfo = {
    ...businessInfo,
    activeResources: normalizeActiveResources(activeResources),
    resourcesVersion: 4,
  }

  const { error } = await supabase
    .from("partners")
    .update({ business_info: nextBusinessInfo })
    .eq("id", context.partnerId)

  if (error) return { success: false, error: error.message }

  revalidateTag(TAGS.userAccess(user.id), "max")
  revalidatePath("/erp")
  revalidatePath("/erp/settings")

  return { success: true }
}
