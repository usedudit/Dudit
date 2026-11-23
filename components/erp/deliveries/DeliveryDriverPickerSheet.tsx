"use client"

import React, { useState, useEffect, useCallback } from "react"
import Portal from "@/components/Portal"
import BottomSheet from "@/components/BottomSheet"
import { useMediaQuery } from "@/components/erp/hooks"
import { useModalLayer } from "@/lib/modal-stack"
import { Button, FormTextarea, ThreeDotsLoader, Badge, InfoCard, Checkbox, Input } from "@/components/reusable"
import {
    TruckIcon,
    XIcon,
    MapPinIcon,
    MoneyIcon,
    ClockIcon,
    CheckCircleIcon,
    PhoneIcon,
    Package,
} from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/hooks/use-notification"
import {
    requestDuditDeliveryAction,
    cancelDuditDeliveryRequestAction,
    getDuditDeliveryRequestStatusAction,
    checkOrderDimensionsForDeliveryAction,
    authorizeDeliveryBonusAction,
} from "@/app/actions/erp/delivery-driver-assignments"

export interface DeliveryDriverPickerSheetProps {
    isOpen: boolean
    onClose: () => void
    partnerId: string
    orderId?: string
    orderIds?: string[]
    deliveryId?: string
    orderNumber?: string | null
    destinationAddress?: string | null
    deliveryFee?: number
    onDeliveryRequested?: (assignmentId: string) => void
    onDeliveryCancelled?: () => void
    /** Backward compatibility */
    drivers?: any[]
    onSelect?: (driverId: string, driver?: any) => void
}

