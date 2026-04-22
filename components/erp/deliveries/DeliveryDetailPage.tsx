"use client"

import { useEffect, useRef, useState } from "react"
import { Button, Badge, InfoCard, ThreeDotsLoader } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon } from "@/lib/icons"
import { getERPDeliveryDetailsAction } from "@/app/actions/erp/deliveries"
import { formatDateTime } from "@/lib/utils"
import { getDeliveryStatusMeta } from "@/lib/orders/status"

export default function DeliveryDetailPage({
  deliveryId,
  partnerId,
  onBack,
}: {
  deliveryId: string
  partnerId: string
  onBack: () => void
}) {
  const [delivery, setDelivery] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const run = async () => {
      setLoading(true)
      const res = await getERPDeliveryDetailsAction(deliveryId, partnerId)
      if (mounted.current) {
        setDelivery(res.success ? res.data : null)
        setLoading(false)
      }
    }
    run()
    return () => {
      mounted.current = false
    }
  }, [deliveryId, partnerId])

  if (loading) return <div className="h-full flex items-center justify-center"><ThreeDotsLoader /></div>
  if (!delivery) return null

  const statusMeta = getDeliveryStatusMeta(delivery.status)
  const links = Array.isArray(delivery.delivery_orders) ? delivery.delivery_orders : []
  const firstLink = links[0]
  const order = firstLink?.orders
  const customer = order?.customers || null
  const address = order?.delivery_address || customer?.addresses?.[0]?.street || "-"

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative">
      <div className="sticky top-0 z-20 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
        <div className="max-w-[1300px] mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0"><ChevronLeftIcon className="w-5 h-5" /></Button>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading">Entrega {order?.order_number || ""}</h1>
              <p className="text-brand-inactive-text dark:text-dark-body text-sm">Detalhes da entrega e do pedido vinculado</p>
            </div>
          </div>
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
        </div>
      </div>

      <div className="max-w-[1300px] mx-auto w-full p-4 md:p-6 grid grid-cols-12 gap-6 overflow-y-auto">
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <InfoCard title="Endereço de Entrega" message={address} color="gray" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard title="Distância" message={`${Number(delivery.distance_km || 0).toFixed(2)} km`} color="blue" />
            <InfoCard title="Duração Estimada" message={`${delivery.estimated_duration_minutes || 0} min`} color="purple" />
            <InfoCard title="Saída" message={delivery.started_at ? formatDateTime(delivery.started_at) : "-"} color="orange" />
            <InfoCard title="Entregue em" message={delivery.delivered_at ? formatDateTime(delivery.delivered_at) : "-"} color="green" />
          </div>
          <InfoCard title="Observações" message={delivery.notes || "Sem observações"} color="gray" />
        </div>
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <InfoCard title="Cliente" message={customer?.name || order?.customer_name || "Cliente"} color="gray" />
          <InfoCard title="Entregador" message={delivery.partner_users?.user_profiles?.full_name || "Não atribuído"} color="gray" />
          <InfoCard title="Pedidos na rota" message={String(links.length || 0)} color="gray" />
        </div>
      </div>
    </FadeIn>
  )
}
