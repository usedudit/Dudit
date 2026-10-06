import { getAdminClient } from "@/lib/supabase/admin"
import { buildArchivePayload } from "@/lib/supabase/query-helpers"
import { removeFromExploreRedis } from "@/lib/redis-sync"
import { getPartnerPlan, invalidatePartnerPlanCache } from "@/lib/services/subscription.service"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"

export interface ArchivingSummary {
  archivedProductsCount: number
  archivedServicesCount: number
  archivedCustomersCount: number
}

/**
 * Enforces fixed plan limits for Products, Services, and Customers upon plan downgrade.
 * Active items exceeding the plan's limit are automatically set to `status = 'arquivado'`, `is_active = false`, `deleted_at = NULL`.
 * Top items are prioritized by sales volume / bookings or creation date.
 */
export async function enforcePlanLimitsAndArchiveExcess(
  partnerId: string,
  explicitLimits?: Record<string, any>
): Promise<ArchivingSummary> {
  const admin = getAdminClient()
  const summary: ArchivingSummary = {
    archivedProductsCount: 0,
    archivedServicesCount: 0,
    archivedCustomersCount: 0,
  }

  // 1. Resolve plan limits
  let limits = explicitLimits
  if (!limits) {
    const plan = await getPartnerPlan(partnerId)
    limits = plan?.limits_json || {}
  }

  const rawItemLimit = limits?.items ?? limits?.products
  const productLimit = typeof rawItemLimit === "number" ? rawItemLimit : null

  const rawServiceLimit = limits?.services
  const serviceLimit = typeof rawServiceLimit === "number" ? rawServiceLimit : null

  const rawCustomerLimit = limits?.customers
  const customerLimit = typeof rawCustomerLimit === "number" ? rawCustomerLimit : null

  // 2. Process Products Archiving
  if (productLimit !== null && productLimit >= 0) {
    const { data: activeProducts } = await admin
      .from("products")
      .select("id, sales_last_30_days, created_at")
      .eq("partner_id", partnerId)
      .is("deleted_at", null)
      .in("status", ["ativo", "active"])
      .order("sales_last_30_days", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (activeProducts && activeProducts.length > productLimit) {
      const excessProducts = activeProducts.slice(productLimit)
      const excessIds = excessProducts.map((p: any) => p.id)

      if (excessIds.length > 0) {
        const payload = buildArchivePayload("arquivado")
        const { error } = await admin
          .from("products")
          .update(payload)
          .in("id", excessIds)

        if (!error) {
          summary.archivedProductsCount = excessIds.length
          // Instantly sync each archived product out of the Redis Explore index
          await Promise.all(
            excessIds.map((id: string) => removeFromExploreRedis(id, "produto"))
          )

          // Sync usage counter to active products count
          const remainingActiveCount = activeProducts.length - excessIds.length
          await admin
            .from("usage_counters")
            .update({ products_count: remainingActiveCount, updated_at: new Date().toISOString() })
            .eq("partner_id", partnerId)
        }
      }
    }
  }

  // 3. Process Services Archiving
  if (serviceLimit !== null && serviceLimit >= 0) {
    const { data: activeServices } = await admin
      .from("services")
      .select("id, bookings_last_30_days, created_at")
      .eq("partner_id", partnerId)
      .is("deleted_at", null)
      .in("status", ["ativo", "active"])
      .order("bookings_last_30_days", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (activeServices && activeServices.length > serviceLimit) {
      const excessServices = activeServices.slice(serviceLimit)
      const excessIds = excessServices.map((s: any) => s.id)

      if (excessIds.length > 0) {
        const payload = buildArchivePayload("arquivado")
        const { error } = await admin
          .from("services")
          .update(payload)
          .in("id", excessIds)

        if (!error) {
          summary.archivedServicesCount = excessIds.length
          await Promise.all(
            excessIds.map((id: string) => removeFromExploreRedis(id, "servico"))
          )

          // Sync usage counter to active services count
          const remainingActiveCount = activeServices.length - excessIds.length
          await admin
            .from("usage_counters")
            .update({ services_count: remainingActiveCount, updated_at: new Date().toISOString() })
            .eq("partner_id", partnerId)
        }
      }
    }
  }

  // 4. Process Customers Archiving
  if (customerLimit !== null && customerLimit >= 0) {
    const { data: activeCustomers } = await admin
      .from("customers")
      .select("id, created_at")
      .eq("partner_id", partnerId)
      .is("deleted_at", null)
      .in("status", ["ativo", "active"])
      .order("created_at", { ascending: false })

    if (activeCustomers && activeCustomers.length > customerLimit) {
      const excessCustomers = activeCustomers.slice(customerLimit)
      const excessIds = excessCustomers.map((c: any) => c.id)

      if (excessIds.length > 0) {
        const payload = buildArchivePayload("arquivado")
        const { error } = await admin
          .from("customers")
          .update(payload)
          .in("id", excessIds)

        if (!error) {
          summary.archivedCustomersCount = excessIds.length
        }
      }
    }
  }

  // 5. Assinaturas recorrentes: modulo exclusivo do Escalar. Ao cair de plano,
  //    pausa as assinaturas vivas + preapprovals do MP (reversivel; nao corta
  //    o vinculo de cobranca do cliente final).
  try {
    const currentPlan = await getPartnerPlan(partnerId)
    if (currentPlan?.slug && !hasMinimumPlan(currentPlan.slug, "escalar")) {
      const { pauseRecurringForPlanDowngrade } = await import("@/lib/services/recurring/limits")
      const { paused } = await pauseRecurringForPlanDowngrade(partnerId)
      if (paused > 0) {
        console.warn(
          `[SUBSCRIPTION-ARCHIVER] Partner ${partnerId} (plano ${currentPlan.slug}): ${paused} assinatura(s) recorrente(s) pausada(s) por downgrade.`,
        )
      }
    }
  } catch (recurErr: any) {
    console.error("[SUBSCRIPTION-ARCHIVER] Error pausing recurring subscriptions on downgrade:", recurErr.message)
  }

  invalidatePartnerPlanCache(partnerId)
  return summary
}

