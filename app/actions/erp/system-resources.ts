"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { normalizeActiveResources, resolveActiveResources, SYSTEM_RESOURCES_VERSION } from "@/lib/system-resources"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import {
  countActiveRecurringPlans,
  countActiveRecurringSubscriptions,
  pauseAllMarketplaceSubscriptions,
} from "@/lib/services/recurring/limits"
import {
  invalidateDeliveryContextCache,
  invalidateStoreCapabilityCache,
} from "@/lib/delivery/order-cache"

async function resolveSettingsContext() {
  const user = await getCurrentUser()
  if (!user) return { error: "Nao autenticado" as const }

  const context = await getCurrentPartnerContext(user)
  if (!context) return { error: "ERP nao encontrado" as const }

  if (!can(context as RbacUserLike, "settings.settings_resources")) {
    return { error: "Apenas proprietarios e administradores podem gerenciar recursos." as const }
  }

  return { user, context }
}

/**
 * Impacto de desativar recursos: o modal de configurações usa estes números
 * para avisar o lojista e oferecer a pausa em lote das assinaturas.
 */
export async function getSystemResourcesImpactAction() {
  const ctx = await resolveSettingsContext()
  if ("error" in ctx) return { success: false as const, error: ctx.error }

  const [activeSubscriptions, activePlans] = await Promise.all([
    countActiveRecurringSubscriptions(ctx.context.partnerId),
    countActiveRecurringPlans(ctx.context.partnerId),
  ])

  return {
    success: true as const,
    activeSubscriptions,
    activePlans,
  }
}

/**
 * Atalho do modal de impacto: pausa todas as assinaturas vivas do parceiro.
 * Pausa é reversível e mantém o vínculo de cobrança (preapproval pausado).
 */
export async function pauseAllActiveSubscriptionsAction() {
  const ctx = await resolveSettingsContext()
  if ("error" in ctx) return { success: false as const, error: ctx.error }

  const result = await pauseAllMarketplaceSubscriptions(ctx.context.partnerId)

  revalidateTag(TAGS.userAccess(ctx.user.id), "max")
  revalidatePath("/erp")
  revalidatePath("/erp/configuracoes")
  revalidatePath("/erp/assinaturas")

  return { success: true as const, ...result }
}

export async function updateSystemResourcesAction(activeResources: string[]) {
  const ctx = await resolveSettingsContext()
  if ("error" in ctx) return { success: false, error: ctx.error }

  const { user, context } = ctx

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
  const currentResources = new Set(resolveActiveResources(businessInfo))
  const nextActiveResources = normalizeActiveResources(activeResources)
  const nextResources = new Set(nextActiveResources)

  const turningOffOrders = currentResources.has("orders") && !nextResources.has("orders")
  const turningOffRecurringSubscriptions =
    currentResources.has("recurringSubscriptions") && !nextResources.has("recurringSubscriptions")

  // Bloqueios duros: pedidos e assinaturas são contratos vivos. Desativá-los
  // sem pausar/cancelar as assinaturas deixaria cobranças sem fluxo de gestão.
  if (turningOffOrders || turningOffRecurringSubscriptions) {
    const activeSubscriptions = await countActiveRecurringSubscriptions(context.partnerId)
    if (activeSubscriptions > 0) {
      return {
        success: false,
        error: turningOffOrders
          ? "Existem assinaturas ativas. Pause todas as assinaturas antes de desativar Pedidos."
          : "Existem assinaturas ativas. Pause todas as assinaturas antes de desativar Assinaturas recorrentes.",
        code: "ACTIVE_SUBSCRIPTIONS",
        activeSubscriptions,
      }
    }
  }

  const nextBusinessInfo = {
    ...businessInfo,
    activeResources: nextActiveResources,
    resourcesVersion: SYSTEM_RESOURCES_VERSION,
  }

  const { error } = await supabase
    .from("partners")
    .update({ business_info: nextBusinessInfo })
    .eq("id", context.partnerId)

  if (error) return { success: false, error: error.message }

  // Habilidades de entrega ficam em cache em memória por parceiro.
  invalidateDeliveryContextCache(context.partnerId)
  invalidateStoreCapabilityCache(context.partnerId)

  revalidateTag(TAGS.userAccess(user.id), "max")
  revalidatePath("/erp")
  revalidatePath("/erp/configuracoes")

  return { success: true }
}
