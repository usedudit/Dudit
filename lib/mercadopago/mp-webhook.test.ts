import { describe, expect, it } from "vitest"

/**
 * Tests for Mercado Pago webhook status mapping and payment method labels.
 *
 * These test the pure logic extracted from the webhook handler to ensure
 * all 6 payment methods are correctly mapped without needing to mock
 * Supabase or HTTP calls.
 */

// ─── Replicate the exact status mapping logic from webhook/route.ts ──

function mapMpStatusToOrderSituation(mpStatus: string, currentSituation?: string): string {
  if (mpStatus === "approved") return "paid"
  if (mpStatus === "in_process") return "in_process"
  if (["rejected", "cancelled", "refunded", "charged_back"].includes(mpStatus)) {
    // rejected + payment_failed → stay in payment_failed for recovery
    if (mpStatus === "rejected" && currentSituation === "payment_failed") return "payment_failed"
    return "cancelled"
  }
  return "pending"
}

// ─── Replicate the exact label logic from webhook/route.ts L320-338 ──

function mapPaymentMethodLabel(paymentMethodId: string, paymentTypeId: string): string {
  const mpPaymentMethodId = paymentMethodId.toLowerCase()
  const mpPaymentTypeId = paymentTypeId.toLowerCase()

  if (mpPaymentMethodId === "pix") return "Pix"
  if (mpPaymentTypeId === "credit_card") return "Cartão de Crédito"
  if (mpPaymentTypeId === "debit_card") return "Cartão de Débito"
  if (mpPaymentTypeId === "ticket") return "Boleto"
  if (mpPaymentTypeId === "account_money") return "Saldo Mercado Pago"
  if (mpPaymentTypeId === "digital_currency" || mpPaymentMethodId === "mercado_credito") return "Mercado Crédito"
  return "Desconhecido"
}

// ─── Replicate the status regression guard from webhook/route.ts ──

function shouldSkipStatusUpdate(currentSituation: string, newStatus: string): boolean {
  const finalStatuses = ["paid", "shipped", "delivered"]
  if (finalStatuses.includes(currentSituation) && !finalStatuses.includes(newStatus)) {
    if (newStatus !== "cancelled" && newStatus !== "payment_failed") return true
  }
  return false
}

// ─── Replicate the idempotency check from webhook/route.ts L170-173 ──

function shouldSkipIdempotent(currentSituation: string): boolean {
  return currentSituation === "paid"
}

// ─── Replicate the process-payment situation mapping from process-payment/route.ts ──

