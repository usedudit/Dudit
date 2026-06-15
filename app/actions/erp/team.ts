"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import type { PartnerRole } from "@/lib/permissions/types"
import { can } from "@/lib/permissions/can"
import type { RoleId } from "@/lib/permissions/rbac-types"

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

async function fetchPartnerTeamMembers(partnerId: string): Promise<{ members: TeamMember[]; error?: string }> {
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
    const [profilesRes, authRes] = await Promise.all([
        admin.from("user_profiles").select("user_id, full_name").in("user_id", userIds),
        admin.from("auth.users").select("id, email").in("id", userIds),
    ])

    let emailMap: Record<string, string> = {}
    if (authRes.data) for (const u of authRes.data) emailMap[u.id] = u.email || ""

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

        const access = await requirePartnerAccessWithPermission(context.partnerId, "settings", "settings_team")
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
        await requirePartnerAccessWithPermission(context.partnerId, "pdv", "sell")
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

        const access = await requirePartnerAccessWithPermission(context.partnerId, "settings", "settings_team")
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { stats: [], error: "Sem permissão para visualizar estatísticas." }
        }

        const admin = getAdminClient()
        const partnerId = context.partnerId

        // Get commission transactions from last 90 days for performance
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
        const { data: commissionData } = await admin
            .from("transactions")
            .select("seller_partner_user_id, amount, created_at, reference_note")
            .eq("partner_id", partnerId)
            .eq("category", "Comissões")
            .eq("transaction_type", "expense")
            .not("seller_partner_user_id", "is", null)
            .gte("created_at", ninetyDaysAgo)
            .order("created_at", { ascending: false })

        // Aggregate per seller
        const statsMap = new Map<string, { saleCount: number; totalCommissionValue: number; lastSaleDate: string | null }>()

        if (commissionData) {
            for (const row of commissionData) {
                const sid = row.seller_partner_user_id as string
                if (!sid) continue
                const existing = statsMap.get(sid) || { saleCount: 0, totalCommissionValue: 0, lastSaleDate: null as string | null }
                existing.saleCount += 1
                existing.totalCommissionValue += Number(row.amount || 0)
                if (!existing.lastSaleDate || (row.created_at && row.created_at > existing.lastSaleDate)) {
                    existing.lastSaleDate = row.created_at as string
                }
                statsMap.set(sid, existing)
            }
        }

        // Get total sales amount per commission owner by parsing reference_note
        // reference_note format: "commission:sale:<entityId>:<partnerUserId>"
        const referenceNotes = (commissionData || [])
            .filter((r: any) => r.seller_partner_user_id)
            .map((r: any) => r.reference_note as string)
            .filter(Boolean)

        // Extract unique entity IDs from reference notes for PDV sales and ERP orders
        const saleIds: string[] = []
        const orderIds: string[] = []
        const entityToSellerMap = new Map<string, string>() // entityId -> sellerPartnerUserId

        for (const ref of referenceNotes) {
            const parts = ref.split(":")
            if (parts.length >= 4 && parts[0] === "commission" && parts[1] === "sale") {
                const entityId = parts[2]
                const sellerId = parts[3]
                saleIds.push(entityId)
                entityToSellerMap.set(entityId, sellerId)
            }
        }

        // Query sales (PDV) amounts
        let saleAmountMap = new Map<string, number>()
        if (saleIds.length > 0) {
            const { data: salesData } = await admin
                .from("sales")
                .select("id, total_amount")
                .in("id", saleIds)
            if (salesData) {
                for (const s of salesData) {
                    saleAmountMap.set(s.id, Number(s.total_amount || 0))
                }
            }
        }

        // Build per-seller total sales value
        const salesValuePerSeller = new Map<string, number>()
        for (const [entityId, sellerId] of entityToSellerMap) {
            const amount = saleAmountMap.get(entityId) || 0
            salesValuePerSeller.set(sellerId, (salesValuePerSeller.get(sellerId) || 0) + amount)
        }

        // Get all partner users to build full stats list
        const { members, error: membersErr } = await fetchPartnerTeamMembers(partnerId)
        if (membersErr) return { stats: [], error: membersErr }

        const stats: TeamMemberStats[] = members.map((m) => {
            const s = statsMap.get(m.id)
            const totalSalesValue = salesValuePerSeller.get(m.id) || 0
            return {
                partnerUserId: m.id,
                fullName: m.fullName,
                avatarUrl: m.avatarUrl,
                saleCount: s?.saleCount || 0,
                totalSalesValue,
                totalCommissionValue: s?.totalCommissionValue || 0,
                lastSaleDate: s?.lastSaleDate || null,
            }
        })

        return { stats }
    } catch (error: any) {
        return { stats: [], error: error.message }
    }
}

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

        const access = await requirePartnerAccessWithPermission(partnerId, "settings", "settings_team", user)
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
        const { revalidateUserAccess } = await import("@/lib/utils/revalidation")
        revalidateUserAccess(memberUserId)

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

        const access = await requirePartnerAccessWithPermission(partnerId, "settings", "settings_team", user)
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
        const { revalidateUserAccess } = await import("@/lib/utils/revalidation")
        revalidateUserAccess(memberUserId)

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

