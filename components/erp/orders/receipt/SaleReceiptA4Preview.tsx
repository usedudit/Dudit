"use client"

import { useMemo } from "react"
import { formatCurrency } from "@/lib/utils"
import {
    DEFAULT_RECEIPT_ACKNOWLEDGMENT,
    type SaleReceiptData,
} from "@/lib/sales/sale-receipt"
import { QUOTE_PREVIEW_PRIMARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import {
    ReceiptA4Document,
    ReceiptA4Page,
    ReceiptStoreHeaderA4,
    ReceiptA4StoreData,
    ReceiptA4Footer,
} from "./ReceiptComponents"

type SaleReceiptA4PreviewProps = {
    data: SaleReceiptData
    footerMessage: string
    showAcknowledgment?: boolean
    printMode?: boolean
}

const SaleReceiptA4Preview = ({
    data,
    footerMessage,
    showAcknowledgment = true,
    printMode = false,
}: SaleReceiptA4PreviewProps) => {
    const primaryColor = data.primaryColor || QUOTE_PREVIEW_PRIMARY_COLOR
    const partnerName = data.partner.fantasyName
    const partnerAvatar = data.partnerAvatar

    const quoteItems = data.items.map((item) => ({
        description: item.description,
        code: item.code,
        qty: item.quantity,
        unit: item.unit || "UN",
        unitPrice: item.unitPrice,
    }))

    const grossTotal = data.itemsTotal || data.items.reduce((acc, item) => acc + item.totalPrice, 0)
    const discountValue =
        (data.generalDiscount || 0) + (data.couponDiscount || 0) + (data.methodDiscount || 0)
    const shippingNum = data.shippingFee || 0
    const otherCosts = (data.otherCosts || 0) + (data.methodFee || 0) + (data.methodInterest || 0)
    const total = data.total
    const saleDate = data.saleDateTime

    const isDeliveryFree = data.deliveryPayer === 'seller'
    const isDelivery = data.deliveryType !== "pickup" && Boolean(data.customerAddress)
    const shouldShowOnlinePaymentNotice = Boolean(
        data.isOnlinePayment &&
        data.deliveryType === "delivery" &&
        data.items.length > 0
    )
    const shouldShowAck = showAcknowledgment && data.showAcknowledgment !== false

    const pages = useMemo(() => {
        const ROW_HEIGHT = 40
        const TOTALS_SECTION_HEIGHT = 380
        const FOOTER_HEIGHT = 40
        const P1_FIXED_CONTENT_HEIGHT = 450
        const P1_TOTAL_AVAILABLE_HEIGHT = 1123
        const P1_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT
        const PN_FIXED_CONTENT_HEIGHT = 220
        const PN_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT

        const chunks: { items: typeof quoteItems; hasTotals: boolean; type: string }[] = []
        let remainingItems = [...quoteItems]
        const requiredHeightAllOnP1 = remainingItems.length * ROW_HEIGHT + TOTALS_SECTION_HEIGHT

        if (requiredHeightAllOnP1 <= P1_AVAILABLE_FOR_ROWS_AND_TOTALS) {
            chunks.push({ items: remainingItems, hasTotals: true, type: "first" })
            return chunks
        }

        const maxItemsP1 = Math.max(1, Math.floor(P1_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT))
        chunks.push({ items: remainingItems.slice(0, maxItemsP1), hasTotals: false, type: "first" })
        remainingItems = remainingItems.slice(maxItemsP1)

        while (remainingItems.length > 0) {
            const requiredHeightOnPn = remainingItems.length * ROW_HEIGHT + TOTALS_SECTION_HEIGHT
            if (requiredHeightOnPn <= PN_AVAILABLE_FOR_ROWS_AND_TOTALS) {
                chunks.push({ items: remainingItems, hasTotals: true, type: "middle" })
                remainingItems = []
            } else {
                const maxItemsPn = Math.max(1, Math.floor(PN_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT))
                chunks.push({ items: remainingItems.slice(0, maxItemsPn), hasTotals: false, type: "middle" })
                remainingItems = remainingItems.slice(maxItemsPn)
            }
        }

        if (chunks.length > 0 && !chunks[chunks.length - 1].hasTotals) {
            chunks.push({ items: [], hasTotals: true, type: "middle" })
        }
        if (chunks.length === 0) {
            chunks.push({ items: [], hasTotals: true, type: "first" })
        }
        return chunks
    }, [quoteItems])

    return (
        <ReceiptA4Document
            printMode={printMode}
            printClassName="sale-receipt-a4-print"
        >
            {pages.map((page, pageIndex) => (
                <ReceiptA4Page key={pageIndex} printMode={printMode}>
                    <ReceiptStoreHeaderA4
                        partnerName={partnerName}
                        partnerAvatar={partnerAvatar}
                        primaryColor={data.primaryColor}
                        secondaryColor={data.secondaryColor}
                        title="Comprovante de venda"
                        subtitle={`Pedido #${data.orderNumber}`}
                    />

                    <div className={`flex-1 flex flex-col ${page.type !== "first" ? "pt-8" : ""}`}>
                        {page.type === "first" && (
                            <>
                                <div className="px-8 py-6">
                                    <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-6 w-full">
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Pedido</span>
                                            <span className="font-bold text-sm text-brand-dark">{data.orderNumber}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Data</span>
                                            <span className="font-bold text-sm text-brand-dark">{saleDate}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">
                                                Canal / Origem
                                            </span>
                                            <span className="font-bold text-sm text-brand-dark">
                                                {data.isOnlineOrder ? (
                                                    data.deliveryType === "pickup" ? "Pedido online - retirada" : "Pedido online - entrega"
                                                ) : (
                                                    data.orderSource || data.sellerName || "Não informado"
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <ReceiptA4StoreData
                                    partnerHeader={data.partner}
                                    partnerName={partnerName}
                                    customerName={data.customerName}
                                    customerPhone={data.customerPhone}
                                    customerAddress={data.customerAddress}
                                />
                            </>
                        )}

                        <div className="px-8 pb-4">
                            <table className="w-full text-left border-separate border-spacing-0">
                                <thead>
                                    <tr className="bg-brand-gray/40">
                                        <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                            Item
                                        </th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center w-24 border-b border-gray-100">
                                            Qtd
                                        </th>
                                        <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-28 border-b border-gray-100">
                                            Preço
                                        </th>
                                        <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-32 rounded-tr-xl border-b border-gray-100">
                                            Total
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {page.items.map((item, idx) => (
                                        <tr key={idx} className="bg-white">
                                            <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                <span className="font-bold text-[13px] text-black block truncate max-w-[250px]">
                                                    {item.description}
                                                </span>
                                            </td>
                                            <td className="py-2 px-4 border-b border-gray-50 text-center">
                                                <span className="text-[13px] font-medium text-gray-600">{item.qty}</span>
                                            </td>
                                            <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                <span className="text-[13px] font-medium text-gray-600">
                                                    {formatCurrency(item.unitPrice)}
                                                </span>
                                            </td>
                                            <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-right">
                                                <span className="text-[13px] font-bold text-black">
                                                    {formatCurrency(item.unitPrice * item.qty)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {page.hasTotals && (
                            <div className="mt-6">
                                <div className="px-8 pb-6 flex flex-col gap-4">
                                    <div className="w-full bg-brand-gray/40 p-6 rounded-2xl text-black space-y-2.5">
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500 font-medium">Itens do pedido</span>
                                            <span className="font-bold">{formatCurrency(grossTotal)}</span>
                                        </div>

                                        {discountValue > 0.009 && (
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-500 font-medium">Descontos</span>
                                                <span className="font-bold text-brand-green">
                                                    -{formatCurrency(discountValue)}
                                                </span>
                                            </div>
                                        )}

                                        {(shippingNum > 0.009 || data.deliveryPayer === 'seller') && (
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-500 font-medium">Taxa de entrega</span>
                                                <span className={`font-bold ${isDeliveryFree ? 'text-brand-green' : ''}`}>
                                                    {isDeliveryFree ? "Grátis (subsidiado)" : formatCurrency(shippingNum)}
                                                </span>
                                            </div>
                                        )}

                                        {otherCosts > 0.009 && (
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-500 font-medium">Outros custos</span>
                                                <span className="font-bold">+{formatCurrency(otherCosts)}</span>
                                            </div>
                                        )}

                                        <div className="border-t border-gray-200 my-2" />

                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-sm">Total do Pedido</span>
                                            <div
                                                className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm"
                                                style={{ backgroundColor: primaryColor }}
                                            >
                                                {formatCurrency(total)}
                                            </div>
                                        </div>

                                        {/* Bloco de Forma de Pagamento */}
                                        <div className="pt-3 border-t border-gray-200/80 space-y-1.5">
                                            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Forma de pagamento</p>
                                            {data.paymentLines && data.paymentLines.length > 0 ? (
                                                data.paymentLines.map((line, i) => (
                                                    <div key={i} className="flex justify-between items-center text-xs">
                                                        <span className={`${line.kind === "sinal" ? "text-brand-dark font-bold" : "text-gray-600 font-medium"}`}>
                                                            {line.label}
                                                        </span>
                                                        <span className="font-bold text-brand-dark">{formatCurrency(line.amount)}</span>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="flex justify-between items-center text-xs">
                                                    <span className="text-gray-600">Não informado</span>
                                                    <span className="font-bold">{formatCurrency(total)}</span>
                                                </div>
                                            )}

                                            {/* Aviso para pagamento online */}
                                            {shouldShowOnlinePaymentNotice && (
                                                <div className="w-full bg-brand-gray/40 p-6 rounded-2xl text-black space-y-2.5 mt-2">
                                                    Pedido pago online. Não cobrar do cliente
                                                </div>
                                            )}

                                            {data.change > 0.009 && (
                                                <div className="flex justify-between items-center text-xs pt-1 text-gray-600">
                                                    <span>Troco</span>
                                                    <span className="font-bold">{formatCurrency(data.change)}</span>
                                                </div>
                                            )}
                                        </div>

                                        {/* Detalhamento de parcelas */}
                                        {data.installmentDetails && data.installmentDetails.length > 0 && (
                                            <div className="pt-3 border-t border-gray-200/80 space-y-1.5">
                                                <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Detalhamento das parcelas</p>
                                                {data.installmentDetails.map((inst, i) => (
                                                    <div key={i} className="flex items-center justify-between text-xs bg-brand-gray/30 rounded-lg py-2">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-brand-dark">
                                                                Parcela {String(inst.number).padStart(2, "0")}/{String(inst.total).padStart(2, "0")}
                                                            </span>
                                                            <span className="text-gray-500 text-[10px]">Vencimento: {inst.dueDate}</span>
                                                        </div>
                                                        <span className="font-bold text-brand-dark">{formatCurrency(inst.amount)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Observações do pedido */}
                                    {data.notes && (
                                        <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700">
                                            <p className="font-bold uppercase tracking-wide text-[10px] text-gray-500 mb-1">Observações:</p>
                                            <p className="whitespace-pre-line leading-relaxed">{data.notes}</p>
                                        </div>
                                    )}
                                </div>

                                {shouldShowAck && (
                                    <div className="px-8 pb-6">
                                        <p className="text-[11px] text-gray-600 leading-relaxed text-center">
                                            {DEFAULT_RECEIPT_ACKNOWLEDGMENT}
                                        </p>
                                        <div className="mt-6 border-b border-dashed border-gray-400 w-full max-w-md mx-auto" />
                                        <p className="text-[10px] font-bold text-center uppercase mt-2 text-gray-700">
                                            Assinatura do cliente
                                        </p>
                                    </div>
                                )}

                                {data.returnPolicyBlock?.showBlock && (
                                    <div className="px-8 pb-4">
                                        <p className="text-[10px] font-bold uppercase text-gray-700 mb-1">Política de trocas</p>
                                        <p className="text-[10px] text-gray-600">
                                            Prazo comercial: {data.returnPolicyBlock.commercialDeadlineDays} dias
                                            {data.returnPolicyBlock.additionalWarrantyDays > 0 && (
                                                <> · Garantia adicional: {data.returnPolicyBlock.additionalWarrantyDays} dias</>
                                            )}
                                        </p>
                                        {data.returnPolicyBlock.message && (
                                            <p className="text-[10px] text-gray-600 mt-1">{data.returnPolicyBlock.message}</p>
                                        )}
                                    </div>
                                )}

                                <div className="px-8 pb-12">
                                    <p className="text-center font-bold text-sm uppercase tracking-wide text-brand-dark">
                                        {footerMessage}
                                    </p>
                                </div>
                            </div>
                        )}

                        {!page.hasTotals && <div className="mt-auto" />}
                    </div>

                    <ReceiptA4Footer primaryColor={data.primaryColor} />
                </ReceiptA4Page>
            ))}
        </ReceiptA4Document>
    )
}

export default SaleReceiptA4Preview