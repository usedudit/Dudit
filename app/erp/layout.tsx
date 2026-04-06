import type React from "react"
import type { Metadata } from "next"
import { ERPSidebar } from "@/components/erp/ERPSidebar"
import { ERPHeader } from "@/components/erp/ERPHeader"
import { SidebarProvider } from "@/lib/sidebar-context"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export const metadata: Metadata = {
  title: "Dudit - Gerenciamento",
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = "force-dynamic"

import { ThemeProvider } from "@/components/theme-provider"
import { StoreProvider } from "@/lib/store-context"
import { PermissionProvider } from "@/lib/permission-context"
import { ProductMetadataProvider } from "@/lib/product-metadata-context"
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import {
  getAllUserPartnerAccess,
  getActivePartnerId,
} from "@/lib/auth/partner-context"
import { ROUTE_PERMISSION_PRESETS, legacyToRoutePermissions } from "@/lib/permissions/route-permissions"
import type { PartnerRole, PartnerRoutePermissions } from "@/lib/permissions/types"

export default async function ERPLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUser() // Ensure authenticated — single auth call for the entire ERP tree
  const user = await getCurrentUser()

  const userProfile = user ? {
    fullName: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary"
  } : undefined

  // Single call to get all partner access (cached for child pages via React cache)
  const allAccess = await getAllUserPartnerAccess()

  // No ERP access at all → redirect to partner login/registration
  if (allAccess.length === 0) {
    redirect("/auth/login?mode=partner")
  }

  // Check if user has the active_partner_id cookie set
  const activePartnerId = await getActivePartnerId()

  let context: { partnerId: string; role: PartnerRole; permissions: any; businessInfo: any } | null = null

  if (activePartnerId) {
    // Validate cookie against actual access
    const match = allAccess.find((a: typeof allAccess[number]) => a.partnerId === activePartnerId)
    if (match) {
      context = { partnerId: match.partnerId, role: match.role, permissions: match.permissions, businessInfo: match.businessInfo }
    }
  }

  // If no valid cookie, auto-resolve if exactly 1 ERP
  if (!context && (allAccess.length === 1)) {
    const match = allAccess[0]
    context = { partnerId: match.partnerId, role: match.role, permissions: match.permissions, businessInfo: match.businessInfo }
  }

  if (!context) {
    // Multiple ERPs without valid cookie, or guest without own partner → select-erp
    return redirect("/select-erp")
  }

  // ── Resolve route permissions ──
  const role = (context.role || "OWNER") as PartnerRole
  let routePermissions: PartnerRoutePermissions

  // If the user has legacy-format permissions, convert them; otherwise use role preset
  if (context.permissions && typeof context.permissions === "object") {
    routePermissions = legacyToRoutePermissions(context.permissions, role)
  } else {
    routePermissions = ROUTE_PERMISSION_PRESETS[role]
  }

  // Read sidebar cookie
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get("dudit_sidebar_state")
  const initialExpanded = sidebarCookie ? sidebarCookie.value === "expanded" : true

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ProductMetadataProvider>
        <PermissionProvider role={role} routePermissions={routePermissions} partnerId={context.partnerId} businessInfo={context.businessInfo}>
          <StoreProvider partnerId={context.partnerId}>
            <SidebarProvider initialExpanded={initialExpanded}>
              <div className="flex h-screen bg-brand-page-bg dark:bg-brand-page-bg text-brand-dark dark:text-white transition-colors duration-200">
                <ERPSidebar />
                <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                  <ERPHeader userProfile={userProfile} />
                  {children}
                </div>
              </div>
            </SidebarProvider>
          </StoreProvider>
        </PermissionProvider>
      </ProductMetadataProvider>
    </ThemeProvider>
  )
}
