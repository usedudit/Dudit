"use client"

import {
    formatReceiptAmount,
    type SaleReceiptData,
} from "@/lib/sales/sale-receipt"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalFooter,
    ReceiptThermalItemsHeader,
    ReceiptThermalNotes,
    ReceiptThermalSectionTitle,
    ReceiptThermalShell,
    ReceiptThermalSignature,
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
        <ReceiptThermalShell printMode={printMode} thermalWidth={thermalWidth}>
            {/* Header estabelecimento */}
            <ReceiptThermalStoreHeader partnerHeader={data.partner} partnerName={data.partner.fantasyName} />

            <DashedLine className="my-1.5" />

            {/* Cliente / Pedido / Entrega */}
            <div className="space-y-0.5" style={{ color: "#000000" }}>
                <ReceiptRow left="Cliente:" right={data.customerName} />
                {data.customerPhone ? (
                    <ReceiptRow left="Telefone:" right={formatBrazilPhone(data.customerPhone)} />
                ) : null}
                <ReceiptRow left={`Nº do Pedido: ${data.orderNumber}`} right={data.saleDateTime} />
                <ReceiptRow
                    left="Canal/Origem:"
                    right={
                        data.isOnlineOrder
                            ? data.deliveryType === "pickup"
                                ? "Pedido online - retirada"
                                : "Pedido online - entrega"
                            : data.orderSource || data.sellerName || "Não informado"
                    }
                />

                {isDelivery && data.customerAddress ? (
                    <ReceiptRow left="Endereço:" right={data.customerAddress} />
                ) : null}
            </div>

            <DashedLine className="my-1.5" />

            {/* Cabeçalho itens */}
            <ReceiptThermalItemsHeader
                columns={[
                    { label: "# COD DESC" },
                    { label: "QTD", align: "right" },
                    { label: "VL UN", align: "right" },
                    { label: "VL ITEM", align: "right" },
                ]}
            />
            <DashedLine className="my-1" />

            {/* Lista de Itens */}
            <div className="space-y-1 mb-1.5" style={{ color: "#000000" }}>
                {data.items.map((item) => (
                    <div key={item.index} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 text-[10.5px] items-start">
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
                <ReceiptThermalSectionTitle>Forma de pagamento:</ReceiptThermalSectionTitle>
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
                        <ReceiptThermalSectionTitle>Detalhamento das parcelas:</ReceiptThermalSectionTitle>
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
                    <ReceiptThermalNotes text={data.notes} />
                </>
            )}

            {/* Confirmação e Assinatura */}
            <ReceiptThermalSignature show={shouldShowAck} />

            {/* Política de trocas */}
            {data.returnPolicyBlock?.showBlock && (
                <>
                    <DashedLine className="my-2" />
                    <p className="text-[9.5px] font-bold text-center uppercase" style={{ color: "#000000" }}>
                        Política de trocas
                    </p>
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
            <ReceiptThermalFooter message={footerMessage} />
        </ReceiptThermalShell>
    )
}
