"use server"

import crypto from "crypto"
import { createAdminClient } from "@/lib/supabase/server"
import { requirePartnerAccess, requireMinimumPlan, requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { auditLog } from "@/lib/security/audit-logger"
import { can } from "@/lib/permissions/can"
import type { PartnerRole, PartnerPermissions } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateToken(): string {
    return crypto.randomBytes(32).toString("hex")
}

function hashToken(token: string): string {
    return crypto.createHash("sha256").update(token, "utf8").digest("hex")
}

/**
 * Constant-time comparison for token hashes.
 * Prevents timing attacks even though we compare hashed values.
 */
function safeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"))
}

/**
 * Validate token format: must be exactly 64 hex characters.
 * Rejects malformed input early before hashing.
 */
function isValidTokenFormat(token: string): boolean {
    return /^[a-f0-9]{64}$/i.test(token)
}

/**
 * Anti-timing jitter: adds a random delay (50–150ms) to prevent
 * attackers from distinguishing error paths via response time analysis.
 */
async function antiTimingJitter(): Promise<void> {
    const delay = 50 + Math.floor(Math.random() * 100)
    return new Promise(resolve => setTimeout(resolve, delay))
}

/**
 * Generic error message for ALL invalid token states.
 * Prevents oracle attacks that distinguish "expired" from "revoked" from "used".
 */
const GENERIC_INVALID_TOKEN_MSG = "Convite inválido ou expirado."

// ─── Create Invitation ──────────────────────────────────────────────────────

export async function createInvitation(input: {
    partnerId: string
    email: string
    role: PartnerRole
    permissions?: PartnerPermissions
    storeIds?: string[]
}): Promise<{ success: boolean; inviteUrl?: string; error?: string }> {
    try {
        await requireRateLimit(RateLimitCategory.INVITE_CREATE)
        const user = await requireUser()
        await requireMinimumPlan(input.partnerId, "crescer")
        const admin = createAdminClient()

        // Canonical guard: must be able to manage team/settings to invite.
        const access = await requirePartnerAccess(input.partnerId, user)
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { success: false, error: "Sem permissão para convidar membros." }
        }

        // Prevent inviting self
        const normalizedEmail = input.email.trim().toLowerCase()
        if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
            return { success: false, error: "E-mail inválido." }
        }
        if (user.email && normalizedEmail === user.email.trim().toLowerCase()) {
            return { success: false, error: "Você não pode convidar a si mesmo." }
        }

        // OWNER is a single-user role tied to the partner creator - never assignable via invite
        if (String(input.role || "").toUpperCase() === "OWNER") {
            return { success: false, error: "Não é possível convidar como proprietário. O proprietário é o criador da conta." }
        }

        // SECURITY FIX (LOW-04): Targeted email lookup instead of listing all users
        // admin.auth.admin.listUsers() loads ALL users - use direct profile query instead
        const { data: matchingProfile } = await admin
            .from("user_profiles")
            .select("user_id")
            .eq("email", normalizedEmail)
            .maybeSingle()

        if (matchingProfile) {
            const { data: existingMember } = await admin
                .from("partner_users")
                .select("id")
                .eq("partner_id", input.partnerId)
                .eq("user_id", matchingProfile.user_id)
                .maybeSingle()

            if (existingMember) {
                return { success: false, error: "Este e-mail já pertence a um membro da equipe." }
            }
        }

        // Prevent duplicate pending invites for the same email
        const { data: pendingInvite } = await admin
            .from("partner_invitations")
            .select("id")
            .eq("partner_id", input.partnerId)
            .eq("email", normalizedEmail)
            .is("used_at", null)
            .is("revoked_at", null)
            .maybeSingle()

        if (pendingInvite) {
            return { success: false, error: "Já existe um convite pendente para este e-mail nesta equipe." }
        }

        // 2.5 Subscription limit check - enforce user limits before inviting
        const { checkLimit } = await import("@/lib/services/subscription.service")
        const limitCheck = await checkLimit(input.partnerId, "users")
        if (!limitCheck.allowed) {
            return { success: false, error: limitCheck.message || "Limite de usuários atingido" }
        }

        // 3. Generate secure token
        const rawToken = generateToken()
        const tokenHash = hashToken(rawToken)

        const roleId = String(input.role || "").toLowerCase() as RoleId

        // 5. Calculate expiration (7 days)
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7)

        // Build invite URL (also persisted as share_url so the team admin can
        // copy the link again later without regenerating/invalidating the invite)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || ""
        const inviteUrl = `${appUrl}/invite/${rawToken}`

        // 6. Insert invitation
        const { error: insertError } = await admin.from("partner_invitations").insert({
            partner_id: input.partnerId,
            email: normalizedEmail,
            token_hash: tokenHash,
            role_id: roleId,
            role: input.role, // legacy column (kept for backward compatibility)
            permissions: { ...(input.permissions || {}), _store_ids_: input.storeIds || null },
            created_by_user_id: user.id,
            created_by_role: String(access.roleId || "").toUpperCase(),
            expires_at: expiresAt.toISOString(),
            share_url: inviteUrl,
        })

        if (insertError) {
            console.error("[Invitations] Insert error:", insertError)
            return { success: false, error: "Erro ao criar convite." }
        }

        // 7. Audit log
        await auditLog({
            action: "invite.created",
            actorUserId: user.id,
            partnerId: input.partnerId,
            metadata: {
                role: input.role,
                email: normalizedEmail,
                expiresAt: expiresAt.toISOString(),
            },
        })

        // 8. Invalidate invitation list cache so the new invite appears immediately
        const { revalidatePartnerInvitations } = await import("@/lib/utils/revalidation")
        revalidatePartnerInvitations(input.partnerId)

        return { success: true, inviteUrl }
    } catch (error) {
        console.error("[Invitations] createInvitation error:", error)
        return { success: false, error: "Erro ao criar convite." }
    }
}

