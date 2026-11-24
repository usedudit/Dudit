"use client"

import { useMemo } from "react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import type { InvoiceData } from "@/lib/billing/types"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import {
    ReceiptA4Document,
    ReceiptA4Page,
    ReceiptStoreHeaderA4,
    ReceiptA4StoreData,
    ReceiptA4Footer,
} from "@/components/erp/orders/receipt/ReceiptComponents"

const DEFAULT_PRIMARY = QUOTE_PREVIEW_PRIMARY_COLOR;
const DEFAULT_SECONDARY = QUOTE_PREVIEW_SECONDARY_COLOR;

// A fatura de assinatura é sempre emitida pela Dudit (plataforma), nunca pela loja parceira
const DUDIT_ISSUER = {
    name: "Dudit",
    email: "usedudit@gmail.com",
    phone: "(18) 99622-9347",
    address: "Rua José Canuto Barbosa 286 - Lado Sul, Lucélia/SP - 17783-124",
    logoUrl: "https://img.dudit.com.br/static/Icon.png",
} as const;

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
    const primary = data.primaryColor ?? DEFAULT_PRIMARY
    const secondary = data.secondaryColor ?? DEFAULT_SECONDARY
    const shortId = shortInvoiceId(invoiceId)

    const partnerHeader: SaleReceiptPartnerHeader = useMemo(
        () => ({
            fantasyName: DUDIT_ISSUER.name,
            legalName: DUDIT_ISSUER.name,
            addressLine: DUDIT_ISSUER.address,
            taxIdLine: "",
            phone: DUDIT_ISSUER.phone,
        }),
        []
    )

    const items = data.items || []

    const customerAddressText = useMemo(() => {
        return data.customer?.address || null
    }, [data.customer?.address])

    // Pagination Logic
    const pages = useMemo(() => {
        const ROW_HEIGHT = 40
        const TOTALS_SECTION_HEIGHT = 150
        const FOOTER_HEIGHT = 40

        const P1_FIXED_CONTENT_HEIGHT = 449
        const P1_TOTAL_AVAILABLE_HEIGHT = 1123
        const P1_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - P1_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT

        const PN_FIXED_CONTENT_HEIGHT = 246
        const PN_AVAILABLE_FOR_ROWS_AND_TOTALS = P1_TOTAL_AVAILABLE_HEIGHT - PN_FIXED_CONTENT_HEIGHT - FOOTER_HEIGHT

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
        <ReceiptA4Document printMode={printMode} printClassName="quote-a4-print">
            {pages.map((page, pageIndex) => (
                <ReceiptA4Page key={pageIndex} printMode={printMode}>
                    <ReceiptStoreHeaderA4
                        partnerName={DUDIT_ISSUER.name}
                        partnerAvatar={DUDIT_ISSUER.logoUrl}
                        primaryColor={primary}
                        secondaryColor={secondary}
                        title="Fatura"
                        subtitle={shortId ? `Fatura #${shortId}` : `Fatura #${data.invoice_number}`}
                    />

                    <div className={`flex-1 flex flex-col ${page.type !== "first" ? "pt-8" : ""}`}>
                        {page.type === "first" && (
                            <>
                                {/* Order info grid */}
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
                                            <span className="font-bold text-sm text-brand-dark">{formatDate(data.period?.start || data.created_at)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">Status</span>
                                            <span className="font-bold text-sm text-brand-dark">{getStatusLabel(data)}</span>
                                        </div>
                                    </div>
                                </div>

                                <ReceiptA4StoreData
                                    partnerHeader={partnerHeader}
                                    partnerName={DUDIT_ISSUER.name}
                                    partnerEmail={DUDIT_ISSUER.email}
                                    customerName={data.customer?.name || undefined}
                                    customerEmail={data.customer?.email ?? null}
                                    customerPhone={data.customer?.phone ?? null}
                                    customerAddress={customerAddressText}
                                />
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
                                                <span className="font-bold text-brand-green">-{formatCurrency(data.purchase.discount_amount)}</span>
                                            </div>
                                        )}

                                        <div className="border-t border-gray-200 my-3"></div>

                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-sm">Total</span>
                                            <div className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm" style={{ backgroundColor: primary }}>
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

                    <ReceiptA4Footer primaryColor={primary} message={data.footer} />
                </ReceiptA4Page>
            ))}
        </ReceiptA4Document>
    )
}

export default InvoicePreview
export { InvoicePreview }
