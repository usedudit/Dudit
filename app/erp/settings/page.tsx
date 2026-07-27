import { redirect } from "next/navigation"
import { ERPPageHeader } from "@/components/erp/page-header-state"
import { SettingsTabs } from "@/components/erp/settings/SettingsPage"
import { FadeIn } from "@/components/animations/FadeIn"
import { requireUser } from "@/lib/auth/authorization"
import { getPartnerPaymentMethodsCached } from "@/lib/data/partner"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { createAdminClient } from "@/lib/supabase/server"
import { can } from "@/lib/permissions/can"
import { decryptCPF } from "@/lib/crypto"

export default async function SettingsPage() {
  await requireUser()

  // SECURITY: restricted to management roles
  const context = await getCurrentPartnerContext()
  if (!context) {
    redirect("/select-erp")
  }
  if (!can({ role_id: context.roleId, permissions: context.permissions }, "settings.view")) {
    return <AccessDenied />
  }

  const supabase = createAdminClient()
  const { data: rawPartner } = await supabase
    .from("partners")
    .select("*")
    .eq("id", context.partnerId)
    .maybeSingle()

  if (!rawPartner) return <AccessDenied />

  const { data: store } = await supabase
    .from("stores")
    .select("*, addresses!store_id!left(id, zip_code, street, number, complement, neighborhood, city, state, is_default)")
    .eq("partner_id", context.partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const partner: any = {
    ...rawPartner,
    store,
    store_name: store?.name,
    store_description: store?.description,
    store_image_url: store?.logo_url,
    banner_url: store?.banner_url,
    opening_hours: store?.opening_hours,
    phone: store?.phone,
    addresses: store?.addresses || [],
  }

  // Decrypt CPF from store for display
  if (store?.cpf) {
    try {
      partner.store_cpf = await decryptCPF(store.cpf)
    } catch (e) {
      console.error("[Settings] Error decrypting store CPF:", e)
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
