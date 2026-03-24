"use server"

import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/authorization"
import { setActivePartner } from "@/lib/auth/partner-context"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"

/**
 * Server action to select an ERP and set the active partner cookie.
 * Validates that the current user has access to the selected partner.
 */
export async function selectErpAction(formData: FormData): Promise<void> {
    const partnerId = formData.get("partnerId") as string

    if (!partnerId || typeof partnerId !== "string") {
        throw new Error("Partner ID inválido.")
    }

    // Validate the user actually has access to this partner using the unified helper
    const { getAllUserPartnerAccess } = await import("@/lib/auth/partner-context")
    const allAccess = await getAllUserPartnerAccess()
    const hasAccess = allAccess.some((a) => a.partnerId === partnerId)

    if (!hasAccess) {
        throw new Error("Você não tem acesso a este ERP.")
    }

    await setActivePartner(partnerId)
    redirect("/erp/dashboard")
}
