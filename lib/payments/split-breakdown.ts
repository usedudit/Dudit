import { calculatePaymentAmounts, type PaymentMethodFeeConfig } from "./calculation"

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
    amount: number
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
    paymentMethodDiscountAmount: number
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
        const declared = safeSplitMoney(Number(row.amount || 0))
        // For a single payment row, discount/fees must ALWAYS be calculated on the full order total (safeBase).
        const baseForThisLeg = safeBase
        const isPartial = declared < safeBase - 0.005

        const mId = row.paymentMethodId ? String(row.paymentMethodId) : ""
        const method = mId ? methodById.get(mId) : null
        if (!method?.id) {
            const finalAmt = isPartial ? declared : baseForThisLeg
            return {
                ok: true,
                finalTotal: baseForThisLeg,
                feeAmount: 0,
                interestAmount: 0,
                paymentMethodDiscountAmount: 0,
                adjustedRows: [
                    {
                        ...row,
                        finalAmount: finalAmt,
                        interestAmount: 0,
                        feeAmount: 0,
                        paymentMethodDiscountAmount: 0,
                    },
                ],
            }
        }

        const calc = calculatePaymentAmounts({
            originalAmount: baseForThisLeg,
            installmentNumber: row.installmentNumber,
            paymentMethod: toFeeConfig(method, feesByMethod),
        })

        const finalAmt = round2(Number(calc.finalAmount || 0))
        const rowFinalAmt = isPartial ? declared : finalAmt
        return {
            ok: true,
            finalTotal: finalAmt,
            feeAmount: round2(Number(calc.feeAmount || 0)),
            interestAmount: round2(Number(calc.interestAmount || 0)),
            paymentMethodDiscountAmount: round2(Number(calc.paymentMethodDiscountAmount || 0)),
            adjustedRows: [
                {
                    ...row,
                    finalAmount: rowFinalAmt,
                    interestAmount: Number(calc.interestAmount || 0),
                    feeAmount: Number(calc.feeAmount || 0),
                    paymentMethodDiscountAmount: Number(calc.paymentMethodDiscountAmount || 0),
                },
            ],
        }
    }

    const sumBase = sumSplitBaseAmounts(rows)
    if (sumBase > safeBase + SPLIT_BASE_SUM_TOLERANCE) {
        return {
            ok: false,
            error: `A soma dos valores por método (R$ ${sumBase.toFixed(2)}) não pode ser maior que o total do pedido (R$ ${safeBase.toFixed(2)}).`,
        }
    }

    const adjustedRows: RecalculatedSplitRow[] = []
    let finalTotal = 0
    let totalFee = 0
    let totalInterest = 0
    let totalPmDiscount = 0

    for (const row of rows) {
        const rowBase = safeSplitMoney(Number(row.amount || 0))
        if (rowBase <= 0) {
            return { ok: false, error: "Cada parte do pagamento dividido deve ser maior que zero." }
        }

        const mId = row.paymentMethodId ? String(row.paymentMethodId) : ""
        const method = mId ? methodById.get(mId) : null

        if (!method?.id) {
            adjustedRows.push({
                ...row,
                finalAmount: rowBase,
                interestAmount: 0,
                feeAmount: 0,
                paymentMethodDiscountAmount: 0,
            })
            finalTotal = round2(finalTotal + rowBase)
            continue
        }

        const calc = calculatePaymentAmounts({
            originalAmount: rowBase,
            installmentNumber: row.installmentNumber,
            paymentMethod: toFeeConfig(method, feesByMethod),
        })

        const finalAmt = round2(Number(calc.finalAmount || 0))
        totalFee = round2(totalFee + Number(calc.feeAmount || 0))
        totalInterest = round2(totalInterest + Number(calc.interestAmount || 0))
        totalPmDiscount = round2(totalPmDiscount + Number(calc.paymentMethodDiscountAmount || 0))

        adjustedRows.push({
            ...row,
            finalAmount: finalAmt,
            interestAmount: Number(calc.interestAmount || 0),
            feeAmount: Number(calc.feeAmount || 0),
            paymentMethodDiscountAmount: Number(calc.paymentMethodDiscountAmount || 0),
        })
        finalTotal = round2(finalTotal + finalAmt)
    }

    return {
        ok: true,
        finalTotal: round2(finalTotal),
        feeAmount: totalFee,
        interestAmount: totalInterest,
        paymentMethodDiscountAmount: totalPmDiscount,
        adjustedRows,
    }
}

/**
 * Maps recalculated rows to stored breakdown: `amount` is the **final** charged amount per method (after discount/interest/fee).
 */
export function toStoredBreakdownAmounts(rows: RecalculatedSplitRow[]): SplitInputRow[] {
    return rows.map((r) => ({
        method: r.method,
        amount: r.finalAmount,
        paymentMethodId: r.paymentMethodId,
        installmentNumber: r.installmentNumber,
    }))
}
