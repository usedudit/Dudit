"use client"

import React from "react"
import { IconPlaceholder } from "@/components/reusable"
import CarrierDeliveryCard from "./CarrierDeliveryCard"

interface CarrierDeliveryBoardProps {
  shipments: any[]
  isLoading?: boolean
  integrationEnabled?: boolean
  onOpenOrder: (orderId: string) => void
}

const COLUMNS = [
  {
    id: "awaiting_label",
    title: "Aguardando etiqueta",
    statuses: ["awaiting_label", "pending", "released"],
  },
  {
    id: "posted",
    title: "Postado",
    statuses: ["posted"],
  },
  {
    id: "in_transit",
    title: "Em trânsito",
    statuses: ["in_transit"],
  },
  {
    id: "delivered",
    title: "Entregue",
    statuses: ["delivered"],
  },
]

export default function CarrierDeliveryBoard({ shipments, isLoading = false, integrationEnabled = true, onOpenOrder }: CarrierDeliveryBoardProps) {
  const closed = shipments.filter((s) => ["cancelled", "failed"].includes(String(s.carrierStatus || "")))
  const active = shipments.filter((s) => !["cancelled", "failed"].includes(String(s.carrierStatus || "")))

  if (shipments.length === 0) {
    return (
      <IconPlaceholder
        placeholderType="image"
        imageSrc="https://img.dudit.com.br/static/mascots/Entregas.png"
        imageAlt="Sem envios"
        title={
          isLoading
            ? "Carregando envios..."
            : !integrationEnabled
              ? "Transportadora não configurada"
              : "Nenhum envio encontrado"
        }
        subtitle={
          isLoading
            ? "Buscando os pedidos atendidos por transportadora."
            : !integrationEnabled
              ? "Configure a integração com a transportadora para acompanhar os envios aqui."
              : "Os pedidos atendidos por transportadora aparecem aqui com o status do envio."
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex lg:grid lg:grid-cols-4 gap-5 overflow-x-auto lg:overflow-x-visible pb-2">
        {COLUMNS.map((col) => {
          const items = active.filter((s) => col.statuses.includes(String(s.carrierStatus || "")))
          return (
            <div key={col.id} className="flex-none w-[310px] sm:w-[330px] lg:w-auto snap-center flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 px-1">
                <h3 className="font-bold text-xs truncate text-brand-dark dark:text-dark-heading">
                  {col.title}
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-gray dark:bg-dark-border text-brand-inactive-text dark:text-dark-body">
                  {items.length}
                </span>
              </div>

              <div className="flex-1 flex flex-col gap-3.5 p-3 rounded-2xl border border-brand-border/70 dark:border-dark-border/70 bg-brand-gray/20 dark:bg-dark-border/20 min-h-[120px]">
                {items.length === 0 ? (
                  <p className="text-xs text-brand-inactive-text dark:text-dark-body text-center py-6">
                    Nenhum envio nesta etapa
                  </p>
                ) : (
                  items.map((shipment) => (
                    <CarrierDeliveryCard
                      key={shipment.id}
                      shipment={shipment}
                      onOpenOrder={onOpenOrder}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {closed.length > 0 && (
        <div>
          <h3 className="font-bold text-xs text-brand-dark dark:text-dark-heading mb-3 px-1">
            Cancelados / Falhas
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {closed.map((shipment) => (
              <CarrierDeliveryCard
                key={shipment.id}
                shipment={shipment}
                onOpenOrder={onOpenOrder}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
