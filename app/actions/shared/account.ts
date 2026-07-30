"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { cookies, headers } from "next/headers"
import { AccountDeletionService } from "@/lib/services/account-deletion.service"

export async function deleteAccountAction(
  userId: string,
  reason: string | null,
  csrf_token?: string
) {
  await requireRateLimit(RateLimitCategory.ACCOUNT_DELETE)

  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  try {
    // 1. Verify that the requesting user is the owner of the account (Security check)
    const user = await requireUser()
    if (user.id !== userId) {
      return { error: "Não autorizado." }
    }

    // 2. Fetch IP, User-Agent, and Country from headers
    const reqHeaders = await headers()
    const userAgent = reqHeaders.get("user-agent")
    const forwarded = reqHeaders.get("x-forwarded-for")
    const ip = forwarded ? forwarded.split(",")[0].trim() : reqHeaders.get("x-real-ip") || "unknown"
    const country = reqHeaders.get("cf-ipcountry") || "BR"

    // 3. Delegate execution to AccountDeletionService
    const result = await AccountDeletionService.requestDeletion(
      userId,
      reason,
      ip,
      userAgent,
      country
    )

    if (!result.success) {
      return { error: result.error || "Erro ao registrar solicitação de exclusão." }
    }

    // Clear session cookies so the middleware fast-fail catches the next request immediately
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    for (const c of allCookies) {
      if (c.name.startsWith("sb-")) {
        cookieStore.delete(c.name)
      }
    }
    cookieStore.delete("active_partner_id")

    // Set flag so middleware only queries account_deletions when necessary
    cookieStore.set("x-account-deleting", "true", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    })

    revalidatePath("/erp/settings/subscription")
    return { success: true }
  } catch (error: any) {
    console.error("General error in deleteAccountAction:", error)
    return { error: "Ocorreu um erro inesperado." }
  }
}

export async function getAccountDeletionDryRunAction(csrf_token?: string) {
  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  try {
    const user = await requireUser()
    const result = await AccountDeletionService.executeDryRun(user.id)
    if (!result.success) {
      return { error: result.error || "Erro ao gerar simulação." }
    }
    return { success: true, report: result.report }
  } catch (error: any) {
    console.error("General error in getAccountDeletionDryRunAction:", error)
    return { error: "Ocorreu um erro inesperado." }
  }
}
