"use server"

import { redirect } from "next/navigation"
import { requireUser } from "@/lib/auth/authorization"
import { setActivePartner, setActiveStore } from "@/lib/auth/partner-context"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getAllUserStoreAccess } from "@/lib/auth/partner-context"

/**
 * Server action to select an ERP and set the active partner/store cookies.
 * Validates that the current user has access to the selected partner and store.
 */
export async function selectErpAction(formData: FormData): Promise<void> {
    const partnerId = formData.get("partnerId") as string
    const storeId = formData.get("storeId") as string | null

    if (!partnerId || typeof partnerId !== "string") {
        throw new Error("Partner ID inválido.")
    }

    // Validate the user actually has access to this partner using the unified helper
    const allAccess = await getAllUserStoreAccess()
    const hasAccess = allAccess.some((a) => a.partnerId === partnerId)

    if (!hasAccess) {
        throw new Error("Você não tem acesso a este ERP.")
    }

    await setActivePartner(partnerId)
    
    if (storeId && typeof storeId === "string") {
        // Verify the store belongs to the partner and user has access
        const storeAccess = allAccess.find(a => a.storeId === storeId && a.partnerId === partnerId)
        if (storeAccess) {
            await setActiveStore(storeId)
        }
    }
    
    redirect("/erp/inicio")
}
