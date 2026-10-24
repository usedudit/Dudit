"use server"

import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getUsageCounters, getLimit, getPartnerPlan } from "@/lib/services/subscription.service"
import { countActiveRecurringPlans, countActiveRecurringSubscriptions } from "@/lib/services/recurring/limits"
import { getNextPlanTarget } from "@/lib/subscription/limit-upgrade"
import { getHardcodedPlan } from "@/lib/subscription/feature-labels"

export interface LimitStatusItem {
  key: string
  label: string
  current: number
  limit: number | "unlimited"
  percentage: number
  isMonthly: boolean
}

export interface LimitStatusData {
  items: LimitStatusItem[]
  planSlug: string
  planName: string
  nextPlanSlug: string | null
  nextPlanName: string | null
}

interface LimitConfig {
  key: string
  label: string
  limitName: string
  /** Coluna de usage_counters; omitida quando a contagem vem de outra fonte. */
  counterField?: string
  isMonthly: boolean
}

const LIMITS_CONFIG: LimitConfig[] = [
  { key: "items", label: "Produtos", limitName: "items", counterField: "products_count", isMonthly: false },
  { key: "monthly_orders", label: "Pedidos/mês", limitName: "monthly_orders", counterField: "orders_month_count", isMonthly: true },
  { key: "monthly_appointments", label: "Agendamentos/mês", limitName: "monthly_appointments", counterField: "appointments_month_count", isMonthly: true },
  { key: "monthly_quotes", label: "Orçamentos/mês", limitName: "monthly_quotes", counterField: "quotes_month_count", isMonthly: true },
  { key: "monthly_service_orders", label: "Ordens de serviço/mês", limitName: "monthly_service_orders", counterField: "service_orders_month_count", isMonthly: true },
  { key: "users", label: "Usuários", limitName: "users", counterField: "users_count", isMonthly: false },
  { key: "recurring_plans", label: "Planos recorrentes", limitName: "recurring_plans", isMonthly: false },
  { key: "active_subscriptions", label: "Assinaturas recorrentes", limitName: "active_subscriptions", isMonthly: false },
]

export async function getLimitStatusAction(): Promise<LimitStatusData | null> {
  try {
    const context = await getCurrentPartnerContext()
    if (!context?.partnerId) return null

    const [counters, plan, recurringPlans, recurringSubs] = await Promise.all([
      getUsageCounters(context.partnerId),
      getPartnerPlan(context.partnerId),
      countActiveRecurringPlans(context.partnerId),
      countActiveRecurringSubscriptions(context.partnerId),
    ])

    if (!counters) return null

    const limits = await Promise.all(
      LIMITS_CONFIG.map((cfg) => getLimit(context.partnerId, cfg.limitName)),
    )
    const items: LimitStatusItem[] = []

    LIMITS_CONFIG.forEach((cfg, index) => {
      const limit = limits[index]
      const current = cfg.counterField
        ? ((counters as any)[cfg.counterField] ?? 0)
        : cfg.key === "recurring_plans"
          ? recurringPlans
          : recurringSubs

      let percentage = 0
      if (limit !== "unlimited") {
        // Limite 0 = recurso bloqueado no plano atual -> barra cheia (paywall)
        percentage = limit > 0 ? Math.min(Math.round((current / limit) * 100), 100) : 100
      }

      items.push({
        key: cfg.key,
        label: cfg.label,
        current,
        limit,
        percentage,
        isMonthly: cfg.isMonthly,
      })
    })

    const nextSlug = getNextPlanTarget(plan.slug)
    const nextName = nextSlug ? getHardcodedPlan(nextSlug).name : null

    return {
      items,
      planSlug: plan.slug,
      planName: getHardcodedPlan(plan.slug).name,
      nextPlanSlug: nextSlug,
      nextPlanName: nextName,
    }
  } catch (err) {
    console.error("[LIMITS_STATUS] Error:", err)
    return null
  }
}
