"use server"

import { requireUser } from "@/lib/auth/authorization"
import { createAdminClient } from "@/lib/supabase/server"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { getDreReport, type DreFilters, type DreReportData } from "@/lib/services/dre.service"
import { checkPermission } from "@/lib/permissions/access"

export async function getDreReportAction(filters: DreFilters): Promise<{
  success: boolean
  data?: DreReportData
  error?: string
}> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Aguarde um momento." }
    }

    const user = await requireUser()
    const partnerId = filters.partnerId
    const admin = createAdminClient()

    const [partnerPlan, partnerRes, puRes] = await Promise.all([
      getPartnerPlan(partnerId),
      admin.from("partners").select("user_id").eq("id", partnerId).maybeSingle(),
      admin.from("partner_users").select("id, role_id").eq("partner_id", partnerId).eq("user_id", user.id).maybeSingle(),
    ])

    // 1. Verificação do Plano Escalar
    if (!hasMinimumPlan(partnerPlan.slug, "escalar")) {
      return { success: false, error: "O relatório DRE é um recurso exclusivo do Plano Escalar." }
    }

    const isPartnerOwner = partnerRes.data?.user_id === user.id

    // 2. Verificação de Permissão: Owner bypasses, outros precisam de reports.export_dre
    if (!isPartnerOwner) {
      const { allowed } = await checkPermission(partnerId, "reports", "export_dre")
      if (!allowed) {
        return { success: false, error: "Apenas proprietários, administradores e gerentes podem acessar o DRE." }
      }
    }

    // 3. Verificação de Lojas Acessíveis pelo Usuário
    let allowedStoreIds: string[] | null = null
    if (!isPartnerOwner) {
      if (!puRes.data) {
        return { success: false, error: "Você não possui acesso a nenhuma loja desta empresa." }
      }
      const { data: members } = await admin
        .from("store_members")
        .select("store_id")
        .eq("partner_user_id", puRes.data.id)

      const memberStoreIds = (members || []).map((m: any) => m.store_id)
      if (memberStoreIds.length === 0) {
        return { success: false, error: "Você não possui acesso a nenhuma loja desta empresa." }
      }
      allowedStoreIds = memberStoreIds
    }

    // Se uma loja específica foi solicitada, validar se o usuário tem permissão para ela
    if (filters.storeId && filters.storeId !== "all") {
      if (allowedStoreIds !== null && !allowedStoreIds.includes(filters.storeId)) {
        return { success: false, error: "Você não possui acesso à loja solicitada." }
      }
    }

    const report = await getDreReport({
      ...filters,
      allowedStoreIds: filters.storeId && filters.storeId !== "all" ? null : allowedStoreIds,
    })

    return { success: true, data: report }
  } catch (error: any) {
    console.error("Error fetching DRE report:", error)
    return { success: false, error: error.message || "Erro ao gerar DRE." }
  }
}
