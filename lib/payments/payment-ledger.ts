import { toCanonicalPaymentType } from "@/lib/payments/payment-method"

export type PaymentLedgerLeg = {
  method?: string | null
  amount?: number | null
  effectiveAmount?: number | null
  amountReceived?: number | null
  paymentMethodId?: string | null
  mpPaymentMethodId?: string | null
  mpPaymentId?: string | null
  provider?: string | null
  paymentKind?: "deposit" | "balance" | "full" | string | null
  [key: string]: unknown
}

export type DepositCheckoutMetaLike = {
  usesDeposit?: boolean
  payDepositOnly?: boolean
  depositAmount?: number
  serviceDepositAmount?: number
  depositPercent?: number
  fullOrderTotal?: number
  initialChargeAmount?: number
  remainingAfterDeposit?: number
  remainingBalance?: number
  depositStatus?: string
  balanceStatus?: string
  paymentProvider?: string
  mpInitialPayment?: boolean
  depositPaidAt?: string
  balancePaidAt?: string
  lastPaymentAt?: string
  [key: string]: unknown
}

export type NormalizedDepositCheckout = DepositCheckoutMetaLike & {
  usesDeposit: boolean
  payDepositOnly: boolean
  depositAmount: number
  initialChargeAmount: number
  fullOrderTotal: number
  balanceAmount: number
  remainingAfterDeposit: number
  remainingBalance: number
  sinalPaid: boolean
  depositStatus: "pending" | "partially_paid" | "paid" | "not_required" | "expired"
  balanceStatus: "pending" | "partially_paid" | "paid" | "not_required"
}

export const PAYMENT_AMOUNT_TOLERANCE = 0.01

export function roundPaymentAmount(value: unknown): number {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount)) return 0
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

export function getLegAmount(leg: PaymentLedgerLeg | null | undefined): number {
  if (!leg) return 0
  const raw = leg.effectiveAmount ?? leg.amount ?? 0
  return Math.max(0, roundPaymentAmount(raw))
}

export function getLegReceivedAmount(
  leg: PaymentLedgerLeg | null | undefined,
): number {
  if (!leg) return 0
  const raw =
    leg.amountReceived != null ? leg.amountReceived : (leg.amount ?? 0)
  return Math.max(0, roundPaymentAmount(raw))
}

export function hasReceivedAmount(leg: PaymentLedgerLeg | null | undefined) {
  return getLegReceivedAmount(leg) > PAYMENT_AMOUNT_TOLERANCE
}

export function normalizePaymentMethodKey(value?: string | null): string {
  const raw = String(value || "").trim().toLowerCase()
  if (!raw) return ""

  if (raw.includes("pix")) return "pix"
  if (
    raw.includes("dinheiro") ||
    raw.includes("cash") ||
    raw.includes("money")
  ) {
    return "cash"
  }
  if (
    raw.includes("débito") ||
    raw.includes("debito") ||
    raw.includes("debit")
  ) {
    return "debit_card"
  }
  if (
    raw.includes("crédito") ||
    raw.includes("credito") ||
    raw.includes("credit")
  ) {
    return "credit_card"
  }
  if (raw.includes("boleto") || raw.includes("ticket")) return "boleto"
  if (
    raw.includes("transferência") ||
    raw.includes("transferencia") ||
    raw.includes("ted") ||
    raw.includes("doc")
  ) {
    return "bank_transfer"
  }
  if (raw.includes("vale") || raw.includes("store_credit")) {
    return "store_credit"
  }

  const canonical = toCanonicalPaymentType(raw)
  return canonical === "other" ? raw : canonical
}

export function paymentMethodsMatch(
  a?: PaymentLedgerLeg | null,
  b?: PaymentLedgerLeg | null,
): boolean {
  if (!a || !b) return false
  if (
    a.mpPaymentId &&
    b.mpPaymentId &&
    String(a.mpPaymentId) === String(b.mpPaymentId)
  ) {
    return true
  }
  if (
    a.paymentMethodId &&
    b.paymentMethodId &&
    String(a.paymentMethodId) === String(b.paymentMethodId)
  ) {
    return true
  }
  const aKey = normalizePaymentMethodKey(String(a.method || ""))
  const bKey = normalizePaymentMethodKey(String(b.method || ""))
  return Boolean(aKey && bKey && aKey === bKey)
}

