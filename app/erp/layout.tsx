import type React from "react"
import type { Metadata } from "next"
import { ERPSidebar } from "@/components/erp/ERPSidebar"
import { ERPResourceGuard } from "@/components/erp/ERPResourceGuard"
import { ERPHeader } from "@/components/erp/ERPHeader"
import { ERPContentRegion } from "@/components/erp/ERPContentRegion"
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
import {
  getPartnerPlan,
  getPartnerSubscriptionBannerInfo,
  PAST_DUE_GRACE_PERIOD_DAYS,
} from "@/lib/services/subscription.service"
import { getErpRequestContext } from "@/lib/auth/erp-context"
import { normalizeToRoutePermissions } from "@/lib/permissions/route-permissions"
import { resolveEffectivePermissions } from "@/lib/store-members"
import { OfflineBanner } from "@/components/pwa/OfflineBanner"
import { LimitStatusWidget } from "@/components/erp/LimitStatusWidget"
import type { PartnerRole, PartnerRoutePermissions } from "@/lib/permissions/types"
import type { RoleId } from "@/lib/permissions/rbac-types"

import { normalizeBusinessInfo } from "@/lib/business-info"
import { listStoresAction } from "@/app/actions/erp/stores"
import { createAdminClient } from "@/lib/supabase/server"
import { ERPOnboardingFeedbackModal } from "@/components/erp/ERPOnboardingFeedbackModal"

