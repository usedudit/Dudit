import type { PaymentMethodFeeConfig } from "./calculation"
import { computePaymentLine, type PaymentBreakdownLine, type AdjustmentType } from "./financial-engine"

export const SPLIT_BASE_SUM_TOLERANCE = 0.01

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

/**
 * Normalizes a money value from user/API input. Rejects NaN and Infinity.
 */
export function safeSplitMoney(n: number): number {
    const v = Number(n)
    if (!Number.isFinite(v) || v < 0) return 0
    return round2(v)
}

export type SplitInputRow = {
    method: string
    /** @deprecated Use amountReceived instead */
    amount: number
    amountReceived?: number
    paymentMethodId: string | null
    installmentNumber: number
}

export type MethodRow = {
    id: string
    fee_percent: number
    fee_fixed: number
    fee_bearer: string
    discount_percent: number
    max_installments: number
    installment_fee_bearer?: string | null
}

export type InstallmentFee = { installmentNumber: number; feePercent: number }

/**
 * Sums the user-defined base amounts (before per-method discount / interest / fee).
 */
export function sumSplitBaseAmounts(rows: Array<{ amount?: number }>): number {
    return rows.reduce((acc, row) => acc + safeSplitMoney(Number(row?.amount || 0)), 0)
}

/**
 * True when the sum of split base amounts matches the order base total (order items + shipping etc., before payment-method adjustments).
 */
export function splitBaseSumMatchesTotal(baseTotal: number, sumBase: number, tolerance = SPLIT_BASE_SUM_TOLERANCE): boolean {
    const a = safeSplitMoney(baseTotal)
    const b = safeSplitMoney(sumBase)
    return Math.abs(a - b) <= tolerance
}

function toFeeConfig(
    method: MethodRow,
    feesByMethod: Map<string, InstallmentFee[]>,
): PaymentMethodFeeConfig {
    return {
        feePercent: Number(method.fee_percent || 0),
        feeFixed: Math.max(0, Number(method.fee_fixed || 0)),
        feeBearer: (method.fee_bearer || "merchant") as "merchant" | "customer",
        installmentFeeBearer: (method.installment_fee_bearer || "merchant") as "merchant" | "customer",
        discountPercent: Number(method.discount_percent || 0),
        maxInstallments: Math.max(1, Number(method.max_installments || 1)),
        installmentFees: (feesByMethod.get(String(method.id)) || []).map((f) => ({
            installmentNumber: f.installmentNumber,
            feePercent: f.feePercent,
        })),
    }
}

export type RecalculatedSplitRow = SplitInputRow & {
    finalAmount: number
    interestAmount: number
    feeAmount: number
    fixedFeeAmount: number
    paymentMethodDiscountAmount: number
    feeBearer?: "merchant" | "customer" | null
    /** New financial engine fields */
    amountReceived?: number
    adjustmentType?: AdjustmentType
    adjustmentPercent?: number
    adjustmentAmount?: number
    effectiveAmount?: number
    netAmount?: number
    installmentCostAmount?: number
}

/**
 * Recalculates a payment breakdown using **user-defined base amounts per leg** (not proportions of the order total).
 * For each leg: discount → interest → fee (per method; `fee_fixed` is applied once per leg).
 * Order: baseTotal must match the sum of leg base amounts (± tolerance) when there is at least one leg.
 */