export function findReceivableLegIndex(
  legs: PaymentLedgerLeg[],
  incoming: PaymentLedgerLeg,
): number {
  if (!Array.isArray(legs) || legs.length === 0) return -1

  const hasCapacity = (leg: PaymentLedgerLeg) =>
    getLegAmount(leg) - getLegReceivedAmount(leg) >
    PAYMENT_AMOUNT_TOLERANCE

  const exactPaymentIndex = legs.findIndex(
    (leg) =>
      hasCapacity(leg) &&
      incoming.mpPaymentId &&
      leg.mpPaymentId &&
      String(leg.mpPaymentId) === String(incoming.mpPaymentId),
  )
  if (exactPaymentIndex >= 0) return exactPaymentIndex

  const exactMethodIdIndex = legs.findIndex(
    (leg) =>
      hasCapacity(leg) &&
      incoming.paymentMethodId &&
      leg.paymentMethodId &&
      String(leg.paymentMethodId) === String(incoming.paymentMethodId),
  )
  if (exactMethodIdIndex >= 0) return exactMethodIdIndex

  const sameMethodIndex = legs.findIndex(
    (leg) => hasCapacity(leg) && paymentMethodsMatch(leg, incoming),
  )
  if (sameMethodIndex >= 0) return sameMethodIndex

  return legs.findIndex(
    (leg) =>
      getLegAmount(leg) <= PAYMENT_AMOUNT_TOLERANCE &&
      getLegReceivedAmount(leg) <= PAYMENT_AMOUNT_TOLERANCE &&
      paymentMethodsMatch(leg, incoming),
  )
}

export function sumReceivedAmount(
  breakdown: PaymentLedgerLeg[] | null | undefined,
): number {
  if (!Array.isArray(breakdown)) return 0
  return roundPaymentAmount(
    breakdown.reduce((sum, leg) => sum + getLegReceivedAmount(leg), 0),
  )
}

export function sumReceivedByMethod(
  breakdown: PaymentLedgerLeg[] | null | undefined,
): Map<string, { amount: number; leg: PaymentLedgerLeg | null }> {
  const result = new Map<string, { amount: number; leg: PaymentLedgerLeg | null }>()
  if (!Array.isArray(breakdown)) return result

  for (const leg of breakdown) {
    const received = getLegReceivedAmount(leg)
    if (received <= PAYMENT_AMOUNT_TOLERANCE) continue
    const key = normalizePaymentMethodKey(String(leg.method || ""))
    if (!key) continue
    const current = result.get(key)
    result.set(key, {
      amount: roundPaymentAmount((current?.amount || 0) + received),
      leg: current?.leg || leg,
    })
  }

  return result
}

export function dedupeReceivedLegs(
  breakdown: PaymentLedgerLeg[] | null | undefined,
): PaymentLedgerLeg[] {
  if (!Array.isArray(breakdown)) return []
  const seen = new Set<string>()
  const result: PaymentLedgerLeg[] = []

  for (const leg of breakdown) {
    const received = getLegReceivedAmount(leg)
    if (received <= PAYMENT_AMOUNT_TOLERANCE) continue

    const key = leg.mpPaymentId
      ? `mp:${String(leg.mpPaymentId)}`
      : [
          normalizePaymentMethodKey(String(leg.method || "")),
          roundPaymentAmount(received).toFixed(2),
          leg.paymentMethodId || "",
          String(leg.installmentNumber || 1),
        ].join(":")

    if (seen.has(key)) {
      const existingIndex = result.findIndex((entry) => {
        const existingKey = entry.mpPaymentId
          ? `mp:${String(entry.mpPaymentId)}`
          : [
              normalizePaymentMethodKey(String(entry.method || "")),
              roundPaymentAmount(getLegReceivedAmount(entry)).toFixed(2),
              entry.paymentMethodId || "",
              String(entry.installmentNumber || 1),
            ].join(":")
        return existingKey === key
      })
      if (existingIndex >= 0) {
        const existing = result[existingIndex]
        if (
          getLegReceivedAmount(leg) > getLegReceivedAmount(existing) + 0.009
        ) {
          result[existingIndex] = { ...existing, ...leg }
        }
        continue
      }
    }

    seen.add(key)
    result.push({ ...leg })
  }

  return result
}