export default async function ERPLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireUser() // Ensure authenticated - single auth call for the entire ERP tree

  // Resolve the canonical ERP context while the layout is fetching its shell
  // data. Pages under this layout call the same React-cached helper, so they
  // reuse this result instead of running the live access/store checks again.
  const erpContextPromise = getErpRequestContext()

  // Stage 1: Parallel fetch profile avatar & partner access
  const [profileDataRes, allAccess] = await Promise.all([
    createAdminClient()
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(
        (res: any) => res,
        () => ({ data: null, error: null })
      ),
    getAllUserPartnerAccess(),
  ])

  const userProfile = {
    fullName: profileDataRes?.data?.full_name || user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (profileDataRes?.data?.full_name?.[0] || user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary",
    imageUrl: null,
  }

  const hasOwnPartner = allAccess.some((a: typeof allAccess[number]) => a.roleId === "owner")

  // No ERP access at all → redirect to partner login/registration
  // If active_partner_id cookie is set, skip redirect - the partner was likely
  // just created and the cache may be stale. The cookie-based resolution below
  // will handle it or fall through to select-erp.
  const activePartnerId = await getActivePartnerId()
  if (allAccess.length === 0 && !activePartnerId) {
    redirect("/auth/login?mode=partner")
  }

  // If user has no own ERP, force explicit selection before entering ERP.
  if (!hasOwnPartner && !activePartnerId) {
    redirect("/select-erp")
  }

  let context: { partnerId: string; roleId: RoleId; role: PartnerRole; permissions: any; businessInfo: any } | null = await erpContextPromise

  if (activePartnerId) {
    // Validate cookie against actual access
    const match = allAccess.find((a: typeof allAccess[number]) => a.partnerId === activePartnerId)
    if (match) {
      const role = String(match.roleId || "delivery").toUpperCase() as PartnerRole
      context = { partnerId: match.partnerId, roleId: match.roleId as RoleId, role, permissions: match.permissions, businessInfo: match.businessInfo }
    } else if (allAccess.length === 0 && activePartnerId) {
      // Cache stale: partner was just created but unstable_cache hasn't been
      // invalidated yet. Query DB directly to avoid redirecting to login.
      const admin = createAdminClient()
      const { getPermissionTemplate } = await import("@/lib/permissions/rbac-template-loader")
      const { normalizePermissions } = await import("@/lib/permissions/rbac-normalize")
      const template = await getPermissionTemplate()

      const { data: freshPartner } = await admin
        .from("partners")
        .select("id, user_id, business_info, is_active, erp_disabled, suspended_at")
        .eq("id", activePartnerId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (freshPartner && freshPartner.is_active && !freshPartner.erp_disabled && !freshPartner.suspended_at) {
        const { data: freshStore } = await admin
          .from("stores")
          .select("id, name, is_active, suspended_at")
          .eq("partner_id", activePartnerId)
          .eq("is_active", true)
          .is("suspended_at", null)
          .order("is_headquarters", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (freshStore) {
          context = {
            partnerId: freshPartner.id,
            roleId: "owner" as RoleId,
            role: "OWNER" as PartnerRole,
            permissions: normalizePermissions(template, {}),
            businessInfo: normalizeBusinessInfo(freshPartner.business_info),
          }
        }
      }
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
  let role = (context.role || "DELIVERY") as PartnerRole
  // Owner is a code-side override: do not let "all-false stored JSON"
  // from RBAC template hide the OWNER preset in the UI.
  let routePermissions: PartnerRoutePermissions =
    context.roleId === "owner" ? normalizeToRoutePermissions(role, null) : normalizeToRoutePermissions(role, context.permissions)

  const businessMode = normalizeBusinessInfo(context.businessInfo).mode
  const isDesapego = businessMode === "desapego"

  // Stage 2: Parallel fetch partner plan, subscription banner state, initial stores, store cookie, and sidebar cookie
  const [partnerPlan, subscriptionBanner, initialStoresRes, activeStoreId, cookieStore] = await Promise.all([
    getPartnerPlan(context.partnerId),
    getPartnerSubscriptionBannerInfo(context.partnerId).catch(() => null),
    isDesapego
      ? createAdminClient()
          .from("stores")
          .select("*, addresses!store_id(id, zip_code, street, number, complement, neighborhood, city, state, is_default)")
          .eq("partner_id", context.partnerId)
          .limit(1)
          .then((res: any) => {
            const data = res?.data
            if (!data || data.length === 0) return []
            const store = data[0]
            const { addresses, ...rest } = store
            const addrList = Array.isArray(addresses) ? addresses : []
            const address = addrList.find((a: any) => a.is_default) || addrList[0] || null
            const merged: any = { ...rest, addresses: addrList }
            if (address) {
              merged.zip_code = address.zip_code ?? null
              merged.street = address.street ?? null
              merged.number = address.number ?? null
              merged.complement = address.complement ?? null
              merged.neighborhood = address.neighborhood ?? null
              merged.city = address.city ?? null
              merged.state = address.state ?? null
            }
            return [merged]
          })
          .catch((e: any) => {
            console.error("Error pre-fetching single store in desapego mode:", e)
            return []
          })
      : listStoresAction(context.partnerId).catch((e: any) => {
          console.error("Error pre-fetching stores in layout:", e)
          return []
        }),
    isDesapego ? Promise.resolve(null) : getActiveStoreId(),
    cookies(),
  ])

  const initialStores: any[] = initialStoresRes || []
  const sidebarCookie = cookieStore.get("dudit_sidebar_state")
  const initialExpanded = sidebarCookie ? sidebarCookie.value === "expanded" : true

  // Days left in the 3-day grace period (past_due subscriptions).
  const graceDaysLeft = (() => {
    if (subscriptionBanner?.status !== "past_due") return null
    const anchor = subscriptionBanner.past_due_at
      ? new Date(subscriptionBanner.past_due_at)
      : new Date()
    const deadline =
      anchor.getTime() + PAST_DUE_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000
    return Math.max(0, Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000)))
  })()

  const effectiveActiveStoreId = (activeStoreId && initialStores.some((s: any) => s.id === activeStoreId))
    ? activeStoreId
    : (initialStores.length > 0 ? (initialStores.find((s: any) => s.is_headquarters)?.id || initialStores[0].id) : null)

  // ── Resolve store-level permissions ──
  // For non-owner users, override partner-level role with the store-specific role
  // from store_members table. This ensures the UI reflects the actual per-store access.
  if (context.roleId !== "owner" && effectiveActiveStoreId) {
    const storeEffective = await resolveEffectivePermissions(context.partnerId, effectiveActiveStoreId)
    if (storeEffective) {
      context.roleId = storeEffective.role.toLowerCase() as RoleId
      context.role = storeEffective.role as PartnerRole
      context.permissions = storeEffective.permissions
      role = storeEffective.role as PartnerRole
      routePermissions = normalizeToRoutePermissions(role, context.permissions)
    }
  }

  return (
      <ProductMetadataProvider>
        <NotificationsRealtimeProvider>
          <PermissionProvider
            role={role}
            routePermissions={routePermissions}
            partnerId={context.partnerId}
            businessInfo={context.businessInfo}
            planSlug={partnerPlan.slug}
            roleId={context.roleId}
            permissions={context.permissions}
          >
            <PlanUpgradeProvider>
              <StoreProvider partnerId={context.partnerId} activeStoreId={effectiveActiveStoreId} initialStores={initialStores}>
                <SidebarProvider initialExpanded={initialExpanded}>
                  <div className="flex h-screen overflow-hidden bg-brand-page-bg dark:bg-brand-page-bg text-brand-dark dark:text-white transition-colors duration-200">
                    <ERPSidebar />
                    <div className="relative flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                      <OfflineBanner variant="erp" />
                      <ERPHeader
                        userProfile={userProfile}
                        subscription={{
                          status: subscriptionBanner?.status ?? null,
                          graceDaysLeft,
                          planName: subscriptionBanner?.plan_name ?? partnerPlan.name ?? null,
                          trialEnd: subscriptionBanner?.trial_end ?? null,
                        }}
                      />
                      {/*
                        Região de conteúdo do ERP.

                        O shell NÃO rola: o header fica fixo e a região é quem
                        controla o scroll. Ela alterna entre dois modos:

                        - conteúdo normal (listas, grids, dashboard...): o
                          conteúdo flui e a scrollbar fica na borda da tela;
                        - entidade (?view/?edit/?create/?duplicate): a página
                          preenche a região e rola por dentro, logo abaixo do
                          ERPHeader.
                      */}
                      <ERPContentRegion>
                        <ERPResourceGuard>
                          {children}
                        </ERPResourceGuard>
                      </ERPContentRegion>
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
  )
}
