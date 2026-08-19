import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getMyDeliveryAssignmentAction } from "@/app/actions/delivery-drivers"
import DeliveryAssignmentDetail from "@/components/delivery/DeliveryAssignmentDetail"

export const metadata: Metadata = {
  title: "Detalhes da Entrega",
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = "force-dynamic"

export default async function DeliveryAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const result = await getMyDeliveryAssignmentAction(assignmentId)
  if (!result.success || !result.data) notFound()
  return <DeliveryAssignmentDetail assignment={result.data as any} />
}
