"use client"

import { useCallback, useEffect, useState } from "react"
import { Button } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { formatCurrency } from "@/lib/utils"
import {
    getOrderShippingGateAction,
    createOrderShippingLabelAction,
    checkoutSuperFreteLabelAction,
    getOrderShipmentAction,
    type OrderShipmentSummary,
} from "@/app/actions/shipping/superfrete"

interface CarrierLabelActionProps {
    orderId: string
    partnerId: string
    onRefresh: () => void | Promise<void>
}

export function CarrierLabelAction({ orderId, partnerId, onRefresh }: CarrierLabelActionProps) {
    const [gate, setGate] = useState<{ connected: boolean; planAllowed: boolean; balance?: number } | null>(null)
    const [gateLoaded, setGateLoaded] = useState(false)
    const [shipment, setShipment] = useState<OrderShipmentSummary | null>(null)
    const [shipmentLoaded, setShipmentLoaded] = useState(false)
    const [creating, setCreating] = useState(false)
    const [paying, setPaying] = useState(false)

    const loadGate = useCallback(async () => {
        try {
            const res = await getOrderShippingGateAction()
            if (res.success) setGate(res.data)
        } catch {
            setGate(null)
        } finally {
            setGateLoaded(true)
        }
    }, [])

    const loadShipment = useCallback(async () => {
        try {
            const res = await getOrderShipmentAction({ orderId })
            if (res.success) setShipment(res.shipment)
        } catch {
            setShipment(null)
        } finally {
            setShipmentLoaded(true)
        }
    }, [orderId])

    useEffect(() => {
        loadGate()
        loadShipment()
    }, [loadGate, loadShipment])

    const refresh = useCallback(async () => {
        await onRefresh()
        loadGate()
        loadShipment()
    }, [onRefresh, loadGate, loadShipment])

    const handleCreate = async () => {
        setCreating(true)
        try {
            const res = await createOrderShippingLabelAction({ orderId })
            if (res.success) {
                const payRes = await checkoutSuperFreteLabelAction({ partnerId, orderId, labelId: res.label.id })
                if (payRes.success) {
                    toast.success(`Etiqueta gerada e paga por ${formatCurrency(res.label.price)}.`)
                } else {
                    toast.success(`Etiqueta criada por ${formatCurrency(res.label.price)}.`)
                    toast.error(payRes.error || "Erro ao pagar a etiqueta. Clique em Pagar etiqueta para concluir.")
                }
                await refresh()
            } else {
                toast.error(res.error || "Erro ao gerar etiqueta.")
            }
        } catch {
            toast.error("Erro ao gerar etiqueta.")
        } finally {
            setCreating(false)
        }
    }

    const handlePay = async () => {
        if (!shipment?.external_label_id) return
        setPaying(true)
        try {
            const res = await checkoutSuperFreteLabelAction({ partnerId, orderId, labelId: shipment.external_label_id })
            if (res.success) {
                toast.success("Etiqueta paga com sucesso!")
                await refresh()
            } else {
                toast.error(res.error || "Erro ao pagar etiqueta.")
            }
        } catch {
            toast.error("Erro ao pagar etiqueta.")
        } finally {
            setPaying(false)
        }
    }

    if (!gateLoaded || !shipmentLoaded) return null

    if (!shipment) {
        if (!(gate?.connected && gate?.planAllowed)) return null
        return (
            <Button variant="link" type="button" onClick={handleCreate} isLoading={creating} className="shrink-0">
                Gerar etiqueta
            </Button>
        )
    }

    if (shipment.status === "pending") {
        return (
            <Button variant="link" type="button" onClick={handlePay} isLoading={paying} className="shrink-0">
                Pagar etiqueta
            </Button>
        )
    }

    if (shipment.status === "cancelled" || shipment.status === "failed") {
        if (!(gate?.connected && gate?.planAllowed)) return null
        return (
            <Button variant="link" type="button" onClick={handleCreate} isLoading={creating} className="shrink-0">
                Gerar etiqueta
            </Button>
        )
    }

    if (shipment.tracking_url) {
        return (
            <Button
                variant="link"
                type="button"
                className="shrink-0"
                onClick={() => window.open(shipment.tracking_url || undefined, "_blank")}
            >
                Rastrear
            </Button>
        )
    }

    return null
}

export default CarrierLabelAction