export function normalizeOrderPaymentBreakdown(
  breakdown: PaymentLedgerLeg[] | null | undefined,
  paidAmount: number,
): PaymentLedgerLeg[] {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return []

  const received = dedupeReceivedLegs(breakdown)
  if (received.length > 0) {
    const paid = Math.max(0, roundPaymentAmount(paidAmount))
    const receivedTotal = sumReceivedAmount(received)
    if (receivedTotal > paid + PAYMENT_AMOUNT_TOLERANCE) {
      let remaining = paid
      const trimmed: PaymentLedgerLeg[] = []
      for (const leg of received) {
        if (remaining <= PAYMENT_AMOUNT_TOLERANCE) break
        const amount = Math.min(getLegReceivedAmount(leg), remaining)
        trimmed.push({
          ...leg,
          amount: getLegAmount(leg),
          amountReceived: roundPaymentAmount(amount),
        })
        remaining = roundPaymentAmount(remaining - amount)
      }
      return trimmed
    }
    return received
  }

  if (roundPaymentAmount(paidAmount) > PAYMENT_AMOUNT_TOLERANCE) {
    const first = breakdown.find((leg) => leg?.method)
    if (!first) return []
    return [
      {
        ...first,
        amount: roundPaymentAmount(paidAmount),
        effectiveAmount: roundPaymentAmount(paidAmount),
        amountReceived: roundPaymentAmount(paidAmount),
      },
    ]
  }

  return breakdown.map((leg) => ({ ...leg }))
}

export function buildOrderPaymentMethodLabel(
  breakdown: PaymentLedgerLeg[] | null | undefined,
  options?: {
    fallbackMethod?: string | null
    usesDeposit?: boolean
    paidAmount?: number
    totalAmount?: number
  },
): string {
  const received = dedupeReceivedLegs(breakdown)
  const labels = Array.from(
    new Set(
      received
        .map((leg) => String(leg.method || "").trim())
        .filter(Boolean)
        .map((label) => label.replace(/\s*\([^)]*\)\s*/g, " ").trim())
        .filter(Boolean),
    ),
  )

  if (labels.length > 1) return "Múltiplos meios"

  const label = labels[0]
  if (label) {
    const paid = Math.max(0, roundPaymentAmount(options?.paidAmount))
    const total = Math.max(0, roundPaymentAmount(options?.totalAmount))
    if (
      options?.usesDeposit &&
      total > PAYMENT_AMOUNT_TOLERANCE &&
      paid < total - PAYMENT_AMOUNT_TOLERANCE
    ) {
      return `${label} (sinal)`
    }
    return label
  }

  return String(options?.fallbackMethod || "").trim() || "Não informado"
}

