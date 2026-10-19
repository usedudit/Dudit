"use client"

import { useCallback, useEffect, useState } from "react"
import {
    AlertModal,
    Badge,
    Button,
    FormSection,
    InfoCard,
    ListItem,
} from "@/components/reusable"
import { toast } from "@/hooks/use-notification"
import { formatCurrency, formatDeliveryDaysRange } from "@/lib/utils"
import { TruckIcon } from "@/lib/icons"
import { getPaymentStatusMeta } from "@/lib/orders/status"
import { isCarrierDeliveryOrder } from "@/components/erp/shared/DeliveryTabContent"
import type { SuperFreteServiceId } from "@/lib/services/shipping/superfrete"
import {
    getOrderCarrierLabelStateAction,
    getSuperFreteBalanceAction,
    createOrderShippingLabelAction,
    checkoutSuperFreteLabelAction,
    printSuperFreteLabelAction,
    cancelSuperFreteLabelAction,
    getOrderShippingQuoteAction,
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
    const [quoteOptions, setQuoteOptions] = useState<any[]>([])
    const [quotesLoading, setQuotesLoading] = useState(false)
    const [quotesError, setQuotesError] = useState<string | null>(null)
    const [selectedService, setSelectedService] = useState<number | null>(null)

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

    // Saldo é exibição apenas: busca em background pra não atrasar os botões.
    // Roda sempre que o gate muda (ex.: após refresh) e ainda não tem saldo.
    useEffect(() => {
        if (!gate?.connected || gate.balance !== undefined) return
        let active = true
        getSuperFreteBalanceAction()
            .then((res) => {
                if (!active || !res.success || res.balance == null) return
                const balance = res.balance
                setGate((prev) => (prev ? { ...prev, balance } : prev))
            })
            .catch(() => {})
        return () => {
            active = false
        }
    }, [gate])

    const refresh = useCallback(async () => {
        await onRefresh()
        load()
    }, [onRefresh, load])

    const labelId: string | null = shipment?.external_label_id || null
    const shippingStatus: string | null = shipment?.status || null
    const statusMeta = SHIPPING_STATUS_META[shippingStatus || ""] || (shippingStatus ? { label: shippingStatus, variant: "gray" as const } : null)
    const canGenerate = Boolean(gate?.connected && gate?.planAllowed)

    // Só pedido marcado como transportadora tem fluxo de etiqueta; se já
    // existe etiqueta, mostra o histórico para qualquer pedido.
    const isCarrierBound = isCarrierDeliveryOrder(order)
    const serviceIdFromBreakdown = Number(order?.delivery_breakdown?.serviceId || 0)
    const needsQuoteSelection = Boolean(isCarrierBound && !labelId && canGenerate && !serviceIdFromBreakdown)

    const paidSituations = ["paid", "shipped", "delivered"]
    const isPaid = paidSituations.includes(String(order?.situation || "").toLowerCase())
    const paymentLabel = getPaymentStatusMeta(order?.situation).label

    useEffect(() => {
        if (!shipmentLoaded || !gateLoaded) return
        if (!needsQuoteSelection) return
        let active = true
        setQuotesLoading(true)
        setQuotesError(null)
        getOrderShippingQuoteAction({ orderId })
            .then((res) => {
                if (!active) return
                if (res.success) {
                    setQuoteOptions(res.quotes)
                    if (res.quotes.length === 0) {
                        setQuotesError("Nenhuma opção de frete encontrada.")
                        setSelectedService(null)
                    } else {
                        setSelectedService(Number(res.quotes[0]?.id) || null)
                    }
                } else {
                    setQuoteOptions([])
                    setSelectedService(null)
                    setQuotesError(res.error)
                }
            })
            .catch(() => {
                if (!active) return
                setQuoteOptions([])
                setSelectedService(null)
                setQuotesError("Erro ao cotar o frete.")
            })
            .finally(() => {
                if (active) setQuotesLoading(false)
            })
        return () => {
            active = false
        }
    }, [needsQuoteSelection, shipmentLoaded, gateLoaded, orderId])

    const handleCreate = async () => {
        setCreating(true)
        try {
            const service = !serviceIdFromBreakdown && selectedService
                ? (selectedService as SuperFreteServiceId)
                : undefined
            if (needsQuoteSelection && !service) {
                toast.error("Selecione um serviço de frete para gerar a etiqueta.")
                return
            }
            const res = await createOrderShippingLabelAction({ orderId, ...(service ? { service } : {}) })
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
    if (!labelId && (!canGenerate || !isCarrierBound)) return null

    return (
        <FormSection title="Frete" className="mt-8">
            {!labelId ? (
                <div className="space-y-4">
                    {!isPaid && (
                        <InfoCard
                            color="orange"
                            title="Pagamento pendente"
                            message={`Este pedido ainda não está pago (${paymentLabel}). Recomendamos gerar a etiqueta somente após a confirmação do pagamento.`}
                        />
                    )}
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

                    {needsQuoteSelection && (
                        <div className="space-y-2">
                            <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                                Selecione o serviço de frete
                            </p>
                            {quotesLoading && (
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">Calculando opções de frete...</p>
                            )}
                            {!quotesLoading && quotesError && (
                                <p className="text-xs text-red-500">{quotesError}</p>
                            )}
                            {!quotesLoading && !quotesError && quoteOptions.map((q: any) => {
                                const optionServiceId = Number(q?.id) || 0
                                const isSelected = selectedService === optionServiceId
                                return (
                                    <button
                                        key={q?.id}
                                        type="button"
                                        onClick={() => setSelectedService(optionServiceId)}
                                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${isSelected
                                            ? "border-brand-green bg-green-50/40 dark:bg-green-900/10"
                                            : "border-brand-border dark:border-dark-border hover:border-brand-green/60 dark:hover:border-brand-green/40"
                                        }`}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-bold text-brand-dark dark:text-dark-heading">
                                                {[q?.company?.name, q?.name].filter(Boolean).join(" - ") || `Serviço ${q?.id}`}
                                            </span>
                                            <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                                                {formatDeliveryDaysRange(q?.delivery_range?.min ?? null, q?.delivery_range?.max ?? null)}
                                            </span>
                                        </span>
                                        <span className="shrink-0 text-sm font-bold text-brand-dark dark:text-dark-heading">
                                            {formatCurrency(Number(q?.price || 0))}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    <Button
                        type="button"
                        onClick={handleCreate}
                        isLoading={creating}
                        disabled={needsQuoteSelection && (quotesLoading || !selectedService)}
                        leftIcon={<TruckIcon className="w-4 h-4" />}
                    >
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
                        {shipment?.price_mismatch && shipment?.checkout_price != null && (
                            <InfoCard
                                color="orange"
                                title="Valor divergente"
                                message={`O valor cobrado no checkout (R$ ${formatCurrency(shipment.checkout_price)}) difere da etiqueta emitida pela SuperFrete (R$ ${formatCurrency(shipment.price || 0)}). Verifique o serviço selecionado e regenere a etiqueta se necessário.`}
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
