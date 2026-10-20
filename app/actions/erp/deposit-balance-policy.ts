"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { requirePermission } from "@/lib/permissions/access"

export async function getDepositBalanceManualPolicyAction(partnerId: string) {
  if (!partnerId) {
    return {
      success: false as const,
      error: "Parceiro inválido.",
      enabled: false,
      canOverride: false,
      role: null,
    }
  }

  try {
    const access = await requirePermission(partnerId, "orders", "edit")
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from("partners")
      .select("deposit_balance_manual_enabled")
      .eq("id", partnerId)
      .maybeSingle()

    if (error) {
      return {
        success: false as const,
        error: error.message,
        enabled: false,
        canOverride: false,
        role: null,
      }
    }

    const role = String(access.roleId || "").toLowerCase()
    return {
      success: true as const,
      enabled: Boolean((data as any)?.deposit_balance_manual_enabled),
      canOverride: ["owner", "admin", "manager"].includes(role),
      role,
    }
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível validar a permissão.",
      enabled: false,
      canOverride: false,
      role: null,
    }
  }
}
