"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import type { PartnerRole } from "@/lib/permissions/types"
import { can } from "@/lib/permissions/can"
import type { RoleId } from "@/lib/permissions/rbac-types"
import { ALL_ROLES, canModifyUser, canUserInviteRole } from "@/lib/permissions/partner-roles"
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
const fetchPartnerTeamMembersCached = (partnerId: string) => unstable_cache(
    async (): Promise<{ members: TeamMember[]; error?: string }> => {
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

        // Fetch emails and metadata in parallel via getUserById for exact resolution
        const emailMap: Record<string, string> = {}
        const nameMap: Record<string, string> = {}
        if (userIds.length > 0) {
            const userResults = await Promise.allSettled(
                userIds.map((uid: string) => admin.auth.admin.getUserById(uid))
            )
            for (let i = 0; i < userIds.length; i++) {
                const res = userResults[i]
                if (res.status === "fulfilled" && res.value.data?.user) {
                    const u = res.value.data.user
                    if (u.email) emailMap[userIds[i]] = u.email
                    const meta = u.user_metadata || {}
                    const metaName = meta.full_name || meta.name || meta.display_name
                    if (metaName && typeof metaName === "string" && metaName.trim()) {
                        nameMap[userIds[i]] = metaName.trim()
                    }
                }
            }
        }

        const { data: profilesRes } = await admin
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)

        if (profilesRes) {
            for (const p of profilesRes as any[]) {
                if (p.full_name && typeof p.full_name === "string" && p.full_name.trim()) {
                    nameMap[p.user_id] = p.full_name.trim()
                }
            }
        }

        const formatEmailAsName = (email: string): string => {
            if (!email) return "Membro"
            const username = email.split("@")[0] || ""
            return username
                .replace(/[._-]/g, " ")
                .split(" ")
                .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                .join(" ")
        }

        const members: TeamMember[] = partnerUsers
            .map((pu: any) => {
                const email = emailMap[pu.user_id] || ""
                const resolvedName = nameMap[pu.user_id] || (email ? formatEmailAsName(email) : "Membro")
                return {
                    id: pu.id,
                    userId: pu.user_id,
                    email,
                    fullName: resolvedName,
                    avatarUrl: null,
                    role: String(pu.role_id || "delivery").toUpperCase() as PartnerRole,
                    permissions: null,
                    createdAt: pu.created_at,
                    isOwner: pu.user_id === ownerUserId,
                } as TeamMember
            })
            .sort((a: TeamMember, b: TeamMember) => {
                if (a.isOwner && !b.isOwner) return -1
                if (!a.isOwner && b.isOwner) return 1
                return (ROLE_ORDER[a.role] ?? 4) - (ROLE_ORDER[b.role] ?? 4)
            })

        return { members }
    },
    [TAGS.teamMembers(partnerId)],
    {
        tags: [TAGS.teamMembers(partnerId)],
        revalidate: 300, // 5 minutes
    }
)

