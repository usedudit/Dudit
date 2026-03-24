/**
 * Admin authorization module.
 *
 * SECURITY: Role is ALWAYS fetched from the database, never from the client.
 * Uses React cache() for request deduplication.
 * Uses the service-role client to read admin_roles (RLS blocks anon access).
 *
 * @module auth/admin-authorization
 */

import "server-only"
import { cache } from "react"
import { getCurrentUser, requireUser, ForbiddenError } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import type { AdminRole, AdminUser, AdminScope } from "@/lib/admin/types"

// ─── Role Hierarchy ─────────────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<AdminRole, number> = {
    moderator: 1,
    admin: 2,
    super_admin: 3,
}

function hasMinimumRole(userRole: AdminRole, requiredRole: AdminRole): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}

// ─── Core Admin Auth ────────────────────────────────────────────────────────

/**
 * Fetch the admin role for the current authenticated user.
 * Returns null if the user is not an admin.
 *
 * SECURITY: Reads from admin_roles via service-role client
 * because RLS blocks anon/authenticated access to this table.
 * This is a READ-ONLY operation — safe to use service-role.
 */
export const getAdminRole = cache(async (): Promise<AdminUser | null> => {
    const user = await getCurrentUser()
    if (!user) return null

    const admin = getAdminClient()
    const { data: roleRecord } = await admin
        .from("admin_roles")
        .select("role, is_protected, scopes")
        .eq("user_id", user.id)
        .single()

    if (!roleRecord) return null

    // Default scopes by role (fallback if scopes array is empty)
    const defaultScopes = getDefaultScopes(roleRecord.role as AdminRole)
    const scopes = (roleRecord.scopes && roleRecord.scopes.length > 0)
        ? roleRecord.scopes as AdminScope[]
        : defaultScopes

    return {
        userId: user.id,
        role: roleRecord.role as AdminRole,
        email: user.email || "",
        isProtected: roleRecord.is_protected,
        scopes,
    }
})

/**
 * Require the current user to be an admin.
 * Optionally enforce a minimum role level.
 *
 * THROWS ForbiddenError if:
 * - User is not authenticated
 * - User is not in admin_roles
 * - User's role is below the required minimum
 *
 * @param minRole - Minimum required role (default: 'moderator' = any admin)
 */
export async function requireAdmin(minRole: AdminRole = "moderator"): Promise<AdminUser> {
    await requireUser() // Throws UnauthorizedError if not authenticated

    const adminUser = await getAdminRole()
    if (!adminUser) {
        throw new ForbiddenError("Acesso administrativo negado")
    }

    if (!hasMinimumRole(adminUser.role, minRole)) {
        throw new ForbiddenError(`Nível de acesso insuficiente. Requerido: ${minRole}`)
    }

    return adminUser
}

/**
 * Require super_admin role.
 */
export async function requireSuperAdmin(): Promise<AdminUser> {
    return requireAdmin("super_admin")
}

// ─── Scope-Based Permissions ───────────────────────────────────────────────

/**
 * Default scopes per role. super_admin gets all scopes.
 */
function getDefaultScopes(role: AdminRole): AdminScope[] {
    switch (role) {
        case "super_admin":
            return ["moderation", "user_enforcement", "billing_control", "audit_access", "system_settings"]
        case "admin":
            return ["moderation", "user_enforcement", "billing_control", "audit_access"]
        case "moderator":
            return ["moderation", "audit_access"]
    }
}

/**
 * Require the admin to have a specific scope.
 * THROWS ForbiddenError if scope is missing.
 *
 * @example
 * const admin = await requireAdmin("moderator")
 * requireScope(admin, "user_enforcement")  // throws if moderator without scope
 */
export function requireScope(admin: AdminUser, scope: AdminScope): void {
    if (!admin.scopes.includes(scope)) {
        throw new ForbiddenError(`Permissão insuficiente. Escopo necessário: ${scope}`)
    }
}

// ─── Self-Lock Guards ───────────────────────────────────────────────────────

/**
 * Prevent an admin from performing destructive actions on themselves.
 */
export function assertNotSelf(adminUserId: string, targetUserId: string): void {
    if (adminUserId === targetUserId) {
        throw new ForbiddenError("Você não pode executar esta ação em sua própria conta")
    }
}

/**
 * Prevent modifying a protected admin (system accounts, super admins marked as protected).
 * Requires a service-role lookup of the target user's admin status.
 */
export async function assertNotProtected(targetUserId: string): Promise<void> {
    const admin = getAdminClient()
    const { data: targetRole } = await admin
        .from("admin_roles")
        .select("is_protected")
        .eq("user_id", targetUserId)
        .single()

    if (targetRole?.is_protected) {
        throw new ForbiddenError("Este usuário é protegido e não pode ser modificado")
    }
}

/**
 * Prevent removing the last admin from the system.
 */
export async function assertNotLastAdmin(): Promise<void> {
    const admin = getAdminClient()
    const { count } = await admin
        .from("admin_roles")
        .select("id", { count: "exact", head: true })
        .in("role", ["admin", "super_admin"])

    if (count !== null && count <= 1) {
        throw new ForbiddenError("Não é possível remover o último administrador do sistema")
    }
}
