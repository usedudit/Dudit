"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { AlertModal, Button, Dropdown, DropdownItem, Input } from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { formatCurrency } from "@/lib/utils"
import {
    getOrderCarrierLabelStateAction,
    createOrderShippingLabelAction,
    checkoutSuperFreteLabelAction,
    printSuperFreteLabelAction,
    cancelSuperFreteLabelAction,
    type OrderShipmentSummary,
} from "@/app/actions/shipping/superfrete"
import { RecipientDocumentModal } from "@/components/erp/orders/RecipientDocumentModal"
import { CancelIcon, PrinterIcon, ThreeDotsIcon, TruckIcon } from "@/lib/icons"

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
    const [cancelling, setCancelling] = useState(false)
    const [cancelOpen, setCancelOpen] = useState(false)
    const [cancelReason, setCancelReason] = useState("")
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
                if (res.priceMismatch) {
                    toast.warning(
                        "Valor divergente na etiqueta",
                        `O checkout cobrou ${formatCurrency(res.checkoutPrice)} e a SuperFrete emitiu por ${formatCurrency(res.labelPrice || 0)}.`,
                    )
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

    const handleCancelLabel = async () => {
        if (!shipment?.external_label_id) return
        const reason = cancelReason.trim()
        if (!reason) {
            toast.error("Informe o motivo do cancelamento da etiqueta.")
            return
        }
        setCancelling(true)
        try {
            const res = await cancelSuperFreteLabelAction({
                partnerId,
                orderId,
                labelId: shipment.external_label_id,
                reason,
            })
            if (res.success) {
                toast.success("Etiqueta cancelada.")
                setCancelOpen(false)
                setCancelReason("")
                await refresh()
            } else {
                toast.error(res.error || "Erro ao cancelar etiqueta.")
            }
        } catch {
            toast.error("Erro ao cancelar etiqueta.")
        } finally {
            setCancelling(false)
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
            <div className="flex shrink-0 items-center gap-1">
                <Button variant="link" type="button" onClick={handlePay} isLoading={paying} className="shrink-0">
                    Pagar etiqueta
                </Button>
                {shipment.external_label_id && (
                    <Dropdown
                        align="right"
                        fullWidth={false}
                        width="w-52"
                        trigger={
                            <Button variant="outline" className="h-9 w-9 shrink-0 p-0 flex items-center justify-center" aria-label="Ações da etiqueta">
                                <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                            </Button>
                        }
                    >
                        <DropdownItem
                            onClick={() => setCancelOpen(true)}
                            className="text-brand-red dark:text-brand-red"
                        >
                            <CancelIcon size={18} /> Cancelar etiqueta
                        </DropdownItem>
                    </Dropdown>
                )}
            </div>
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
        const canCancelLabel = Boolean(shipment.external_label_id)
            && !["cancelled", "failed", "delivered"].includes(String(shipment.status || ""))
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
                <Dropdown
                    align="right"
                    fullWidth={false}
                    width="w-52"
                    trigger={
                        <Button variant="outline" className="h-9 w-9 shrink-0 p-0 flex items-center justify-center" aria-label="Ações da etiqueta">
                            <ThreeDotsIcon className="w-4 h-4 text-brand-inactive-text dark:text-dark-heading" />
                        </Button>
                    }
                >
                    {shipment.external_label_id && (
                        <DropdownItem onClick={handlePrint}>
                            <PrinterIcon size={18} /> Imprimir etiqueta
                        </DropdownItem>
                    )}
                    {shipment.tracking_url && (
                        <DropdownItem onClick={() => window.open(shipment.tracking_url || undefined, "_blank")}>
                            <TruckIcon size={18} /> Rastrear envio
                        </DropdownItem>
                    )}
                    {canCancelLabel && (
                        <DropdownItem
                            onClick={() => setCancelOpen(true)}
                            className="text-brand-red dark:text-brand-red"
                        >
                            <CancelIcon size={18} /> Cancelar etiqueta
                        </DropdownItem>
                    )}
                </Dropdown>
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
            <AlertModal
                isOpen={cancelOpen}
                onClose={() => {
                    setCancelOpen(false)
                    setCancelReason("")
                }}
                onConfirm={handleCancelLabel}
                title="Cancelar etiqueta"
                message={
                    <div className="flex flex-col gap-4 text-left">
                        <p>
                            O cancelamento é enviado para a transportadora e o valor da etiqueta volta para a carteira
                            {gate?.connected ? " da SuperFrete" : ""}. Se a etiqueta já estiver postada, a transportadora
                            recusará o cancelamento e será necessário concluir a entrega para solicitar troca ou devolução.
                        </p>
                        <Input
                            label="Motivo do cancelamento"
                            placeholder="Descreva o motivo..."
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            maxLength={120}
                        />
                    </div>
                }
                confirmText="Cancelar etiqueta"
                cancelText="Voltar"
                variant="warning"
                isLoading={cancelling}
                disabled={!cancelReason.trim()}
            />
        </>
    )
}

export default CarrierLabelAction
