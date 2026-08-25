import { redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function AvailableDeliveryOfferPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  const { assignmentId } = await params
  redirect(`/entregadores/entregas-disponiveis?view=${assignmentId}`)
}
