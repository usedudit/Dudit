"use client"

import { formatCurrency, formatDate } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import { DashedLine, ReceiptRow } from "@/components/erp/orders/receipt/ReceiptComponents"
import { QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
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
    secondaryColor = QUOTE_PREVIEW_SECONDARY_COLOR,
    quoteTitle = "Orçamento",
    quoteSubtitle,
    partnerName = "Parceiro",
    partnerAddress = "Endereço não cadastrado",
    partnerPhone,
    partnerAvatar,
    printMode = false,
    thermalWidth = "80mm",
}: QuoteThermalPreviewProps) {
    const partnerAddressFormatted = (() => {
        if (!partnerAddress) return ""
        const lines = partnerAddress.split("\n").filter((line) => line.trim() && !line.trim().startsWith("CEP:"))
        return lines.slice(0, 2).join("\n")
    })()

    const showLogo = Boolean(partnerAvatar && !partnerAvatar.includes("Placeholder.png"))

    return (
        <div
            className={`thermal-receipt-root mx-auto break-inside-avoid ${printMode ? "sale-receipt-thermal-print" : ""}`}
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
                {/* Cabeçalho da empresa */}
                <div className="text-center mb-1.5" style={{ color: "#000000" }}>
                    {showLogo ? (
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <img
                                src={partnerAvatar}
                                alt={partnerName}
                                className="w-8 h-8 rounded-full object-cover shrink-0"
                                style={{ backgroundColor: secondaryColor }}
                            />
                            <span className="font-bold text-[13.5px] uppercase tracking-tight leading-tight" style={{ color: "#000000" }}>
                                {partnerName}
                            </span>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-2 mb-1">
                            <UserProfileImage
                                fullName={partnerName}
                                imageUrl={partnerAvatar}
                                className="w-8 h-8 shrink-0 text-[13px] font-bold"
                                style={{ backgroundColor: secondaryColor }}
                            />
                            <span className="font-bold text-[13.5px] uppercase tracking-tight leading-tight" style={{ color: "#000000" }}>
                                {partnerName}
                            </span>
                        </div>
                    )}
                    {partnerPhone ? (
                        <p className="text-[9.5px] mt-0.5 leading-tight font-medium" style={{ color: "#000000" }}>
                            {formatBrazilPhone(partnerPhone)}
                        </p>
                    ) : null}
                    {partnerAddressFormatted ? (
                        <p className="text-[9.5px] mt-0.5 leading-tight whitespace-pre-line font-medium" style={{ color: "#000000" }}>
                            {partnerAddressFormatted}
                        </p>
                    ) : null}
                </div>

                <DashedLine className="my-1.5" />

                {/* Título e dados do orçamento */}
                <div className="space-y-0.5 text-[10.5px]" style={{ color: "#000000" }}>
                    <p className="font-bold text-[12px] text-center uppercase tracking-tight" style={{ color: "#000000" }}>
                        {quoteTitle}
                    </p>
                    {quoteSubtitle ? (
                        <p className="text-[9.5px] text-center" style={{ color: "#000000" }}>
                            {quoteSubtitle}
                        </p>
                    ) : null}
                    <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                        <span>Nº Orçamento:</span>
                        <span className="font-bold">{invoiceNumber}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                        <span>Emissão:</span>
                        <span>{formatDate(quoteDate)}</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                        <span>Validade:</span>
                        <span>{formatDate(expiryDate)}</span>
                    </div>
                    {salespersonName ? (
                        <div className="flex justify-between items-baseline pt-0.5 text-[10.5px]">
                            <span>Atendente:</span>
                            <span>{salespersonName}</span>
                        </div>
                    ) : null}
                </div>

                <DashedLine className="my-1.5" />

                {/* Dados do cliente */}
                <div className="space-y-0.5 text-[10.5px]" style={{ color: "#000000" }}>
                    <p className="font-bold text-[9.5px] uppercase" style={{ color: "#000000" }}>Cliente:</p>
                    {selectedCustomer ? (
                        <>
                            <p className="font-bold text-[10.5px]" style={{ color: "#000000" }}>
                                {selectedCustomer.name}
                            </p>
                            {selectedCustomer.phone ? (
                                <p className="leading-tight" style={{ color: "#000000" }}>
                                    {formatBrazilPhone(selectedCustomer.phone)}
                                </p>
                            ) : null}
                            {selectedCustomer.addresses && selectedCustomer.addresses.length > 0 ? (
                                (() => {
                                    const addr = selectedCustomer.addresses.find(
                                        (a: any) => a.address_type === "primary" || a.is_default
                                    ) || selectedCustomer.addresses[0]
                                    const addrText = addr
                                        ? [addr.street, addr.number, addr.complement, addr.neighborhood, addr.city]
                                              .filter(Boolean)
                                              .join(" - ")
                                        : null
                                    return addrText ? (
                                        <p className="leading-tight whitespace-pre-line" style={{ color: "#000000" }}>
                                            {addrText}
                                        </p>
                                    ) : null
                                })()
                            ) : null}
                        </>
                    ) : (
                        <p className="leading-tight" style={{ color: "#000000" }}>
                            {QUOTE_DEFAULT_CUSTOMER_LABEL}
                        </p>
                    )}
                </div>

                <DashedLine className="my-1.5" />

                {/* Cabeçalho de itens */}
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 text-[9.5px] font-bold uppercase" style={{ color: "#000000" }}>
                    <span># DESC</span>
                    <span className="text-right">QTD</span>
                    <span className="text-right">VL UN</span>
                    <span className="text-right">TOTAL</span>
                </div>
                <DashedLine className="my-1" />

                {/* Lista de itens */}
                <div className="space-y-1 mb-1.5" style={{ color: "#000000" }}>
                    {quoteItems.map((item, idx) => (
                        <div key={idx} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-1.5 text-[10.5px] items-start">
                            <span className="break-words min-w-0 pr-1 leading-tight font-medium" style={{ color: "#000000" }}>
                                {String(idx + 1).padStart(3, "0")} {item.name || "Produto sem nome"}
                            </span>
                            <span className="text-right whitespace-nowrap shrink-0 font-medium" style={{ color: "#000000" }}>
                                {item.qty}
                            </span>
                            <span className="text-right whitespace-nowrap shrink-0 font-medium" style={{ color: "#000000" }}>
                                {formatCurrency(item.price)}
                            </span>
                            <span className="text-right whitespace-nowrap font-bold shrink-0" style={{ color: "#000000" }}>
                                {formatCurrency((item.price || 0) * (item.qty || 0))}
                            </span>
                        </div>
                    ))}
                </div>

                <DashedLine className="my-1.5" />

                {/* Totais */}
                <div className="space-y-1" style={{ color: "#000000" }}>
                    <ReceiptRow left="Subtotal:" right={formatCurrency(subtotal)} />

                    {shippingNum > 0 && (
                        <ReceiptRow left="Entrega:" right={formatCurrency(shippingNum)} />
                    )}

                    {otherCosts > 0 && (
                        <ReceiptRow left="Outros custos:" right={formatCurrency(otherCosts)} />
                    )}

                    {discountValue > 0 && (
                        <ReceiptRow left="Desconto:" right={`-${formatCurrency(discountValue)}`} />
                    )}

                    <div className="flex justify-between items-baseline pt-1 my-0.5 font-bold" style={{ color: "#000000" }}>
                        <span className="text-[10.5px]">TOTAL:</span>
                        <span className="text-[11px]">{formatCurrency(total)}</span>
                    </div>
                </div>

                {/* Observações */}
                {note ? (
                    <>
                        <DashedLine className="my-1.5" />
                        <div style={{ color: "#000000" }}>
                            <p className="font-bold text-[9.5px] uppercase" style={{ color: "#000000" }}>Observações:</p>
                            <p className="text-[9.5px] leading-tight whitespace-pre-line mt-0.5 font-medium" style={{ color: "#000000" }}>
                                {note}
                            </p>
                        </div>
                    </>
                ) : null}

                {/* Rodapé */}
                <DashedLine className="my-2" />
                <p className="text-[9.5px] text-center font-medium" style={{ color: "#000000" }}>
                    Criado via Dudit - dudit.com.br
                </p>
            </div>
        </div>
    )
}
