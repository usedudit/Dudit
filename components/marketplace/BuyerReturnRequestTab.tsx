"use client"

import React, { useMemo } from "react"
import { Badge, Button, FormSection } from "@/components/reusable"
import { formatCurrency, formatDateTime, formatDate } from "@/lib/utils"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import { getPrimaryProductDisplayImage } from "@/lib/utils/product-display-images"
import { getReturnStatusMeta } from "@/components/erp/returns/ReturnListRow"
import { getDeliveryStatusMeta, getDeliveryStatusLabelForType, getFulfillmentModeLabel } from "@/lib/orders/status"
import {
    getReverseLogisticsMethodLabel,
    getReverseLogisticsStatusLabel,
    getReverseLogisticsCustomerDescription,
} from "@/lib/returns/types"
import { canReportReturnToDudit, getShippingPayerLabel } from "@/lib/returns/policy"

const PLACEHOLDER_IMAGE = "https://img.dudit.com.br/static/Placeholder.png"

function getReasonLabel(reason?: string | null): string {
    const raw = String(reason || "").toLowerCase()
    if (raw === "wrong_item" || raw === "item errado" || raw === "recebi item errado") return "Item errado"
    if (raw === "defective" || raw === "item com defeito" || raw === "defeito") return "Item com defeito"
    if (raw === "damaged" || raw === "item danificado") return "Item danificado"
    if (raw === "different_from_description" || raw === "not_as_described" || raw === "diferente da descrição") return "Diferente da descrição"
    if (raw === "missing_parts" || raw === "faltam partes") return "Faltam partes"
    if (raw === "arrived_late" || raw === "chegou atrasado") return "Chegou atrasado"
    if (raw === "changed_mind" || raw === "buyer_remorse" || raw === "mudou de ideia" || raw === "arrependimento") return "Mudou de ideia"
    return "Outro"
}

function getConditionLabel(condition?: string | null): string {
    const raw = String(condition || "").toLowerCase()
    if (raw === "sealed" || raw === "lacrado") return "Lacrado"
    if (raw === "damaged" || raw === "danificado") return "Danificado"
    return "Aberto"
}

function mapExchangeSubstatusToDeliveryStatus(substatus?: string | null): string {
    const sub = String(substatus || "").toLowerCase()
    if (sub === "entregue" || sub === "concluido" || sub === "completed") return "delivered"
    if (sub === "enviado" || sub === "sent") return "sent"
    if (sub === "separando" || sub === "reserved") return "preparing"
    return "not_sent"
}

const SummaryRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <div className="flex justify-between items-center text-[14px] gap-4 py-2.5 border-b border-brand-border/30 dark:border-dark-border/30 last:border-0">
        <span className="text-brand-inactive-text dark:text-dark-body font-medium">{label}</span>
        <div className="text-right font-bold text-brand-dark dark:text-dark-heading">{value}</div>
    </div>
)

interface BuyerReturnRequestTabProps {
    order: any
    returnRequest: any
    onReportToDudit: () => void
}

