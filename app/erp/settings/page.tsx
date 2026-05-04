import { redirect } from "next/navigation"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { SettingsTabs } from "@/components/erp/settings/SettingsPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { requireUser } from "@/lib/auth/authorization"
import { getPartnerPaymentMethodsCached } from "@/lib/data/partner"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { createAdminClient } from "@/lib/supabase/server"
import { ROLE_HIERARCHY } from "@/lib/permissions/partner-roles"
import type { PartnerRole } from "@/lib/permissions/types"
import { decryptCPF } from "@/lib/crypto"

export default async function SettingsPage() {
  await requireUser()

  // SECURITY: restricted to management roles
  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  const userRole = context.role as PartnerRole
  if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.MANAGER) {
    return <AccessDenied />
  }

  const supabase = createAdminClient()
  const { data: partner } = await supabase
    .from("partners")
    .select("*, addresses(*)")
    .maybeSingle()

  if (!partner) return <AccessDenied />

  // Decrypt CPF for display
  if (partner.cpf) {
    try {
      partner.cpf = await decryptCPF(partner.cpf)
    } catch (e) {
      console.error("[Settings] Error decrypting partner CPF:", e)
    }
  }

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
        <SettingsTabs partner={partner} paymentMethods={paymentMethods || []} role={context.role} />
      </FadeIn>
    </>
  )
}
