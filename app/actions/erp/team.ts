"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import type { PartnerRole } from "@/lib/permissions/types"
import { can } from "@/lib/permissions/can"
import type { RoleId } from "@/lib/permissions/rbac-types"

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

// ─── Server Actions ─────────────────────────────────────────────────────────

/**
 * Get all team members for the current ERP.
 * Returns users from partner_users table + the partner owner.
 */
export async function getTeamMembers(): Promise<{ members: TeamMember[]; currentUserRole?: PartnerRole; currentUserId?: string; error?: string }> {
    try {
        await requireUser()
        const context = await getCurrentPartnerContext()
        if (!context) return { members: [], error: "Contexto de ERP não encontrado" }

        // SECURITY: Verify the user actually has access to this partner.
        // getCurrentPartnerContext reads from a client-settable cookie,
        // so we must validate against partner_users to prevent enumeration.
        const access = await requirePartnerAccessWithPermission(context.partnerId, "settings", "settings_team")
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { members: [], error: "Sem permissão para visualizar equipe." }
        }

        const admin = getAdminClient()
        const partnerId = context.partnerId

        // Get the partner owner
        const { data: partner } = await admin
            .from("partners")
            .select("user_id")
            .eq("id", partnerId)
            .single()

        const ownerUserId = partner?.user_id

        // Get all partner_users entries
        let { data: partnerUsers, error } = await admin
            .from("partner_users")
            .select("id, user_id, role_id, created_at")
            .eq("partner_id", partnerId)
            .order("created_at", { ascending: true })

        if (error) return { members: [], error: error.message }

        // Fix: Ensure owner is in partner_users so they appear in the team list and are assignable.
        if (ownerUserId && !partnerUsers?.some((pu: any) => pu.user_id === ownerUserId)) {
            const { data: newPu } = await admin
                .from("partner_users")
                .insert({
                    partner_id: partnerId,
                    user_id: ownerUserId,
                    role_id: "owner"
                })
                .select("id, user_id, role_id, created_at")
                .single()

            if (newPu) {
                partnerUsers = partnerUsers ? [newPu, ...partnerUsers] : [newPu]
            }
        }

        if (!partnerUsers || partnerUsers.length === 0) {
            return { members: [] }
        }

        // Get user profiles for all members
        const userIds = partnerUsers.map((pu: any) => pu.user_id)
        const { data: profiles } = await admin
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)

        // Get auth emails
        const { data: authUsers } = await admin
            .from("auth.users")
            .select("id, email")
            .in("id", userIds)

        // If auth.users query fails (it might), fallback to getting emails individually
        let emailMap: Record<string, string> = {}
        if (authUsers) {
            for (const u of authUsers) {
                emailMap[u.id] = u.email || ""
            }
        } else {
            // Fallback: get emails from Supabase auth admin API
            for (const userId of userIds) {
                try {
                    const { data: { user } } = await admin.auth.admin.getUserById(userId)
                    if (user?.email) emailMap[userId] = user.email
                } catch {
                    // skip
                }
            }
        }

        const profileMap: Record<string, { full_name: string | null }> = {}
        if (profiles) {
            for (const p of profiles) {
                profileMap[p.user_id] = { full_name: p.full_name }
            }
        }

        const members: TeamMember[] = partnerUsers.map((pu: any) => ({
            id: pu.id,
            userId: pu.user_id,
            email: emailMap[pu.user_id] || "",
            fullName: profileMap[pu.user_id]?.full_name || null,
            avatarUrl: null,
            role: String(pu.role_id || "delivery").toUpperCase() as PartnerRole,
            permissions: null,
            createdAt: pu.created_at,
            isOwner: pu.user_id === ownerUserId,
        }))

        // Sort: owner first, then by role hierarchy
        const roleOrder: Record<string, number> = { OWNER: 0, ADMIN: 1, MANAGER: 2, OPERATOR: 3, DELIVERY: 4 }
        members.sort((a, b) => {
            if (a.isOwner && !b.isOwner) return -1
            if (!a.isOwner && b.isOwner) return 1
            return (roleOrder[a.role] ?? 4) - (roleOrder[b.role] ?? 4)
        })

        return { members, currentUserRole: context.role as PartnerRole, currentUserId: context.userId }
    } catch (error: any) {
        return { members: [], error: error.message }
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

        return { success: true }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

