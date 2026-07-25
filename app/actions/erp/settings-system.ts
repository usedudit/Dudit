"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePermission } from "@/lib/permissions/access"
import { revalidatePath } from "next/cache"

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
    revalidatePath("/erp/settings")
    return { success: true as const }
  } catch (e: any) {
    return { success: false as const, error: e.message }
  }
}
