"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import {
  AddonSlug,
  getAllPartnerAddons,
  getAddonMetrics,
  setPartnerAddonStatus,
  PartnerAddonStatus,
  AddonMetrics,
} from "@/lib/services/addon.service"

export async function getPartnerAddonsAction(): Promise<{
  success: boolean
  data?: PartnerAddonStatus[]
  error?: string
}> {
  try {
    await requireUser()
    const context = await getCurrentPartnerContext()
    if (!context?.partnerId) {
      return { success: false, error: "Parceiro ativo não encontrado." }
    }

    const addons = await getAllPartnerAddons(context.partnerId)
    return { success: true, data: addons }
  } catch (err: any) {
    console.error("[getPartnerAddonsAction] Erro:", err)
    return { success: false, error: err.message || "Erro ao buscar aplicativos." }
  }
}

export async function togglePartnerAddonAction(
  addonSlug: AddonSlug,
  isEnabled: boolean,
): Promise<{
  success: boolean
  error?: string
}> {
  try {
    await requireUser()
    const context = await getCurrentPartnerContext()
    if (!context?.partnerId) {
      return { success: false, error: "Parceiro ativo não encontrado." }
    }

    const res = await setPartnerAddonStatus(context.partnerId, addonSlug, isEnabled)
    return res
  } catch (err: any) {
    console.error("[togglePartnerAddonAction] Erro:", err)
    return { success: false, error: err.message || "Erro ao alterar status do aplicativo." }
  }
}

export async function getAddonMetricsAction(
  addonSlug: AddonSlug,
): Promise<{
  success: boolean
  data?: AddonMetrics
  error?: string
}> {
  try {
    await requireUser()
    const context = await getCurrentPartnerContext()
    if (!context?.partnerId) {
      return { success: false, error: "Parceiro ativo não encontrado." }
    }

    const metrics = await getAddonMetrics(context.partnerId, addonSlug)
    return { success: true, data: metrics }
  } catch (err: any) {
    console.error("[getAddonMetricsAction] Erro:", err)
    return { success: false, error: err.message || "Erro ao carregar métricas." }
  }
}