export function normalizeDepositCheckoutMeta(
  meta: DepositCheckoutMetaLike | null | undefined,
  orderTotal: number,
  paidAmount: number,
  options?: { expired?: boolean; nowIso?: string },
): NormalizedDepositCheckout | null {
  if (!meta || typeof meta !== "object") return null

  const orderTotalRounded = roundPaymentAmount(orderTotal)
  const metaFullOrderTotal = roundPaymentAmount(meta.fullOrderTotal)
  const usesDeposit = Boolean(meta.usesDeposit || meta.payDepositOnly)
  // Deposit-only orders can have `orders.total_amount` set to the initial
  // charge (the sinal) while the real order total lives in the deposit
  // metadata. Prefer the larger value for deposit orders so the balance is not
  // computed as zero.
  const fullOrderTotal = Math.max(
    0,
    roundPaymentAmount(
      usesDeposit && metaFullOrderTotal > orderTotalRounded
        ? metaFullOrderTotal
        : orderTotalRounded > 0
          ? orderTotalRounded
          : metaFullOrderTotal,
    ),
  )
  const depositAmount = Math.max(
    0,
    roundPaymentAmount(meta.depositAmount ?? meta.serviceDepositAmount ?? 0),
  )
  const paid = Math.max(0, roundPaymentAmount(paidAmount))
  const payDepositOnly = Boolean(meta.payDepositOnly)

  if (!usesDeposit && !payDepositOnly) {
    return {
      ...meta,
      usesDeposit: false,
      payDepositOnly: false,
      depositAmount: 0,
      initialChargeAmount: 0,
      fullOrderTotal,
      balanceAmount: fullOrderTotal,
      remainingAfterDeposit: Math.max(0, fullOrderTotal - paid),
      remainingBalance: Math.max(0, fullOrderTotal - paid),
      sinalPaid: false,
      depositStatus: "not_required",
      balanceStatus: "not_required",
    }
  }

  const rawInitial = Math.max(
    0,
    roundPaymentAmount(meta.initialChargeAmount),
  )
  const rawRemaining = Number(
    meta.remainingBalance ?? meta.remainingAfterDeposit ?? 0,
  )
  const looksInverted =
    depositAmount > 0 &&
    rawInitial > depositAmount + PAYMENT_AMOUNT_TOLERANCE &&
    ((rawRemaining > 0 &&
      Math.abs(rawInitial + rawRemaining - fullOrderTotal) <=
        PAYMENT_AMOUNT_TOLERANCE + 0.01 &&
      Math.abs(rawRemaining - depositAmount) <=
        PAYMENT_AMOUNT_TOLERANCE + 0.01) ||
      Math.abs(rawInitial + depositAmount - fullOrderTotal) <=
        PAYMENT_AMOUNT_TOLERANCE + 0.01)

  let initialChargeAmount = rawInitial
  if (
    looksInverted ||
    initialChargeAmount <= PAYMENT_AMOUNT_TOLERANCE ||
    initialChargeAmount > fullOrderTotal + PAYMENT_AMOUNT_TOLERANCE
  ) {
    initialChargeAmount = depositAmount
  }
  if (initialChargeAmount > fullOrderTotal + PAYMENT_AMOUNT_TOLERANCE) {
    initialChargeAmount = fullOrderTotal
  }

  const balanceAmount = Math.max(0, fullOrderTotal - initialChargeAmount)
  const metaStatus = String(meta.depositStatus || "")
  const sinalPaid =
    (initialChargeAmount > 0 &&
      paid >= initialChargeAmount - PAYMENT_AMOUNT_TOLERANCE) ||
    metaStatus === "paid" ||
    metaStatus === "partially_paid"

   let depositStatus: NormalizedDepositCheckout["depositStatus"]
   if (fullOrderTotal > PAYMENT_AMOUNT_TOLERANCE && paid >= fullOrderTotal - PAYMENT_AMOUNT_TOLERANCE) {
     depositStatus = "paid"
   } else if (sinalPaid) {
     depositStatus = "partially_paid"
   } else if (metaStatus === "expired") {
     // Preserve existing expired status from metadata (set by checkAndExpireDeposit)
     depositStatus = "expired"
   } else if (options?.expired) {
     depositStatus = "expired"
   } else {
     depositStatus = "pending"
   }

  let balanceStatus: NormalizedDepositCheckout["balanceStatus"]
  if (fullOrderTotal > PAYMENT_AMOUNT_TOLERANCE && paid >= fullOrderTotal - PAYMENT_AMOUNT_TOLERANCE) {
    balanceStatus = "paid"
  } else if (sinalPaid) {
    balanceStatus = "pending"
  } else {
    balanceStatus = "not_required"
  }

  const nowIso = options?.nowIso || new Date().toISOString()
  const depositPaidAt =
    (meta.depositPaidAt as string | undefined) ||
    (sinalPaid ? nowIso : undefined)
  const balancePaidAt =
    (meta.balancePaidAt as string | undefined) ||
    (balanceStatus === "paid" ? nowIso : undefined)

  return {
    ...meta,
    usesDeposit,
    payDepositOnly,
    depositAmount,
    initialChargeAmount: roundPaymentAmount(initialChargeAmount),
    fullOrderTotal,
    balanceAmount: roundPaymentAmount(balanceAmount),
    remainingAfterDeposit: roundPaymentAmount(balanceAmount),
    remainingBalance: roundPaymentAmount(Math.max(0, fullOrderTotal - paid)),
    sinalPaid,
    depositStatus,
    balanceStatus,
    ...(depositPaidAt ? { depositPaidAt } : {}),
    ...(balancePaidAt ? { balancePaidAt } : {}),
    lastPaymentAt: paid > PAYMENT_AMOUNT_TOLERANCE ? nowIso : meta.lastPaymentAt,
  }
}
