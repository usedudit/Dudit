import type { Metadata } from "next"
import DeliveryAssignmentsList from "@/components/delivery/DeliveryAssignmentsList"
import { FadeIn } from "@/components/animations/FadeIn"

export const metadata: Metadata = {
  title: "Minhas Entregas",
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = "force-dynamic"

export default function DeliveryPortalPage() {
  return (
    <FadeIn className="p-4">
      <DeliveryAssignmentsList />
    </FadeIn>
  )
}
