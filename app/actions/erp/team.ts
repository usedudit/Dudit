"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import type { PartnerRole } from "@/lib/permissions/types"
import { can } from "@/lib/permissions/can"
import type { RoleId } from "@/lib/permissions/rbac-types"
import { unstable_cache } from "next/cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

// ─── Stats Types ────────────────────────────────────────────────────────────

export type TeamMemberStats = {
    partnerUserId: string
    fullName: string | null
    avatarUrl: string | null
    saleCount: number
    totalSalesValue: number
    totalCommissionValue: number
    lastSaleDate: string | null
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TeamMember {
    id: string // partner_users.id
    userId: string
    email: string
    fullName: string | null
    avatarUrl: string | null
    role: PartnerRole
    permissions: any
    createdAt: string
    isOwner: boolean // true if this user is the partners.user_id
}

const ROLE_ORDER: Record<string, number> = { OWNER: 0, ADMIN: 1, MANAGER: 2, OPERATOR: 3, DELIVERY: 4 }

// Cached version of fetchPartnerTeamMembers - revalidates on team changes
const fetchPartnerTeamMembersCached = unstable_cache(
    async (partnerId: string): Promise<{ members: TeamMember[]; error?: string }> => {
        const admin = getAdminClient()

        const { data: partner } = await admin
            .from("partners")
            .select("user_id")
            .eq("id", partnerId)
            .single()
        const ownerUserId = partner?.user_id

        let { data: partnerUsers, error } = await admin
            .from("partner_users")
            .select("id, user_id, role_id, created_at")
            .eq("partner_id", partnerId)
            .order("created_at", { ascending: true })
        if (error) return { members: [], error: error.message }

        if (ownerUserId && !partnerUsers?.some((pu: any) => pu.user_id === ownerUserId)) {
            const { data: newPu } = await admin
                .from("partner_users")
                .insert({ partner_id: partnerId, user_id: ownerUserId, role_id: "owner" })
                .select("id, user_id, role_id, created_at")
                .single()
            if (newPu) partnerUsers = partnerUsers ? [newPu, ...partnerUsers] : [newPu]
        }

        if (!partnerUsers || partnerUsers.length === 0) return { members: [] }

        const userIds = partnerUsers.map((pu: any) => pu.user_id)

        // Emails via a single listUsers batch (1-2 HTTP calls) instead of N sequential
        // auth.admin.getUserById calls, which were the main latency source of this fetch.
        const emailMap: Record<string, string> = {}
        const PAGE_SIZE = 200
        for (let page = 1; ; page++) {
            const { data: pageData, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
            if (error || !pageData?.users || pageData.users.length === 0) break
            for (const u of pageData.users) {
                if (u.email && userIds.includes(u.id)) emailMap[u.id] = u.email
            }
            if (pageData.users.length < PAGE_SIZE) break
        }

        const { data: profilesRes } = await admin
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)

        const profileMap: Record<string, { full_name: string | null }> = {}
        if (profilesRes.data) for (const p of profilesRes.data) profileMap[p.user_id] = { full_name: p.full_name }

        const members: TeamMember[] = partnerUsers
            .map((pu: any) => ({
                id: pu.id,
                userId: pu.user_id,
                email: emailMap[pu.user_id] || "",
                fullName: profileMap[pu.user_id]?.full_name || null,
                avatarUrl: null,
                role: String(pu.role_id || "delivery").toUpperCase() as PartnerRole,
                permissions: null,
                createdAt: pu.created_at,
                isOwner: pu.user_id === ownerUserId,
            }) as TeamMember)
            .sort((a: TeamMember, b: TeamMember) => {
                if (a.isOwner && !b.isOwner) return -1
                if (!a.isOwner && b.isOwner) return 1
                return (ROLE_ORDER[a.role] ?? 4) - (ROLE_ORDER[b.role] ?? 4)
            })

        return { members }
    },
    ["team-members"],
    {
        tags: ["team-members"],
        revalidate: 300, // 5 minutes
    }
)

async function fetchPartnerTeamMembers(partnerId: string): Promise<{ members: TeamMember[]; error?: string }> {
    return fetchPartnerTeamMembersCached(partnerId)
}

// ─── Server Actions ─────────────────────────────────────────────────────────

/**
 * Get all team members for the current ERP.
 * Requires settings.settings_team permission (OWNER/ADMIN/MANAGER).
 */
export async function getTeamMembers(): Promise<{ members: TeamMember[]; currentUserRole?: PartnerRole; currentUserId?: string; error?: string }> {
    try {
        await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { members: [], error: "Contexto de ERP não encontrado" }

        const access = await requirePermission(context.partnerId, "settings", "settings_team")
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { members: [], error: "Sem permissão para visualizar equipe." }
        }

        const { members, error } = await fetchPartnerTeamMembers(context.partnerId)
        if (error) return { members: [], error }

        return { members, currentUserRole: context.role as PartnerRole, currentUserId: context.userId }
    } catch (error: any) {
        return { members: [], error: error.message }
    }
}

