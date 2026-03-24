"use server"

/**
 * Step-up authentication server action.
 * Admin re-enters password to get a short-lived token for critical actions.
 */

import { requireAdmin } from "@/lib/auth/admin-authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { createStepUpToken } from "@/lib/admin/step-up-auth"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"

export async function requestStepUpToken(
    password: string
): Promise<{ success: boolean; token?: string; error?: string }> {
    const admin = await requireAdmin("moderator")
    await requireRateLimit(RateLimitCategory.ADMIN_STEP_UP)

    try {
        const token = await createStepUpToken(admin.userId, admin.email, password)

        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.ADMIN_STEP_UP,
            targetType: "system",
            metadata: { action: "step_up_token_created" },
        })

        return { success: true, token }
    } catch (error: any) {
        // Log failed attempt
        await adminAuditLog({
            adminUserId: admin.userId,
            actionType: AdminActionType.ADMIN_LOGIN_FAILED,
            targetType: "system",
            metadata: { action: "step_up_failed", reason: error?.message },
        })

        return { success: false, error: error?.message || "Autenticação falhou" }
    }
}