async function fetchPartnerTeamMembers(partnerId: string): Promise<{ members: TeamMember[]; error?: string }> {
    return fetchPartnerTeamMembersCached(partnerId)()
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
/**
 * Retorna os membros da equipe aptos a serem responsáveis pelo pedido no ERP.
 * Exclui o cargo de entregador (DELIVERY) e retorna o partnerUserId do usuário logado
 * para seleção padrão automática.
 */
export async function getOrderResponsiblesAction(): Promise<{
    members: TeamMember[];
    currentUserId?: string;
    currentPartnerUserId?: string;
    error?: string;
}> {
    try {
        const user = await requireUser()
        if (!user) return { members: [], error: "Não autenticado" }
        const context = await getCurrentPartnerContext()
        if (!context) return { members: [], error: "Contexto de ERP não encontrado" }
        await requirePermission(context.partnerId, "orders", "view")

        const admin = getAdminClient()

        const [{ data: partner }, { data: partnerUsers, error: puErr }] = await Promise.all([
            admin.from("partners").select("user_id").eq("id", context.partnerId).single(),
            admin.from("partner_users").select("id, user_id, role_id, created_at").eq("partner_id", context.partnerId).order("created_at", { ascending: true }),
        ])
        if (puErr) return { members: [], error: puErr.message }

        const ownerUserId = partner?.user_id
        let list = partnerUsers || []

        if (ownerUserId && !list.some((pu: any) => pu.user_id === ownerUserId)) {
            const { data: newPu } = await admin
                .from("partner_users")
                .insert({ partner_id: context.partnerId, user_id: ownerUserId, role_id: "owner" })
                .select("id, user_id, role_id, created_at")
                .single()
            if (newPu) list = [newPu, ...list]
        }

        // Exclui entregadores (DELIVERY)
        const nonDelivery = list.filter((pu: any) => String(pu.role_id || "").toLowerCase() !== "delivery")
        const userIds = Array.from(new Set(nonDelivery.map((pu: any) => pu.user_id).filter(Boolean)))

        const nameMap: Record<string, string> = {}
        if (userIds.length > 0) {
            const { data: profiles } = await admin
                .from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", userIds)
            for (const p of profiles || []) {
                if (p.full_name && typeof p.full_name === "string" && p.full_name.trim()) {
                    nameMap[p.user_id] = p.full_name.trim()
                }
            }
        }

        if (user.id && !nameMap[user.id]) {
            const meta = user.user_metadata || {}
            const metaName = meta.full_name || meta.name || meta.display_name || user.email?.split("@")[0]
            if (metaName && typeof metaName === "string" && metaName.trim()) {
                nameMap[user.id] = metaName.trim()
            }
        }

        const members: TeamMember[] = nonDelivery.map((pu: any) => {
            const resolvedName = nameMap[pu.user_id] || "Funcionário"
            return {
                id: pu.id,
                userId: pu.user_id,
                email: "",
                fullName: resolvedName,
                avatarUrl: null,
                role: String(pu.role_id || "operator").toUpperCase() as PartnerRole,
                permissions: null,
                createdAt: pu.created_at,
                isOwner: pu.user_id === ownerUserId,
            }
        })

        const currentMember = list.find((pu: any) => pu.user_id === context.userId)

        return {
            members,
            currentUserId: context.userId,
            currentPartnerUserId: currentMember?.id,
        }
    } catch (error: any) {
        return { members: [], error: error.message }
    }
}

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
 * When `memberId` is provided, only that member's stats are computed with
 * lightweight aggregate queries (much faster than loading all orders).
 * Requires settings.settings_team permission.
 */
export async function getTeamMemberStatsAction(memberId?: string): Promise<{ stats: TeamMemberStats[]; error?: string }> {
    try {
        const user = await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { stats: [], error: "Contexto de ERP não encontrado" }

        const access = await requirePermission(context.partnerId, "settings", "settings_team", user)
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { stats: [], error: "Sem permissão para visualizar estatísticas." }
        }

        if (memberId) {
            const memberStats = await fetchTeamMemberStatsCached(context.partnerId, memberId)
            return { stats: memberStats ? [memberStats] : [] }
        }

        const stats = await fetchTeamStatsCached(context.partnerId)
        return { stats }
    } catch (error: any) {
        return { stats: [], error: error.message }
    }
}

