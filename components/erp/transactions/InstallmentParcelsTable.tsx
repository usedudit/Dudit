"use client"

import React, { useState, useMemo } from "react"
import { Badge, ActionsDropdown } from "@/components/reusable"
import Pagination from "@/components/reusable/Pagination"
import { PaymentMethodIndicator } from "./PaymentMethodIndicator"
import { formatCurrency } from "@/lib/utils"

export type InstallmentParcelRow = {
    id: string
    installmentNumber: number
    totalCount: number
    status: "paid" | "overdue" | "pending"
    originalAmount: number
    paidAmount: number
    interestAmount?: number
    discountAmount?: number
    dueDate?: string | null
    finalizationDate: string | null
    paymentType?: string | null
    reason: string
    reference: string
    remainingAmount?: number
}

type InstallmentParcelsTableProps = {
    rows: InstallmentParcelRow[]
    getActionsSlot?: (row: InstallmentParcelRow) => React.ReactNode
    onRowClick?: (id: string) => void
}

function statusToTag(status: InstallmentParcelRow["status"]): { label: string; variant: "green" | "red" | "orange" } {
    if (status === "paid") return { label: "Pago", variant: "green" }
    if (status === "overdue") return { label: "Vencido", variant: "red" }
    return { label: "Pendente", variant: "orange" }
}

const ITEMS_PER_PAGE = 8

export function formatInstallmentPaymentMethod(label: string | null | undefined): string {
    if (!label) return "Não informado"
    const trimmed = label.trim()
    const match = trimmed.match(/^(.*)\s+\(([^)]+)\)$/)
    if (match) {
        const part1 = match[1].trim()
        const part2 = match[2].trim()
        const knownTypes = [
            "pix", "dinheiro", "cartão de crédito", "cartão de debito", "cartão de débito",
            "cartão", "cartao de credito", "cartao de debito", "cartao", "transferência bancária",
            "transferencia bancaria", "boleto", "outros", "caixa"
        ]
        const isPart1Type = knownTypes.includes(part1.toLowerCase())
        const isPart2Type = knownTypes.includes(part2.toLowerCase())

        if (isPart2Type && !isPart1Type) {
            return `${part2} (${part1})`
        }
        return trimmed
    }
    return trimmed
}

export default function InstallmentParcelsTable({ rows, getActionsSlot, onRowClick }: InstallmentParcelsTableProps) {
    const [page, setPage] = useState(1)

    const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE)
    const paginatedRows = useMemo(() => {
        return rows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
    }, [rows, page])

    const hasActions = typeof getActionsSlot === "function"

    if (rows.length === 0) return null

    return (
        <div className="w-full space-y-4">
            {/* Desktop View */}
            <div className="hidden md:block w-full overflow-x-auto rounded-xl">
                <table className="w-full text-left border-separate border-spacing-0">
                    <thead>
                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg pl-6">Parcela</th>
                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body">Valor</th>
                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center">Status</th>
                            <th className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body text-center w-40 ${hasActions ? "" : "rounded-r-lg pr-6"}`}>Data do Pagamento</th>
                            {hasActions && (
                                <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-r-lg pr-6 text-center w-24">Ações</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                        {paginatedRows.map((row) => {
                            const badge = statusToTag(row.status)
                            const paymentDate = row.status === "paid" ? (row.finalizationDate || "-") : "-"

                            return (
                                <tr key={row.id} className="hover:bg-brand-gray/50 dark:hover:bg-dark-border/10 transition-colors cursor-pointer" onClick={() => onRowClick?.(row.id)}>
                                    <td className="py-4 px-2 pl-6">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                Parcela {row.installmentNumber}/{row.totalCount}
                                            </span>
                                            <div className="mt-1 flex" onClick={(e) => e.stopPropagation()}>
                                                <PaymentMethodIndicator label={formatInstallmentPaymentMethod(row.paymentType)} simplifyMultiple={false} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-2 text-[13px] text-brand-dark dark:text-dark-heading">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-brand-inactive-text dark:text-dark-body text-xs">Original: {formatCurrency(row.originalAmount)}</span>
                                            {row.interestAmount && row.interestAmount > 0 ? (
                                                <span className="text-brand-red text-xs">+ Juros: {formatCurrency(row.interestAmount)}</span>
                                            ) : null}
                                            {row.discountAmount && row.discountAmount > 0 ? (
                                                <span className="text-brand-green text-xs">- Desconto: {formatCurrency(row.discountAmount)}</span>
                                            ) : null}
                                            <span className="font-bold mt-0.5">
                                                {row.status === "paid" ? `Pago: ${formatCurrency(row.paidAmount)}` : `Restante: ${formatCurrency(row.remainingAmount ?? row.originalAmount)}`}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-4 px-2">
                                        <Badge variant={badge.variant}>
                                            {badge.label}
                                        </Badge>
                                    </td>
                                    <td className="py-4 px-2 text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                        {paymentDate}
                                    </td>
                                    {hasActions && (
                                        <td className="py-4 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                                            {getActionsSlot?.(row)}
                                        </td>
                                    )}
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {/* Mobile / Tablet View */}
            <div className="block md:hidden w-full divide-y divide-brand-border dark:divide-dark-border">
                {paginatedRows.map((row) => {
                    const badge = statusToTag(row.status)
                    const paymentDate = row.status === "paid" ? (row.finalizationDate || "-") : "-"

                    return (
                        <div key={row.id} className="py-4 flex flex-col gap-2 cursor-pointer" onClick={() => onRowClick?.(row.id)}>
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                        Parcela {row.installmentNumber}/{row.totalCount}
                                    </span>
                                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                        <PaymentMethodIndicator label={formatInstallmentPaymentMethod(row.paymentType)} simplifyMultiple={false} />
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                        {row.status === "paid" ? formatCurrency(row.paidAmount) : formatCurrency(row.originalAmount)}
                                    </span>
                                    <div className="text-[11px] text-brand-inactive-text dark:text-dark-body flex flex-col items-end mt-0.5">
                                        <span>Orig: {formatCurrency(row.originalAmount)}</span>
                                        {row.interestAmount && row.interestAmount > 0 ? (
                                            <span className="text-brand-red">+ Juros: {formatCurrency(row.interestAmount)}</span>
                                        ) : null}
                                        {row.discountAmount && row.discountAmount > 0 ? (
                                            <span className="text-brand-green">- Desc: {formatCurrency(row.discountAmount)}</span>
                                        ) : null}
                                    </div>
                                </div>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                                <div className="flex items-center gap-2">
                                    <Badge variant={badge.variant}>
                                        {badge.label}
                                    </Badge>
                                    {row.status === "paid" && (
                                        <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                            Paga em: {paymentDate}
                                        </span>
                                    )}
                                </div>
                                {hasActions && (
                                    <div className="action-btn shrink-0" onClick={(e) => e.stopPropagation()}>
                                        {getActionsSlot?.(row)}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Pagination Component */}
            {totalPages > 1 && (
                <Pagination
                    currentPage={page}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    inline
                />
            )}
        </div>
    )
}
