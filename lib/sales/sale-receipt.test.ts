import { describe, expect, it } from "vitest";
import { buildPaymentLinesFromOrder } from "./sale-receipt";

function depositOrder(overrides: Record<string, any> = {}) {
  return {
    total_amount: 100,
    paid_amount: 100,
    payment_breakdown: [
      { method: "pix", amount: 30, amountReceived: 30, paymentKind: "deposit" },
      { method: "pix", amount: 70, amountReceived: 70, paymentKind: "balance" },
    ],
    checkout_fulfillment: {
      depositCheckout: {
        usesDeposit: true,
        depositAmount: 30,
        initialChargeAmount: 30,
        fullOrderTotal: 100,
        sinalPaid: true,
      },
    },
    ...overrides,
  };
}

describe("buildPaymentLinesFromOrder", () => {
  it("separates the sinal from the balance payment", () => {
    const lines = buildPaymentLinesFromOrder(depositOrder());

    expect(lines).toEqual([
      { label: "Sinal - Pix", amount: 30, kind: "sinal" },
      { label: "Saldo - Pix", amount: 70, kind: "payment" },
    ]);
  });

  it("shows the pending balance after a paid sinal", () => {
    const lines = buildPaymentLinesFromOrder(
      depositOrder({
        paid_amount: 30,
        payment_breakdown: [
          {
            method: "pix",
            amount: 30,
            amountReceived: 30,
            paymentKind: "deposit",
          },
        ],
        checkout_fulfillment: {
          depositCheckout: {
            usesDeposit: true,
            depositAmount: 30,
            initialChargeAmount: 30,
            fullOrderTotal: 100,
            sinalPaid: true,
            remainingBalance: 70,
          },
        },
      }),
    );

    expect(lines).toEqual([
      { label: "Sinal - Pix", amount: 30, kind: "sinal" },
      { label: "Saldo a pagar", amount: 70, kind: "saldo" },
    ]);
  });

  it("keeps regular payments unchanged for non-deposit orders", () => {
    const lines = buildPaymentLinesFromOrder({
      total_amount: 100,
      paid_amount: 100,
      payment_breakdown: [
        { method: "pix", amount: 100, amountReceived: 100 },
      ],
    });

    expect(lines).toEqual([{ label: "Pix", amount: 100 }]);
  });
});
