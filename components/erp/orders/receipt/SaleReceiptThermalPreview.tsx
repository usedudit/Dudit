"use client"

import {
    DEFAULT_RECEIPT_ACKNOWLEDGMENT,
    formatReceiptAmount,
    type SaleReceiptData,
} from "@/lib/sales/sale-receipt"

const DASH = "-".repeat(42)

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

    return (
        <div
            className={`mx-auto bg-[#fffef5] text-black font-mono text-[11px] leading-snug shadow-md ${
                printMode ? "sale-receipt-thermal-print" : ""
            }`}
            style={{ width: printMode ? "80mm" : "320px", maxWidth: "100%" }}
        >
            <div className="px-3 py-4">
                {/* Header estabelecimento */}
                <div className="text-center mb-2">
                    <p className="font-bold text-[13px] uppercase tracking-tight">{data.partner.fantasyName}</p>
                    <p className="text-[10px] mt-0.5">{data.partner.legalName}</p>
                    <p className="text-[9px] mt-1 leading-tight">{data.partner.addressLine}</p>
                    {data.partner.taxIdLine ? (
                        <p className="text-[9px] mt-1 leading-tight">{data.partner.taxIdLine}</p>
                    ) : null}
                </div>

                <p className="text-center my-1">{DASH}</p>

                {/* Consumidor + pedido/data */}
                <p className="text-[10px] mb-1">
                    <span className="font-bold">Consumidor:</span> {data.customerName}
                </p>
                <div className="flex justify-between text-[10px] font-bold mb-1">
                    <span>{data.orderNumber}</span>
                    <span>{data.saleDateTime}</span>
                </div>

                <p className="text-center my-1">{DASH}</p>

                {/* Cabeçalho itens */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 text-[8px] font-bold uppercase mb-1">
                    <span># COD DESC</span>
                    <span className="text-right">QTD</span>
                    <span className="text-right">VL UN</span>
                    <span className="text-right">VL ITEM</span>
                </div>
                <p className="text-center mb-1">{DASH}</p>

                {/* Itens */}
                <div className="space-y-2 mb-2">
                    {data.items.map((item) => (
                        <div key={item.index}>
                            <p className="text-[10px] leading-tight break-words">
                                {String(item.index).padStart(3, "0")} {item.code} {item.description}
                            </p>
                            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1 text-[10px]">
                                <span />
                                <span className="text-right">
                                    {item.quantity} {item.unit}
                                </span>
                                <span className="text-right">{formatReceiptAmount(item.unitPrice)}</span>
                                <span className="text-right font-bold">{formatReceiptAmount(item.totalPrice)}</span>
                            </div>
                        </div>
                    ))}
                </div>

                <p className="text-center my-1">{DASH}</p>

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
                        <Row left="Entrega / Frete" right={formatReceiptAmount(data.shippingFee)} />
                    )}
                    {data.otherCosts > 0.009 && (
                        <Row left="Outros custos" right={formatReceiptAmount(data.otherCosts)} />
                    )}
                    {data.change > 0.009 && <Row left="Troco" right={formatReceiptAmount(data.change)} />}
                </div>

                <p className="text-center my-2">{DASH}</p>
                <p className="text-[10px] font-bold text-center">Vendedor: {data.sellerName}</p>

                {showAcknowledgment && (
                    <>
                        <p className="text-center my-2">{DASH}</p>
                        <p className="text-[9px] text-center leading-relaxed px-1">{DEFAULT_RECEIPT_ACKNOWLEDGMENT}</p>
                        <p className="text-center mt-4 mb-1">{DASH}</p>
                        <p className="text-[9px] font-bold text-center uppercase tracking-wide">Assinatura do cliente</p>
                    </>
                )}

                <p className="text-center my-2">{DASH}</p>
                <p className="text-[10px] font-bold text-center uppercase tracking-wide">{footerMessage}</p>
            </div>
        </div>
    )
}
