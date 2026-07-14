"use server"

import { revalidatePath } from "next/cache"
import { requireUser } from "@/lib/auth/authorization"
import { AccountDeletionService } from "@/lib/services/account-deletion.service"

export async function cancelDeletionAction(csrf_token?: string) {
  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  try {
    const user = await requireUser()
    const result = await AccountDeletionService.cancelDeletion(user.id)

    if (!result.success) {
      return { error: result.error || "Erro ao cancelar a solicitação de exclusão." }
    }

    revalidatePath("/erp/settings/subscription")
    return { success: true }
  } catch (error: any) {
    console.error("General error in cancelDeletionAction:", error)
    return { error: "Ocorreu um erro inesperado." }
  }
}
