import { PLAN_TIER_ORDER, type PlanTierSlug, planTierIndex } from "./plan-tier"

export function isPlanLimitReachedError(error: unknown): boolean {
  const msg = String(error ?? "").toLowerCase()
  // Current backend error messages include "Limite do plano ... Faça upgrade ..."
  return msg.includes("limite do plano") || msg.includes("faça upgrade") || msg.includes("fa\u00e7a upgrade")
}

export function getNextPlanTarget(currentPlanSlug: string): PlanTierSlug | null {
  const idx = planTierIndex(currentPlanSlug)
  const next = PLAN_TIER_ORDER[idx + 1] ?? null
  return next
}

