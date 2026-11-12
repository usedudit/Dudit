import { describe, it, expect } from "vitest"
import { calculateOrderFinancialBreakdown } from "@/lib/payments/order-financial-breakdown"

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

  it("order with campaign discount (item_discount_amount) and coupon", () => {
    // Order with:
    // - Product nominal (original_price): 10.00 x 2 = 20.00
    // - Charged price (product_price): 8.00 x 2 = 16.00 (campaign discount 2.00 per item)
    // - Coupon discount: 1.00
    // - Manual discount: 0
    // - No payment method fees
    // - unit_cost: 3.00 per item
    const order = {
      subtotal_value: 16.00,
      total_amount: 15.00,
      paid_amount: 15.00,
      delivery_fee: 0,
      discount_value: 0,
      discount_type: "fixed",
      discount_amount: 1.00, // cupom
      item_discount_amount: 4.00, // campanha (2 itens x 2.00)
      manual_discount_amount: 0,
      payment_method_discount_amount: 0,
      payment_method_extra_amount: 0,
      payment_breakdown: [],
      order_items: [
        {
          product_id: "prod-1",
          product_name: "Produto A",
          product_price: 8.00,
          original_price: 10.00,
          discount_amount: 2.00,
          quantity: 2,
          subtotal: 16.00,
          unit_cost: 3.00,
          is_gift: false,
        },
      ],
    }

    const res = calculateOrderFinancialBreakdown(order)

    // Receita bruta nominal: 10.00 x 2 = 20.00
    expect(res.revenue.total).toBe(20.00)
    expect(res.revenue.lines).toEqual([
      { label: "Valor dos produtos", value: 20.00 },
    ])

    // Descontos: item (campanha) 4.00 + cupom 1.00 = 5.00
    expect(res.discounts.total).toBe(-5.00)
    expect(res.discounts.lines).toEqual([
      { label: "Desconto em itens", value: -4.00 },
      { label: "Desconto de cupom", value: -1.00 },
    ])

    // CMV: 3.00 x 2 = 6.00
    expect(res.costs.total).toBe(-6.00)
    expect(res.costs.lines).toEqual([
      { label: "Custo dos produtos", value: -6.00 },
    ])

    // Deduções: -5.00 + -6.00 = -11.00
    expect(res.totalDeductions).toBe(-11.00)

    // Lucro líquido: 20.00 - 11.00 = 9.00
    expect(res.netProfit).toBe(9.00)
    expect(res.netMargin).toBe(45.00)
  })

  it("order with gift item (brinde) - zero revenue, real cost in CMV", () => {
    // Order with:
    // - Product nominal: 10.00 x 1 = 10.00
    // - Gift product: nominal 8.00 x 1 = 0 revenue, unit_cost 2.00
    // - No discounts
    const order = {
      subtotal_value: 10.00,
      total_amount: 10.00,
      paid_amount: 10.00,
      delivery_fee: 0,
      discount_value: 0,
      discount_amount: 0,
      item_discount_amount: 0,
      manual_discount_amount: 0,
      payment_method_discount_amount: 0,
      payment_method_extra_amount: 0,
      payment_breakdown: [],
      order_items: [
        {
          product_id: "prod-1",
          product_name: "Produto Normal",
          product_price: 10.00,
          original_price: 10.00,
          discount_amount: 0,
          quantity: 1,
          subtotal: 10.00,
          unit_cost: 4.00,
          is_gift: false,
        },
        {
          product_id: "prod-gift",
          product_name: "Brinde Especial",
          product_price: 0,
          original_price: 8.00,
          discount_amount: 0,
          quantity: 1,
          subtotal: 0,
          unit_cost: 2.00,
          is_gift: true,
        },
      ],
    }

    const res = calculateOrderFinancialBreakdown(order)

    // Receita: apenas produto normal (10.00) — brinde tem receita 0
    expect(res.revenue.total).toBe(10.00)

    // CMV: produto normal (4.00) + brinde (2.00) = 6.00
    expect(res.costs.total).toBe(-6.00)
    expect(res.costs.lines).toEqual([
      { label: "Custo dos produtos", value: -6.00 },
    ])

    // Lucro líquido: 10.00 - 6.00 = 4.00
    expect(res.netProfit).toBe(4.00)
    expect(res.netMargin).toBe(40.00)
  })

  it("order with manual percentage discount (discount_type=percentage)", () => {
    // Order with:
    // - Product nominal: 100.00 x 1 = 100.00
    // - Manual discount: 10% (stored as discount_value=10, discount_type=percentage)
    // - Charged price: 90.00
    // - No coupon, no campaign
    const order = {
      subtotal_value: 90.00,
      total_amount: 90.00,
      paid_amount: 90.00,
      delivery_fee: 0,
      discount_value: 10, // 10%
      discount_type: "percentage",
      discount_amount: 0, // sem cupom
      item_discount_amount: 0,
      manual_discount_amount: 0, // legado: calculado em tempo de execução
      payment_method_discount_amount: 0,
      payment_method_extra_amount: 0,
      payment_breakdown: [],
      order_items: [
        {
          product_id: "prod-1",
          product_name: "Produto Caro",
          product_price: 90.00,
          original_price: 100.00,
          discount_amount: 0,
          quantity: 1,
          subtotal: 90.00,
          unit_cost: 30.00,
          is_gift: false,
        },
      ],
    }

    const res = calculateOrderFinancialBreakdown(order)

    // Receita bruta nominal: 100.00
    expect(res.revenue.total).toBe(100.00)

    // Desconto manual: 10% de 100.00 = 10.00
    expect(res.discounts.total).toBe(-10.00)
    expect(res.discounts.lines).toEqual([
      { label: "Desconto manual", value: -10.00 },
    ])

    // CMV: 30.00
    expect(res.costs.total).toBe(-30.00)

    // Lucro líquido: 100.00 - 10.00 - 30.00 = 60.00
    expect(res.netProfit).toBe(60.00)
    expect(res.netMargin).toBe(60.00)
  })
})
