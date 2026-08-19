import type { Metadata } from "next"
import DeliveryAssignmentsList from "@/components/delivery/DeliveryAssignmentsList"

export const metadata: Metadata = {
  title: "Minhas Entregas",
  robots: {
    index: false,
    follow: false,
  },
}

export const dynamic = "force-dynamic"

export default function DeliveryPortalPage() {
  return <DeliveryAssignmentsList />
}
