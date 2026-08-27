import type React from "react"
import type { Metadata } from "next"
import { ERPSidebar } from "@/components/erp/ERPSidebar"
import { ERPResourceGuard } from "@/components/erp/ERPResourceGuard"
import { ERPHeader } from "@/components/erp/ERPHeader"
import { SidebarProvider } from "@/lib/sidebar-context"
import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { NotificationsRealtimeProvider } from "@/providers/notifications-realtime-provider"

export const metadata: Metadata = {
  title: "Gerenciamento",
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
  getActiveStoreId,
} from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import { OfflineBanner } from "@/components/pwa/OfflineBanner"
import { LimitStatusWidget } from "@/components/erp/LimitStatusWidget"
import type { PartnerRole, PartnerRoutePermissions } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"

import { listStoresAction } from "@/app/actions/erp/stores"
import { createAdminClient } from "@/lib/supabase/server"
import { ERPOnboardingFeedbackModal } from "@/components/erp/ERPOnboardingFeedbackModal"

export default async function ERPLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser() // Ensure authenticated - single auth call for the entire ERP tree

  // Stage 1: Parallel fetch profile avatar & partner access
  const [profileDataRes, allAccess] = await Promise.all([
    createAdminClient()
      .from("user_profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(
        (res: any) => res,
        () => ({ data: null, error: null })
      ),
    getAllUserPartnerAccess(user),
  ])

  const userProfile = {
    fullName: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary",
    imageUrl: profileDataRes?.data?.avatar_url || null,
  }

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

  // If no valid cookie, auto-resolve only if the single ERP belongs to the user
  const hasNonOwnAccess = allAccess.some((a: typeof allAccess[number]) => a.roleId !== "owner")
  if (!context && (allAccess.length === 1) && !hasNonOwnAccess) {
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
  // Owner is a code-side override: do not let "all-false stored JSON"
  // from RBAC template hide the OWNER preset in the UI.
  const routePermissions: PartnerRoutePermissions =
    context.roleId === "owner" ? normalizeToRoutePermissions(role, null) : normalizeToRoutePermissions(role, context.permissions)

  // Stage 2: Parallel fetch partner plan, initial stores, store cookie, and sidebar cookie
  const [partnerPlan, initialStoresRes, activeStoreId, cookieStore] = await Promise.all([
    getPartnerPlan(context.partnerId),
    listStoresAction(context.partnerId).catch(e => {
      console.error("Error pre-fetching stores in layout:", e)
      return []
    }),
    getActiveStoreId(),
    cookies(),
  ])

  const initialStores = initialStoresRes || []
  const sidebarCookie = cookieStore.get("dudit_sidebar_state")
  const initialExpanded = sidebarCookie ? sidebarCookie.value === "expanded" : true

  const effectiveActiveStoreId = (activeStoreId && initialStores.some(s => s.id === activeStoreId))
    ? activeStoreId
    : (initialStores.length > 0 ? (initialStores.find(s => s.is_headquarters)?.id || initialStores[0].id) : null)

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ProductMetadataProvider>
        <NotificationsRealtimeProvider>
          <PermissionProvider
            role={role}
            routePermissions={routePermissions}
            partnerId={context.partnerId}
            businessInfo={context.businessInfo}
            planSlug={partnerPlan.slug}
          >
            <PlanUpgradeProvider>
              <StoreProvider partnerId={context.partnerId} activeStoreId={effectiveActiveStoreId} initialStores={initialStores}>
                <SidebarProvider initialExpanded={initialExpanded}>
                  <div className="flex h-screen bg-brand-page-bg dark:bg-brand-page-bg text-brand-dark dark:text-white transition-colors duration-200">
                    <ERPSidebar />
                    <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                      <OfflineBanner variant="erp" />
                      <ERPHeader userProfile={userProfile} />
                      <ERPResourceGuard>
                        {children}
                      </ERPResourceGuard>
                    </div>
                  </div>
                  <LimitStatusWidget />
                  <ERPOnboardingFeedbackModal
                    partnerId={context.partnerId}
                    partnerPlan={partnerPlan.slug}
                    userRole={role}
                  />
                </SidebarProvider>
              </StoreProvider>
            </PlanUpgradeProvider>
          </PermissionProvider>
        </NotificationsRealtimeProvider>
      </ProductMetadataProvider>
    </ThemeProvider>
  )
}
