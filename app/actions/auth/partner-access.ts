"use server"

import { getAllUserPartnerAccess, getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { isSystemResourceActive } from "@/lib/system-resources"
import { normalizeBusinessInfo } from "@/lib/business-info"

/** Returns true if the current user has at least one ERP (owner or invited). */
export async function getUserHasAnyPartnerAccess(): Promise<boolean> {
  const access = await getAllUserPartnerAccess()
  return access.length > 0
}

export async function getUserPartnerAnnounceCapabilities(): Promise<{
  hasPartner: boolean
  sellsProducts: boolean
  sellsServices: boolean
}> {
  try {
    const context = await getCurrentPartnerContext()
    if (context) {
      const bInfo = normalizeBusinessInfo(context.businessInfo)
      return {
        hasPartner: true,
        sellsProducts: isSystemResourceActive(bInfo, "products"),
        sellsServices: isSystemResourceActive(bInfo, "services"),
      }
    }

    const access = await getAllUserPartnerAccess()
    if (access.length > 0) {
      const bInfo = normalizeBusinessInfo(access[0].businessInfo)
      return {
        hasPartner: true,
        sellsProducts: isSystemResourceActive(bInfo, "products"),
        sellsServices: isSystemResourceActive(bInfo, "services"),
      }
    }

    return {
      hasPartner: false,
      sellsProducts: true,
      sellsServices: true,
    }
  } catch {
    return {
      hasPartner: false,
      sellsProducts: true,
      sellsServices: true,
    }
  }
}