// ─── Accept Invitation ──────────────────────────────────────────────────────

export async function acceptInvitation(
    rawToken: string
): Promise<{ success: boolean; partnerId?: string; error?: string }> {
    try {
        await requireRateLimit(RateLimitCategory.INVITE_ACCEPT)
        const user = await requireUser()
        const admin = createAdminClient()

        // 0. Validate token format (reject malformed input early)
        if (!isValidTokenFormat(rawToken)) {
            await antiTimingJitter()
            return { success: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        // 1. Hash the incoming token
        const tokenHash = hashToken(rawToken)

        // 2. Lookup invitation by token_hash
        const { data: invitation, error: lookupError } = await admin
            .from("partner_invitations")
            .select("*")
            .eq("token_hash", tokenHash)
            .single()

        if (lookupError || !invitation) {
            await antiTimingJitter()
            return { success: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        // Enforce account deletion write locks for target partner
        const { AccountDeletionService } = await import("@/lib/services/account-deletion.service")
        try {
            await AccountDeletionService.assertNotLocked(invitation.partner_id)
        } catch (lockErr) {
            return { success: false, error: "A conta deste parceiro está em processo de exclusão e não aceita novos membros." }
        }

        // 3. Constant-time verify hash match
        if (!safeCompare(invitation.token_hash, tokenHash)) {
            await antiTimingJitter()
            return { success: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        // 4. Check if locked (brute-force protection)
        if (invitation.locked_at) {
            await antiTimingJitter()
            await auditLog({
                action: "invite.accepted.failed" as any,
                actorUserId: user.id,
                partnerId: invitation.partner_id,
                metadata: { reason: "invite_locked", invitationId: invitation.id },
            }).catch(() => { })
            return { success: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        // 5. Check if already used, revoked, or expired - generic message for all
        if (invitation.used_at || invitation.revoked_at || new Date(invitation.expires_at) < new Date()) {
            await antiTimingJitter()
            return { success: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        // 6. SECURITY: Validate exact email match and status
        if (!invitation.email) {
            await antiTimingJitter()
            return { success: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        const inviteEmail = invitation.email.trim().toLowerCase()
        const userEmail = (user.email || "").trim().toLowerCase()

        if (inviteEmail !== userEmail) {
            // Increment failed attempts counter (brute-force tracking)
            // NOTE: supabase builders are thenables (no .catch) - use try/catch instead
            try {
                await admin.rpc("increment_invite_failed_attempts", {
                    p_invitation_id: invitation.id,
                })
            } catch { /* non-blocking */ }

            // Log security mismatch
            await auditLog({
                action: "invite.accepted.failed",
                actorUserId: user.id,
                partnerId: invitation.partner_id,
                metadata: {
                    reason: "email_mismatch",
                    invitationId: invitation.id,
                },
            }).catch(() => { })

            await antiTimingJitter()
            return {
                success: false,
                error: "Este convite foi enviado para outro e-mail. Faça login com a conta correta.",
            }
        }

        // Require email confirmation to avoid fake accounts claiming invites
        if (!user.email_confirmed_at) {
            return { success: false, error: "Valide seu endereço de e-mail antes de aceitar o convite." }
        }

        // 7. RACE CONDITION FIX & ATOMIC CONSUMPTION: Call RPC Transaction
        const { data: rpcResult, error: rpcError } = await admin.rpc(
            "accept_partner_invitation",
            {
                p_invitation_id: invitation.id,
                p_user_id: user.id,
            }
        )

        if (rpcError) {
            console.error("[Invitations] accept RPC error:", rpcError)
            return { success: false, error: "Erro interno ao processar o aceite." }
        }

        if (!rpcResult?.success) {
            return { success: false, error: rpcResult?.error || "Erro ao processar convite." }
        }

        // 8. Create store_members for invited stores (if specified)
        // NOTE: The RPC accept_partner_invitation now handles store_members atomically.
        // This app-side upsert is only a defensive fallback for legacy invites accepted
        // before the RPC upgrade. supabase builders are thenables (no .catch) - use try/catch.
        const storeIds = (invitation.permissions as any)?._store_ids_ as string[] | null
        if (storeIds && storeIds.length > 0) {
            const { data: partnerUser } = await admin
                .from("partner_users")
                .select("id")
                .eq("partner_id", invitation.partner_id)
                .eq("user_id", user.id)
                .maybeSingle()

            if (partnerUser) {
                const memberships = storeIds.map((sid: string) => ({
                    partner_user_id: partnerUser.id,
                    store_id: sid,
                    role: invitation.role,
                    permissions: invitation.permissions,
                }))
                try {
                    await admin.from("store_members").upsert(memberships, {
                        onConflict: "partner_user_id, store_id",
                    })
                } catch (e: any) {
                    console.warn("[Invitations] Failed to create some store_members:", e)
                }
            }
        }

        // 9. Audit log
        await auditLog({
            action: "invite.accepted",
            actorUserId: user.id,
            partnerId: invitation.partner_id,
            targetUserId: invitation.created_by_user_id,
            metadata: {
                invitationId: invitation.id,
                role: invitation.role,
            },
        })

        // 10. Invalidate caches so the new ERP appears immediately in the user's selector
        const { revalidateUserAccess, revalidatePartnerInvitations, revalidateTeamMembers } = await import("@/lib/utils/revalidation")
        revalidateUserAccess(user.id)
        revalidatePartnerInvitations(invitation.partner_id)
        revalidateTeamMembers(invitation.partner_id)

        return { success: true, partnerId: invitation.partner_id }
    } catch (error) {
        console.error("[Invitations] acceptInvitation error:", error)
        return { success: false, error: "Erro ao aceitar convite." }
    }
}

// ─── Revoke Invitation ──────────────────────────────────────────────────────

export async function revokeInvitation(input: {
    invitationId: string
    partnerId: string
}): Promise<{ success: boolean; error?: string }> {
    try {
        await requireRateLimit(RateLimitCategory.INVITE_VALIDATE)
        const user = await requireUser()
        const admin = createAdminClient()

        const access = await requirePartnerAccess(input.partnerId, user)
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { success: false, error: "Sem permissão para revogar este convite." }
        }

        // 2. Load the invitation
        const { data: invitation } = await admin
            .from("partner_invitations")
            .select("id, role, used_at, revoked_at, created_by_role, partner_id")
            .eq("id", input.invitationId)
            .eq("partner_id", input.partnerId) // SECURITY: ensure same tenant
            .single()

        if (!invitation) {
            return { success: false, error: "Convite não encontrado." }
        }

        if (invitation.used_at) {
            return { success: false, error: "Convite já foi utilizado e não pode ser revogado." }
        }

        if (invitation.revoked_at) {
            return { success: false, error: "Convite já foi revogado." }
        }

        // 4. Mark as revoked
        const { error: updateError } = await admin
            .from("partner_invitations")
            .update({
                revoked_at: new Date().toISOString(),
                revoked_by: user.id,
            })
            .eq("id", invitation.id)
            .is("revoked_at", null)

        if (updateError) {
            return { success: false, error: "Erro ao revogar convite." }
        }

        // 5. Audit log
        await auditLog({
            action: "invite.revoked",
            actorUserId: user.id,
            partnerId: input.partnerId,
            metadata: {
                invitationId: invitation.id,
                revokedRole: invitation.role,
            },
        })

        // 6. Invalidate invitation list cache
        const { revalidatePartnerInvitations } = await import("@/lib/utils/revalidation")
        revalidatePartnerInvitations(input.partnerId)

        return { success: true }
    } catch (error) {
        console.error("[Invitations] revokeInvitation error:", error)
        return { success: false, error: "Erro ao revogar convite." }
    }
}

// ─── List Partner Invitations (Audit) ───────────────────────────────────────

export async function listPartnerInvitations(partnerId: string): Promise<{
    success: boolean
    invitations?: any[]
    error?: string
}> {
    try {
        const user = await requireUser()
        const admin = createAdminClient()

        const access = await requirePartnerAccess(partnerId, user)
        if (!can({ role_id: access.roleId, permissions: access.permissions }, "settings.settings_team")) {
            return { success: false, error: "Sem permissão para visualizar convites." }
        }

        const { data, error } = await admin
            .from("partner_invitations")
            .select("id, email, role, created_at, expires_at, used_at, used_by, revoked_at, revoked_by, created_by_user_id, created_by_role, share_url")
            .eq("partner_id", partnerId)
            .order("created_at", { ascending: false })
            .limit(50)

        if (error) {
            return { success: false, error: "Erro ao listar convites." }
        }

        const invitations = data || []
        if (invitations.length > 0) {
            const usedByIds = ([...new Set(invitations.map((i: any) => i.used_by).filter(Boolean))] as string[])
            if (usedByIds.length > 0) {
                const { data: profiles } = await admin
                    .from("user_profiles")
                    .select("user_id, full_name")
                    .in("user_id", usedByIds)
                const nameMap = new Map<string, string>((profiles || []).map((p: any) => [p.user_id, p.full_name]))
                for (const inv of invitations) {
                    if (inv.used_by) {
                        inv.used_by_name = nameMap.get(inv.used_by) || null
                    }
                }
            }
        }

        return { success: true, invitations }
    } catch (error) {
        console.error("[Invitations] listPartnerInvitations error:", error)
        return { success: false, error: "Erro ao listar convites." }
    }
}

// ─── Validate Invitation (without accepting) ────────────────────────────────

export async function validateInvitation(rawToken: string): Promise<{
    valid: boolean
    error?: string
    partnerName?: string
    role?: string
    email?: string
}> {
    try {
        await requireRateLimit(RateLimitCategory.INVITE_VALIDATE)
        const admin = createAdminClient()

        // Validate token format early
        if (!isValidTokenFormat(rawToken)) {
            await antiTimingJitter()
            return { valid: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        const tokenHash = hashToken(rawToken)

        const { data: invitation } = await admin
            .from("partner_invitations")
            .select("id, partner_id, email, role, expires_at, used_at, revoked_at, locked_at")
            .eq("token_hash", tokenHash)
            .single()

        if (!invitation) {
            await antiTimingJitter()
            return { valid: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        // All invalid states return the same generic message
        if (invitation.used_at || invitation.revoked_at || invitation.locked_at || new Date(invitation.expires_at) < new Date()) {
            await antiTimingJitter()
            return { valid: false, error: GENERIC_INVALID_TOKEN_MSG }
        }

        // Get store name for display
        const { data: store } = await admin
            .from("stores")
            .select("name")
            .eq("partner_id", invitation.partner_id)
            .limit(1)
            .maybeSingle()
        const partner = { store_name: store?.name || "Loja" }

        // Audit log (non-blocking)
        const user = await getCurrentUser()
        if (user) {
            auditLog({
                action: "invite.validated",
                actorUserId: user.id,
                partnerId: invitation.partner_id,
                metadata: { invitationId: invitation.id },
            }).catch(() => { })
        }

        // MASK EMAIL: Only return masked version - NEVER the exact email to the client
        let maskedEmail = undefined
        if (invitation.email) {
            const emailParts = invitation.email.split("@")
            if (emailParts.length === 2) {
                const name = emailParts[0]
                const domain = emailParts[1]
                maskedEmail = name.length > 2
                    ? `${name.charAt(0)}***${name.charAt(name.length - 1)}@${domain}`
                    : `${name.charAt(0)}***@${domain}`
            }
        }

        return {
            valid: true,
            partnerName: partner?.store_name || "Loja",
            role: invitation.role,
            email: maskedEmail,
            // NOTE: exactEmail deliberately REMOVED - email comparison happens
            // server-side only in acceptInvitation to prevent information disclosure
        }
    } catch (error) {
        return { valid: false, error: "Erro ao validar convite." }
    }
}
