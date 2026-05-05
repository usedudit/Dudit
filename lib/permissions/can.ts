import type { RbacUserLike } from "@/lib/permissions/rbac-types"

function getRoleId(user: RbacUserLike | null | undefined): string {
  return String((user as any)?.role_id ?? (user as any)?.roleId ?? "").toLowerCase()
}

/**
 * Global RBAC permission checker.
 *
 * Rules:
 * - Default deny (missing keys => false)
 * - Safe nested access
 * - Owner override: if role is "owner", always true
 *
 * @example
 * can(user, "orders.edit")
 */
export function can(user: RbacUserLike | null | undefined, permission: string): boolean {
  if (!user) return false
  if (getRoleId(user) === "owner") return true

  const path = String(permission || "").trim()
  if (!path) return false

  const parts = path.split(".").map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return false

  let cur: any = (user as any).permissions
  for (const part of parts) {
    if (!cur || typeof cur !== "object") return false
    cur = cur[part]
  }
  return cur === true
}

