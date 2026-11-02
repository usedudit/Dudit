"use client"

import {
    DEFAULT_RECEIPT_ACKNOWLEDGMENT,
    formatReceiptAmount,
    type SaleReceiptData,
    type SaleReceiptInstallmentDetail,
} from "@/lib/sales/sale-receipt"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalStoreHeader,
} from "./ReceiptComponents"

type SaleReceiptThermalPreviewProps = {
    data: SaleReceiptData
    footerMessage: string
    showAcknowledgment?: boolean
    printMode?: boolean
    thermalWidth?: "80mm" | "58mm"
}

export default function SaleReceiptThermalPreview({
    data,
    footerMessage,
    showAcknowledgment = true,
    printMode = false,
    thermalWidth = "80mm",
}: SaleReceiptThermalPreviewProps) {
    const grossTotal = data.itemsTotal || data.items.reduce((acc, item) => acc + item.totalPrice, 0)
    const isDeliveryFree = data.deliveryPayer === 'seller'
    const totalDiscounts = (data.generalDiscount || 0) + (data.couponDiscount || 0) + (data.methodDiscount || 0)
    const totalOtherCosts = (data.otherCosts || 0) + (data.methodFee || 0) + (data.methodInterest || 0)
    const isDelivery = data.deliveryType !== "pickup" && Boolean(data.customerAddress)
    const shouldShowOnlinePaymentNotice = Boolean(
        data.isOnlinePayment &&
        data.deliveryType === "delivery" &&
        data.items.length > 0
    )

    const shouldShowAck = showAcknowledgment && data.showAcknowledgment !== false

    return (
        <div
            className={`thermal-receipt-root mx-auto break-inside-avoid ${printMode ? "sale-receipt-thermal-print" : ""
                }`}
            style={{
                width: printMode ? thermalWidth : (thermalWidth === "58mm" ? "220px" : "320px"),
                maxWidth: "100%",
                boxSizing: "border-box",
                color: "#000000",
                backgroundColor: "#ffffff",
                fontFamily: "Consolas, 'Courier New', Monaco, monospace",
                fontWeight: 500,
                lineHeight: "1.35",
                fontSize: "10.5px",
                WebkitFontSmoothing: "antialiased",
                MozOsxFontSmoothing: "grayscale",
            }}
        >
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                        .thermal-receipt-root,
                        .thermal-receipt-root * {
                            color: #000000 !important;
                            border-color: #000000 !important;
                            -webkit-text-fill-color: #000000 !important;
                            text-shadow: none !important;
                            box-sizing: border-box !important;
                        }
                    `,
                }}
            />

            <div className="px-3 py-3" style={{ backgroundColor: "#ffffff" }}>
                {/* Header estabelecimento */}
                <ReceiptThermalStoreHeader partnerHeader={data.partner} partnerName={data.partner.fantasyName} />

                <DashedLine className="my-1.5" />

                {/* Cliente / Pedido / Entrega */}
                <div className="space-y-0.5 text-[10.5px]" style={{ color: "#000000" }}>
                    <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                        <span>Cliente:</span>
                        <span>{data.customerName}</span>
                    </div>
                    {data.customerPhone ? (
                        <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                            <span>Telefone:</span>
                            <span>{formatBrazilPhone(data.customerPhone)}</span>
                        </div>
                    ) : null}
                    <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                        <span>Nº do Pedido: {data.orderNumber}</span>
                        <span>{data.saleDateTime}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                        <span>Canal/Origem:</span>{" "}
                        {data.isOnlineOrder ? (
                            <span className="uppercase">
                                {data.deliveryType === "pickup" ? "Pedido online - retirada" : "Pedido online - entrega"}
                            </span>
                        ) : (
                            data.orderSource || data.sellerName || "Não informado"
                        )}
                    </div>

                    {isDelivery && data.customerAddress ? (
                        <div className="flex pt-0.5 text-[10.5px]">
                            <span>Endereço:</span>
                            <p className="leading-tight whitespace-pre-line">{data.customerAddress}</p>
                        </div>
                    ) : null}
                </div>

                <DashedLine className="my-1.5" />

                {/* Cabeçalho itens */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 text-[9.5px] font-bold uppercase" style={{ color: "#000000" }}>
                    <span># COD DESC</span>
                    <span className="text-right">QTD</span>
                    <span className="text-right">VL UN</span>
                    <span className="text-right">VL ITEM</span>
                </div>
                <DashedLine className="my-1" />

                {/* Lista de Itens */}
                <div className="space-y-1 mb-1.5" style={{ color: "#000000" }}>
                    {data.items.map((item) => (
                        <div key={item.index} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 text-[10.5px] items-start">
                            <span className="break-words min-w-0 pr-1 leading-tight font-medium">
                                {String(item.index).padStart(3, "0")} {item.code ? `${item.code} ` : ""}{item.description}
                            </span>
                            <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                {item.quantity} {item.unit}
                            </span>
                            <span className="text-right whitespace-nowrap shrink-0 font-medium">
                                {formatReceiptAmount(item.unitPrice)}
                            </span>
                            <span className="text-right whitespace-nowrap font-bold shrink-0">
                                {formatReceiptAmount(item.totalPrice)}
                            </span>
                        </div>
                    ))}
                </div>

                <DashedLine className="my-1.5" />

                {/* Totais estruturados */}
                <div className="space-y-1" style={{ color: "#000000" }}>
                    <ReceiptRow left="Itens do pedido:" right={`R$ ${formatReceiptAmount(grossTotal)}`} />

                    {totalDiscounts > 0.009 && (
                        <ReceiptRow left="Descontos:" right={`-R$ ${formatReceiptAmount(totalDiscounts)}`} />
                    )}

                    {(data.shippingFee > 0.009 || data.deliveryPayer === "seller") && (
                        <ReceiptRow
                            left="Taxa de entrega:"
                            right={isDeliveryFree ? "Grátis" : `R$ ${formatReceiptAmount(data.shippingFee)}`}
                        />
                    )}

                    {totalOtherCosts > 0.009 && (
                        <ReceiptRow left="Outros custos:" right={`+R$ ${formatReceiptAmount(totalOtherCosts)}`} />
                    )}

                    <div className="flex justify-between items-baseline pt-1 my-0.5 font-bold" style={{ color: "#000000" }}>
                        <span className="text-[10.5px]">Subtotal:</span>
                        <span className="text-[10.5px]">R$ {formatReceiptAmount(data.total)}</span>
                    </div>

                    {data.change > 0.009 && (
                        <ReceiptRow left="Troco:" right={`R$ ${formatReceiptAmount(data.change)}`} />
                    )}
                </div>

                {/* Formas de pagamento */}
                <div className="space-y-1" style={{ color: "#000000" }}>
                    <p className="font-bold text-[10.5px] uppercase" style={{ color: "#000000" }}>Forma de pagamento:</p>
                    {data.paymentLines && data.paymentLines.length > 0 ? (
                        data.paymentLines.map((line, i) => (
                            <ReceiptRow
                                key={`pay-${i}`}
                                left={line.label}
                                right={`R$ ${formatReceiptAmount(line.amount)}`}
                                bold={line.kind === "sinal"}
                            />
                        ))
                    ) : (
                        <ReceiptRow left="Não informado" right={`R$ ${formatReceiptAmount(data.total)}`} />
                    )}

                    {shouldShowOnlinePaymentNotice && (
                        <div
                            className="mt-2 py-1 px-1.5 border text-center font-bold text-[10.5px] uppercase tracking-tight"
                            style={{
                                borderColor: "#000000",
                                color: "#000000",
                                backgroundColor: "#ffffff",
                            }}
                        >
                            Pedido pago online. Não cobrar do cliente
                        </div>
                    )}
                </div>

                {/* Detalhamento de parcelas */}
                {data.installmentDetails && data.installmentDetails.length > 0 && (
                    <>
                        <DashedLine className="my-1.5" />
                        <div className="space-y-1" style={{ color: "#000000" }}>
                            <p className="font-bold text-[10.5px] uppercase" style={{ color: "#000000" }}>Detalhamento das parcelas:</p>
                            {data.installmentDetails.map((inst, i) => (
                                <div key={i} className="text-[10px] leading-snug font-medium" style={{ color: "#000000" }}>
                                    <div>Nr Prestação: {String(inst.number).padStart(2, "0")}/{String(inst.total).padStart(2, "0")}</div>
                                    <div>Data Venc.: {inst.dueDate}</div>
                                    <div>Valor......: R$ {formatReceiptAmount(inst.amount)}</div>
                                    {i < data.installmentDetails!.length - 1 && <div className="my-0.5" />}
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* Observações */}
                {data.notes && (
                    <>
                        <DashedLine className="my-1.5" />
                        <div style={{ color: "#000000" }}>
                            <p className="font-bold text-[9.5px] uppercase" style={{ color: "#000000" }}>OBSERVAÇÕES:</p>
                            <p className="text-[9.5px] leading-tight whitespace-pre-line mt-0.5 font-medium" style={{ color: "#000000" }}>
                                {data.notes}
                            </p>
                        </div>
                    </>
                )}

                {/* Confirmação e Assinatura */}
                {shouldShowAck && (
                    <>
                        <DashedLine className="my-2" />
                        <p className="text-[9.5px] text-center leading-relaxed px-1 font-medium" style={{ color: "#000000" }}>
                            {DEFAULT_RECEIPT_ACKNOWLEDGMENT}
                        </p>
                        <div className="mt-6 border-b border-dashed w-3/4 mx-auto" style={{ borderColor: "#000000" }} />
                        <p className="text-[9.5px] font-bold text-center uppercase tracking-wide mt-1" style={{ color: "#000000" }}>
                            Assinatura do cliente
                        </p>
                    </>
                )}

                {/* Política de trocas */}
                {data.returnPolicyBlock?.showBlock && (
                    <>
                        <DashedLine className="my-2" />
                        <p className="text-[9.5px] font-bold text-center uppercase" style={{ color: "#000000" }}>Política de trocas</p>
                        <p className="text-[9.5px] text-center font-medium" style={{ color: "#000000" }}>
                            Prazo: {data.returnPolicyBlock.commercialDeadlineDays}d
                            {data.returnPolicyBlock.additionalWarrantyDays > 0 && ` · Garantia +${data.returnPolicyBlock.additionalWarrantyDays}d`}
                        </p>
                        {data.returnPolicyBlock.message && (
                            <p className="text-[9.5px] text-center mt-0.5 font-medium" style={{ color: "#000000" }}>
                                {data.returnPolicyBlock.message}
                            </p>
                        )}
                    </>
                )}

                {/* Mensagem final / Footer */}
                {footerMessage ? (
                    <>
                        <DashedLine className="my-2" />
                        <p className="text-[10.5px] font-bold text-center uppercase tracking-wide" style={{ color: "#000000" }}>
                            {footerMessage}
                        </p>
                    </>
                ) : null}
            </div>
        </div>
    )
}
