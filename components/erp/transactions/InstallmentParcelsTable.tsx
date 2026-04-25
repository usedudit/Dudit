"use client"

import React, { useMemo } from "react"
import StockMovementListItem from "@/components/erp/stock-movements/StockMovementListRow"
import { formatCurrency } from "@/lib/utils"

const COLUMNS: { id: string; align: "left" | "center" | "right" }[] = [
    { id: "movement", align: "left" },
    { id: "reason", align: "left" },
    { id: "reference", align: "left" },
    { id: "date", align: "left" },
    { id: "type", align: "center" },
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
    /** Texto de data/hora de finalização (pago) ou "—" */
    finalizationDate: string | null
    reason: string
    reference: string
}

type InstallmentParcelsTableProps = {
    rows: InstallmentParcelRow[]
    /** Se definido, exibe coluna de ações com o conteúdo retornado (ex.: menu da parcela). */
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

    const movements = rows.map((row) => {
        const int = Number(row.interestAmount || 0)
        const disc = Number(row.discountAmount || 0)
        const sub = [int > 0 ? `Juros ${formatCurrency(int)}` : null, disc > 0 ? `Desc. ${formatCurrency(disc)}` : null]
            .filter(Boolean)
            .join(" · ")
        const idPrefix = String(row.id).replace(/-/g, "").slice(0, 8).toUpperCase()
        const dateLine = row.finalizationDate && row.finalizationDate.length > 0 ? row.finalizationDate : "—, —"
        return {
            id: row.id,
            displayId: `${idPrefix.slice(0, 4)}-${idPrefix.slice(4, 8)}`,
            items_count: 1,
            parcelSubtitle: `Valor parcela ${formatCurrency(row.originalAmount)} · Pago ${formatCurrency(row.paidAmount)}`,
            reason: sub ? `${row.reason} · ${sub}` : row.reason,
            reference: row.reference,
            date: dateLine,
            statusTag: statusToTag(row.status),
            actionsSlot: hasActions && getActionsSlot ? getActionsSlot(row) : undefined,
        }
    })

    if (rows.length === 0) return null

    return (
        <div className="w-full overflow-x-auto border border-brand-border dark:border-dark-border rounded-xl">
            <table className="w-full text-sm min-w-[720px]">
                <thead>
                    <tr className="bg-brand-gray/60 dark:bg-dark-border/20 text-left text-xs font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wide">
                        <th className="p-2 pl-6 w-12" />
                        <th className="p-2 w-[220px]">Movimentação</th>
                        <th className="p-2 min-w-[140px]">Motivo</th>
                        <th className="p-2 min-w-[120px]">Referência</th>
                        <th className="p-2 w-[160px]">Data</th>
                        <th className="p-2 w-[120px] text-center">Tipo</th>
                        {hasActions ? <th className="p-2 w-20 text-center">Ações</th> : null}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, idx) => {
                        const m = movements[idx]
                        if (!m) return null
                        return (
                            <StockMovementListItem
                                key={row.id}
                                movement={m}
                                columns={columns}
                                selected={false}
                                onSelect={() => {}}
                                onUndo={() => {}}
                                onDetails={onRowClick || (() => {})}
                                showCheckbox={false}
                                showActions={!!hasActions && !m.actionsSlot}
                            />
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
