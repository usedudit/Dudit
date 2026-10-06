"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { formatCurrency } from "@/lib/utils"
import {
    getOrderCarrierLabelStateAction,
    createOrderShippingLabelAction,
    checkoutSuperFreteLabelAction,
    printSuperFreteLabelAction,
    type OrderShipmentSummary,
} from "@/app/actions/shipping/superfrete"
import { RecipientDocumentModal } from "@/components/erp/orders/RecipientDocumentModal"

interface CarrierLabelActionProps {
    orderId: string
    partnerId: string
    onRefresh: () => void | Promise<void>
}

export function CarrierLabelAction({ orderId, partnerId, onRefresh }: CarrierLabelActionProps) {
    const [gate, setGate] = useState<{ connected: boolean; planAllowed: boolean } | null>(null)
    const [gateLoaded, setGateLoaded] = useState(false)
    const [shipment, setShipment] = useState<OrderShipmentSummary | null>(null)
    const [shipmentLoaded, setShipmentLoaded] = useState(false)
    const [creating, setCreating] = useState(false)
    const [paying, setPaying] = useState(false)
    const [printing, setPrinting] = useState(false)
    const [docModalOpen, setDocModalOpen] = useState(false)

    // Uma única action rápida: gate + shipment numa cadeia de auth só e sem
    // chamada remota ao SuperFrete.
    const load = useCallback(async () => {
        try {
            const res = await getOrderCarrierLabelStateAction({ orderId })
            if (res.success) {
                setGate({ connected: res.connected, planAllowed: res.planAllowed })
                setShipment(res.shipment)
            } else {
                setGate(null)
                setShipment(null)
            }
        } catch {
            setGate(null)
            setShipment(null)
        } finally {
            setGateLoaded(true)
            setShipmentLoaded(true)
        }
    }, [orderId])

    useEffect(() => {
        load()
    }, [load])

    const refresh = useCallback(async () => {
        await onRefresh()
        load()
    }, [onRefresh, load])

    const handleCreate = async () => {
        setCreating(true)
        try {
            const res = await createOrderShippingLabelAction({ orderId })
            if (res.success) {
                const payRes = await checkoutSuperFreteLabelAction({ partnerId, orderId, labelId: res.label.id })
                if (payRes.success) {
                    toast.success(
                        payRes.result.simulated
                            ? `Etiqueta gerada em modo simulado (sandbox) por ${formatCurrency(res.label.price)}.`
                            : `Etiqueta gerada e paga por ${formatCurrency(res.label.price)}.`,
                    )
                } else {
                    toast.success(`Etiqueta criada por ${formatCurrency(res.label.price)}.`)
                    toast.error(payRes.error || "Erro ao pagar a etiqueta. Clique em Pagar etiqueta para concluir.")
                }
                await refresh()
            } else if (res.code === "missing_document") {
                setDocModalOpen(true)
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
                toast.success(res.result.simulated ? "Etiqueta paga em modo simulado (sandbox)." : "Etiqueta paga com sucesso!")
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

    const handlePrint = async () => {
        if (!shipment?.external_label_id) return
        setPrinting(true)
        try {
            const res = await printSuperFreteLabelAction({ partnerId, labelId: shipment.external_label_id })
            if (res.success) {
                window.open(res.url, "_blank")
            } else {
                toast.error(res.error || "Erro ao gerar impressão.")
            }
        } catch {
            toast.error("Erro ao gerar impressão.")
        } finally {
            setPrinting(false)
        }
    }

    if (!gateLoaded || !shipmentLoaded) return null

    let content: ReactNode = null

    if (!shipment) {
        if (gate?.connected && gate?.planAllowed) {
            content = (
                <Button variant="link" type="button" onClick={handleCreate} isLoading={creating} className="shrink-0">
                    Gerar etiqueta
                </Button>
            )
        }
    } else if (shipment.status === "pending") {
        content = (
            <Button variant="link" type="button" onClick={handlePay} isLoading={paying} className="shrink-0">
                Pagar etiqueta
            </Button>
        )
    } else if (shipment.status === "cancelled" || shipment.status === "failed") {
        if (gate?.connected && gate?.planAllowed) {
            content = (
                <Button variant="link" type="button" onClick={handleCreate} isLoading={creating} className="shrink-0">
                    Gerar etiqueta
                </Button>
            )
        }
    } else {
        content = (
            <div className="flex shrink-0 items-center gap-1">
                {shipment.external_label_id && (
                    <Button variant="link" type="button" className="shrink-0" onClick={handlePrint} isLoading={printing}>
                        Imprimir
                    </Button>
                )}
                {shipment.tracking_url && (
                    <Button
                        variant="link"
                        type="button"
                        className="shrink-0"
                        onClick={() => window.open(shipment.tracking_url || undefined, "_blank")}
                    >
                        Rastrear
                    </Button>
                )}
            </div>
        )
    }

    return (
        <>
            {content}
            <RecipientDocumentModal
                isOpen={docModalOpen}
                onClose={() => setDocModalOpen(false)}
                partnerId={partnerId}
                orderId={orderId}
                onSaved={handleCreate}
            />
        </>
    )
}

export default CarrierLabelAction