/**
 * Lightweight version for PDV seller selection.
 * Requires pdv.sell permission instead of settings.settings_team,
 * so OPERADOR (cashier) roles can see and assign sellers.
 */
export async function getPDVSellersAction(): Promise<{ members: TeamMember[]; error?: string }> {
    try {
        await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { members: [], error: "Contexto de ERP não encontrado" }
        await requirePermission(context.partnerId, "pdv", "sell")
        return await fetchPartnerTeamMembers(context.partnerId)
    } catch (error: any) {
        return { members: [], error: error.message }
    }
}

/**
 * Returns per-member sales and commission stats for the team page.
 * Requires settings.settings_team permission.
 */
export async function getTeamMemberStatsAction(): Promise<{ stats: TeamMemberStats[]; error?: string }> {
    try {
        await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { stats: [], error: "Contexto de ERP não encontrado" }

        const access = await requirePermission(context.partnerId, "settings", "settings_team")
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { stats: [], error: "Sem permissão para visualizar estatísticas." }
        }

        const stats = await fetchTeamStatsCached(context.partnerId)
        return { stats }
    } catch (error: any) {
        return { stats: [], error: error.message }
    }
}

// Aggregated per-member stats, cached per partner.
// Sales come from orders (covers both ERP pedidos and PDV sales synced with is_pos_sale),
// commissions from the Comissões expense transactions. No arbitrary time window.
const fetchTeamStatsCached = unstable_cache(
    async (partnerId: string): Promise<TeamMemberStats[]> => {
        const admin = getAdminClient()

        const [usersRes, ordersRes, commissionsRes] = await Promise.all([
            admin
                .from("partner_users")
                .select("id, user_id")
                .eq("partner_id", partnerId),
            admin
                .from("orders")
                .select("id, total_amount, created_at, seller_partner_user_id")
                .eq("partner_id", partnerId)
                .neq("situation", "cancelled"),
            admin
                .from("transactions")
                .select("amount, seller_partner_user_id")
                .eq("partner_id", partnerId)
                .eq("category", "Comissões")
                .eq("transaction_type", "expense")
                .not("seller_partner_user_id", "is", null),
        ])

        const partnerUsers = usersRes.data || []
        const userIds = partnerUsers.map((pu: any) => pu.user_id)

        const { data: profilesRes } = await admin
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)
        const profileMap = new Map<string, string | null>(
            (profilesRes || []).map((p: any) => [p.user_id, p.full_name])
        )

        // Sales per seller (keyed by partner_users.id)
        const salesMap = new Map<string, { saleCount: number; totalSalesValue: number; lastSaleDate: string | null }>()
        for (const order of ordersRes.data || []) {
            const sid = order.seller_partner_user_id as string | null
            if (!sid) continue
            const existing = salesMap.get(sid) || { saleCount: 0, totalSalesValue: 0, lastSaleDate: null as string | null }
            existing.saleCount += 1
            existing.totalSalesValue += Number(order.total_amount || 0)
            if (!existing.lastSaleDate || (order.created_at && order.created_at > existing.lastSaleDate)) {
                existing.lastSaleDate = order.created_at as string
            }
            salesMap.set(sid, existing)
        }

        // Commissions per seller
        const commissionMap = new Map<string, number>()
        for (const tx of commissionsRes.data || []) {
            const sid = tx.seller_partner_user_id as string
            if (!sid) continue
            commissionMap.set(sid, (commissionMap.get(sid) || 0) + Number(tx.amount || 0))
        }

        return partnerUsers.map((pu: any) => {
            const sales = salesMap.get(pu.id) || { saleCount: 0, totalSalesValue: 0, lastSaleDate: null }
            return {
                partnerUserId: pu.id,
                fullName: profileMap.get(pu.user_id) || null,
                avatarUrl: null,
                saleCount: sales.saleCount,
                totalSalesValue: sales.totalSalesValue,
                totalCommissionValue: commissionMap.get(pu.id) || 0,
                lastSaleDate: sales.lastSaleDate,
            }
        })
    },
    ["team-stats"],
    {
        revalidate: 60,
        tags: ["team-stats"],
    }
)

