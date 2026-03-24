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

    // Redirect to the dashboard if they only have 1 ERP
    if (allAccess.length === 1) {
        await setActivePartner(allAccess[0].partnerId)
        const origin = new URL(request.url).origin
        return NextResponse.redirect(`${origin}/erp/dashboard`)
    }

    // Otherwise, clear and go to selection screen
    await clearActivePartner()
    const origin = new URL(request.url).origin
    return NextResponse.redirect(`${origin}/select-erp`)
}
