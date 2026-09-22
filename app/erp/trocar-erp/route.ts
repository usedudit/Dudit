import { NextRequest, NextResponse } from "next/server"
import { clearActivePartner, getAllUserPartnerAccess, setActivePartner } from "@/lib/auth/partner-context"
import { getCurrentUser } from "@/lib/auth/authorization"

/**
 * Route handler used to explicitly force the user out of their current ERP context.
 * It clears the active_partner_id cookie and redirects to /select-erp.
 * This is used by the "Central do Vendedor" button in the marketplace header.
 *
 * Performance: If exactly 1 ERP is found, it auto-selects it and goes to dashboard.
 */
function getOrigin(request: NextRequest): string {
    const envOrigin = process.env.NEXT_PUBLIC_APP_URL
    if (envOrigin) return envOrigin
    return request.nextUrl.origin
}

export async function GET(request: NextRequest) {
    const user = await getCurrentUser()
    if (!user) {
        return NextResponse.redirect(`${getOrigin(request)}/auth/login?mode=partner`)
    }

    const allAccess = await getAllUserPartnerAccess(user)

    // Only auto-select if the single ERP belongs to the user
    if (allAccess.length === 1 && allAccess[0].roleId === "owner") {
        await setActivePartner(allAccess[0].partnerId)
        return NextResponse.redirect(`${getOrigin(request)}/erp/inicio`)
    }

    await clearActivePartner()
    return NextResponse.redirect(`${getOrigin(request)}/select-erp`)
}