/**
 * Update a team member's role.
 */
export async function updateTeamMemberRole(
    memberUserId: string,
    newRole: PartnerRole
): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto não encontrado." }

        // SECURITY: Prevent users from changing their own role
        if (user.id === memberUserId) {
            return { success: false, error: "Você não pode alterar seu próprio cargo." }
        }

        const admin = getAdminClient()
        const partnerId = context.partnerId

        const access = await requirePermission(partnerId, "settings", "settings_team", user)
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { success: false, error: "Acesso negado." }
        }

        // Get target member
        const { data: targetRecord } = await admin
            .from("partner_users")
            .select("id, role_id")
            .eq("partner_id", partnerId)
            .eq("user_id", memberUserId)
            .single()

        if (!targetRecord) {
            return { success: false, error: "Membro não encontrado na equipe." }
        }

        const targetRoleId = String(targetRecord.role_id || "delivery").toLowerCase() as RoleId
        if (targetRoleId === "owner" && access.roleId !== "owner") {
            return { success: false, error: "O proprietário da loja não pode ser alterado." }
        }

        // Update
        const { error } = await admin
            .from("partner_users")
            .update({
                role_id: String(newRole || "").toLowerCase()
            })
            .eq("id", targetRecord.id)

        if (error) {
            return { success: false, error: "Erro ao atualizar o membro." }
        }

        await import("@/lib/security/audit-logger").then(m => m.auditLog({
            action: "member.updated" as any,
            actorUserId: user.id,
            partnerId,
            targetUserId: memberUserId,
            metadata: { oldRole: targetRoleId, newRole: String(newRole || "").toLowerCase() }
        }))

        const { revalidatePath } = await import("next/cache")
        revalidatePath("/erp", "layout")

        // Invalidate the affected user's access cache so role change reflects immediately
        const { revalidateUserAccess, revalidateTeamMembers } = await import("@/lib/utils/revalidation")
        revalidateUserAccess(memberUserId)
        revalidateTeamMembers(partnerId)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

/**
 * Remove a team member.
 */
export async function removeTeamMember(memberUserId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { success: false, error: "Contexto não encontrado." }

        const admin = getAdminClient()
        const partnerId = context.partnerId

        // Ensure user is not removing themselves
        if (user.id === memberUserId) {
            return { success: false, error: "Você não pode remover a si mesmo." }
        }

        // Check if target is the partner owner
        const { data: partnerRecord } = await admin
            .from("partners")
            .select("user_id")
            .eq("id", partnerId)
            .single()

        if (partnerRecord?.user_id === memberUserId) {
            return { success: false, error: "O proprietário da loja não pode ser removido." }
        }

        const access = await requirePermission(partnerId, "settings", "settings_team", user)
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { success: false, error: "Acesso negado." }
        }

        // Get target role
        const { data: targetRecord } = await admin
            .from("partner_users")
            .select("id, role_id")
            .eq("partner_id", partnerId)
            .eq("user_id", memberUserId)
            .single()

        if (!targetRecord) return { success: false, error: "Membro não encontrado." }

        const targetRoleId = String(targetRecord.role_id || "delivery").toLowerCase() as RoleId
        if (targetRoleId === "owner") {
            return { success: false, error: "O proprietário da loja não pode ser removido." }
        }

        const { error } = await admin
            .from("partner_users")
            .delete()
            .eq("id", targetRecord.id)

        if (error) return { success: false, error: "Erro ao remover membro." }

        await import("@/lib/security/audit-logger").then(m => m.auditLog({
            action: "member.removed" as any,
            actorUserId: user.id,
            partnerId,
            targetUserId: memberUserId,
        }))

        // Invalidate the removed user's access cache so the ERP disappears from their selector
        // and they can no longer access this ERP
        const { revalidateUserAccess, revalidateTeamMembers } = await import("@/lib/utils/revalidation")
        revalidateUserAccess(memberUserId)
        revalidateTeamMembers(partnerId)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

