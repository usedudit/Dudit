import { redirect } from "next/navigation"
import { ERPHeader } from "@/components/erp/erp-header"
import { SettingsTabs } from "@/components/erp/settings/SettingsTabs"
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
    redirect("/dashboard")
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
      <ERPHeader
        pageTitle="Configurações"
        userProfile={{
          fullName: user.email?.split("@")[0] || "Usuário",
          email: user.email || "",
          initials: (user.email?.[0] || "U").toUpperCase(),
          avatarColor: "bg-brand-primary",
        }}
      />
      <FadeIn className="p-4">
        <SettingsTabs partner={partner} paymentMethods={paymentMethods?.map((pm: any) => pm.payment_method) || []} />
      </FadeIn>
    </>
  )
}
