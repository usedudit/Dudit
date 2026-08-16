import "server-only"
import { cache } from "react"
import { getAdminClient } from "@/lib/supabase/admin"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { hasMinimumPlan, type PlanTierSlug } from "@/lib/subscription/plan-tier"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { isSystemResourceActive, type SystemResourceId } from "@/lib/system-resources"

export interface PartnerCapabilities {
  partnerId: string
  planSlug: string
  hasFinancial: boolean
  hasStockMovements: boolean
  hasProductivity: boolean
  hasGoals: boolean
  hasDeliveries: boolean
  hasCoupons: boolean
  hasCampaigns: boolean
  hasServiceOrders: boolean
  hasAppointments: boolean
  hasReturns: boolean
  hasProducts: boolean
  hasServices: boolean
  isResourceActive: (resourceId: SystemResourceId) => boolean
}

/**
 * Resolves the effective capabilities for a partner based on their current
 * subscription plan and active resources configuration.
 *
 * Performance: Uses React cache() for request deduplication.
 */
export const getPartnerCapabilities = cache(async (
  partnerId: string,
  options?: {
    storeId?: string | null
    businessInfo?: unknown
  }
): Promise<PartnerCapabilities> => {
  const admin = getAdminClient()

  // 1. Resolve plan and business_info concurrently if businessInfo is not provided
  let businessInfo = options?.businessInfo ? normalizeBusinessInfo(options.businessInfo) : null

  const planPromise = getPartnerPlan(partnerId)

  if (!businessInfo) {
    if (options?.storeId) {
      const { data: store } = await admin
        .from("stores")
        .select("business_info")
        .eq("id", options.storeId)
        .eq("partner_id", partnerId)
        .maybeSingle()

      if (store?.business_info) {
        businessInfo = normalizeBusinessInfo(store.business_info)
      }
    }

    if (!businessInfo) {
      const { data: partner } = await admin
        .from("partners")
        .select("business_info")
        .eq("id", partnerId)
        .maybeSingle()

      businessInfo = normalizeBusinessInfo(partner?.business_info)
    }
  }

  const plan = await planPromise
  const planSlug = plan?.slug || "free"

  const checkResource = (resourceId: SystemResourceId) => isSystemResourceActive(businessInfo!, resourceId)

  const hasProducts = checkResource("products")
  const hasServices = checkResource("services")

  const hasFinancial = checkResource("financial") && hasMinimumPlan(planSlug, "crescer")
  const hasStockMovements = checkResource("stockMovements") && hasProducts
  const hasProductivity = checkResource("productivity") && hasMinimumPlan(planSlug, "escalar")
  const hasGoals = checkResource("goals")
  const hasDeliveries = checkResource("deliveries") && hasMinimumPlan(planSlug, "crescer")
  const hasCoupons = checkResource("coupons") && hasMinimumPlan(planSlug, "crescer")
  const hasCampaigns = checkResource("campaigns") && hasMinimumPlan(planSlug, "escalar")
  const hasServiceOrders = checkResource("serviceOrders") && hasMinimumPlan(planSlug, "crescer")
  const hasAppointments = checkResource("appointments") && hasServices
  const hasReturns = checkResource("returns") && hasMinimumPlan(planSlug, "crescer")

  return {
    partnerId,
    planSlug,
    hasFinancial,
    hasStockMovements,
    hasProductivity,
    hasGoals,
    hasDeliveries,
    hasCoupons,
    hasCampaigns,
    hasServiceOrders,
    hasAppointments,
    hasReturns,
    hasProducts,
    hasServices,
    isResourceActive: checkResource,
  }
})
