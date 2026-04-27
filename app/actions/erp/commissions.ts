"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccess, requireUser } from "@/lib/auth/authorization"
import { calculateCommission, partnerRoleToCommissionRole, type CommissionRole, type CommissionType } from "@/lib/services/commission.service"

export type CommissionSettingsRow = {
  partnerUserId: string
  userId: string
  name: string
  roleLabel: string
  commissionRole: CommissionRole
  commissionType: CommissionType
  value: number
  metadata: Record<string, unknown>
}

const DEFAULT_TYPE_BY_ROLE: Record<CommissionRole, CommissionType> = {
  seller: "none",
  delivery: "fixed_per_delivery",
}

function canManageCommissions(role: string | null | undefined) {
  const normalized = String(role || "").toUpperCase()
  return normalized === "OWNER" || normalized === "ADMIN"
}

export async function listEmployeeCommissionsAction(partnerId: string) {
  await requireUser()
  const access = await requirePartnerAccess(partnerId)
  if (!canManageCommissions(access.role)) {
    return { success: false as const, error: "Acesso restrito para este módulo." }
  }
  const supabase = await getSupabaseServerClient()

  const { data: partnerUsers, error: partnerUsersError } = await supabase
    .from("partner_users")
    .select("id, user_id, role")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: true })

  if (partnerUsersError) return { success: false as const, error: partnerUsersError.message }
  if (!partnerUsers || partnerUsers.length === 0) return { success: true as const, items: [] as CommissionSettingsRow[] }

  const userIds = Array.from(new Set(partnerUsers.map((row: any) => row.user_id).filter(Boolean)))
  const partnerUserIds = partnerUsers.map((row: any) => row.id)

  const [{ data: profiles }, { data: existingCommissions, error: commissionsError }] = await Promise.all([
    userIds.length > 0
      ? supabase.from("user_profiles").select("user_id, full_name").in("user_id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    supabase
      .from("employee_commissions")
      .select("user_id, role, commission_type, value, metadata")
      .eq("partner_id", partnerId)
      .in("user_id", partnerUserIds),
  ])

  if (commissionsError) return { success: false as const, error: commissionsError.message }

  const nameByUserId = new Map<string, string>()
  for (const profile of profiles || []) {
    nameByUserId.set(String(profile.user_id), String(profile.full_name || "Usuário"))
  }

  const commissionByKey = new Map<string, any>()
  for (const item of existingCommissions || []) {
    commissionByKey.set(`${item.user_id}:${item.role}`, item)
  }

  const roleLabelMap: Record<string, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    MANAGER: "Gestor",
    OPERATOR: "Operador",
    DELIVERY: "Entrega",
  }

  const items: CommissionSettingsRow[] = partnerUsers.map((row: any) => {
    const commissionRole = partnerRoleToCommissionRole(row.role)
    const key = `${row.id}:${commissionRole}`
    const saved = commissionByKey.get(key)
    return {
      partnerUserId: String(row.id),
      userId: String(row.user_id),
      name: nameByUserId.get(String(row.user_id)) || "Usuário",
      roleLabel: roleLabelMap[String(row.role)] || String(row.role),
      commissionRole,
      commissionType: (saved?.commission_type || DEFAULT_TYPE_BY_ROLE[commissionRole]) as CommissionType,
      value: Number(saved?.value || 0),
      metadata: (saved?.metadata || {}) as Record<string, unknown>,
    }
  })

  return { success: true as const, items }
}

export async function upsertEmployeeCommissionAction(input: {
  partnerId: string
  partnerUserId: string
  role: CommissionRole
  commissionType: CommissionType
  value: number
  metadata?: Record<string, unknown>
}) {
  await requireUser()
  const access = await requirePartnerAccess(input.partnerId)
  if (!canManageCommissions(access.role)) {
    return { success: false as const, error: "Acesso restrito para este módulo." }
  }
  const supabase = await getSupabaseServerClient()

  const normalizedValue = Math.max(0, Number(input.value || 0))
  const payload = {
    partner_id: input.partnerId,
    user_id: input.partnerUserId,
    role: input.role,
    commission_type: input.commissionType,
    value: normalizedValue,
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from("employee_commissions")
    .upsert(payload, { onConflict: "partner_id,user_id,role" })

  if (error) return { success: false as const, error: error.message }
  return { success: true as const }
}

export async function calculateCommissionAction(input: {
  partnerId: string
  userId: string
  role: CommissionRole
  saleAmount?: number
  deliveryFee?: number
}) {
  await requireUser()
  const access = await requirePartnerAccess(input.partnerId)
  if (!canManageCommissions(access.role)) {
    return { success: false as const, error: "Acesso restrito para este módulo." }
  }
  const supabase = await getSupabaseServerClient()

  const { data } = await supabase
    .from("employee_commissions")
    .select("commission_type, value")
    .eq("partner_id", input.partnerId)
    .eq("user_id", input.userId)
    .eq("role", input.role)
    .limit(1)
    .maybeSingle()

  if (!data) return { success: true as const, commission: 0 }

  const commission = calculateCommission({
    userId: input.userId,
    role: input.role,
    commissionType: data.commission_type as CommissionType,
    value: Number(data.value || 0),
    saleAmount: Number(input.saleAmount || 0),
    deliveryFee: Number(input.deliveryFee || 0),
  })

  return { success: true as const, commission }
}
