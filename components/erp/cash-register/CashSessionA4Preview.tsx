"use client"

import { formatCurrency } from "@/lib/utils"
import { QUOTE_PREVIEW_PRIMARY_COLOR } from "@/lib/quotes/quote-preview-theme"
import type { SaleReceiptPartnerHeader } from "@/lib/sales/sale-receipt"
import { usePartnerTimezone } from "@/lib/store-context"
import {
    ReceiptStoreHeaderA4,
    ReceiptA4StoreData,
    ReceiptA4Footer,
} from "@/components/erp/orders/receipt/ReceiptComponents"
import type { CashSessionCouponData } from "./CashSessionCouponPreview"

type CashSessionA4PreviewProps = {
    data: CashSessionCouponData
    partnerHeader: SaleReceiptPartnerHeader
    partnerAvatar?: string
    type: "opening" | "closing"
    printMode?: boolean
}

const formatFullDateTime = (iso: string, tz?: string) => {
    try {
        return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: tz })
    } catch { return iso }
}

const CashSessionA4Preview = ({
    data,
    partnerHeader,
    partnerAvatar,
    type,
    printMode = false,
}: CashSessionA4PreviewProps) => {
    const tz = usePartnerTimezone()
    const primaryColor = QUOTE_PREVIEW_PRIMARY_COLOR
    const partnerName = data.partnerName
    const isClosed = type === "closing"

    const metaCells: { label: string; value: string }[] = [
        { label: "Sessão", value: data.sessionId.slice(0, 8).toUpperCase() },
        { label: "Abertura", value: formatFullDateTime(data.openedAt, tz) },
        { label: "Operador", value: data.openOperator },
    ]
    if (isClosed) {
        metaCells.push(
            { label: "Fechamento", value: data.closedAt ? formatFullDateTime(data.closedAt, tz) : "-" },
            { label: "Fechado por", value: data.closeOperator || "-" },
            { label: "Status", value: "Fechado" },
        )
    }

    return (
        <div
            className={`flex flex-col w-full h-full bg-white dark:bg-dark-surface relative overflow-hidden ${printMode ? "sale-receipt-a4-print" : "md:border-l border-brand-border dark:border-dark-border"
                }`}
        >
            <div
                className={printMode
                    ? "w-full flex flex-col items-center p-0"
                    : "flex-1 overflow-auto custom-scrollbar p-4 md:p-12 flex flex-col items-start lg:items-center pt-12 space-y-8 absolute top-4 right-4 bottom-4 left-4 bg-[#e5e7eb] dark:bg-dark-surface/50 rounded-2xl border border-brand-border dark:border-dark-border"
                }
            >
                <div
                    className={`w-[210mm] min-w-[210mm] shrink-0 bg-white text-[#113833] overflow-hidden relative font-sans h-[297mm] flex flex-col ${printMode ? "pdf-print-page" : "shadow-md rounded-sm min-h-[297mm]"}`}
                >
                    <ReceiptStoreHeaderA4
                        partnerName={partnerName}
                        partnerAvatar={partnerAvatar}
                        primaryColor={primaryColor}
                        title={isClosed ? "Cupom de fechamento de caixa" : "Cupom de abertura de caixa"}
                        subtitle={`Sessão ${data.sessionId.slice(0, 8).toUpperCase()}`}
                    />

                    <div className="flex-1 flex flex-col">
                        <div className="px-8 py-6">
                            <div className="grid grid-cols-3 gap-4 border-b border-gray-100 pb-6 w-full">
                                {metaCells.map((cell) => (
                                    <div key={cell.label} className="flex flex-col">
                                        <span className="text-xs text-brand-inactive-text font-medium tracking-wide mb-0.5">{cell.label}</span>
                                        <span className="font-bold text-sm text-brand-dark">{cell.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <ReceiptA4StoreData
                            partnerHeader={partnerHeader}
                            partnerName={partnerName}
                        />

                        {isClosed && (
                            <div className="px-8 pb-4">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-6">
                                    Resumo por forma de recebimento
                                </p>
                                <table className="w-full text-left border-separate border-spacing-0">
                                    <thead>
                                        <tr className="bg-brand-gray/40">
                                            <th className="py-2.5 pl-6 pr-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider rounded-tl-xl border-b border-gray-100">
                                                Forma de recebimento
                                            </th>
                                            <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-32 border-b border-gray-100">
                                                Registrado
                                            </th>
                                            <th className="py-2.5 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-32 border-b border-gray-100">
                                                Informado
                                            </th>
                                            <th className="py-2.5 pl-4 pr-6 text-[11px] font-bold text-gray-400 uppercase tracking-wider text-right w-32 rounded-tr-xl border-b border-gray-100">
                                                Diferença
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.summaryByPaymentMethod.map((row, idx) => (
                                            <tr key={idx} className="bg-white">
                                                <td className="py-2 pl-6 pr-4 border-b border-gray-50">
                                                    <span className="font-bold text-[13px] text-black block truncate max-w-[250px]">
                                                        {row.label}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                    <span className="text-[13px] font-medium text-gray-600">
                                                        {formatCurrency(row.calculated)}
                                                    </span>
                                                </td>
                                                <td className="py-2 px-4 border-b border-gray-50 text-right">
                                                    <span className="text-[13px] font-medium text-gray-600">
                                                        {row.counted != null ? formatCurrency(row.counted) : "-"}
                                                    </span>
                                                </td>
                                                <td className="py-2 pl-4 pr-6 border-b border-gray-50 text-right">
                                                    <span className={`text-[13px] font-bold ${row.difference == null ? "text-gray-600" : row.difference < 0 ? "text-brand-red" : "text-brand-green"}`}>
                                                        {row.difference != null ? formatCurrency(row.difference) : "-"}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {data.summaryByPaymentMethod.length === 0 && (
                                    <p className="text-[13px] text-gray-500 px-6 py-2">Nenhuma venda registrada.</p>
                                )}
                            </div>
                        )}

                        <div className="mt-6">
                            <div className="px-8 pb-6 flex flex-col gap-4">
                                <div className="w-full bg-brand-gray/40 p-6 rounded-2xl text-black space-y-2.5">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-500 font-medium">Troco inicial</span>
                                        <span className="font-bold">{formatCurrency(data.initialAmount)}</span>
                                    </div>

                                    {data.totals.totalSalesAllMethods > 0 && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500 font-medium">Total de vendas</span>
                                            <span className="font-bold">{formatCurrency(data.totals.totalSalesAllMethods)}</span>
                                        </div>
                                    )}

                                    {(data.totals.totalWithdrawals > 0 || data.totals.totalDeposits > 0) && (
                                        <>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-500 font-medium">Sangrias</span>
                                                <span className="font-bold">-{formatCurrency(data.totals.totalWithdrawals)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-500 font-medium">Reforços</span>
                                                <span className="font-bold">+{formatCurrency(data.totals.totalDeposits)}</span>
                                            </div>
                                        </>
                                    )}

                                    <div className="border-t border-gray-200 my-2" />

                                    <div className="flex justify-between items-center">
                                        <span className="font-bold text-sm">Saldo calculado</span>
                                        <div
                                            className="text-white px-3 py-1.5 rounded text-sm font-bold shadow-sm"
                                            style={{ backgroundColor: primaryColor }}
                                        >
                                            {formatCurrency(data.totals.calculatedDrawerTotal)}
                                        </div>
                                    </div>

                                    {isClosed && data.totals.informedDrawerTotal != null && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-500 font-medium">Saldo informado</span>
                                            <span className="font-bold">{formatCurrency(data.totals.informedDrawerTotal)}</span>
                                        </div>
                                    )}

                                    {isClosed && data.totals.difference != null && (
                                        <div className="pt-3 border-t border-gray-200/80 flex justify-between items-center">
                                            <span className="font-bold text-sm">Diferença</span>
                                            <span className={`font-bold text-sm ${data.totals.difference < 0 ? "text-brand-red" : "text-brand-green"}`}>
                                                {formatCurrency(data.totals.difference)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {data.notes && (
                                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-700">
                                        <p className="font-bold uppercase tracking-wide text-[10px] text-gray-500 mb-1">Observações:</p>
                                        <p className="whitespace-pre-line leading-relaxed">{data.notes}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <ReceiptA4Footer primaryColor={primaryColor} />
                </div>
            </div>
        </div>
    )
}

export default CashSessionA4Preview