// Lightweight stats for a single member, cached per partner+member.
// Runs ownership verification, orders summary, and commissions in a single parallel round-trip.
const fetchTeamMemberStatsCached = (partnerId: string, memberId: string) => unstable_cache(
    async (partnerId: string, memberId: string): Promise<TeamMemberStats | null> => {
        const admin = getAdminClient()

        const [userRes, ordersRes, commissionsRes] = await Promise.all([
            admin
                .from("partner_users")
                .select("id, user_id")
                .eq("partner_id", partnerId)
                .eq("id", memberId)
                .maybeSingle(),
            admin
                .from("orders")
                .select("total_amount, created_at", { count: "exact" })
                .eq("partner_id", partnerId)
                .eq("seller_partner_user_id", memberId)
                .neq("situation", "cancelled")
                .order("created_at", { ascending: false }),
            admin
                .from("transactions")
                .select("amount")
                .eq("partner_id", partnerId)
                .eq("seller_partner_user_id", memberId)
                .eq("category", "Comissões")
                .eq("transaction_type", "expense"),
        ])

        if (!userRes.data) return null

        const orders = ordersRes.data || []
        let totalSalesValue = 0
        for (const order of orders) {
            totalSalesValue += Number(order.total_amount || 0)
        }

        let totalCommissionValue = 0
        for (const tx of commissionsRes.data || []) {
            totalCommissionValue += Number(tx.amount || 0)
        }

        return {
            partnerUserId: memberId,
            fullName: null,
            avatarUrl: null,
            saleCount: ordersRes.count ?? orders.length,
            totalSalesValue,
            totalCommissionValue,
            lastSaleDate: orders[0]?.created_at || null,
        }
    },
    ["team-member-stats", partnerId, memberId],
    {
        revalidate: 60,
        tags: [`team-member-stats-${partnerId}-${memberId}`],
    }
)(partnerId, memberId)

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

        // Server Actions are directly callable, so enforce the role hierarchy
        // here instead of relying on the role choices hidden by the UI.
        const actorRole = String(access.roleId || "").toUpperCase() as PartnerRole
        const requestedRole = String(newRole || "").toUpperCase()
        if (!ALL_ROLES.includes(requestedRole as PartnerRole)) {
            return { success: false, error: "Cargo inválido." }
        }
        if (!canUserInviteRole(actorRole, requestedRole as PartnerRole)) {
            return { success: false, error: "Você não pode atribuir esse cargo." }
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
        if (!canModifyUser(actorRole, targetRoleId.toUpperCase() as PartnerRole)) {
            return { success: false, error: "O proprietário da loja não pode ser alterado." }
        }

        const newRoleIdLower = requestedRole.toLowerCase()
        const newRoleUpper = requestedRole

        // Update partner_users
        const { error } = await admin
            .from("partner_users")
            .update({
                role_id: newRoleIdLower,
                role: newRoleUpper,
            })
            .eq("id", targetRecord.id)

        if (error) {
            return { success: false, error: "Erro ao atualizar o membro." }
        }

        // Update store_members for this partner_user as well
        await admin
            .from("store_members")
            .update({
                role: newRoleUpper,
            })
            .eq("partner_user_id", targetRecord.id)

        const { data: targetProfile } = await admin
            .from("user_profiles")
            .select("full_name, email")
            .eq("user_id", memberUserId)
            .maybeSingle()

        await import("@/lib/security/audit-logger").then(m => m.auditLog({
            action: "role.changed",
            actorUserId: user.id,
            partnerId,
            targetUserId: memberUserId,
            metadata: {
                oldRole: targetRoleId,
                newRole: String(newRole || "").toLowerCase(),
                targetName: targetProfile?.full_name || null,
                targetEmail: targetProfile?.email || null,
            }
        }))

        const { revalidatePath } = await import("next/cache")
        revalidatePath("/erp", "layout")

        // Invalidate the affected user's access cache so role change reflects immediately
        const { revalidateUserAccess, revalidateTeamMembers } = await import("@/lib/utils/revalidation")
        await Promise.all([
            revalidateUserAccess(memberUserId),
            revalidateTeamMembers(partnerId),
        ])

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

        const { data: targetProfile } = await admin
            .from("user_profiles")
            .select("full_name, email")
            .eq("user_id", memberUserId)
            .maybeSingle()

        const { error } = await admin
            .from("partner_users")
            .delete()
            .eq("id", targetRecord.id)

        if (error) return { success: false, error: "Erro ao remover membro." }

        await import("@/lib/security/audit-logger").then(m => m.auditLog({
            action: "member.removed",
            actorUserId: user.id,
            partnerId,
            targetUserId: memberUserId,
            metadata: {
                removedRole: targetRoleId,
                targetName: targetProfile?.full_name || null,
                targetEmail: targetProfile?.email || null,
            },
        }))

        // Invalidate the removed user's access cache so the ERP disappears from their selector
        // and they can no longer access this ERP
        const { revalidateUserAccess, revalidateTeamMembers } = await import("@/lib/utils/revalidation")
        await Promise.all([
            revalidateUserAccess(memberUserId),
            revalidateTeamMembers(partnerId),
        ])

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}


