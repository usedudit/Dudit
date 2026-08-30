"use client"

import { createContext, useContext, useMemo } from "react"
import type { PartnerRole, PartnerRoutePermissions, RouteKey } from "@/lib/permissions/types"
import {
    canAccessRoute,
    canPerformAction,
    hasSpecificPermission,
    canAccessPath,
    permissionDeniedMessage,
} from "@/lib/permissions/route-permissions"
import { DEFAULT_BUSINESS_INFO, normalizeBusinessInfo } from "@/lib/business-info"
import { can as canRbac } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"

// ─── Context Types ──────────────────────────────────────────────────────────

interface PermissionContextValue {
    role: PartnerRole
    routePermissions: PartnerRoutePermissions | null
    partnerId: string
    businessInfo: any // Added for feature flags
    /** Current subscription plan slug (`plans.slug`), e.g. `free`, `vendedor`. */
    planSlug: string

    // Convenience helpers
    canAccess: (routeKey: RouteKey) => boolean
    canCreate: (routeKey: RouteKey) => boolean
    canEdit: (routeKey: RouteKey) => boolean
    canDelete: (routeKey: RouteKey) => boolean
    hasSpecific: (routeKey: RouteKey, permKey: string) => boolean
    canAccessPath: (pathname: string) => boolean
    getDeniedMessage: (routeKey: RouteKey, action: string) => string
    /** RBAC permission check (e.g. `canRbac("orders.edit")`) */
    canRbac: (permission: string) => boolean
}

const PermissionContext = createContext<PermissionContextValue | null>(null)

// ─── Provider ───────────────────────────────────────────────────────────────

interface PermissionProviderProps {
    children: React.ReactNode
    role: PartnerRole
    routePermissions: PartnerRoutePermissions | null
    partnerId: string
    businessInfo: any
    planSlug?: string
    roleId?: string
    permissions?: any
}

export function PermissionProvider({ children, role, routePermissions, partnerId, businessInfo, planSlug = "free", roleId, permissions }: PermissionProviderProps) {
    const routePermissionsKey = JSON.stringify(routePermissions)
    const businessInfoKey = JSON.stringify(businessInfo)

    const rbacUser = useMemo<RbacUserLike>(() => ({
        roleId: roleId || role?.toLowerCase(),
        permissions: permissions || {},
    }), [roleId, permissions, role])

    const value = useMemo<PermissionContextValue>(() => ({
        role,
        routePermissions,
        partnerId,
        businessInfo,
        planSlug,
        canAccess: (routeKey: RouteKey) => canAccessRoute(routePermissions, routeKey),
        canCreate: (routeKey: RouteKey) => canPerformAction(routePermissions, routeKey, "create"),
        canEdit: (routeKey: RouteKey) => canPerformAction(routePermissions, routeKey, "edit"),
        canDelete: (routeKey: RouteKey) => canPerformAction(routePermissions, routeKey, "delete"),
        hasSpecific: (routeKey: RouteKey, permKey: string) => hasSpecificPermission(routePermissions, routeKey, permKey),
        canAccessPath: (pathname: string) => canAccessPath(routePermissions, pathname),
        getDeniedMessage: (routeKey: RouteKey, action: string) => permissionDeniedMessage(routeKey, action),
        canRbac: (permission: string) => canRbac(rbacUser, permission),
    }), [role, routePermissionsKey, partnerId, businessInfoKey, planSlug, rbacUser])

    return (
        <PermissionContext.Provider value={value}>
            {children}
        </PermissionContext.Provider>
    )
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function usePermissions(): PermissionContextValue {
    const ctx = useContext(PermissionContext)
    if (!ctx) {
        // SECURITY: Return a RESTRICTIVE context when outside provider.
        // Previously this returned OWNER permissions, which silently granted
        // full admin access to any component outside the PermissionProvider.
        return {
            role: "DELIVERY" as PartnerRole,
            routePermissions: null,
            partnerId: "",
            businessInfo: normalizeBusinessInfo(DEFAULT_BUSINESS_INFO),
            planSlug: "free",
            canAccess: () => false,
            canCreate: () => false,
            canEdit: () => false,
            canDelete: () => false,
            hasSpecific: () => false,
            canAccessPath: () => false,
            getDeniedMessage: () => "Sem permissão",
            canRbac: () => false,
        }
    }
    return ctx
}
