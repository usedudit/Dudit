import { describe, it, expect } from "vitest"
import { calculateOrderFinancialBreakdown } from "@/app/actions/erp/order-financial-breakdown"

describe("calculateOrderFinancialBreakdown", () => {
  it("order with repassed credit card fees and absorbed installment interest", () => {
    // Scenario matching the user's order DDT302022:
    // - Service items total: R$ 1.50
    // - Payment method: Cartão de Crédito
    // - 2% discount: R$ 0.03
    // - 0.79% administrative fee (repassed to customer): R$ 0.01
    // - Fixed fee per sale (repassed to customer): R$ 0.19
    // - Installment interest (2% on 2x, absorbed by merchant): R$ 0.03
    // - Total charged to customer: R$ 1.67
    const order = {
      subtotal_value: 1.50,
      total_amount: 1.67,
      paid_amount: 1.67,
      delivery_fee: 0,
      discount_value: 0,
      payment_method_discount_amount: 0.03,
      payment_method_fee_amount: 0.01,
      payment_method_fixed_fee_amount: 0.19,
      payment_method_interest_amount: 0.03,
      payment_method_extra_amount: 0.20,
      payment_breakdown: [
        {
          method: "Cartão de Crédito",
          amount: 1.67,
          amountReceived: 1.67,
          feeBearer: "customer",
          installmentFeeBearer: "merchant",
          feeAmount: 0.01,
          fixedFeeAmount: 0.19,
          interestAmount: 0.03,
          installmentCostAmount: 0.03,
          paymentMethodDiscountAmount: 0.03,
          installmentNumber: 2,
        },
      ],
      order_items: [
        {
          service_id: "srv-1",
          product_price: 1.50,
          quantity: 1,
          subtotal: 1.50,
          unit_cost: 0,
          services: { cost_price: 0 },
        },
      ],
    }

    const res = calculateOrderFinancialBreakdown(order)

    // Receita: services (1.50) + repassed percentage fee (0.01) + repassed fixed fee (0.19) = 1.70
    expect(res.revenue.total).toBe(1.70)
    expect(res.revenue.lines).toEqual([
      { label: "Valor dos serviços", value: 1.50 },
      { label: "Taxa do método repassada", value: 0.01 },
      { label: "Custo do método repassado", value: 0.19 },
    ])

    // Descontos: 2% method discount = -0.03
    expect(res.discounts.total).toBe(-0.03)
    expect(res.discounts.lines).toEqual([
      { label: "Desconto do método", value: -0.03 },
    ])

    // Custos: percentage fee (-0.01), fixed fee (-0.19), interest (-0.03) = -0.23
    expect(res.costs.total).toBe(-0.23)
    expect(res.costs.lines).toEqual([
      { label: "Taxa (Cartão de Crédito)", value: -0.01 },
      { label: "Custo do método (Cartão de Crédito)", value: -0.19 },
      { label: "Juros", value: -0.03 },
    ])

    // Deduções: -0.03 (desconto) + -0.23 (custos) = -0.26
    expect(res.totalDeductions).toBe(-0.26)

    // Lucro líquido: 1.70 - 0.26 = 1.44
    expect(res.netProfit).toBe(1.44)
    expect(res.netMargin).toBe(84.71)
  })

  it("order with merchant-absorbed fees (not repassed to customer)", () => {
    // When merchant absorbs fees:
    // - Services: 1.50
    // - Discount: 0.03
    // - Fees are NOT repassed to customer (customer pays 1.47)
    // - Gateway fee: 0.01, fixed fee: 0.19
    const order = {
      subtotal_value: 1.50,
      total_amount: 1.47,
      paid_amount: 1.47,
      delivery_fee: 0,
      discount_value: 0,
      payment_method_discount_amount: 0.03,
      payment_breakdown: [
        {
          method: "Cartão de Crédito",
          amount: 1.47,
          amountReceived: 1.47,
          feeBearer: "merchant",
          installmentFeeBearer: "merchant",
          feeAmount: 0.01,
          fixedFeeAmount: 0.19,
          interestAmount: 0,
          installmentCostAmount: 0,
          paymentMethodDiscountAmount: 0.03,
          installmentNumber: 1,
        },
      ],
      order_items: [
        {
          service_id: "srv-1",
          product_price: 1.50,
          quantity: 1,
          subtotal: 1.50,
          unit_cost: 0,
        },
      ],
    }

    const res = calculateOrderFinancialBreakdown(order)

    // Receita: services only (1.50)
    expect(res.revenue.total).toBe(1.50)
    expect(res.revenue.lines).toEqual([
      { label: "Valor dos serviços", value: 1.50 },
    ])

    // Descontos: -0.03
    expect(res.discounts.total).toBe(-0.03)

    // Custos: percentage fee (-0.01) + fixed fee (-0.19) = -0.20
    expect(res.costs.total).toBe(-0.20)
    expect(res.costs.lines).toEqual([
      { label: "Taxa (Cartão de Crédito)", value: -0.01 },
      { label: "Custo do método (Cartão de Crédito)", value: -0.19 },
    ])

    // Lucro líquido: 1.50 - 0.03 - 0.20 = 1.27
    expect(res.netProfit).toBe(1.27)
  })
})
