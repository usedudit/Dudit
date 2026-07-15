"use client"

import { useMemo } from "react"
import { QUOTE_PREVIEW_PRIMARY_COLOR, QUOTE_PREVIEW_SECONDARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import type { InvoiceData } from "@/lib/billing/types"
import { formatDocument } from "@/lib/billing/invoice-generator"

interface InvoicePreviewProps {
    data: InvoiceData
    printMode?: boolean
}

const A4_HEIGHT = 1050
const ROW_HEIGHT = 40
const TOTALS_SECTION_HEIGHT = 150
const PAGE_1_FIXED = 420
const PAGE_N_FIXED = 230

function formatCurrency(value: number): string {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
}

function formatDate(iso: string | null): string {
    if (!iso) return "-"
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(iso))
}

export function InvoicePreview({ data, printMode }: InvoicePreviewProps) {
    const primaryColor = QUOTE_PREVIEW_PRIMARY_COLOR
    const secondaryColor = QUOTE_PREVIEW_SECONDARY_COLOR

    const { pages } = useMemo(() => {
        const items = data.items || []
        const totalRows = items.length
        const hasTotals = true

        const rowsPerPage1 = Math.floor((A4_HEIGHT - PAGE_1_FIXED - TOTALS_SECTION_HEIGHT) / ROW_HEIGHT)
        const rowsPerPageN = Math.floor((A4_HEIGHT - PAGE_N_FIXED - TOTALS_SECTION_HEIGHT) / ROW_HEIGHT)

        if (totalRows === 0) {
            return {
                pages: [
                    {
                        items: [],
                        showTotals: true,
                        showHeader: true,
                        pageNumber: 1,
                    },
                ],
            }
        }

        if (totalRows <= rowsPerPage1) {
            return {
                pages: [
                    {
                        items,
                        showTotals: true,
                        showHeader: true,
                        pageNumber: 1,
                    },
                ],
            }
        }

        const allPages: Array<{ items: typeof items; showTotals: boolean; showHeader: boolean; pageNumber: number }> = []
        let remaining = [...items]
        let pageNum = 1

        const firstBatch = remaining.splice(0, rowsPerPage1)
        allPages.push({ items: firstBatch, showTotals: false, showHeader: true, pageNumber: pageNum++ })

        while (remaining.length > 0) {
            const batch = remaining.splice(0, rowsPerPageN)
            const isLast = remaining.length === 0
            allPages.push({ items: batch, showTotals: isLast, showHeader: false, pageNumber: pageNum++ })
        }

        if (!allPages[allPages.length - 1].showTotals) {
            return {
                pages: [
                    ...allPages.slice(0, -1),
                    { ...allPages[allPages.length - 1], showTotals: true },
                ],
            }
        }

        return { pages: allPages }
    }, [data.items])

    return (
        <div className={cn("flex flex-col items-center", printMode ? "" : "")}>
            <style>{`
                @media print {
                    .invoice-page { page-break-after: always; box-shadow: none !important; margin: 0 !important; }
                }
                .invoice-page { width: 650px; min-height: ${A4_HEIGHT}px; background: white; overflow: hidden; position: relative; }
                ${!printMode ? `.invoice-page { box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 16px; border-radius: 8px; }` : ""}
            `}</style>

            {pages.map((page) => (
                <div key={page.pageNumber} className="invoice-page flex flex-col">
                    <div
                        className="relative h-[160px] flex items-center px-10 overflow-hidden"
                        style={{ backgroundColor: primaryColor }}
                    >
                        <div
                            className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20"
                            style={{ backgroundColor: secondaryColor }}
                        />
                        <div
                            className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full opacity-20"
                            style={{ backgroundColor: secondaryColor }}
                        />
                        <div className="flex items-center gap-5 z-10 w-full">
                            {data.partner.image_url && (
                                <img
                                    src={data.partner.image_url}
                                    alt=""
                                    className="w-16 h-16 rounded-full object-cover border-2 border-white/30"
                                />
                            )}
                            <div className="flex-1">
                                <h1 className="text-[22px] font-bold text-white">Fatura</h1>
                                <p className="text-white/80 text-sm font-medium mt-0.5">{data.partner.name}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-white/60 text-[11px] font-medium uppercase tracking-wider">Nº {data.invoice_number}</p>
                                <div
                                    className="text-[11px] font-mono mt-1 px-2 py-0.5 rounded inline-block"
                                    style={{ backgroundColor: secondaryColor, color: primaryColor }}
                                >
                                    #{data.verification_hash.slice(0, 8)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex-1 px-10 py-6">
                        {page.showHeader && (
                            <div className="grid grid-cols-4 gap-4 mb-6">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Número</p>
                                    <p className="text-sm font-bold text-gray-800">{data.invoice_number}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Código</p>
                                    <p className="text-sm font-mono text-gray-800">#{data.verification_hash.slice(0, 8)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Emissão</p>
                                    <p className="text-sm font-bold text-gray-800">{formatDate(data.created_at)}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Status</p>
                                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-full inline-block"
                                        style={{
                                            backgroundColor: data.status === "issued" ? "#d4f995" : "#fecaca",
                                            color: data.status === "issued" ? "#003229" : "#991b1b",
                                        }}
                                    >
                                        {data.status === "issued" ? "Emitida" : data.status === "cancelled" ? "Cancelada" : "Reembolsada"}
                                    </span>
                                </div>
                            </div>
                        )}

                        {page.showHeader && (
                            <div className="grid grid-cols-2 gap-6 mb-6 p-4 rounded-lg bg-gray-50">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Empresa</p>
                                    <p className="text-sm font-bold text-gray-800">{data.partner.name}</p>
                                    {data.partner.document && (
                                        <p className="text-xs text-gray-500">CNPJ/CPF: {formatDocument(data.partner.document)}</p>
                                    )}
                                    <p className="text-xs text-gray-500">{data.partner.address}</p>
                                    {data.partner.email && <p className="text-xs text-gray-500">{data.partner.email}</p>}
                                </div>
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Cliente</p>
                                    {data.customer ? (
                                        <>
                                            <p className="text-sm font-bold text-gray-800">{data.customer.name}</p>
                                            {data.customer.document && (
                                                <p className="text-xs text-gray-500">CPF/CNPJ: {formatDocument(data.customer.document)}</p>
                                            )}
                                            {data.customer.email && <p className="text-xs text-gray-500">{data.customer.email}</p>}
                                        </>
                                    ) : (
                                        <p className="text-sm text-gray-400">—</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {page.showHeader && data.period && (
                            <div className="flex gap-6 mb-4 text-xs text-gray-500">
                                <span>Início: {formatDate(data.period.start)}</span>
                                <span>Fim: {formatDate(data.period.end)}</span>
                            </div>
                        )}

                        <table className="w-full mb-4">
                            <thead>
                                <tr className="border-b-2 border-gray-200">
                                    <th className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-2 w-20">Código</th>
                                    <th className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-2">Descrição</th>
                                    <th className="text-center text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-2 w-16">Qtd</th>
                                    <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-2 w-28">Valor Unit.</th>
                                    <th className="text-right text-[10px] font-bold uppercase tracking-wider text-gray-400 pb-2 w-28">Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {page.items.map((item, i) => (
                                    <tr key={i} className="border-b border-gray-100">
                                        <td className="py-2 text-xs text-gray-500">{item.code || "—"}</td>
                                        <td className="py-2">
                                            <p className="text-sm font-medium text-gray-800 truncate max-w-[250px]">{item.name}</p>
                                            {item.description && (
                                                <p className="text-[11px] text-gray-400 truncate max-w-[250px]">{item.description}</p>
                                            )}
                                        </td>
                                        <td className="py-2 text-center text-sm text-gray-800">{item.quantity}</td>
                                        <td className="py-2 text-right text-sm text-gray-800">{formatCurrency(item.unit_price)}</td>
                                        <td className="py-2 text-right text-sm font-bold text-gray-800">{formatCurrency(item.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {page.showTotals && (
                            <div className="ml-auto w-64 border-t-2 border-gray-200 pt-3 mt-auto">
                                <div className="flex justify-between text-sm py-1">
                                    <span className="text-gray-500">Subtotal</span>
                                    <span className="font-medium">{formatCurrency(data.purchase.amount)}</span>
                                </div>
                                {data.purchase.discount_amount > 0 && (
                                    <div className="flex justify-between text-sm py-1">
                                        <span className="text-gray-500">Desconto</span>
                                        <span className="font-medium text-red-500">-{formatCurrency(data.purchase.discount_amount)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm pt-2 border-t border-gray-200 mt-1">
                                    <span className="font-bold">Total</span>
                                    <span className="font-bold text-lg" style={{ color: primaryColor }}>
                                        {formatCurrency(data.purchase.total_amount)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {page.showTotals && (
                            <div className="mt-6 p-3 rounded-lg bg-gray-50 text-xs text-gray-500 space-y-1">
                                <p><strong>Forma de pagamento:</strong> {data.payment.method_label}</p>
                                <p><strong>Gateway:</strong> {data.payment.gateway_label}</p>
                                {data.payment.paid_at && <p><strong>Pago em:</strong> {formatDate(data.payment.paid_at)}</p>}
                                <p><strong>Status:</strong> {data.payment.status}</p>
                                <p><strong>Tipo:</strong> {data.purchase.type}</p>
                            </div>
                        )}

                        {page.showTotals && data.notes && (
                            <div className="mt-4 p-3 rounded-lg bg-yellow-50 text-xs text-gray-600">
                                <p className="font-bold mb-1">Observações:</p>
                                <p>{data.notes}</p>
                            </div>
                        )}
                    </div>

                    <div className="h-[40px] flex items-center justify-center" style={{ backgroundColor: primaryColor }}>
                        <p className="text-[10px] text-white/60 font-medium">{data.footer}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
    return classes.filter(Boolean).join(" ")
}
