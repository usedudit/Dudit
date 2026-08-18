"use client"

import {
    DEFAULT_RECEIPT_ACKNOWLEDGMENT,
    formatReceiptAmount,
    type SaleReceiptData,
} from "@/lib/sales/sale-receipt"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"

const DASH = "-".repeat(60)

function DashedLine({ className = "my-1" }: { className?: string }) {
    return (
        <p className={`text-center overflow-hidden whitespace-nowrap select-none ${className}`}>
            {DASH}
        </p>
    )
}

type SaleReceiptThermalPreviewProps = {
    data: SaleReceiptData
    footerMessage: string
    showAcknowledgment: boolean
    printMode?: boolean
}

function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
    return (
        <div className={`flex justify-between gap-2 text-[11px] leading-tight ${bold ? "font-bold" : ""}`}>
            <span className="shrink-0">{left}</span>
            <span className="text-right shrink-0">{right}</span>
        </div>
    )
}

export default function SaleReceiptThermalPreview({
    data,
    footerMessage,
    showAcknowledgment,
    printMode = false,
}: SaleReceiptThermalPreviewProps) {
    const grossTotal = data.items.reduce((acc, item) => acc + item.totalPrice, 0)
    const isDeliveryFree = data.deliveryPayer === 'seller'

    return (
        <div
            className={`mx-auto bg-[#fffef5] text-black font-mono text-[11px] leading-snug ${printMode ? "sale-receipt-thermal-print" : ""
                }`}
            style={{ width: printMode ? "80mm" : "320px", maxWidth: "100%" }}
        >
            <div className="px-3 py-4">
                {/* Header estabelecimento */}
                <div className="text-center mb-2">
                    <p className="font-bold text-[13px] uppercase tracking-tight">{data.partner.fantasyName}</p>
                    {data.partner.legalName ? <p className="text-[10px] mt-0.5">{data.partner.legalName}</p> : null}
                    {data.partner.phone ? <p className="text-[9px] mt-0.5">{formatBrazilPhone(data.partner.phone)}</p> : null}
                    {data.partner.addressLine ? (
                        <p className="text-[9px] mt-1 leading-tight whitespace-pre-line">{data.partner.addressLine}</p>
                    ) : null}
                    {data.partner.taxIdLine ? (
                        <p className="text-[9px] mt-1 leading-tight">{data.partner.taxIdLine}</p>
                    ) : null}
                </div>

                <DashedLine className="my-1" />

                {/* Consumidor + pedido/data */}
                <p className="text-[10px]">
                    <span className="font-bold">Cliente:</span> {data.customerName}
                </p>
                {data.customerPhone ? (
                    <p className="text-[10px]">{formatBrazilPhone(data.customerPhone)}</p>
                ) : null}
                {data.customerAddress ? (
                    <p className="text-[10px] whitespace-pre-line">{data.customerAddress}</p>
                ) : null}
                <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span>Nº DO PEDIDO: {data.orderNumber}</span>
                    <span>{data.saleDateTime}</span>
                </div>
                <p className="text-[10px]">
                    <span className="font-bold">Vendedor:</span> {data.sellerName}
                </p>

                <DashedLine className="my-1" />

                {/* Cabeçalho itens */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 text-[10px] font-bold uppercase">
                    <span># COD DESC</span>
                    <span className="text-right">QTD</span>
                    <span className="text-right">VL UN</span>
                    <span className="text-right">VL ITEM</span>
                </div>
                <DashedLine className="mb-1" />

                {/* Itens */}
                <div className="space-y-1 mb-2">
                    {data.items.map((item) => (
                        <div key={item.index} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 text-[10px] items-start">
                            <span className="break-words min-w-0 pr-1">
                                {String(item.index).padStart(3, "0")} {item.code} {item.description}
                            </span>
                            <span className="text-right whitespace-nowrap shrink-0">
                                {item.quantity} {item.unit}
                            </span>
                            <span className="text-right whitespace-nowrap shrink-0 text-gray-700">
                                {formatReceiptAmount(item.unitPrice)}
                            </span>
                            <span className="text-right whitespace-nowrap font-bold shrink-0">
                                {formatReceiptAmount(item.totalPrice)}
                            </span>
                        </div>
                    ))}
                </div>

                <DashedLine className="my-1" />

                {/* Totais */}
                <div className="space-y-1">
                    <Row left="Total bruto" right={formatReceiptAmount(grossTotal)} />
                    <div className="flex justify-between items-baseline my-1">
                        <span className="font-bold text-[14px]">TOTAL R$</span>
                        <span className="font-bold text-[14px]">{formatReceiptAmount(data.total)}</span>
                    </div>

                    {data.paymentLines.map((line, i) => (
                        <Row key={`pay-${i}`} left={line.label} right={formatReceiptAmount(line.amount)} />
                    ))}

                    {data.methodDiscount > 0.009 && (
                        <Row left="Desconto de método" right={`-${formatReceiptAmount(data.methodDiscount)}`} />
                    )}
                    {data.couponDiscount > 0.009 && (
                        <Row left="Desconto cupom" right={`-${formatReceiptAmount(data.couponDiscount)}`} />
                    )}
                    {data.generalDiscount > 0.009 && (
                        <Row left="Desconto" right={`-${formatReceiptAmount(data.generalDiscount)}`} />
                    )}
                    {data.methodFee > 0.009 && (
                        <Row left="Taxa de método" right={`+${formatReceiptAmount(data.methodFee)}`} />
                    )}
                    {data.methodInterest > 0.009 && (
                        <Row left="Juros de método" right={`+${formatReceiptAmount(data.methodInterest)}`} />
                    )}
                    {data.shippingFee > 0.009 && (
                        <Row left={isDeliveryFree ? "Entrega (subsidiado)" : "Entrega"} right={isDeliveryFree ? `${formatReceiptAmount(data.shippingFee)} (grátis)` : formatReceiptAmount(data.shippingFee)} />
                    )}
                    {data.otherCosts > 0.009 && (
                        <Row left="Outros custos" right={formatReceiptAmount(data.otherCosts)} />
                    )}
                    {data.change > 0.009 && <Row left="Troco" right={formatReceiptAmount(data.change)} />}
                </div>

                {showAcknowledgment && (
                    <>
                        <p className="text-[9px] text-center leading-relaxed px-1">{DEFAULT_RECEIPT_ACKNOWLEDGMENT}</p>
                        <DashedLine className="mt-4 mb-1" />
                        <p className="text-[9px] font-bold text-center uppercase tracking-wide">Assinatura do cliente</p>
                    </>
                )}

                {data.returnPolicyBlock?.showBlock && (
                    <>
                        <DashedLine className="my-2" />
                        <p className="text-[9px] font-bold text-center">Política de trocas</p>
                        <p className="text-[9px] text-center">
                            Prazo: {data.returnPolicyBlock.commercialDeadlineDays}d
                            {data.returnPolicyBlock.additionalWarrantyDays > 0 && ` · Garantia +${data.returnPolicyBlock.additionalWarrantyDays}d`}
                        </p>
                        {data.returnPolicyBlock.message && (
                            <p className="text-[9px] text-center mt-1">{data.returnPolicyBlock.message}</p>
                        )}
                    </>
                )}

                <DashedLine className="my-2" />
                <p className="text-[10px] font-bold text-center uppercase tracking-wide">{footerMessage}</p>
            </div>
        </div>
    )
}
