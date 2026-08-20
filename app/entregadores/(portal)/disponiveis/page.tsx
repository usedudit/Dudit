import React from "react"
import { Metadata } from "next"
import AvailableDeliveriesList from "@/components/delivery/AvailableDeliveriesList"

export const metadata: Metadata = {
    title: "Entregas Disponíveis | Dudit Entregadores",
    description: "Visualizar e aceitar entregas disponíveis em tempo real.",
}

export default function AvailableDeliveriesPage() {
    return <AvailableDeliveriesList />
}
