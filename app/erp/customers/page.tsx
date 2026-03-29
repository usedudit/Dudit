import CustomersPage from "@/components/erp/clientes/CustomersPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { checkPartnerPermission } from "@/lib/auth/authorization"
import { AccessDenied } from "@/components/erp/access-denied"
import { ERPHeader } from "@/components/erp/erp-header"
import { FadeIn } from "@/components/animations/FadeIn"
import { getCurrentUser } from "@/lib/auth/authorization"

export const revalidate = false

export default async function CustomersRoute() {
  const user = await getCurrentUser()
  if (!user) return <AccessDenied />

  const context = (await getCurrentPartnerContext())!
  const partnerId = context.partnerId

  const { allowed } = await checkPartnerPermission(partnerId, "customers", "view")
  if (!allowed) return <AccessDenied />

  const userProfile = {
    fullName: user.email?.split("@")[0] || "Usuário",
    email: user.email || "",
    initials: (user.email?.[0] || "U").toUpperCase(),
    avatarColor: "bg-brand-primary"
  }

  return (
    <>
      <ERPHeader
        pageTitle="Clientes"
        userProfile={userProfile}
      />
      <FadeIn className="p-4">
        <CustomersPage partnerId={partnerId} />
      </FadeIn>
    </>
  )
}