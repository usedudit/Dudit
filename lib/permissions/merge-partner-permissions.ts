import { PERMISSION_PRESETS } from "@/lib/permissions/partner-roles"
import type { PartnerPermissions, PartnerRole } from "@/lib/permissions/types"

/**
 * Merges stored JSON from `partner_users.permissions` with the role preset.
 * Fixes invited users with null/empty permissions (which previously denied all ERP pages).
 */
export function mergePartnerPermissions(role: PartnerRole, stored: unknown): PartnerPermissions {
  const base = PERMISSION_PRESETS[role] ?? PERMISSION_PRESETS.OPERATOR
  if (!stored || typeof stored !== "object") return base

  const raw = stored as Record<string, unknown>
  const out: PartnerPermissions = { ...base }

  for (const key of Object.keys(base) as (keyof PartnerPermissions)[]) {
    const baseEntry = base[key]
    const patch = raw[key]
    if (!patch || typeof patch !== "object" || !baseEntry || typeof baseEntry !== "object") continue
    out[key] = { ...(baseEntry as Record<string, unknown>), ...(patch as Record<string, unknown>) } as any
  }

  return out
}
