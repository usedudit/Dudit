// Server component for Returns & Exchanges ERP page
import { ERPPageHeader } from "@/components/erp/page-header-state"
import ReturnsPage from "@/components/erp/returns/ReturnsPage"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { AccessDenied } from "@/components/erp/access-denied"
import { FadeIn } from "@/components/animations/FadeIn"

export const dynamic = "force-dynamic"

export default async function ReturnsPageServer() {
  const context = await getCurrentPartnerContext()
  if (!context) return <AccessDenied />

  const { partnerId, roleId } = context

  // Delivery role has no access at all
  if (roleId === "delivery") {
    return <AccessDenied />
  }

  return (
    <>
      <ERPPageHeader title="Trocas e Devoluções" />
      <FadeIn className="p-4">
        <ReturnsPage
          partnerId={partnerId}
          roleId={roleId}
        />
      </FadeIn>
    </>
  )
}
