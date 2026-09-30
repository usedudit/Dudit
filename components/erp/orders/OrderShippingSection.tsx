"use client"

import { useCallback, useEffect, useState } from "react"
import {
    AlertModal,
    Badge,
    Button,
    FormSection,
    ListItem,
} from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { formatCurrency } from "@/lib/utils"
import { TruckIcon } from "@/lib/icons"
import {
    getOrderShippingGateAction,
    createOrderShippingLabelAction,
    checkoutSuperFreteLabelAction,
    printSuperFreteLabelAction,
    cancelSuperFreteLabelAction,
    getOrderShipmentAction,
    type OrderShipmentSummary,
} from "@/app/actions/shipping/superfrete"
import { RecipientDocumentModal } from "@/components/erp/orders/RecipientDocumentModal"

const SHIPPING_STATUS_META: Record<string, { label: string; variant: "green" | "red" | "orange" | "blue" | "gray" }> = {
    pending: { label: "Aguardando pagamento", variant: "orange" },
    released: { label: "Etiqueta paga", variant: "green" },
    posted: { label: "Postada", variant: "blue" },
    in_transit: { label: "Em trânsito", variant: "blue" },
    delivered: { label: "Entregue", variant: "green" },
    cancelled: { label: "Cancelada", variant: "red" },
    failed: { label: "Falhou", variant: "red" },
}

interface OrderShippingSectionProps {
    orderId: string
    partnerId: string
    order: any
    onRefresh: () => void | Promise<void>
}

export function OrderShippingSection({ orderId, partnerId, order, onRefresh }: OrderShippingSectionProps) {
    const [gate, setGate] = useState<{ connected: boolean; planAllowed: boolean; balance?: number } | null>(null)
    const [gateLoaded, setGateLoaded] = useState(false)
    const [shipment, setShipment] = useState<OrderShipmentSummary | null>(null)
    const [shipmentLoaded, setShipmentLoaded] = useState(false)
    const [creating, setCreating] = useState(false)
    const [paying, setPaying] = useState(false)
    const [printing, setPrinting] = useState(false)
    const [cancelOpen, setCancelOpen] = useState(false)
    const [cancelling, setCancelling] = useState(false)
    const [docModalOpen, setDocModalOpen] = useState(false)

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

    const labelId: string | null = shipment?.external_label_id || null
    const shippingStatus: string | null = shipment?.status || null
    const statusMeta = SHIPPING_STATUS_META[shippingStatus || ""] || (shippingStatus ? { label: shippingStatus, variant: "gray" as const } : null)
    const canGenerate = Boolean(gate?.connected && gate?.planAllowed)

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
        if (!labelId) return
        setPaying(true)
        try {
            const res = await checkoutSuperFreteLabelAction({ partnerId, orderId, labelId })
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
        if (!labelId) return
        setPrinting(true)
        try {
            const res = await printSuperFreteLabelAction({ partnerId, labelId })
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

    const handleCancel = async () => {
        if (!labelId) return
        setCancelling(true)
        try {
            const res = await cancelSuperFreteLabelAction({
                partnerId,
                orderId,
                labelId,
                reason: "Cancelado pelo lojista",
            })
            if (res.success) {
                toast.success("Etiqueta cancelada.")
                setCancelOpen(false)
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
    if (!labelId && !canGenerate) return null

    return (
        <FormSection title="Frete" className="mt-8">
            {!labelId ? (
                <div className="space-y-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-brand-blue/10 dark:bg-blue-900/30 text-brand-blue dark:text-blue-400 flex items-center justify-center shrink-0">
                            <TruckIcon className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-md font-medium text-brand-dark dark:text-dark-heading">Etiqueta de frete</p>
                            <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                                Gere a etiqueta pelo SuperFrete usando o endereço de entrega do pedido. O valor é debitado da sua carteira SuperFrete.
                            </p>
                            {gate?.balance !== undefined && (
                                <p className="text-sm font-medium text-brand-dark dark:text-dark-heading mt-1">
                                    Saldo SuperFrete: {formatCurrency(gate.balance)}
                                </p>
                            )}
                        </div>
                    </div>
                    <Button type="button" onClick={handleCreate} isLoading={creating} leftIcon={<TruckIcon className="w-4 h-4" />}>
                        Gerar etiqueta de frete
                    </Button>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <ListItem
                            className="border-0"
                            title="Serviço"
                            description={shipment?.service_name || shipment?.carrier || "SuperFrete"}
                        />
                        {statusMeta && (
                            <ListItem
                                className="border-0"
                                title="Status"
                                right={<Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>}
                            />
                        )}
                        {shipment?.tracking_number && (
                            <ListItem
                                className="border-0"
                                title="Rastreio"
                                description={shipment.tracking_number}
                                right={
                                    shipment.tracking_url ? (
                                        <Button
                                            variant="link"
                                            type="button"
                                            onClick={() => window.open(shipment.tracking_url || undefined, "_blank")}
                                        >
                                            Rastrear
                                        </Button>
                                    ) : null
                                }
                            />
                        )}
                        {shipment?.price != null && (
                            <ListItem
                                className="border-0"
                                title="Valor da etiqueta"
                                description={formatCurrency(shipment.price)}
                            />
                        )}
                    </div>

                    {gate?.balance !== undefined && shippingStatus === "pending" && (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Saldo SuperFrete: <span className="font-medium text-brand-dark dark:text-dark-heading">{formatCurrency(gate.balance)}</span>
                        </p>
                    )}

                    <div className="flex flex-wrap gap-3">
                        {shippingStatus === "pending" && (
                            <Button type="button" onClick={handlePay} isLoading={paying}>
                                Pagar etiqueta
                            </Button>
                        )}
                        {shippingStatus !== "cancelled" && shippingStatus !== "failed" && (
                            <Button type="button" variant="outline" onClick={handlePrint} isLoading={printing}>
                                Imprimir
                            </Button>
                        )}
                        {(shippingStatus === "pending" || shippingStatus === "released") && (
                            <Button type="button" variant="ghostred" onClick={() => setCancelOpen(true)}>
                                Cancelar etiqueta
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <AlertModal
                isOpen={cancelOpen}
                onClose={() => {
                    if (!cancelling) setCancelOpen(false)
                }}
                onConfirm={handleCancel}
                title="Cancelar etiqueta"
                message="Tem certeza que deseja cancelar esta etiqueta? O valor não é reembolsado após o envio."
                confirmText="Cancelar etiqueta"
                cancelText="Voltar"
                variant="danger"
                isDestructive
                isLoading={cancelling}
            />

            <RecipientDocumentModal
                isOpen={docModalOpen}
                onClose={() => setDocModalOpen(false)}
                partnerId={partnerId}
                orderId={orderId}
                recipientName={order?.customer_name || undefined}
                onSaved={handleCreate}
            />
        </FormSection>
    )
}
