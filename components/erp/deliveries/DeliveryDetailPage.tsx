"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import dynamic from "next/dynamic"
import { Button, Badge, InfoCard, ThreeDotsLoader } from "@/components/reusable"
import { FadeIn } from "@/components/animations/FadeIn"
import { ChevronLeftIcon } from "@/lib/icons"
import { getERPDeliveryDetailsAction, getDeliveryRoutePointsAction } from "@/app/actions/erp/deliveries"
import { formatDateTime } from "@/lib/utils"
import { getDeliveryStatusMeta } from "@/lib/orders/status"

const DeliveryRouteMap = dynamic(
  () => import("./DeliveryRouteMap").then((m) => m.DeliveryRouteMap),
  { ssr: false },
)

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
  const [route, setRoute] = useState<any | null>(null)
  const [routeLoading, setRouteLoading] = useState(false)
  const mounted = useRef(true)

  const handleBack = useCallback(() => onBack(), [onBack])

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

  useEffect(() => {
    let alive = true
    const run = async () => {
      setRouteLoading(true)
      const res = await getDeliveryRoutePointsAction({ partnerId, deliveryId })
      if (!alive) return
      setRoute(res.success ? res.data : null)
      setRouteLoading(false)
    }
    run()
    return () => { alive = false }
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
            <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0"><ChevronLeftIcon className="w-5 h-5" /></Button>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading">
                Entrega {delivery?.delivery_number ? `#${delivery.delivery_number}` : (order?.order_number || "")}
              </h1>
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
            <InfoCard title="Saída" message={delivery.departure_time ? formatDateTime(delivery.departure_time) : (delivery.started_at ? formatDateTime(delivery.started_at) : "-")} color="orange" />
            <InfoCard title="Conclusão" message={delivery.completed_at ? formatDateTime(delivery.completed_at) : (delivery.delivered_at ? formatDateTime(delivery.delivered_at) : "-")} color="green" />
          </div>
          <InfoCard title="Observações" message={delivery.notes || "Sem observações"} color="gray" />

          <div className="mt-2">
            <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-3">Mapa da rota</h3>
            <div className="h-[320px]">
              {routeLoading ? (
                <div className="h-full flex items-center justify-center rounded-2xl border border-brand-border dark:border-dark-border">
                  <span className="text-sm text-brand-inactive-text">Carregando mapa...</span>
                </div>
              ) : route?.points?.length ? (
                <DeliveryRouteMap
                  points={route.points}
                  initialLat={route.origin?.lat ?? null}
                  initialLng={route.origin?.lng ?? null}
                />
              ) : (
                <div className="h-full flex items-center justify-center rounded-2xl border border-brand-border dark:border-dark-border">
                  <span className="text-sm text-brand-inactive-text">Sem dados de rota para exibir.</span>
                </div>
              )}
            </div>
          </div>
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
