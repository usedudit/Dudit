/** Ordered subscription tiers (lowest → highest). Keep aligned with `plans.slug` in DB. */
export const PLAN_TIER_ORDER = ["free", "crescer", "escalar"] as const

export type PlanTierSlug = (typeof PLAN_TIER_ORDER)[number]

export function planTierIndex(slug: string): number {
  const i = PLAN_TIER_ORDER.indexOf(slug as PlanTierSlug)
  return i >= 0 ? i : 0
}

/** True if `currentSlug` is the same tier or higher than `minimumSlug`. */
export function hasMinimumPlan(currentSlug: string, minimumSlug: PlanTierSlug): boolean {
  return planTierIndex(currentSlug) >= planTierIndex(minimumSlug)
}

export const PLAN_UPGRADE_ICONS = {
  crescer: "https://img.dudit.com.br/static/icons/StarVender.png",
  escalar: "https://img.dudit.com.br/static/icons/StarEscalar.png",
} as const

export const PLAN_UPGRADE_MASCOTS = {
  crescer: "https://img.dudit.com.br/static/mascots/PlanoVender.png",
  escalar: "https://img.dudit.com.br/static/mascots/PlanoEscalar.png",
} as const
