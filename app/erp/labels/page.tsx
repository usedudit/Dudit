import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { redirect } from "next/navigation"
import LabelsPageClient from "@/components/erp/labels/LabelsPageClient"

export default async function LabelsPage() {
  const context = await getCurrentPartnerContext()
  if (!context) redirect("/dashboard")

  const plan = await getPartnerPlan(context.partnerId)
  const isFreePlan = plan.slug.toLowerCase() === "free"

  return <LabelsPageClient isFree={isFreePlan} />
}
