import { redirect } from "next/navigation"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { SettingsTabs } from "@/components/erp/settings/SettingsPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { requireUser } from "@/lib/auth/authorization"
import { getPartnerByUserIdCached, getPartnerPaymentMethodsCached } from "@/lib/data/partner"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { ROLE_HIERARCHY } from "@/lib/permissions/partner-roles"
import { AccessDenied } from "@/components/erp/access-denied"
import type { PartnerRole } from "@/lib/permissions/types"

export default async function SettingsPage() {
  // Auth + partner via cached functions (deduplicated with layout)
  const user = await requireUser()
  const partner = await getPartnerByUserIdCached(user.id)

  if (!partner) {
    redirect("/auth/login?mode=partner")
  }

  // SECURITY: Only MANAGER+ can access settings
  const context = await getCurrentPartnerContext()
  if (context) {
    const userRole = context.role as PartnerRole
    if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.MANAGER) {
      return <AccessDenied />
    }
  }

  const paymentMethods = await getPartnerPaymentMethodsCached(partner.id)

  return (
    <>
      <ERPPageHeader title="Configurações" />
      <FadeIn className="p-4">
        <SettingsTabs partner={partner} paymentMethods={paymentMethods || []} />
      </FadeIn>
    </>
  )
}