export default function DeliveryDriverPickerSheet({
    isOpen,
    onClose,
    partnerId,
    orderId,
    orderIds,
    deliveryId,
    orderNumber,
    destinationAddress,
    deliveryFee = 0,
    onDeliveryRequested,
    onDeliveryCancelled,
    onSelect,
}: DeliveryDriverPickerSheetProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    // z-index dinâmico: esta sheet abre acima de tudo que já estava aberto.
    const zIndex = useModalLayer(isOpen)
    const [notes, setNotes] = useState("")
    const [isLoadingStatus, setIsLoadingStatus] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [activeRequest, setActiveRequest] = useState<any | null>(null)
    const [dimensionsCheck, setDimensionsCheck] = useState<{
        dimensionsUnknown: boolean
        missingProducts: Array<{ productId: string | null; productName: string }>
    } | null>(null)
    const [acknowledgeUnknownDimensions, setAcknowledgeUnknownDimensions] = useState(false)
    const [bonusInput, setBonusInput] = useState("")
    const [bonusReason, setBonusReason] = useState("")
    const [isAuthorizingBonus, setIsAuthorizingBonus] = useState(false)

    const targetOrderIds = React.useMemo(
        () => Array.from(new Set(orderIds || (orderId ? [orderId] : []))).filter(Boolean),
        [orderIds, orderId]
    )
    const primaryOrderId = targetOrderIds[0] || undefined

    const checkRequestStatus = useCallback(async () => {
        if (!primaryOrderId || !partnerId) return
        setIsLoadingStatus(true)
        try {
            const res = await getDuditDeliveryRequestStatusAction({ partnerId, orderId: primaryOrderId })
            if (res.success) {
                setActiveRequest(res.activeRequest)
            }
        } catch (err) {
            console.error("Erro ao buscar status da entrega Dudit:", err)
        } finally {
            setIsLoadingStatus(false)
        }
    }, [partnerId, primaryOrderId])

    useEffect(() => {
        if (isOpen && primaryOrderId) {
            setAcknowledgeUnknownDimensions(false)
            void checkRequestStatus()
            void checkOrderDimensionsForDeliveryAction({ partnerId, orderIds: targetOrderIds })
                .then((res) => {
                    if (res.success) {
                        setDimensionsCheck({
                            dimensionsUnknown: res.dimensionsUnknown,
                            missingProducts: res.missingProducts,
                        })
                    }
                })
                .catch(() => {
                    setDimensionsCheck(null)
                })
        } else if (!isOpen) {
            setAcknowledgeUnknownDimensions(false)
            setDimensionsCheck(null)
        }
    }, [isOpen, primaryOrderId, partnerId, targetOrderIds, checkRequestStatus])

    // Polling while request is pending acceptance
    useEffect(() => {
        if (!isOpen || !primaryOrderId || !activeRequest || activeRequest.status !== "available") return
        const interval = setInterval(() => {
            void checkRequestStatus()
        }, 5000)
        return () => clearInterval(interval)
    }, [isOpen, primaryOrderId, activeRequest, checkRequestStatus])

    const handleRequestDelivery = async () => {
        if (targetOrderIds.length === 0 || !partnerId) {
            toast.error("Salve o pedido primeiro para poder solicitar um entregador Dudit.")
            return
        }

        if (dimensionsCheck?.dimensionsUnknown && !acknowledgeUnknownDimensions) {
            toast.error("Confirme que deseja continuar mesmo sem peso/dimensões nos produtos.")
            return
        }

        setIsSubmitting(true)
        try {
            const res = await requestDuditDeliveryAction({
                partnerId,
                orderIds: targetOrderIds,
                deliveryId: deliveryId || null,
                notes,
                acknowledgeUnknownDimensions,
            })

            if (!res.success) {
                toast.error(res.error || "Não foi possível solicitar a entrega.")
                return
            }

            toast.success("Solicitação enviada para os entregadores Dudit!")
            if (onDeliveryRequested) {
                onDeliveryRequested(res.assignmentId)
            }
            if (onSelect) {
                onSelect("platform:dudit_network")
            }
            void checkRequestStatus()
        } catch (err: any) {
            toast.error(err?.message || "Erro inesperado ao solicitar entrega.")
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleAuthorizeBonus = async () => {
        if (!activeRequest?.id || !partnerId) return
        const parsed = Number(String(bonusInput).replace(",", "."))
        if (!Number.isFinite(parsed) || parsed <= 0) {
            toast.error("Informe um valor de bônus válido.")
            return
        }
        setIsAuthorizingBonus(true)
        try {
            const res = await authorizeDeliveryBonusAction({
                partnerId,
                assignmentId: activeRequest.id,
                amount: parsed,
                reason: bonusReason,
            })
            if (!res.success) {
                toast.error(res.error || "Não foi possível autorizar o bônus.")
                return
            }
            toast.success("Bônus autorizado e oferta reenviada para os entregadores!")
            setBonusInput("")
            setBonusReason("")
            void checkRequestStatus()
        } catch (err: any) {
            toast.error(err?.message || "Erro ao autorizar bônus.")
        } finally {
            setIsAuthorizingBonus(false)
        }
    }

    const handleCancelRequest = async () => {
        if (!orderId || !partnerId) return
        setIsCancelling(true)
        try {
            const res = await cancelDuditDeliveryRequestAction({ partnerId, orderId })
            if (!res.success) {
                toast.error(res.error || "Não foi possível cancelar a solicitação.")
                return
            }

            toast.success("Solicitação cancelada com sucesso.")
            setActiveRequest(null)
            if (onDeliveryCancelled) {
                onDeliveryCancelled()
            }
        } catch (err: any) {
            toast.error(err?.message || "Erro ao cancelar solicitação.")
        } finally {
            setIsCancelling(false)
        }
    }

    const content = (
        <div className="flex h-full flex-col bg-white dark:bg-dark-surface">
            <header className="z-10 flex shrink-0 items-center justify-between border-b border-brand-border bg-white p-6 dark:border-dark-border dark:bg-dark-surface">
                <h2 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Entregadores Dudit</h2>
                <Button variant="filled" onClick={onClose} size="icon" className="hidden lg:flex">
                    <XIcon className="h-5 w-5" />
                </Button>
            </header>

            {/* BODY */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {isLoadingStatus ? (
                    <div className="flex items-center justify-center py-12">
                        <ThreeDotsLoader />
                    </div>
                ) : activeRequest && activeRequest.status !== "cancelled" ? (
                    /* ACTIVE REQUEST STATE */
                    <div className="space-y-5">
                        {activeRequest.status === "available" || activeRequest.status === "requested" ? (
                            activeRequest.dispatchExhaustedAt ? (
                                <InfoCard
                                    color="orange"
                                    title={
                                        activeRequest.dispatchExhaustedReason === "no_economically_viable_courier"
                                            ? "Sem entregador no raio coberto pela taxa"
                                            : "Nenhum entregador disponível no momento"
                                    }
                                    message={
                                        activeRequest.dispatchExhaustedReason === "no_economically_viable_courier"
                                            ? `A taxa atual cobre até ${activeRequest.economicCapKm ?? "—"} km pelo piso operacional.${
                                                  activeRequest.suggestedFee
                                                      ? ` Sugestão total para alcançar entregadores próximos: ${formatCurrency(activeRequest.suggestedFee)}.`
                                                      : ""
                                              } Você pode autorizar um bônus adicional ou aguardar/usar retirada.`
                                            : "Todos os raios de busca foram percorridos sem aceite. Você pode autorizar um bônus para incentivar a coleta ou cancelar a solicitação."
                                    }
                                />
                            ) : (
                                <InfoCard
                                    title="Procurando entregadores..."
                                    message={`Sua solicitação está disponível na rede Dudit (nível de busca ${Number(activeRequest.dispatchTier || 0) + 1}/5).`}
                                />
                            )
                        ) : activeRequest.status === "accepted" ? (
                            <InfoCard
                                title="Entregador a caminho da loja!"
                                message={`${activeRequest.driver?.name || "Entregador"} aceitou a entrega.`}
                                color="green"
                            />
                        ) : activeRequest.status === "picked_up" ? (
                            <InfoCard
                                title="Pedido retirado na loja"
                                message="O entregador retirou o pacote no estabelecimento."
                                color="blue"
                            />
                        ) : activeRequest.status === "out_for_delivery" ? (
                            <InfoCard
                                title="Em rota para o cliente"
                                message="O entregador está se deslocando até o endereço de entrega."
                                color="purple"
                            />
                        ) : (
                            <InfoCard
                                title="Status atual"
                                message={`Status atual: ${activeRequest.status}`}
                                color="gray"
                            />
                        )}

                        {/* DRIVER INFO IF ACCEPTED */}
                        {activeRequest.driver && (
                            <div className="rounded-2xl border border-brand-border p-4 dark:border-dark-border space-y-2 bg-white dark:bg-dark-surface">
                                <span className="text-[11px] font-bold uppercase tracking-wider text-brand-inactive-text dark:text-dark-body">
                                    Entregador Responsável
                                </span>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-bold text-sm text-brand-dark dark:text-dark-heading">
                                            {activeRequest.driver.name}
                                        </p>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                            {activeRequest.driver.vehicleType ? `Veículo: ${activeRequest.driver.vehicleType}` : "Entregador Dudit"}
                                        </p>
                                    </div>
                                    {activeRequest.driver.phone && (
                                        <a
                                            href={`tel:${activeRequest.driver.phone}`}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-brand-border dark:border-dark-border text-xs font-bold text-brand-dark dark:text-dark-heading hover:bg-brand-gray dark:hover:bg-dark-border transition"
                                        >
                                            <PhoneIcon size={13} />
                                            Ligar
                                        </a>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ORDER & FEE INFO */}
                        <div className="rounded-2xl border border-brand-border p-4 dark:border-dark-border space-y-3 bg-white dark:bg-dark-surface">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-brand-inactive-text dark:text-dark-body">Taxa de Entrega:</span>
                                <span className="font-bold text-brand-green">
                                    {formatCurrency(activeRequest.deliveryFee || deliveryFee)}
                                </span>
                            </div>
                            {Number(activeRequest.bonusAmount || 0) > 0 && (
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body">Bônus autorizado:</span>
                                    <span className="font-bold text-brand-green">
                                        + {formatCurrency(Number(activeRequest.bonusAmount))}
                                    </span>
                                </div>
                            )}
                            {destinationAddress && (
                                <div className="flex items-start gap-2 pt-2 border-t border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body">
                                    <MapPinIcon size={14} className="shrink-0 mt-0.5 text-brand-inactive-text" />
                                    <span className="line-clamp-2">{destinationAddress}</span>
                                </div>
                            )}
                        </div>

                        {/* AUTHORIZE BONUS (Fase 2 — §7.4, sempre manual) */}
                        {activeRequest.status === "available" && (
                            <div className="rounded-2xl border border-brand-border p-4 dark:border-dark-border space-y-3 bg-white dark:bg-dark-surface">
                                <span className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    Autorizar bônus opcional ao entregador
                                </span>
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    Valor adicional bancado pelo estabelecimento para acelerar o aceite (não altera a taxa cobrada do cliente).
                                </p>
                                <div className="flex items-center gap-2">
                                    <div className="w-28 shrink-0">
                                        <Input
                                            name="bonus_amount"
                                            type="number"
                                            min="1"
                                            step="0.50"
                                            placeholder="Ex: 5,00"
                                            value={bonusInput}
                                            onChange={(e) => setBonusInput(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <Input
                                            name="bonus_reason"
                                            type="text"
                                            placeholder="Motivo (opcional)"
                                            value={bonusReason}
                                            onChange={(e) => setBonusReason(e.target.value)}
                                        />
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full"
                                    onClick={handleAuthorizeBonus}
                                    disabled={isAuthorizingBonus || !bonusInput}
                                    isLoading={isAuthorizingBonus}
                                >
                                    Autorizar bônus e reenviar
                                </Button>
                            </div>
                        )}

                        {/* CANCEL BUTTON */}
                        {activeRequest.status === "available" && (
                            <Button
                                variant="outline"
                                className="w-full text-brand-red border-brand-red/30 hover:bg-brand-red/10"
                                onClick={handleCancelRequest}
                                disabled={isCancelling}
                            >
                                {isCancelling ? "Cancelando..." : "Cancelar Solicitação"}
                            </Button>
                        )}
                    </div>
                ) : (
                    /* NEW DISPATCH FLOW */
                    <div className="space-y-5">
                        {/* HOW IT WORKS INFO */}
                        <div className="rounded-2xl border border-brand-border bg-gray-50 p-4.5 dark:border-dark-border dark:bg-dark-border/20 space-y-2">
                            <div className="flex items-center gap-2 text-brand-dark dark:text-dark-heading font-bold text-sm">
                                <TruckIcon size={16} className="text-brand-green" />
                                <span>Como funciona a entrega Dudit?</span>
                            </div>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body leading-relaxed">
                                Ao solicitar, a entrega é enviada para todos os entregadores parceiros Dudit online da sua cidade. O primeiro a aceitar fará a coleta na sua loja e a entrega ao cliente.
                            </p>
                            <div className="pt-2 border-t border-brand-border/60 dark:border-dark-border/60 flex flex-wrap items-center justify-between gap-1 text-[11px] text-brand-inactive-text dark:text-dark-body">
                                <span>Limites: até 15 kg e 60L (~45x40x35cm)</span>
                                <a
                                    href="/ajuda/entregas/regras-e-limites-entregas-dudit"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-bold text-brand-green hover:underline inline-flex items-center gap-1"
                                >
                                    Ver regras e limites
                                </a>
                            </div>
                        </div>

                        {/* SUMMARY CARD */}
                        <div className="rounded-2xl border border-brand-border p-4 dark:border-dark-border space-y-3 bg-white dark:bg-dark-surface">
                            {orderNumber && (
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-brand-inactive-text dark:text-dark-body">Pedido:</span>
                                    <span className="font-bold text-brand-dark dark:text-dark-heading">
                                        #{orderNumber}
                                    </span>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-brand-inactive-text dark:text-dark-body">Taxa de Entrega:</span>
                                <span className="font-bold text-brand-green">
                                    {formatCurrency(deliveryFee)}
                                </span>
                            </div>

                            {destinationAddress && (
                                <div className="flex items-start gap-2 pt-2 border-t border-brand-border dark:border-dark-border text-xs text-brand-inactive-text dark:text-dark-body">
                                    <MapPinIcon size={14} className="shrink-0 mt-0.5 text-brand-green" />
                                    <span className="line-clamp-2">{destinationAddress}</span>
                                </div>
                            )}
                        </div>

                        {/* INSTRUCTIONS / NOTES */}
                        <div className="space-y-1.5">
                            <FormTextarea
                                label="Instruções para o entregador (opcional)"
                                placeholder="Ex: Chamar no interfone 42, ponto de referência ao lado do mercado..."
                                value={notes}
                                onChange={(e: any) => setNotes(e.target.value)}
                                rows={3}
                            />
                        </div>

                        {/* DIMENSIONS UNKNOWN WARNING (Fase 0.7 / §12.3) */}
                        {dimensionsCheck?.dimensionsUnknown && (
                            <><InfoCard
                                title="Dimensões não informadas"
                                color="orange"
                                message={(
                                    <>
                                        <p className="text-sm">
                                            {dimensionsCheck.missingProducts.length > 0
                                                ? `${dimensionsCheck.missingProducts.length} ${dimensionsCheck.missingProducts.length === 1 ? "produto" : "produtos"} sem peso/dimensão.`
                                                : "Itens sem peso/dimensão informados."}
                                        </p>
                                        <p className="text-sm mt-1 opacity-90">
                                            O entregador verá este aviso no card da oferta e pode recusar se não couber no veículo.
                                        </p>
                                        {dimensionsCheck.missingProducts.length > 0 && (
                                            <ul className="text-sm mt-1.5 list-disc pl-4 space-y-0.5 opacity-90">
                                                {dimensionsCheck.missingProducts.slice(0, 3).map((p, idx) => (
                                                    <li key={p.productId || idx} className="truncate">{p.productName}</li>
                                                ))}
                                                {dimensionsCheck.missingProducts.length > 3 && (
                                                    <li>+ {dimensionsCheck.missingProducts.length - 3} outro(s)</li>
                                                )}
                                            </ul>
                                        )}
                                    </>
                                )}
                                bottomElement={<a
                                    href={dimensionsCheck.missingProducts[0]?.productId
                                        ? `/erp/produtos/${dimensionsCheck.missingProducts[0].productId}`
                                        : "/erp/produtos"}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Preencher agora
                                </a>} />

                                <Checkbox
                                    label="Continuar mesmo assim (estou ciente do aviso ao entregador)"
                                    checked={acknowledgeUnknownDimensions}
                                    onChange={(checked) => setAcknowledgeUnknownDimensions(checked)}
                                    className="mt-0.5"
                                />
                            </>
                        )}

                        {!primaryOrderId && (
                            <InfoCard message="Salve o pedido primeiro para poder disparar a solicitação para a rede." color="orange" />
                        )}
                    </div>
                )}
            </div>

            {/* FOOTER */}
            {
                !activeRequest || activeRequest.status === "cancelled" ? (
                    <footer className="border-t border-brand-border p-6 dark:border-dark-border bg-white dark:bg-dark-surface">
                        <Button
                            variant="default"
                            className="w-full h-11"
                            onClick={handleRequestDelivery}
                            disabled={
                                isSubmitting ||
                                !primaryOrderId ||
                                (Boolean(dimensionsCheck?.dimensionsUnknown) && !acknowledgeUnknownDimensions)
                            }
                        >
                            {isSubmitting ? "Solicitando..." : "Solicitar Entregador Dudit"}
                        </Button>
                    </footer>
                ) : null
            }
        </div >
    )

    if (isMobile) {
        return (
            <BottomSheet isOpen={isOpen} onClose={onClose}>
                {content}
            </BottomSheet>
        )
    }

    return (
        <Portal>
            <div
                className={`fixed inset-0 z-50 bg-black/50 transition-opacity duration-300 ${isOpen ? "opacity-100" : "pointer-events-none opacity-0"
                    }`}
                style={{ zIndex }}
                onClick={onClose}
            >
                <div
                    className={`fixed right-4 top-4 bottom-4 w-[460px] overflow-hidden rounded-2xl bg-white shadow-2xl transition-all duration-300 dark:bg-dark-surface ${isOpen ? "translate-x-0 opacity-100" : "translate-x-[120%] opacity-100"
                        }`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {content}
                </div>
            </div>
        </Portal>
    )
}
