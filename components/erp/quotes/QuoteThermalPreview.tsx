"use client"

import { formatDate } from "@/lib/utils"
import { formatReceiptAmount } from "@/lib/sales/sale-receipt"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import {
    DashedLine,
    ReceiptRow,
    ReceiptThermalFooter,
    ReceiptThermalItemsHeader,
    ReceiptThermalNotes,
    ReceiptThermalShell,
    ReceiptThermalStoreHeader,
    ReceiptThermalTitle,
} from "@/components/erp/orders/receipt/ReceiptComponents"
import { QUOTE_DEFAULT_CUSTOMER_LABEL } from "@/lib/quotes/quote-edit-rules"

interface QuoteThermalPreviewProps {
    invoiceNumber: string
    quoteDate: string
    expiryDate: string
    selectedCustomer: any
    quoteItems: any[]
    subtotal: number
    shippingNum: number
    otherCosts: number
    discountValue: number
    total: number
    note?: string
    primaryColor?: string
    secondaryColor?: string
    quoteTitle?: string
    quoteSubtitle?: string
    partnerName?: string
    partnerAddress?: string
    partnerPhone?: string
    partnerAvatar?: string
    printMode?: boolean
    thermalWidth?: "80mm" | "58mm"
    showDecoration?: boolean
    salespersonName?: string
}

export default function QuoteThermalPreview({
    invoiceNumber,
    quoteDate,
    expiryDate,
    selectedCustomer,
    quoteItems,
    subtotal,
    shippingNum,
    otherCosts,
    discountValue,
    total,
    note,
    quoteTitle = "Orçamento",
    quoteSubtitle,
    partnerName = "Parceiro",
    partnerAddress = "Endereço não cadastrado",
    partnerPhone,
    partnerAvatar,
    printMode = false,
    thermalWidth = "80mm",
    salespersonName,
}: QuoteThermalPreviewProps) {
    const partnerAddressFormatted = (() => {
        if (!partnerAddress) return ""
        const lines = partnerAddress.split("\n").filter((line) => line.trim() && !line.trim().startsWith("CEP:"))
        return lines.slice(0, 2).join("\n")
    })()

    const partnerHeader: SaleReceiptPartnerHeader = {
        fantasyName: partnerName,
        legalName: "",
        addressLine: partnerAddressFormatted,
        taxIdLine: "",
        phone: partnerPhone || null,
    }

    return (
        <ReceiptThermalShell printMode={printMode} thermalWidth={thermalWidth}>
            {/* Cabeçalho da empresa */}
            <ReceiptThermalStoreHeader
                partnerHeader={partnerHeader}
                partnerName={partnerName}
                partnerAvatar={partnerAvatar}
            />

            <DashedLine className="my-1.5" />

            {/* Título e dados do orçamento */}
            <ReceiptThermalTitle>{quoteTitle}</ReceiptThermalTitle>
            {quoteSubtitle ? (
                <p className="text-[9.5px] text-center" style={{ color: "#000000" }}>
                    {quoteSubtitle}
                </p>
            ) : null}
            <div className="space-y-0.5" style={{ color: "#000000" }}>
                <ReceiptRow
                    left="Cliente:"
                    right={selectedCustomer ? selectedCustomer.name : QUOTE_DEFAULT_CUSTOMER_LABEL}
                />
                <ReceiptRow left="Nº Orçamento:" right={invoiceNumber} />
                <ReceiptRow left="Emissão:" right={formatDate(quoteDate)} />
                <ReceiptRow left="Validade:" right={formatDate(expiryDate)} />
                {salespersonName ? (
                    <ReceiptRow left="Atendente:" right={salespersonName} />
                ) : null}
            </div>

            <DashedLine className="my-1.5" />

            {/* Cabeçalho de itens */}
            <ReceiptThermalItemsHeader
                columns={[
                    { label: "# DESC" },
                    { label: "QTD", align: "right" },
                    { label: "VL UN", align: "right" },
                    { label: "VL ITEM", align: "right" },
                ]}
            />
            <DashedLine className="my-1" />

            {/* Lista de itens */}
            <div className="space-y-1 mb-1.5" style={{ color: "#000000" }}>
                {quoteItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-1.5 text-[10.5px] items-start">
                        <span className="break-words min-w-0 pr-1 leading-tight font-medium" style={{ color: "#000000" }}>
                            {String(idx + 1).padStart(3, "0")} {item.code ? `${item.code} ` : ""}{item.name || "Produto sem nome"}
                        </span>
                        <span className="text-right whitespace-nowrap shrink-0 font-medium" style={{ color: "#000000" }}>
                            {item.qty}
                        </span>
                        <span className="text-right whitespace-nowrap shrink-0 font-medium" style={{ color: "#000000" }}>
                            {formatReceiptAmount(item.price)}
                        </span>
                        <span className="text-right whitespace-nowrap font-bold shrink-0" style={{ color: "#000000" }}>
                            {formatReceiptAmount((item.price || 0) * (item.qty || 0))}
                        </span>
                    </div>
                ))}
            </div>

            <DashedLine className="my-1.5" />

            {/* Totais */}
            <div className="space-y-1" style={{ color: "#000000" }}>
                <ReceiptRow left="Subtotal:" right={`R$ ${formatReceiptAmount(subtotal)}`} />

                {shippingNum > 0 && (
                    <ReceiptRow left="Entrega:" right={`R$ ${formatReceiptAmount(shippingNum)}`} />
                )}

                {otherCosts > 0 && (
                    <ReceiptRow left="Outros custos:" right={`+R$ ${formatReceiptAmount(otherCosts)}`} />
                )}

                {discountValue > 0 && (
                    <ReceiptRow left="Desconto:" right={`-R$ ${formatReceiptAmount(discountValue)}`} />
                )}

                <div className="flex justify-between items-baseline pt-1 my-0.5 font-bold" style={{ color: "#000000" }}>
                    <span className="text-[10.5px]">TOTAL:</span>
                    <span className="text-[11px]">R$ {formatReceiptAmount(total)}</span>
                </div>
            </div>

            {/* Observações */}
            {note ? (
                <>
                    <DashedLine className="my-1.5" />
                    <ReceiptThermalNotes text={note} />
                </>
            ) : null}

            {/* Rodapé */}
            <ReceiptThermalFooter />
        </ReceiptThermalShell>
    )
}