export function BuyerReturnRequestTab({
    order,
    returnRequest,
    onReportToDudit,
}: BuyerReturnRequestTabProps) {
    const resolutionType = returnRequest.approved_resolution || returnRequest.desired_resolution || "refund"
    const resolutionLabel =
        resolutionType === "refund" ? "Reembolso" :
            resolutionType === "exchange" ? "Troca" :
                resolutionType === "store_credit" ? "Vale-compra" :
                    resolutionType === "rejected" ? "Recusada" : "Sem resolução"

    const statusMeta = getReturnStatusMeta(returnRequest.status)

    const orderItemsById = useMemo(() => {
        const map = new Map<string, any>()
        for (const oi of order?.order_items || []) {
            map.set(oi.id, oi)
        }
        return map
    }, [order?.order_items])

    const returnedItems = useMemo(() => {
        const list = Array.isArray(returnRequest.return_items) ? returnRequest.return_items : []
        return list.map((ri: any) => {
            const oi = orderItemsById.get(ri.order_item_id)
            const isService = Boolean(oi?.service_id || oi?.line_type === "service_booking")
            const img = oi
                ? (isService
                    ? (oi.services?.images?.[0] ? getR2ImageUrl(oi.services.images[0], "thumb") : PLACEHOLDER_IMAGE)
                    : getPrimaryProductDisplayImage({
                        images: oi.products?.images || null,
                        video_thumbnail: oi.products?.video_thumbnail || null,
                        fallback_variant_image: oi.product_variants?.variant_options?.image || null,
                    }))
                : PLACEHOLDER_IMAGE
            const quantity = Number(ri.quantity || 1)
            const orderedQuantity = Number(ri.ordered_quantity || oi?.quantity || quantity)
            const unitPrice = Number(ri.unit_price_snapshot ?? oi?.product_price ?? 0)
            const netVal = Number(ri.net_item_value_snapshot ?? 0)
            const lineTotal = netVal > 0 ? netVal : unitPrice * quantity

            return {
                id: ri.id || ri.order_item_id,
                productName: ri.product_name_snapshot || oi?.products?.name || oi?.services?.name || oi?.product_name || "Item",
                sku: ri.sku_snapshot || oi?.products?.sku || "",
                image: img,
                quantity,
                orderedQuantity,
                unitPrice: unitPrice > 0 ? unitPrice : (quantity > 0 ? lineTotal / quantity : 0),
                lineTotal,
                reason: ri.reason || returnRequest.reason,
                condition: ri.condition || "opened",
                isService,
            }
        })
    }, [returnRequest.return_items, returnRequest.reason, orderItemsById])

    const exchangeItems = useMemo(() => {
        const snap = Array.isArray(returnRequest.exchange_items_snapshot) ? returnRequest.exchange_items_snapshot : []
        return snap.map((ei: any, idx: number) => {
            const unitPrice = Number(ei.unit_price || ei.price || 0)
            const quantity = Number(ei.quantity || 1)
            return {
                key: `${ei.product_id || idx}-${ei.variant_id || idx}`,
                name: ei.product_name || ei.name || "Produto substituto",
                sku: ei.sku || "",
                image: ei.image ? getR2ImageUrl(ei.image, "thumb") : PLACEHOLDER_IMAGE,
                quantity,
                unitPrice,
                lineTotal: unitPrice * quantity,
            }
        })
    }, [returnRequest.exchange_items_snapshot])

    const creditAvailable = useMemo(
        () => returnedItems.reduce((sum: number, i: any) => sum + Number(i.lineTotal || 0), 0),
        [returnedItems]
    )
    const replacementTotal = useMemo(
        () => exchangeItems.reduce((sum: number, i: any) => sum + Number(i.lineTotal || 0), 0),
        [exchangeItems]
    )
    const exchangeDifference = Math.max(0, replacementTotal - creditAvailable)
    const exchangeSurplus = Math.max(0, creditAvailable - replacementTotal)

    const refundAmount = Number(returnRequest.refund_amount || 0)
    const storeCreditAmount = Number(returnRequest.store_credit_amount || 0)
    const totalResolution =
        resolutionType === "refund" ? (refundAmount > 0 ? refundAmount : creditAvailable) :
            resolutionType === "store_credit" ? (storeCreditAmount > 0 ? storeCreditAmount : creditAvailable) :
                creditAvailable

    const exchangeDeliveryType = order?.delivery_type || "delivery"
    const exchangeDeliveryStatus = mapExchangeSubstatusToDeliveryStatus(returnRequest.exchange_substatus)
    const exchangeDeliveryMeta = getDeliveryStatusMeta(exchangeDeliveryStatus)

    const reverseMethod = returnRequest.reverse_logistics_method || null
    const reverseStatus = returnRequest.reverse_logistics_status || null
    const reverseFreightPayer = returnRequest.return_freight_payer || null
    const reverseTracking = returnRequest.reverse_logistics_tracking_code || null
    const reverseNotes = returnRequest.reverse_logistics_notes || null
    const reverseDesc = getReverseLogisticsCustomerDescription(reverseMethod)
    const returnShipment = Array.isArray(order?.order_shipments)
        ? order.order_shipments.find((s: any) => s.kind === "return" && s.status !== "cancelled")
        : null

    const evidenceList = useMemo(() => {
        const rows = Array.isArray(returnRequest.return_evidence) ? returnRequest.return_evidence : []
        return rows
            .map((ev: any) => ({
                id: ev.id,
                url: ev.signed_url || ev.file_url || null,
                name: ev.file_name || "Evidência",
                type: ev.file_type || "",
            }))
            .filter((ev: any) => Boolean(ev.url))
    }, [returnRequest.return_evidence])

    const canReport = canReportReturnToDudit({
        status: returnRequest.status,
        slaStatus: returnRequest.sla_status,
        reportedToDuditAt: returnRequest.reported_to_dudit_at,
    })

    const summaryCard = (
        <div className="border border-brand-border dark:border-dark-border rounded-xl overflow-hidden bg-white dark:bg-dark-surface">
            <div className="text-md bg-brand-gray dark:bg-dark-border/50 px-6 py-4 border-b border-brand-border dark:border-dark-border font-bold text-brand-dark dark:text-dark-heading">
                Resumo da Solicitação
            </div>
            <div className="p-6">
                <div className="space-y-0.5">
                    <SummaryRow
                        label="Status da solicitação"
                        value={
                            <Badge variant={statusMeta.variant}>
                                {statusMeta.label}
                            </Badge>
                        }
                    />
                    <SummaryRow
                        label="Data"
                        value={formatDateTime(returnRequest.created_at)}
                    />
                    <SummaryRow
                        label="Tipo de resolução"
                        value={resolutionLabel}
                    />

                    {resolutionType === "exchange" && (
                        <>
                            <SummaryRow
                                label="Entrega do pedido de troca"
                                value={getFulfillmentModeLabel(exchangeDeliveryType)}
                            />
                            <SummaryRow
                                label="Status do envio da troca"
                                value={
                                    <Badge variant={exchangeDeliveryMeta.variant}>
                                        {getDeliveryStatusLabelForType(exchangeDeliveryStatus, exchangeDeliveryType)}
                                    </Badge>
                                }
                            />
                            {exchangeItems.length > 0 && (
                                <SummaryRow
                                    label="Total dos substitutos"
                                    value={formatCurrency(replacementTotal)}
                                />
                            )}
                            <SummaryRow
                                label="Crédito disponível"
                                value={formatCurrency(creditAvailable)}
                            />
                            {exchangeItems.length > 0 && exchangeDifference > 0.009 && (
                                <SummaryRow
                                    label="Diferença a pagar"
                                    value={formatCurrency(exchangeDifference)}
                                />
                            )}
                            {exchangeItems.length > 0 && exchangeSurplus > 0.009 && (
                                <SummaryRow
                                    label="Saldo restante"
                                    value={formatCurrency(exchangeSurplus)}
                                />
                            )}
                        </>
                    )}

                    {resolutionType === "refund" && (
                        <>
                            <SummaryRow
                                label="Valor do reembolso"
                                value={formatCurrency(refundAmount > 0 ? refundAmount : creditAvailable)}
                            />
                            {returnRequest.refund_payment_method && (
                                <SummaryRow
                                    label="Método de reembolso"
                                    value={returnRequest.refund_payment_method}
                                />
                            )}
                        </>
                    )}

                    {resolutionType === "store_credit" && (
                        <SummaryRow
                            label="Valor do vale-compra"
                            value={formatCurrency(storeCreditAmount > 0 ? storeCreditAmount : creditAvailable)}
                        />
                    )}
                </div>

                <div className="pt-4 border-t border-brand-border dark:border-dark-border mt-3 flex justify-between items-center">
                    <span className="font-bold text-base text-brand-dark dark:text-dark-heading">
                        Total da Resolução
                    </span>
                    <span className="font-bold text-xl tracking-tight text-brand-dark dark:text-dark-heading">
                        {formatCurrency(totalResolution)}
                    </span>
                </div>

                {returnRequest.reported_to_dudit_at && (
                    <p className="mt-4 text-xs text-brand-inactive-text dark:text-dark-body">
                        Reporte enviado à Dudit em {formatDate(returnRequest.reported_to_dudit_at)}.
                    </p>
                )}

                {canReport && (
                    <div className="mt-4 pt-3 border-t border-brand-border/40 dark:border-dark-border/40">
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full"
                            onClick={onReportToDudit}
                        >
                            Reportar à Dudit
                        </Button>
                    </div>
                )}
            </div>
        </div>
    )

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Column */}
            <div className="lg:col-span-8 space-y-8">
                {/* Produtos para Devolução */}
                <FormSection title="Produtos para Devolução">
                    {returnedItems.length === 0 ? (
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Nenhum item listado nesta solicitação.
                        </p>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {returnedItems.map((item: any) => (
                                <div key={item.id} className="flex items-start gap-4">
                                    <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border bg-white">
                                        <img
                                            src={item.image || PLACEHOLDER_IMAGE}
                                            className="w-full h-full object-cover rounded-full"
                                            alt={item.productName}
                                            onError={(e: any) => { e.target.src = PLACEHOLDER_IMAGE }}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1 gap-3">
                                            <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                {item.productName}
                                            </h4>
                                            <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading shrink-0">
                                                {formatCurrency(item.lineTotal)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">
                                            SKU: {item.sku || "Sem SKU"}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-inactive-text dark:text-dark-body">
                                            <span>
                                                Qtd devolvida: <strong className="text-brand-dark dark:text-dark-heading">{item.quantity}</strong> de {item.orderedQuantity}
                                            </span>
                                            <span>•</span>
                                            <span>
                                                Preço unitário: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(item.unitPrice)}</strong>
                                            </span>
                                            <span>•</span>
                                            <span>
                                                Motivo: <strong className="text-brand-dark dark:text-dark-heading">{getReasonLabel(item.reason)}</strong>
                                            </span>
                                            {!item.isService && (
                                                <>
                                                    <span>•</span>
                                                    <span>
                                                        Condição: <strong className="text-brand-dark dark:text-dark-heading">{getConditionLabel(item.condition)}</strong>
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </FormSection>

                {/* Produtos Substitutos */}
                {exchangeItems.length > 0 && (
                    <FormSection hasSeparator title="Produtos Substitutos">
                        <div className="flex flex-col gap-6">
                            {exchangeItems.map((item: any) => (
                                <div key={item.key} className="flex items-start gap-4">
                                    <div className="w-16 h-16 overflow-hidden shrink-0 rounded-full border border-brand-border dark:border-dark-border bg-white">
                                        <img
                                            src={item.image || PLACEHOLDER_IMAGE}
                                            className="w-full h-full object-cover rounded-full"
                                            alt={item.name}
                                            onError={(e: any) => { e.target.src = PLACEHOLDER_IMAGE }}
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start mb-1 gap-3">
                                            <h4 className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading truncate">
                                                {item.name}
                                            </h4>
                                            <span className="font-bold text-[14px] md:text-[15px] text-brand-dark dark:text-dark-heading shrink-0">
                                                {formatCurrency(item.lineTotal)}
                                            </span>
                                        </div>
                                        <div className="text-xs text-brand-inactive-text dark:text-dark-body uppercase mb-2">
                                            SKU: {item.sku || "Sem SKU"}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-brand-inactive-text dark:text-dark-body">
                                            <span>
                                                Quantidade: <strong className="text-brand-dark dark:text-dark-heading">{item.quantity}</strong> un.
                                            </span>
                                            <span>•</span>
                                            <span>
                                                Preço unitário: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(item.unitPrice)}</strong>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </FormSection>
                )}

                {/* Logística Reversa */}
                {reverseMethod && (
                    <FormSection hasSeparator title="Logística Reversa">
                        <div className="space-y-1">
                            <SummaryRow
                                label="Como devolver o item"
                                value={getReverseLogisticsMethodLabel(reverseMethod)}
                            />
                            {reverseMethod !== "not_required" && (
                                <SummaryRow
                                    label="Status da devolução"
                                    value={getReverseLogisticsStatusLabel(reverseStatus)}
                                />
                            )}
                            {reverseFreightPayer && reverseMethod !== "not_required" && reverseMethod !== "in_person" && (
                                <SummaryRow
                                    label="Frete da devolução"
                                    value={getShippingPayerLabel(reverseFreightPayer)}
                                />
                            )}
                            {(returnShipment?.tracking_number || reverseTracking) && (
                                <SummaryRow
                                    label="Rastreio / referência"
                                    value={
                                        returnShipment?.tracking_url ? (
                                            <a
                                                href={returnShipment.tracking_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-brand-green underline"
                                            >
                                                {returnShipment.tracking_number || "Acompanhar"}
                                            </a>
                                        ) : (
                                            returnShipment?.tracking_number || reverseTracking
                                        )
                                    }
                                />
                            )}
                        </div>
                        {reverseDesc && (
                            <p className="mt-3 text-sm text-brand-inactive-text dark:text-dark-body">
                                {reverseDesc}
                            </p>
                        )}
                        {reverseNotes && (
                            <div className="mt-3 p-3.5 rounded-xl bg-brand-gray/40 dark:bg-dark-border/30 border border-brand-border/40 dark:border-dark-border/40 text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap">
                                <span className="block text-xs font-semibold text-brand-inactive-text dark:text-dark-body mb-1">
                                    Instruções da loja
                                </span>
                                {reverseNotes}
                            </div>
                        )}
                    </FormSection>
                )}

                {/* Evidências */}
                {evidenceList.length > 0 && (
                    <FormSection hasSeparator title="Evidências">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                            {evidenceList.map((ev: any, idx: number) => {
                                const isPdf = String(ev.type || "").includes("pdf") || String(ev.name || "").toLowerCase().endsWith(".pdf")
                                return (
                                    <a
                                        key={ev.id || idx}
                                        href={ev.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative aspect-square rounded-xl overflow-hidden border border-brand-border dark:border-dark-border bg-brand-gray/30 flex items-center justify-center"
                                    >
                                        {isPdf ? (
                                            <span className="text-xs font-semibold text-brand-dark dark:text-dark-heading px-2 text-center truncate">
                                                {ev.name}
                                            </span>
                                        ) : (
                                            <img
                                                src={ev.url}
                                                alt={ev.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                            />
                                        )}
                                    </a>
                                )
                            })}
                        </div>
                    </FormSection>
                )}

                {/* Mensagem opcional / Observações */}
                {(returnRequest.customer_message || returnRequest.seller_notes) && (
                    <FormSection hasSeparator title="Mensagens e Observações">
                        <div className="space-y-4">
                            {returnRequest.customer_message && (
                                <div className="space-y-1.5">
                                    <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                        Sua mensagem
                                    </p>
                                    <div className="p-3.5 rounded-xl bg-brand-gray/40 dark:bg-dark-border/30 border border-brand-border/40 dark:border-dark-border/40 text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap">
                                        {returnRequest.customer_message}
                                    </div>
                                </div>
                            )}
                            {returnRequest.seller_notes && (
                                <div className="space-y-1.5">
                                    <p className="text-xs font-semibold text-brand-inactive-text dark:text-dark-body">
                                        Observações da loja
                                    </p>
                                    <div className="p-3.5 rounded-xl bg-brand-gray/40 dark:bg-dark-border/30 border border-brand-border/40 dark:border-dark-border/40 text-sm text-brand-dark dark:text-dark-heading whitespace-pre-wrap">
                                        {returnRequest.seller_notes}
                                    </div>
                                </div>
                            )}
                        </div>
                    </FormSection>
                )}

                {/* Mobile/Tablet Summary Card */}
                <div className="block lg:hidden">
                    {summaryCard}
                </div>
            </div>

            {/* Right Column (Desktop Summary Card matching Resumo dos Valores) */}
            <div className="hidden lg:block lg:col-span-4 pl-12 border-l border-brand-border dark:border-dark-border space-y-6">
                {summaryCard}
            </div>
        </div>
    )
}