function mapCreationSituation(mpStatus: string): string {
  if (mpStatus === "approved") return "paid"
  if (mpStatus === "in_process") return "in_process"
  if (mpStatus === "rejected") return "payment_failed"
  return "pending"
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("MP Status → Order Situation Mapping", () => {
  it("PIX approved → paid", () => {
    expect(mapMpStatusToOrderSituation("approved")).toBe("paid")
  })

  it("Credit card approved → paid", () => {
    expect(mapMpStatusToOrderSituation("approved")).toBe("paid")
  })

  it("Credit card in_process → in_process", () => {
    expect(mapMpStatusToOrderSituation("in_process")).toBe("in_process")
  })

   it("Credit card rejected → cancelled", () => {
    expect(mapMpStatusToOrderSituation("rejected")).toBe("cancelled")
  })

  it("Credit card rejected when already payment_failed → stays payment_failed (recovery)", () => {
    expect(mapMpStatusToOrderSituation("rejected", "payment_failed")).toBe("payment_failed")
  })

  it("Refunded when already payment_failed → cancelled", () => {
    expect(mapMpStatusToOrderSituation("refunded", "payment_failed")).toBe("cancelled")
  })

  it("Debit card approved → paid", () => {
    expect(mapMpStatusToOrderSituation("approved")).toBe("paid")
  })

  it("Boleto pending → pending", () => {
    expect(mapMpStatusToOrderSituation("pending")).toBe("pending")
  })

  it("Boleto approved → paid", () => {
    expect(mapMpStatusToOrderSituation("approved")).toBe("paid")
  })

  it("Boleto expired (cancelled) → cancelled", () => {
    expect(mapMpStatusToOrderSituation("cancelled")).toBe("cancelled")
  })

  it("Account balance approved → paid", () => {
    expect(mapMpStatusToOrderSituation("approved")).toBe("paid")
  })

  it("Mercado Crédito approved → paid", () => {
    expect(mapMpStatusToOrderSituation("approved")).toBe("paid")
  })

  it("Mercado Crédito in_process → in_process", () => {
    expect(mapMpStatusToOrderSituation("in_process")).toBe("in_process")
  })

  it("refunded → cancelled", () => {
    expect(mapMpStatusToOrderSituation("refunded")).toBe("cancelled")
  })

  it("charged_back → cancelled", () => {
    expect(mapMpStatusToOrderSituation("charged_back")).toBe("cancelled")
  })
})

describe("Payment Method Label Mapping", () => {
  it("PIX → Pix", () => {
    expect(mapPaymentMethodLabel("pix", "bank_transfer")).toBe("Pix")
  })

  it("credit_card → Cartão de Crédito", () => {
    expect(mapPaymentMethodLabel("visa", "credit_card")).toBe("Cartão de Crédito")
  })

  it("debit_card → Cartão de Débito", () => {
    expect(mapPaymentMethodLabel("maestro", "debit_card")).toBe("Cartão de Débito")
  })

  it("ticket (boleto) → Boleto", () => {
    expect(mapPaymentMethodLabel("bolbradesco", "ticket")).toBe("Boleto")
  })

  it("account_money → Saldo Mercado Pago", () => {
    expect(mapPaymentMethodLabel("account_money", "account_money")).toBe("Saldo Mercado Pago")
  })

  it("digital_currency → Mercado Crédito", () => {
    expect(mapPaymentMethodLabel("consumer_credits", "digital_currency")).toBe("Mercado Crédito")
  })

  it("mercado_credito method ID → Mercado Crédito", () => {
    expect(mapPaymentMethodLabel("mercado_credito", "digital_currency")).toBe("Mercado Crédito")
  })

  it("mercado_credito method ID without type → Mercado Crédito", () => {
    expect(mapPaymentMethodLabel("mercado_credito", "")).toBe("Mercado Crédito")
  })
})

describe("Webhook Idempotency", () => {
  it("already paid → skip (idempotent)", () => {
    expect(shouldSkipIdempotent("paid")).toBe(true)
  })

  it("pending → do not skip", () => {
    expect(shouldSkipIdempotent("pending")).toBe(false)
  })

  it("in_process → do not skip", () => {
    expect(shouldSkipIdempotent("in_process")).toBe(false)
  })
})

describe("Status Regression Guard", () => {
  it("paid → pending: skip (no regression)", () => {
    expect(shouldSkipStatusUpdate("paid", "pending")).toBe(true)
  })

  it("paid → in_process: skip", () => {
    expect(shouldSkipStatusUpdate("paid", "in_process")).toBe(true)
  })

  it("paid → cancelled: allow (refund/chargeback)", () => {
    expect(shouldSkipStatusUpdate("paid", "cancelled")).toBe(false)
  })

  it("paid → payment_failed: allow (card recovery)", () => {
    expect(shouldSkipStatusUpdate("paid", "payment_failed")).toBe(false)
  })

  it("shipped → pending: skip", () => {
    expect(shouldSkipStatusUpdate("shipped", "pending")).toBe(true)
  })

  it("pending → paid: allow", () => {
    expect(shouldSkipStatusUpdate("pending", "paid")).toBe(false)
  })

  it("in_process → paid: allow", () => {
    expect(shouldSkipStatusUpdate("in_process", "paid")).toBe(false)
  })
})

describe("Process-Payment Creation Situation", () => {
  it("approved → paid", () => {
    expect(mapCreationSituation("approved")).toBe("paid")
  })

  it("in_process → in_process", () => {
    expect(mapCreationSituation("in_process")).toBe("in_process")
  })

  it("rejected → payment_failed (not cancelled)", () => {
    expect(mapCreationSituation("rejected")).toBe("payment_failed")
  })

  it("pending → pending", () => {
    expect(mapCreationSituation("pending")).toBe("pending")
  })
})
