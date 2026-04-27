import { redirect } from "next/navigation"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { SettingsTabs } from "@/components/erp/settings/SettingsPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { requireUser } from "@/lib/auth/authorization"
import { getPartnerPaymentMethodsCached } from "@/lib/data/partner"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { ROLE_HIERARCHY } from "@/lib/permissions/partner-roles"

export default async function SettingsPage() {
  await requireUser()

  // SECURITY: restricted to management roles
  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  if (ROLE_HIERARCHY[context.role] < ROLE_HIERARCHY.MANAGER) {
    return <AccessDenied />
  }

  const supabase = await getSupabaseServerClient()
  const { data: partner } = await supabase
    .from("partners")
    .select("*, addresses(*)")
    .eq("id", context.partnerId)
    .maybeSingle()

  if (!partner) return <AccessDenied />

  if (partner.addresses && partner.addresses.length > 0) {
    const defaultAddress = partner.addresses.find((a: any) => a.is_default) || partner.addresses[0]
    partner.zip_code = defaultAddress.zip_code
    partner.street = defaultAddress.street
    partner.number = defaultAddress.number
    partner.complement = defaultAddress.complement
    partner.neighborhood = defaultAddress.neighborhood
    partner.city = defaultAddress.city
    partner.state = defaultAddress.state
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
