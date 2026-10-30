'use client';

import React from "react"

export interface StockAvailabilityHintProps {
    /** Estoque físico total (ou a soma das variações). */
    total: number
    /** Quantidade reservada por pedidos ainda não finalizados. */
    reserved?: number | null
    className?: string
}

/**
 * Linha secundária do estoque exibindo quanto está reservado e quanto está
 * realmente disponível para venda.
 *
 * O disponível é derivado de `total - reservado` (em vez de usar
 * `stock_available` do banco) para continuar coerente com ajustes otimistas
 * de estoque feitos na própria listagem.
 */
const StockAvailabilityHint = ({ total, reserved, className = "" }: StockAvailabilityHintProps) => {
    const reservedQty = Math.max(0, Number(reserved) || 0)
    if (reservedQty <= 0) return null

    const availableQty = (Number(total) || 0) - reservedQty
    const availableTone = availableQty > 0 ? "text-brand-dark dark:text-dark-heading" : "text-brand-red"

    return (
        <span
            className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-brand-inactive-text dark:text-dark-body ${className}`}
        >
            <span title="Estoque disponível para venda (total menos reservado)">
                Disponível{" "}
                <strong className={`font-bold ${availableTone}`}>{availableQty}</strong>
            </span>
            <span aria-hidden="true" className="opacity-60">
                ·
            </span>
            <span title="Reservado por pedidos aguardando finalização">
                Reservado{" "}
                <strong className="font-bold text-brand-orange">{reservedQty}</strong>
            </span>
        </span>
    )
}

export default StockAvailabilityHint
