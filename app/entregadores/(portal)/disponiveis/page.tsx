import { Metadata } from "next"
import AvailableDeliveriesList from "@/components/delivery/AvailableDeliveriesList"
import { FadeIn } from "@/components/animations/FadeIn"

export const metadata: Metadata = {
    title: "Entregas Disponíveis",
    description: "Visualizar e aceitar entregas disponíveis em tempo real.",
}

export default function AvailableDeliveriesPage() {
    return (
        <FadeIn className="p-4">
            <AvailableDeliveriesList />
        </FadeIn>
    )
}
