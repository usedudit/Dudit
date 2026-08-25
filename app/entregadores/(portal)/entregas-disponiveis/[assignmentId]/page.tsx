import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { getMyDeliveryAssignmentAction } from "@/app/actions/delivery-drivers"
import AvailableDeliveryDetail from "@/components/delivery/AvailableDeliveryDetail"

export const metadata: Metadata = {
  title: "Detalhes da Oferta Disponível",
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = "force-dynamic"

export default async function AvailableDeliveryOfferPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>
}) {
  const { assignmentId } = await params
  const result = await getMyDeliveryAssignmentAction(assignmentId)

  if (!result.success || !result.data) {
    notFound()
  }

  // Se já foi aceita ou está ativa para este entregador, direcionar para o painel de entrega ativa
  if (result.data.status && result.data.status !== "available" && result.data.status !== "requested") {
    redirect(`/entregadores/entregas/${assignmentId}`)
  }

  return <AvailableDeliveryDetail offer={result.data as any} />
}
