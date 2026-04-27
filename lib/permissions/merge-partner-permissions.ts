import { PERMISSION_PRESETS } from "@/lib/permissions/partner-roles"
import type { PartnerPermissions, PartnerRole, ResourcePermissions } from "@/lib/permissions/types"

const RESOURCE_KEYS: (keyof PartnerPermissions)[] = [
  "products",
  "services",
  "orders",
  "financial",
  "customers",
  "suppliers",
  "quotes",
]

/**
 * Merges stored JSON from `partner_users.permissions` with the role preset.
 * Fixes invited users with null/empty permissions (which previously denied all ERP pages).
 */
export function mergePartnerPermissions(role: PartnerRole, stored: unknown): PartnerPermissions {
  const noAccess: ResourcePermissions = { view: false, create: false, edit: false, delete: false }
  const base = PERMISSION_PRESETS[role] ?? {
    products: noAccess,
    services: noAccess,
    orders: noAccess,
    financial: noAccess,
    customers: noAccess,
    suppliers: noAccess,
    quotes: noAccess,
  }
  if (!stored || typeof stored !== "object") return base

  const s = stored as Record<string, Partial<ResourcePermissions>>
  const out: PartnerPermissions = { ...base }
  for (const key of RESOURCE_KEYS) {
    const patch = s[key]
    if (patch && typeof patch === "object") {
      out[key] = { ...base[key], ...patch }
    }
  }
  return out
}
