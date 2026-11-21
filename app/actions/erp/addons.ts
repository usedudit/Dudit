"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import {
  AddonSlug,
  AddonSubscriptionStatus,
  getAllPartnerAddons,
  getAddonMetrics,
  setPartnerAddonStatus,
  createAddonMpSubscription,
  verifyAndSyncAddonCheckout,
  cancelAddonMpSubscription,
  isValidAddonSlug,
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
  requiresPayment?: boolean
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

export async function subscribePartnerAddonAction(
  addonSlug: AddonSlug,
): Promise<{
  success: boolean
  initPoint?: string
  mpPreapprovalId?: string
  alreadyIncluded?: boolean
  alreadyActive?: boolean
  error?: string
}> {
  try {
    const user = await requireUser()
    const context = await getCurrentPartnerContext()
    if (!context?.partnerId) {
      return { success: false, error: "Parceiro ativo não encontrado." }
    }

    const payerEmail = user.email
    if (!payerEmail) {
      return { success: false, error: "E-mail de cobrança não encontrado na sua conta." }
    }

    return await createAddonMpSubscription(context.partnerId, addonSlug, payerEmail)
  } catch (err: any) {
    console.error("[subscribePartnerAddonAction] Erro:", err)
    return { success: false, error: err.message || "Erro ao iniciar checkout do aplicativo." }
  }
}

export async function syncPartnerAddonCheckoutAction(
  addonSlug: string,
): Promise<{
  success: boolean
  status?: AddonSubscriptionStatus
  isEnabled?: boolean
  error?: string
}> {
  try {
    await requireUser()
    const context = await getCurrentPartnerContext()
    if (!context?.partnerId) {
      return { success: false, error: "Parceiro ativo não encontrado." }
    }

    if (!isValidAddonSlug(addonSlug)) {
      return { success: false, error: "Aplicativo inválido." }
    }

    return await verifyAndSyncAddonCheckout(context.partnerId, addonSlug)
  } catch (err: any) {
    console.error("[syncPartnerAddonCheckoutAction] Erro:", err)
    return { success: false, error: err.message || "Erro ao verificar status do pagamento." }
  }
}

export async function cancelPartnerAddonSubscriptionAction(
  addonSlug: AddonSlug,
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

    return await cancelAddonMpSubscription(context.partnerId, addonSlug)
  } catch (err: any) {
    console.error("[cancelPartnerAddonSubscriptionAction] Erro:", err)
    return { success: false, error: err.message || "Erro ao cancelar assinatura do aplicativo." }
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
