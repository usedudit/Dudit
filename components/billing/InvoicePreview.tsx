"use client"

import { useMemo } from "react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { formatBrazilPhone } from "@/lib/utils/phone-utils"
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import type { InvoiceData } from "@/lib/billing/types"

interface InvoicePreviewProps {
    data: InvoiceData
    invoiceId?: string
    printMode?: boolean
}

function getStatusLabel(data: InvoiceData): string {
    if (data.status === "cancelled") return "Cancelado"
    if (data.status === "refunded") return "Reembolsado"
    const payStatus = (data.payment?.status || "").toLowerCase()
    const isPaid = !!data.payment?.paid_at ||
        ["concluído", "aprovado", "approved", "completed"].some((s) => payStatus.includes(s))
    return isPaid ? "Pago" : "Não pago"
}

function shortInvoiceId(invoiceId?: string): string {
    return invoiceId ? invoiceId.slice(0, 6) : ""
}

function formatPeriod(start: string | null, end: string | null): string {
    if (!start && !end) return "-"
    const parts = [start, end].filter(Boolean).map((d) => formatDate(d!))
    return parts.length > 0 ? parts.join(" → ") : "-"
}

const InvoicePreview = ({ data, invoiceId, printMode = false }: InvoicePreviewProps) => {
    const primaryColor = QUOTE_PREVIEW_PRIMARY_COLOR
    const secondaryColor = QUOTE_PREVIEW_SECONDARY_COLOR
    const shortId = shortInvoiceId(invoiceId)

    const partnerAddressFormatted = useMemo(() => {
        if (!data.partner.address) return ""
        const lines = data.partner.address
            .split("\n")
            .filter((line: string) => line.trim() && !line.trim().startsWith("CEP:"))
        return lines.slice(0, 2).join("\n")
    }, [data.partner.address])

    const items = data.items || []

    const pages = useMemo(() => {
        const ROW_HEIGHT = 40
        const TOTALS_SECTION_HEIGHT = 150

        const P1_FIXED_CONTENT_HEIGHT = 449
        const P1_TOTAL_AVAILABLE_HEIGHT = 1123
        const P1_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT

        const PN_FIXED_CONTENT_HEIGHT = 246
        const PN_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT

        const chunks: { items: typeof items; hasTotals: boolean; type: string }[] = []
        let remainingItems = [...items]

        const requiredHeightAllOnP1 = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT

        if (requiredHeightAllOnP1 <= P1_AVAILABLE_FOR_ROWS_AND_TOTALS) {
            chunks.push({ items: remainingItems, hasTotals: true, type: "first" })
            return chunks
        }

        const maxItemsP1 = Math.floor(P1_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT)
        const itemsP1 = remainingItems.slice(0, maxItemsP1)
        remainingItems = remainingItems.slice(maxItemsP1)
        chunks.push({ items: itemsP1, hasTotals: false, type: "first" })

        while (remainingItems.length > 0) {
            const requiredHeightOnPn = (remainingItems.length * ROW_HEIGHT) + TOTALS_SECTION_HEIGHT

            if (requiredHeightOnPn <= PN_AVAILABLE_FOR_ROWS_AND_TOTALS) {
                chunks.push({ items: remainingItems, hasTotals: true, type: "middle" })
                remainingItems = []
            } else {
                const maxItemsPn = Math.floor(PN_AVAILABLE_FOR_ROWS_AND_TOTALS / ROW_HEIGHT)
                const itemsPn = remainingItems.slice(0, maxItemsPn)
                remainingItems = remainingItems.slice(maxItemsPn)
                chunks.push({ items: itemsPn, hasTotals: false, type: "middle" })
            }
        }

        if (chunks.length > 0 && !chunks[chunks.length - 1].hasTotals) {
            chunks.push({ items: [], hasTotals: true, type: "middle" })
        }

        if (chunks.length === 0) {
            chunks.push({ items: [], hasTotals: true, type: "first" })
        }

        return chunks
    }, [items])

    return (
        <div className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${printMode ? "quote-a4-print" : "border-l border-brand-border dark:border-dark-border"}`}>
            <div className={printMode ? "w-full p-0" : "absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border overflow-hidden flex flex-col shadow-sm"}>
                <div className={printMode ? "w-full flex flex-col items-center p-0" : "flex-1 overflow-auto custom-scrollbar p-4 md:p-12 flex flex-col items-start lg:items-center pt-12 space-y-8"}>
                    {pages.map((page, pageIndex) => (
                        <div
                            key={pageIndex}
                            className={`w-[210mm] min-w-[210mm] shrink-0 bg-white text-[#113833] overflow-hidden relative font-sans min-h-[297mm] flex flex-col ${printMode ? "pdf-print-page" : "shadow-md rounded-sm"}`}
                        >
                            {/* HEADER */}
                            <div
                                className="px-8 py-8 relative overflow-hidden flex flex-col justify-between h-[160px] shrink-0"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <div className="absolute -top-12 right-6 flex gap-3 opacity-90 rotate-180">
                                    <div className="flex flex-col gap-3">
                                        <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                        <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                        <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                    </div>
                                    <div className="flex flex-col gap-3 -mt-12">
                                        <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                        <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                        <div className="w-14 h-24 rounded-full" style={{ backgroundColor: secondaryColor }}></div>
                                    </div>
                                </div>

                                <div className="relative z-10">
                                    <div className="flex items-center gap-3 mb-6">
                                        <UserProfileImage
                                            fullName={data.partner.name}
                                            imageUrl={data.partner.image_url && !data.partner.image_url.includes("Placeholder.png") ? data.partner.image_url : null}
                                            className="w-8 h-8 shrink-0 text-[13px] font-bold"
                                            style={{ backgroundColor: secondaryColor }}
                                        />
                                        <span className="text-white font-bold text-md">{data.partner.name}</span>
                                    </div>

                                    <div>
                                        <h1 className="text-2xl font-medium text-white">Fatura</h1>
                                        <p className="text-white/80 text-xs tracking-widest font-light mt-1">
                                            {shortId ? `Fatura #${shortId}` : `Fatura #${data.invoice_number}`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                            {/* FIM DO HEADER */}

                            <div className={`flex-1 flex flex-col ${page.type !== "first" ? "pt-8" : ""}`}>
                                {page.type === "first" && (
                                    <>
                                        <div className="px-8 py-6">
                                            <div className="grid grid-cols-4 gap-4 border-b border-gray-100 pb-6 w-full">
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Número</span>
                                                    <span className="font-bold text-sm text-brand-dark">{shortId ? `#${shortId}` : data.invoice_number}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Emissão</span>
                                                    <span className="font-bold text-sm text-brand-dark">{formatDate(data.created_at)}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Vencimento</span>
                                                    <span className="font-bold text-sm text-brand-dark">{formatDate(data.period?.end || data.created_at)}</span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Status</span>
                                                    <span className="font-bold text-sm text-brand-dark">{getStatusLabel(data)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="px-8 pb-6">
                                            <div className="grid grid-cols-2 gap-8">
                                                <div>
                                                    <h3 className="font-bold text-sm text-brand-dark mb-3">Dados da empresa</h3>
                                                    <div className="text-xs text-gray-600 space-y-1">
                                                        <p className="font-bold text-brand-dark">{data.partner.name}</p>
                                                        {data.partner.email && <p>{data.partner.email}</p>}
                                                        {data.partner.phone && <p>{formatBrazilPhone(data.partner.phone)}</p>}
                                                        {partnerAddressFormatted && <p className="whitespace-pre-wrap">{partnerAddressFormatted}</p>}
                                                    </div>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-sm text-brand-dark mb-3">Dados do cliente</h3>
                                                    {data.customer ? (
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            <p className="font-bold text-brand-dark">{data.customer.name}</p>
                                                            {data.customer.email && <p>{data.customer.email}</p>}
                                                            {data.customer.phone && <p>{formatBrazilPhone(data.customer.phone)}</p>}
                                                            {data.customer.address && <p className="whitespace-pre-wrap">{data.customer.address}</p>}
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs text-gray-600 space-y-1">
                                                            <p className="font-bold text-brand-dark">Cliente</p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="px-8 pb-4">
                                    <table className="w-full text-left border-separate border-spacing-0">
                                        <thead>
                                            <tr className="bg-brand-gray/40">
                                                <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">Descrição</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center w-32 border-b border-gray-100">Período</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-center w-16 border-b border-gray-100">Qtd</th>
                                                <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-28 border-b border-gray-100">Valor Unit.</th>
                                                <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-32 rounded-tr-xl border-b border-gray-100">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {page.items.map((item, idx) => (
                                                <tr key={idx} className="bg-white">
                                                    <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                        <span className="font-bold text-[13px] text-black block truncate max-w-[250px]">
                                                            {item.name || "Item"}
                                                        </span>
                                                        {item.description && (
                                                            <span className="text-[11px] text-gray-500 block truncate max-w-[250px]">
                                                                {item.description}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-2 px-4 border-b border-gray-50 text-center">
                                                        <span className="text-[13px] font-medium text-gray-600">
                                                            {formatPeriod(data.period?.start || null, data.period?.end || null)}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-4 border-b border-gray-50 text-center">
                                                        <span className="text-[13px] font-medium text-gray-600">
                                                            {item.quantity}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                        <span className="text-[13px] font-medium text-gray-600">
                                                            {formatCurrency(item.unit_price)}
                                                        </span>
                                                    </td>
                                                    <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-right">
                                                        <span className="text-[13px] font-bold text-black">
                                                            {formatCurrency(item.total)}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {page.hasTotals && (
                                    <div className="mt-8">
                                        <div className="px-8 pb-6 flex justify-start">
                                            <div className="w-full bg-brand-gray/40 p-6 rounded-lg text-black">
                                                <div className="flex justify-between items-center text-xs mb-2">
                                                    <span className="text-gray-500 font-medium">Subtotal</span>
                                                    <span className="font-bold">{formatCurrency(data.purchase.amount)}</span>
                                                </div>

                                                {data.purchase.discount_amount > 0 && (
                                                    <div className="flex justify-between items-center text-xs mb-2">
                                                        <span className="text-gray-500 font-medium">Desconto</span>
                                                        <span className="font-bold text-brand-red">-{formatCurrency(data.purchase.discount_amount)}</span>
                                                    </div>
                                                )}

                                                <div className="border-t border-gray-200 my-3"></div>

                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-sm">Total</span>
                                                    <div className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm" style={{ backgroundColor: primaryColor }}>
                                                        {formatCurrency(data.purchase.total_amount)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {data.notes && (
                                            <div className="px-8 pb-12">
                                                <div className="w-full">
                                                    <h4 className="font-bold text-xs mb-1.5 text-black">Observações</h4>
                                                    <p className="text-[11px] text-gray-500 leading-relaxed whitespace-pre-wrap">
                                                        {data.notes}
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {!page.hasTotals && <div className="mt-auto"></div>}
                            </div>

                            {/* Footer */}
                            <div
                                className="text-white/80 px-8 py-2 text-[10px] flex justify-end items-center absolute bottom-0 w-full h-[40px]"
                                style={{ backgroundColor: primaryColor }}
                            >
                                <span>{data.footer}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default InvoicePreview
export { InvoicePreview }
