import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function DeliveryAssignmentPage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params
  redirect(`/entregadores/entregas?view=${assignmentId}`)
}
