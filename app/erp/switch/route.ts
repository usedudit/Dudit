import { NextResponse } from "next/server"
import { clearActivePartner, getAllUserPartnerAccess, setActivePartner } from "@/lib/auth/partner-context"

/**
 * Route handler used to explicitly force the user out of their current ERP context.
 * It clears the active_partner_id cookie and redirects to /select-erp.
 * This is used by the "Central do Parceiro" button in the marketplace header.
 * 
 * Performance: If exactly 1 ERP is found, it auto-selects it and goes to dashboard.
 */
export async function GET(request: Request) {
    const allAccess = await getAllUserPartnerAccess()

    // Força a base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dudit.com.br"

    if (allAccess.length === 1) {
        await setActivePartner(allAccess[0].partnerId)
        return NextResponse.redirect(`${baseUrl}/erp/dashboard`)
    }

    await clearActivePartner()
    return NextResponse.redirect(`${baseUrl}/select-erp`)
}