// ─── Team History ───────────────────────────────────────────────────────────

export interface TeamHistoryEntry {
    id: string
    actor_name: string
    change_lines: string[]
    created_at: string
    metadata?: Record<string, any> | null
    entry_type?: string
}

const TEAM_ROLE_LABELS: Record<string, string> = {
    owner: "Proprietário",
    admin: "Administrador",
    manager: "Gestor",
    operator: "Operador",
    delivery: "Entregador",
}

function formatTeamRoleLabel(role?: string | null): string {
    if (!role) return ""
    return TEAM_ROLE_LABELS[String(role).toLowerCase()] || String(role)
}

const TEAM_AUDIT_ACTIONS = [
    "invite_created",
    "invite_accepted",
    "invite_revoked",
    "invite_expired",
    "role_changed",
    "member_updated",
    "member_removed",
    "store_member_added",
    "store_member_removed",
    "store_member_updated",
    "store_member_role_updated",
    "store_member_access_updated",
]

/**
 * Returns the full team history timeline for the current ERP:
 * member joins, who invited whom, invites sent/revoked, removals,
 * role changes, and store access changes.
 */
export async function getTeamHistoryAction(): Promise<{
    entries: TeamHistoryEntry[]
    error?: string
}> {
    try {
        const user = await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { entries: [], error: "Contexto de ERP não encontrado" }

        const access = await requirePermission(context.partnerId, "settings", "settings_team", user)
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { entries: [], error: "Sem permissão para visualizar histórico da equipe." }
        }

        const admin = getAdminClient()
        const partnerId = context.partnerId

        const [logsRes, invitesRes, membersRes, partnerRes, storesRes] = await Promise.all([
            admin
                .from("audit_logs")
                .select("id, actor_user_id, actor_name, action_type, change_lines, metadata, created_at")
                .eq("partner_id", partnerId)
                .in("action_type", TEAM_AUDIT_ACTIONS)
                .order("created_at", { ascending: false })
                .limit(150),
            admin
                .from("partner_invitations")
                .select("id, email, role, permissions, created_at, used_at, used_by, revoked_at, revoked_by, created_by_user_id")
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })
                .limit(100),
            admin
                .from("partner_users")
                .select("id, user_id, role_id, created_at")
                .eq("partner_id", partnerId),
            admin
                .from("partners")
                .select("user_id")
                .eq("id", partnerId)
                .maybeSingle(),
            admin
                .from("stores")
                .select("id, name")
                .eq("partner_id", partnerId),
        ])

        const logs = logsRes.data || []
        const invitations = invitesRes.data || []
        const partnerUsers = membersRes.data || []
        const ownerUserId = partnerRes.data?.user_id || null
        const storeNameById = new Map<string, string>(
            (storesRes.data || []).map((s: any) => [s.id, s.name])
        )

        // Collect all user IDs to resolve display names in one batch
        const userIds = new Set<string>()
        for (const l of logs as any[]) {
            if (l.actor_user_id) userIds.add(l.actor_user_id)
            const meta = (l.metadata || {}) as Record<string, any>
            if (meta._targetUserId) userIds.add(meta._targetUserId)
            if (meta.invitedByUserId) userIds.add(meta.invitedByUserId)
        }
        for (const inv of invitations as any[]) {
            if (inv.created_by_user_id) userIds.add(inv.created_by_user_id)
            if (inv.used_by) userIds.add(inv.used_by)
            if (inv.revoked_by) userIds.add(inv.revoked_by)
        }
        for (const pu of partnerUsers as any[]) {
            if (pu.user_id) userIds.add(pu.user_id)
        }

        const nameMap = new Map<string, string>()
        const emailMap = new Map<string, string>()
        const allUserIds = Array.from(userIds)

        if (allUserIds.length > 0) {
            const { data: profiles } = await admin
                .from("user_profiles")
                .select("user_id, full_name, email")
                .in("user_id", allUserIds)

            for (const p of (profiles || []) as any[]) {
                if (p.full_name && typeof p.full_name === "string" && p.full_name.trim()) {
                    nameMap.set(p.user_id, p.full_name.trim())
                }
                if (p.email) emailMap.set(p.user_id, p.email)
            }

            // Fallback to auth.users only for IDs still missing a name
            const missingIds = allUserIds.filter((uid) => !nameMap.has(uid))
            if (missingIds.length > 0) {
                const authResults = await Promise.allSettled(
                    missingIds.slice(0, 30).map((uid) => admin.auth.admin.getUserById(uid))
                )
                for (let i = 0; i < authResults.length; i++) {
                    const res = authResults[i]
                    const uid = missingIds[i]
                    if (res.status === "fulfilled" && res.value.data?.user) {
                        const u = res.value.data.user
                        if (u.email) emailMap.set(uid, u.email)
                        const meta = u.user_metadata || {}
                        const metaName = meta.full_name || meta.name || meta.display_name
                        if (metaName && typeof metaName === "string" && metaName.trim()) {
                            nameMap.set(uid, metaName.trim())
                        }
                    }
                }
            }
        }

        const resolveUserName = (uid?: string | null, fallbackName?: string | null, fallbackEmail?: string | null): string => {
            if (uid && nameMap.has(uid)) return nameMap.get(uid)!
            if (fallbackName && fallbackName.trim()) return fallbackName.trim()
            const email = (uid && emailMap.get(uid)) || fallbackEmail
            if (email) return email
            return "Usuário"
        }

        const entries: TeamHistoryEntry[] = []

        // Track audit log keys for deduplication with backfilled invitation/member records
        const loggedInviteCreated = new Set<string>()
        const loggedInviteAccepted = new Set<string>()
        const loggedInviteRevoked = new Set<string>()
        const acceptedUserIds = new Set<string>()

        for (const log of logs as any[]) {
            const action = String(log.action_type || "").toLowerCase()
            const meta = (log.metadata || {}) as Record<string, any>
            const actorName = log.actor_user_id
                ? resolveUserName(log.actor_user_id, log.actor_name)
                : (log.actor_name || "Sistema")
            const targetName = resolveUserName(meta._targetUserId, meta.targetName, meta.targetEmail)

            let lines: string[] = []
            let entryType = action

            switch (action) {
                case "invite_created": {
                    const email = meta.email || "e-mail não informado"
                    const roleLabel = formatTeamRoleLabel(meta.role)
                    lines.push(
                        `Enviou convite para ${email}${roleLabel ? ` com o cargo de ${roleLabel}` : ""}.`
                    )
                    if (Array.isArray(meta.storeNames) && meta.storeNames.length > 0) {
                        lines.push(`Lojas liberadas no convite: ${meta.storeNames.join(", ")}.`)
                    }
                    if (meta.email) loggedInviteCreated.add(String(meta.email).toLowerCase())
                    break
                }

                case "invite_accepted": {
                    const roleLabel = formatTeamRoleLabel(meta.role)
                    const inviterId = meta.invitedByUserId || meta._targetUserId
                    const inviterName = inviterId ? resolveUserName(inviterId) : null
                    lines.push(
                        `Entrou na equipe${roleLabel ? ` como ${roleLabel}` : ""}${inviterName ? ` (convidado por ${inviterName})` : ""}.`
                    )
                    if (Array.isArray(meta.storeNames) && meta.storeNames.length > 0) {
                        lines.push(`Acesso inicial às lojas: ${meta.storeNames.join(", ")}.`)
                    }
                    entryType = "approved"
                    if (meta.invitationId) loggedInviteAccepted.add(String(meta.invitationId))
                    if (log.actor_user_id) acceptedUserIds.add(log.actor_user_id)
                    break
                }

                case "invite_revoked": {
                    const email = meta.email ? ` para ${meta.email}` : ""
                    const roleLabel = formatTeamRoleLabel(meta.revokedRole || meta.role)
                    lines.push(
                        `Revogou o convite${email}${roleLabel ? ` (${roleLabel})` : ""}.`
                    )
                    entryType = "cancelled"
                    if (meta.invitationId) loggedInviteRevoked.add(String(meta.invitationId))
                    break
                }

                case "role_changed":
                case "member_updated": {
                    const oldRole = formatTeamRoleLabel(meta.oldRole)
                    const newRole = formatTeamRoleLabel(meta.newRole)
                    if (oldRole && newRole) {
                        lines.push(`Alterou o cargo de ${targetName} de ${oldRole} para ${newRole}.`)
                    } else {
                        lines.push(`Alterou o cargo de ${targetName}.`)
                    }
                    break
                }

                case "member_removed": {
                    const removedRole = formatTeamRoleLabel(meta.removedRole)
                    lines.push(
                        `Removeu ${targetName}${removedRole ? ` (${removedRole})` : ""} da equipe.`
                    )
                    entryType = "cancelled"
                    break
                }

                case "store_member_access_updated": {
                    lines.push(`Atualizou o acesso às lojas de ${targetName}.`)
                    if (Array.isArray(meta.addedStores) && meta.addedStores.length > 0) {
                        const formatted = meta.addedStores.map((item: string) => {
                            const [name, role] = String(item).split(":")
                            const r = formatTeamRoleLabel(role)
                            return r ? `${name} (${r})` : name
                        })
                        lines.push(`Acesso concedido: ${formatted.join(", ")}.`)
                    }
                    if (Array.isArray(meta.removedStores) && meta.removedStores.length > 0) {
                        lines.push(`Acesso removido: ${meta.removedStores.join(", ")}.`)
                    }
                    if (Array.isArray(meta.roleChanges) && meta.roleChanges.length > 0) {
                        for (const item of meta.roleChanges) {
                            const [name, oldR, newR] = String(item).split(":")
                            lines.push(
                                `Cargo na loja ${name}: ${formatTeamRoleLabel(oldR) || "Padrão"} → ${formatTeamRoleLabel(newR)}.`
                            )
                        }
                    }
                    break
                }

                case "store_member_added": {
                    const storeName = meta.storeName || storeNameById.get(meta.storeId) || "loja"
                    const roleLabel = formatTeamRoleLabel(meta.role)
                    lines.push(
                        `Concedeu acesso de ${targetName} à loja ${storeName}${roleLabel ? ` como ${roleLabel}` : ""}.`
                    )
                    entryType = "approved"
                    break
                }

                case "store_member_removed": {
                    const storeName = meta.storeName || storeNameById.get(meta.storeId) || "loja"
                    lines.push(`Removeu o acesso de ${targetName} à loja ${storeName}.`)
                    entryType = "cancelled"
                    break
                }

                case "store_member_updated":
                case "store_member_role_updated": {
                    const storeName = meta.storeName || storeNameById.get(meta.storeId) || "loja"
                    const oldRole = formatTeamRoleLabel(meta.oldRole)
                    const newRole = formatTeamRoleLabel(meta.newRole)
                    if (oldRole && newRole) {
                        lines.push(`Alterou o cargo de ${targetName} na loja ${storeName} de ${oldRole} para ${newRole}.`)
                    } else if (newRole) {
                        lines.push(`Alterou o cargo de ${targetName} na loja ${storeName} para ${newRole}.`)
                    } else {
                        lines.push(`Atualizou permissões de ${targetName} na loja ${storeName}.`)
                    }
                    break
                }

                default: {
                    lines = Array.isArray(log.change_lines) && log.change_lines.length > 0
                        ? log.change_lines
                        : ["Ação registrada na equipe."]
                    break
                }
            }

            entries.push({
                id: String(log.id),
                actor_name: actorName,
                change_lines: lines,
                created_at: log.created_at,
                metadata: meta,
                entry_type: entryType,
            })
        }

        // Backfill invitation lifecycle events not present in audit_logs
        for (const inv of invitations as any[]) {
            const roleLabel = formatTeamRoleLabel(inv.role)
            const invStoreIds = ((inv.permissions as any)?._store_ids_ || []) as string[]
            const invStoreNames = invStoreIds
                .map((sid) => storeNameById.get(sid))
                .filter((n): n is string => Boolean(n))

            if (inv.created_at && !loggedInviteCreated.has(String(inv.email || "").toLowerCase())) {
                const lines = [
                    `Enviou convite para ${inv.email}${roleLabel ? ` com o cargo de ${roleLabel}` : ""}.`,
                ]
                if (invStoreNames.length > 0) {
                    lines.push(`Lojas liberadas no convite: ${invStoreNames.join(", ")}.`)
                }
                entries.push({
                    id: `inv-created-${inv.id}`,
                    actor_name: inv.created_by_user_id ? resolveUserName(inv.created_by_user_id) : "Sistema",
                    change_lines: lines,
                    created_at: inv.created_at,
                    entry_type: "invite_created",
                })
            }

            if (inv.used_at && !loggedInviteAccepted.has(String(inv.id))) {
                const inviterName = inv.created_by_user_id ? resolveUserName(inv.created_by_user_id) : null
                const lines = [
                    `Entrou na equipe${roleLabel ? ` como ${roleLabel}` : ""}${inviterName ? ` (convidado por ${inviterName})` : ""}.`,
                ]
                if (invStoreNames.length > 0) {
                    lines.push(`Acesso inicial às lojas: ${invStoreNames.join(", ")}.`)
                }
                entries.push({
                    id: `inv-accepted-${inv.id}`,
                    actor_name: resolveUserName(inv.used_by, null, inv.email),
                    change_lines: lines,
                    created_at: inv.used_at,
                    entry_type: "approved",
                })
                if (inv.used_by) acceptedUserIds.add(inv.used_by)
            }

            if (inv.revoked_at && !loggedInviteRevoked.has(String(inv.id))) {
                entries.push({
                    id: `inv-revoked-${inv.id}`,
                    actor_name: inv.revoked_by ? resolveUserName(inv.revoked_by) : "Sistema",
                    change_lines: [
                        `Revogou o convite para ${inv.email}${roleLabel ? ` (${roleLabel})` : ""}.`,
                    ],
                    created_at: inv.revoked_at,
                    entry_type: "cancelled",
                })
            }
        }

        // Backfill member join events for members without an invite_accepted entry (e.g. owner)
        for (const pu of partnerUsers as any[]) {
            if (!pu.created_at || acceptedUserIds.has(pu.user_id)) continue
            const isOwner = pu.user_id === ownerUserId || String(pu.role_id || "").toLowerCase() === "owner"
            const roleLabel = formatTeamRoleLabel(pu.role_id)
            entries.push({
                id: `member-joined-${pu.id}`,
                actor_name: resolveUserName(pu.user_id),
                change_lines: [
                    isOwner
                        ? "Criou a equipe como Proprietário."
                        : `Entrou na equipe${roleLabel ? ` como ${roleLabel}` : ""}.`,
                ],
                created_at: pu.created_at,
                entry_type: "approved",
            })
        }

        entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

        return { entries }
    } catch (error: any) {
        return { entries: [], error: error.message }
    }
}
