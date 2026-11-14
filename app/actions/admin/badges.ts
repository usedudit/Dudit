"use server"

import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { getReportsStats } from "@/app/actions/admin/reports"
import { getAdminReturnRequestsStats } from "@/app/actions/admin/marketplace-ops"
import { getAdminDashboardStats } from "@/app/actions/admin/audit-logs"

export interface AdminSidebarBadges {
    moderation: number
    reports: number
    returns: number
}

export async function getAdminSidebarBadgesAction(): Promise<AdminSidebarBadges> {
    try {
        await requireAdminScope("moderation")

        const [dashStats, reportsStats, returnStats] = await Promise.all([
            getAdminDashboardStats().catch(() => null),
            getReportsStats().catch(() => null),
            getAdminReturnRequestsStats().catch(() => null),
        ])

        return {
            moderation: dashStats?.pendingModeration || 0,
            reports: reportsStats?.pending || 0,
            returns: returnStats?.pending || 0,
        }
    } catch {
        return {
            moderation: 0,
            reports: 0,
            returns: 0,
        }
    }
}