export function recalculateSplitPaymentFromBaseAmounts(
    baseTotal: number,
    rows: SplitInputRow[],
    methodById: Map<string, MethodRow>,
    feesByMethod: Map<string, InstallmentFee[]>,
):
    | {
        ok: true
        finalTotal: number
        feeAmount: number
        fixedFeeAmount: number
        interestAmount: number
        paymentMethodDiscountAmount: number
        adjustedRows: RecalculatedSplitRow[]
    }
    | { ok: false; error: string } {
    const safeBase = safeSplitMoney(baseTotal)
    if (!rows.length) {
        return {
            ok: true,
            finalTotal: safeBase,
            feeAmount: 0,
            fixedFeeAmount: 0,
            interestAmount: 0,
            paymentMethodDiscountAmount: 0,
            adjustedRows: [],
        }
    }

    for (const row of rows) {
        const raw = Number(row.amount)
        if (!Number.isFinite(raw) || raw < 0) {
            return { ok: false, error: "Valores de pagamento inválidos (negativos ou não numéricos)." }
        }
        if (Number.isNaN(row.installmentNumber) || !Number.isFinite(Number(row.installmentNumber))) {
            return { ok: false, error: "Número de parcelas inválido." }
        }
    }

    if (rows.length === 1) {
        if (safeBase <= 0) {
            return { ok: false, error: "Total do pedido inválido." }
        }

        const row = rows[0]!
        const amountReceived = safeSplitMoney(Number(row.amountReceived ?? (row.amount || 0)))

        if (amountReceived <= 0) {
            return { ok: false, error: "Valor do pagamento inválido." }
        }

        const mId = row.paymentMethodId ? String(row.paymentMethodId) : ""
        const method = mId ? methodById.get(mId) : null

        if (!method?.id) {
            return {
                ok: true,
                finalTotal: amountReceived,
                feeAmount: 0,
                fixedFeeAmount: 0,
                interestAmount: 0,
                paymentMethodDiscountAmount: 0,
                adjustedRows: [
                    {
                        ...row,
                        amount: amountReceived,
                        finalAmount: amountReceived,
                        interestAmount: 0,
                        feeAmount: 0,
                        fixedFeeAmount: 0,
                        paymentMethodDiscountAmount: 0,
                        amountReceived,
                        adjustmentType: "none",
                        adjustmentPercent: 0,
                        adjustmentAmount: 0,
                        effectiveAmount: amountReceived,
                        netAmount: amountReceived,
                        installmentCostAmount: 0,
                    },
                ],
            }
        }

        const feeConfig = toFeeConfig(method, feesByMethod)
        const engine = computePaymentLine({
            amountReceived,
            paymentMethod: feeConfig,
            installmentNumber: row.installmentNumber,
        })

        return {
            ok: true,
            finalTotal: engine.effectiveAmount,
            feeAmount: engine.feeAmount || 0,
            fixedFeeAmount: engine.fixedFeeAmount || 0,
            interestAmount: engine.interestAmount || 0,
            paymentMethodDiscountAmount: engine.paymentMethodDiscountAmount || 0,
            adjustedRows: [
                {
                    ...row,
                    amount: engine.effectiveAmount,
                    finalAmount: engine.effectiveAmount,
                    interestAmount: engine.interestAmount || 0,
                    feeAmount: engine.feeAmount || 0,
                    fixedFeeAmount: engine.fixedFeeAmount || 0,
                    paymentMethodDiscountAmount: engine.paymentMethodDiscountAmount || 0,
                    amountReceived: engine.amountReceived,
                    adjustmentType: engine.adjustmentType,
                    adjustmentPercent: engine.adjustmentPercent,
                    adjustmentAmount: engine.adjustmentAmount,
                    effectiveAmount: engine.effectiveAmount,
                    netAmount: engine.netAmount,
                    installmentCostAmount: engine.installmentCostAmount,
                    feeBearer: engine.feeBearer,
                },
            ],
        }
    }

    const sumBase = sumSplitBaseAmounts(rows)

    const adjustedRows: RecalculatedSplitRow[] = []
    let finalTotal = 0
    let totalFee = 0
    let totalFixedFee = 0
    let totalInterest = 0
    let totalPmDiscount = 0

    for (const row of rows) {
        const amountReceived = safeSplitMoney(Number(row.amountReceived ?? (row.amount || 0)))
        if (amountReceived <= 0) {
            return { ok: false, error: "Cada parte do pagamento dividido deve ser maior que zero." }
        }

        const mId = row.paymentMethodId ? String(row.paymentMethodId) : ""
        const method = mId ? methodById.get(mId) : null

        if (!method?.id) {
            adjustedRows.push({
                ...row,
                amount: amountReceived,
                finalAmount: amountReceived,
                interestAmount: 0,
                feeAmount: 0,
                fixedFeeAmount: 0,
                paymentMethodDiscountAmount: 0,
                amountReceived,
                adjustmentType: "none",
                adjustmentPercent: 0,
                adjustmentAmount: 0,
                effectiveAmount: amountReceived,
                netAmount: amountReceived,
                installmentCostAmount: 0,
            })
            finalTotal = round2(finalTotal + amountReceived)
            continue
        }

        const engine = computePaymentLine({
            amountReceived,
            paymentMethod: toFeeConfig(method, feesByMethod),
            installmentNumber: row.installmentNumber,
        })

        const finalAmt = engine.effectiveAmount
        totalFee = round2(totalFee + (engine.feeAmount || 0))
        totalFixedFee = round2(totalFixedFee + (engine.fixedFeeAmount || 0))
        totalInterest = round2(totalInterest + (engine.interestAmount || 0))
        totalPmDiscount = round2(totalPmDiscount + (engine.paymentMethodDiscountAmount || 0))

        adjustedRows.push({
            ...row,
            amount: finalAmt,
            finalAmount: finalAmt,
            interestAmount: engine.interestAmount || 0,
            feeAmount: engine.feeAmount || 0,
            fixedFeeAmount: engine.fixedFeeAmount || 0,
            paymentMethodDiscountAmount: engine.paymentMethodDiscountAmount || 0,
            amountReceived: engine.amountReceived,
            adjustmentType: engine.adjustmentType,
            adjustmentPercent: engine.adjustmentPercent,
            adjustmentAmount: engine.adjustmentAmount,
            effectiveAmount: engine.effectiveAmount,
            netAmount: engine.netAmount,
            installmentCostAmount: engine.installmentCostAmount,
            feeBearer: engine.feeBearer,
        })
        finalTotal = round2(finalTotal + finalAmt)
    }

    return {
        ok: true,
        finalTotal: round2(finalTotal),
        feeAmount: totalFee,
        fixedFeeAmount: totalFixedFee,
        interestAmount: totalInterest,
        paymentMethodDiscountAmount: totalPmDiscount,
        adjustedRows,
    }
}

/**
 * Maps recalculated rows to stored breakdown.
 * Includes all financial-engine fields for auditability.
 * `amount` is kept for backward compat (deprecated).
 */
export function toStoredBreakdownAmounts(rows: RecalculatedSplitRow[]): PaymentBreakdownLine[] {
    return rows.map((r) => ({
        method: r.method,
        amount: r.finalAmount,
        amountReceived: r.amountReceived ?? r.finalAmount,
        adjustmentType: r.adjustmentType ?? "none",
        adjustmentPercent: r.adjustmentPercent ?? 0,
        adjustmentAmount: r.adjustmentAmount ?? 0,
        feeBearer: r.feeBearer ?? null,
        paymentMethodDiscountAmount: r.paymentMethodDiscountAmount ?? 0,
        interestAmount: r.interestAmount ?? 0,
        feeAmount: r.feeAmount ?? 0,
        fixedFeeAmount: r.fixedFeeAmount ?? 0,
        effectiveAmount: r.effectiveAmount ?? r.finalAmount,
        netAmount: r.netAmount ?? r.finalAmount,
        installmentCostAmount: r.installmentCostAmount ?? 0,
        paymentMethodId: r.paymentMethodId,
        installmentNumber: r.installmentNumber,
    }))
}
