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

export default function InstallmentParcelsTable({ rows, getActionsSlot, onRowClick }: InstallmentParcelsTableProps) {
    const [page, setPage] = useState(1)
    const hasActions = typeof getActionsSlot === "function"

    const totalPages = Math.ceil(rows.length / ITEMS_PER_PAGE)
    const paginatedRows = useMemo(() => {
        return rows.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)
    }, [rows, page])

    if (rows.length === 0) return null

    return (
        <div className="w-full space-y-4">
            {/* Desktop View */}
            <div className="hidden md:block w-full overflow-x-auto rounded-xl">
                <table className="w-full text-left border-separate border-spacing-0 min-w-[920px]">
                    <thead>
                        <tr className="bg-brand-gray dark:bg-dark-border/50">
                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg pl-6">Parcela</th>
                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body">Valor</th>
                            <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body">Status</th>
                            <th className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body ${hasActions ? "" : "rounded-r-lg pr-6"}`}>Data do Pagamento</th>
                            {hasActions ? <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-r-lg pr-6 text-center">Ações</th> : null}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border dark:divide-dark-border">
                        {paginatedRows.map((row) => {
                            const badge = statusToTag(row.status)
                            const paymentDate = row.status === "paid" ? (row.finalizationDate || "-") : "-"
                            const actions = hasActions && getActionsSlot ? getActionsSlot(row) : null

                            return (
                                <tr key={row.id} className="hover:bg-brand-gray/50 dark:hover:bg-dark-border/10 transition-colors cursor-pointer" onClick={() => onRowClick?.(row.id)}>
                                    <td className="py-4 px-2 pl-6">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-[13px] text-brand-dark dark:text-dark-heading">
                                                Parcela {row.installmentNumber}/{row.totalCount}
                                            </span>
                                            <div className="mt-1 flex" onClick={(e) => e.stopPropagation()}>
                                                <PaymentMethodIndicator label={row.paymentType} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4 px-2 font-semibold text-[13px] text-brand-dark dark:text-dark-heading">
                                        {formatCurrency(row.originalAmount)}
                                    </td>
                                    <td className="py-4 px-2">
                                        <Badge variant={badge.variant}>
                                            {badge.label}
                                        </Badge>
                                    </td>
                                    <td className="py-4 px-2 text-[13px] font-medium text-brand-dark dark:text-dark-heading">
                                        {paymentDate}
                                    </td>
                                    {hasActions ? (
                                        <td className="py-4 px-2 pr-6 text-center" onClick={(e) => e.stopPropagation()}>
                                            {actions ? (
                                                <div className="flex justify-center">
                                                    <ActionsDropdown>
                                                        {actions}
                                                    </ActionsDropdown>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-brand-inactive-text">-</span>
                                            )}
                                        </td>
                                    ) : null}
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
                    const actions = hasActions && getActionsSlot ? getActionsSlot(row) : null

                    return (
                        <div key={row.id} className="py-4 flex flex-col gap-2 cursor-pointer" onClick={() => onRowClick?.(row.id)}>
                            <div className="flex justify-between items-start">
                                <div className="flex flex-col">
                                    <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                        Parcela {row.installmentNumber}/{row.totalCount}
                                    </span>
                                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                        <PaymentMethodIndicator label={row.paymentType} />
                                    </div>
                                </div>
                                <span className="font-bold text-[14px] text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(row.originalAmount)}
                                </span>
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
                                {actions && (
                                    <div className="action-btn" onClick={(e) => e.stopPropagation()}>
                                        <ActionsDropdown>
                                            {actions}
                                        </ActionsDropdown>
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
                />
            )}
        </div>
    )
}
