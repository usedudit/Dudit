import { notFound } from "next/navigation"
import { getMyDeliveryAssignmentAction } from "@/app/actions/delivery-drivers"
import DeliveryAssignmentDetail from "@/components/delivery/DeliveryAssignmentDetail"

export default async function DeliveryAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  const result = await getMyDeliveryAssignmentAction(assignmentId)
  if (!result.success) notFound()
  return <DeliveryAssignmentDetail assignment={result.data} />
}
