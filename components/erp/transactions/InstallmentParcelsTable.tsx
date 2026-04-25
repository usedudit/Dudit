"use client"

import React, { useMemo } from "react"
import OrderListItem from "@/components/erp/orders/OrderListRow"

const COLUMNS: { id: string; align: "left" | "center" | "right" }[] = [
    { id: "order_id", align: "left" },
    { id: "total", align: "left" },
    { id: "status", align: "left" },
    { id: "date", align: "left" },
    { id: "actions", align: "center" },
]

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

export default function InstallmentParcelsTable({ rows, getActionsSlot, onRowClick }: InstallmentParcelsTableProps) {
    const hasActions = typeof getActionsSlot === "function"
    const columns = useMemo(() => (hasActions ? COLUMNS : COLUMNS.filter((c) => c.id !== "actions")), [hasActions])

    const mappedRows = rows.map((row) => {
        const badge = statusToTag(row.status)
        const dateLine = row.finalizationDate && row.finalizationDate.length > 0 ? row.finalizationDate : row.dueDate || "-"
        const [formattedDate, formattedTime = ""] = dateLine.split(", ")

        return {
            originalId: row.id,
            displayId: `Parcela ${row.installmentNumber}/${row.totalCount}`,
            items_count: 1,
            secondaryLine:
                row.status === "paid"
                    ? row.finalizationDate
                        ? `Finalizado em ${row.finalizationDate}`
                        : "Parcela finalizada"
                    : row.dueDate
                        ? `Vence em ${row.dueDate}`
                        : "Sem vencimento",
            total_amount: row.originalAmount,
            statusLabel: badge.label,
            statusColor: badge.variant,
            deliveryStatusLabel: row.paymentType || row.reason || "Parcela",
            deliveryStatusColor: "gray",
            formattedDate,
            formattedTime,
            situation: row.status === "paid" ? "completed" : row.status,
            actionMenuExtra: hasActions && getActionsSlot ? getActionsSlot(row) : undefined,
        }
    })

    if (rows.length === 0) return null

    return (
        <div className="w-full overflow-x-auto rounded-xl">
            <table className="w-full text-left border-separate border-spacing-0 min-w-[920px]">
                <thead>
                    <tr className="bg-brand-gray dark:bg-dark-border/50">
                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-l-lg pl-6">Parcela</th>
                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body">Valor</th>
                        <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body">Status</th>
                        <th className={`py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body ${hasActions ? "" : "rounded-r-lg pr-6"}`}>Data</th>
                        {hasActions ? <th className="py-3 px-2 text-[13px] font-medium text-gray-500 dark:text-dark-body rounded-r-lg pr-6 text-center">Ações</th> : null}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, idx) => {
                        const mapped = mappedRows[idx]
                        if (!mapped) return null

                        return (
                            <OrderListItem
                                key={row.id}
                                order={mapped}
                                columns={columns}
                                selected={false}
                                onSelect={() => {}}
                                onEdit={() => {}}
                                onCancel={() => {}}
                                onDetails={() => onRowClick?.(row.id)}
                                canEdit={false}
                                showCheckbox={false}
                                extraActions={mapped.actionMenuExtra}
                            />
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
