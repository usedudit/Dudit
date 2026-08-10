import type { PermissionTemplate, RbacPermissions } from "@/lib/permissions/rbac-types"

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

/**
 * Normalize an unknown permissions object against a base template:
 * - Missing keys -> false (from template)
 * - Extra keys -> ignored
 * - Non-boolean leaf values -> false
 */
export function normalizePermissions(template: PermissionTemplate, raw: unknown): RbacPermissions {
  const patchRoot = isPlainObject(raw) ? raw : {}

  const out: any = {}

  for (const [moduleKey, moduleTemplate] of Object.entries(template)) {
    const incomingModule = patchRoot[moduleKey]
    if (!isPlainObject(moduleTemplate)) {
      out[moduleKey] = false
      continue
    }

    const moduleOut: any = {}
    const incomingObj = isPlainObject(incomingModule) ? incomingModule : {}

    for (const [permKey, permDefault] of Object.entries(moduleTemplate)) {
      const incomingVal = incomingObj[permKey]
      moduleOut[permKey] = typeof incomingVal === "boolean" ? incomingVal : (typeof permDefault === "boolean" ? permDefault : false)
    }

    out[moduleKey] = moduleOut
  }

  return out as RbacPermissions
}

/**
 * Merges base role permissions (from DB roles table) with user-level overrides,
 * then normalizes against the base permission template.
 * If userPerms is empty/null/{}, rolePerms is used directly as the source of truth.
 */
export function mergePermissionsWithRole(
  template: PermissionTemplate,
  rolePerms: unknown,
  userPerms: unknown
): RbacPermissions {
  const baseRole = isPlainObject(rolePerms) ? rolePerms : {}
  const userPatch = isPlainObject(userPerms) ? userPerms : {}

  const merged: any = {}
  for (const moduleKey of Object.keys(template)) {
    const roleMod = isPlainObject((baseRole as any)[moduleKey]) ? (baseRole as any)[moduleKey] : {}
    const userMod = isPlainObject((userPatch as any)[moduleKey]) ? (userPatch as any)[moduleKey] : {}
    merged[moduleKey] = { ...roleMod, ...userMod }
  }

  return normalizePermissions(template, merged)
}


