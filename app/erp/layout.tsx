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
import { PlanUpgradeProvider } from "@/components/erp/subscription/PlanUpgradeModal"
import { StoreProvider } from "@/lib/store-context"
import { PermissionProvider } from "@/lib/permission-context"
import { ProductMetadataProvider } from "@/lib/product-metadata-context"
import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import {
  getAllUserPartnerAccess,
  getActivePartnerId,
} from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import type { PartnerRole, PartnerRoutePermissions } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"

export default async function ERPLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUser() // Ensure authenticated - single auth call for the entire ERP tree
  const user = await getCurrentUser()

  const userProfile = user ? {
    fullName: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary"
  } : undefined

  // Single call to get all partner access (cached for child pages via React cache)
  const allAccess = await getAllUserPartnerAccess()
  const hasOwnPartner = allAccess.some((a: typeof allAccess[number]) => a.roleId === "owner")

  // No ERP access at all → redirect to partner login/registration
  if (allAccess.length === 0) {
    redirect("/auth/login?mode=partner")
  }

  // Check if user has the active_partner_id cookie set
  const activePartnerId = await getActivePartnerId()

  // If user has no own ERP, force explicit selection before entering ERP.
  if (!hasOwnPartner && !activePartnerId) {
    redirect("/select-erp")
  }

  let context: { partnerId: string; roleId: RoleId; role: PartnerRole; permissions: any; businessInfo: any } | null = null

  if (activePartnerId) {
    // Validate cookie against actual access
    const match = allAccess.find((a: typeof allAccess[number]) => a.partnerId === activePartnerId)
    if (match) {
      const role = String(match.roleId || "delivery").toUpperCase() as PartnerRole
      context = { partnerId: match.partnerId, roleId: match.roleId as RoleId, role, permissions: match.permissions, businessInfo: match.businessInfo }
    }
  }

  // If no valid cookie, auto-resolve if exactly 1 ERP (only for users with own ERP).
  if (!context && (allAccess.length === 1) && hasOwnPartner) {
    const match = allAccess[0]
    const role = String(match.roleId || "delivery").toUpperCase() as PartnerRole
    context = { partnerId: match.partnerId, roleId: match.roleId as RoleId, role, permissions: match.permissions, businessInfo: match.businessInfo }
  }

  if (!context) {
    // Multiple ERPs without valid cookie, or guest without own partner → select-erp
    return redirect("/select-erp")
  }

  // ── Resolve route permissions ──
  const role = (context.role || "DELIVERY") as PartnerRole
  const routePermissions: PartnerRoutePermissions = normalizeToRoutePermissions(role, context.permissions)

  // Read sidebar cookie
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get("dudit_sidebar_state")
  const initialExpanded = sidebarCookie ? sidebarCookie.value === "expanded" : true

  const partnerPlan = await getPartnerPlan(context.partnerId)

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ProductMetadataProvider>
        <PermissionProvider
          role={role}
          routePermissions={routePermissions}
          partnerId={context.partnerId}
          businessInfo={context.businessInfo}
          planSlug={partnerPlan.slug}
        >
          <PlanUpgradeProvider>
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
          </PlanUpgradeProvider>
        </PermissionProvider>
      </ProductMetadataProvider>
    </ThemeProvider>
  )
}
