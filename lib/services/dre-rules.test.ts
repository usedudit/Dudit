import { describe, it, expect } from "vitest"
import {
  getOrderRevenueBucket,
  isOrderDerivedTransaction,
  isRealizedServiceOrder,
  isCancelledServiceOrder,
  normalizeAppointmentStatus,
  isRealizedAppointment,
  isExcludedAppointmentFromRevenue,
  isOrderRevenueRecognized,
  isOrderCashCollected,
  isServiceOrderLinkedOrder,
  isServiceOrderOriginSale,
  isPaidAmountSettled,
  computeServiceOrderAmounts,
  computeProratedMonthlyTax,
  getTaxRegimeLabel,
} from "./dre-rules"

describe("getOrderRevenueBucket", () => {
  it("pedidos de assinatura entram no bucket recorrente", () => {
    expect(getOrderRevenueBucket("Assinatura")).toBe("recurring")
  })

  it("normaliza caixa e espaços do order_source", () => {
    expect(getOrderRevenueBucket("assinatura")).toBe("recurring")
    expect(getOrderRevenueBucket("  ASSINATURA  ")).toBe("recurring")
  })

  it("demais origens ficam no bucket de produtos", () => {
    expect(getOrderRevenueBucket("Marketplace")).toBe("products")
    expect(getOrderRevenueBucket("Balcão")).toBe("products")
    expect(getOrderRevenueBucket("Entrega")).toBe("products")
    expect(getOrderRevenueBucket("manual")).toBe("products")
  })

  it("origem ausente cai no bucket de produtos", () => {
    expect(getOrderRevenueBucket(null)).toBe("products")
    expect(getOrderRevenueBucket(undefined)).toBe("products")
    expect(getOrderRevenueBucket("")).toBe("products")
  })
})

describe("isOrderDerivedTransaction", () => {
  it("transações do ledger de pedidos são ignoradas no DRE", () => {
    expect(isOrderDerivedTransaction({ kind: "recognition" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "settlement" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "fee" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "refund" })).toBe(true)
    expect(isOrderDerivedTransaction({ kind: "chargeback" })).toBe(true)
  })

  it("transações manuais continuam contabilizadas", () => {
    expect(isOrderDerivedTransaction({ kind: null })).toBe(false)
    expect(isOrderDerivedTransaction({ kind: "" })).toBe(false)
    expect(isOrderDerivedTransaction({})).toBe(false)
    expect(isOrderDerivedTransaction(undefined)).toBe(false)
    expect(isOrderDerivedTransaction(null)).toBe(false)
  })

  it("kind com espaços em branco não conta como derivado", () => {
    expect(isOrderDerivedTransaction({ kind: "   " })).toBe(false)
  })
})

describe("ordens de serviço", () => {
  it("reconhece somente concluída e entregue", () => {
    expect(isRealizedServiceOrder("concluida")).toBe(true)
    expect(isRealizedServiceOrder("entregue")).toBe(true)
    expect(isRealizedServiceOrder("aberta")).toBe(false)
    expect(isRealizedServiceOrder("aprovada")).toBe(false)
    expect(isRealizedServiceOrder("em_andamento")).toBe(false)
    expect(isRealizedServiceOrder("completed")).toBe(false)
  })

  it("identifica cancelada", () => {
    expect(isCancelledServiceOrder("cancelada")).toBe(true)
    expect(isCancelledServiceOrder("Cancelada")).toBe(true)
    expect(isCancelledServiceOrder("concluida")).toBe(false)
  })
})

describe("agendamentos", () => {
  it("normaliza status em português e inglês", () => {
    expect(normalizeAppointmentStatus("Concluído")).toBe("Concluído")
    expect(normalizeAppointmentStatus("Pago")).toBe("Concluído")
    expect(normalizeAppointmentStatus("Pago Parcialmente")).toBe("Concluído")
    expect(normalizeAppointmentStatus("completed")).toBe("Concluído")
    expect(normalizeAppointmentStatus("Cancelado")).toBe("Cancelado")
    expect(normalizeAppointmentStatus("cancelled")).toBe("Cancelado")
    expect(normalizeAppointmentStatus("Ausência")).toBe("Ausência")
    expect(normalizeAppointmentStatus("Reservado")).toBe("Reservado")
    expect(normalizeAppointmentStatus("Confirmado")).toBe("Confirmado")
  })

  it("reconhece receita apenas quando concluído", () => {
    expect(isRealizedAppointment("Concluído")).toBe(true)
    expect(isRealizedAppointment("Pago")).toBe(true)
    expect(isRealizedAppointment("Reservado")).toBe(false)
    expect(isRealizedAppointment("Confirmado")).toBe(false)
    expect(isRealizedAppointment("Cancelado")).toBe(false)
    expect(isRealizedAppointment("Ausência")).toBe(false)
  })

  it("exclui cancelado e ausência da receita", () => {
    expect(isExcludedAppointmentFromRevenue("Cancelado")).toBe(true)
    expect(isExcludedAppointmentFromRevenue("Ausência")).toBe(true)
    expect(isExcludedAppointmentFromRevenue("Concluído")).toBe(false)
  })
})

describe("pedidos online", () => {
  it("reconhece apenas situações efetivamente faturadas", () => {
    expect(isOrderRevenueRecognized("paid")).toBe(true)
    expect(isOrderRevenueRecognized("partially_paid")).toBe(true)
    expect(isOrderRevenueRecognized("completed")).toBe(true)
    expect(isOrderRevenueRecognized("pending")).toBe(false)
    expect(isOrderRevenueRecognized("cancelled")).toBe(false)
    expect(isOrderRevenueRecognized("pending_payment")).toBe(false)
    expect(isOrderRevenueRecognized("")).toBe(false)
  })

  it("considera caixa recebido somente em pago/parcial", () => {
    expect(isOrderCashCollected("paid")).toBe(true)
    expect(isOrderCashCollected("partially_paid")).toBe(true)
    expect(isOrderCashCollected("delivered")).toBe(false)
    expect(isOrderCashCollected("pending")).toBe(false)
  })
})

describe("deduplicação OS x pedidos/vendas", () => {
  it("detecta pedidos vinculados a OS", () => {
    expect(isServiceOrderLinkedOrder({ order_source: "Ordem de Serviço" })).toBe(true)
    expect(isServiceOrderLinkedOrder({ order_source: "admin_service_order" })).toBe(true)
    expect(isServiceOrderLinkedOrder({ source_service_order_id: "abc" })).toBe(true)
    expect(isServiceOrderLinkedOrder({ order_source: "Manual" })).toBe(false)
    expect(isServiceOrderLinkedOrder(null)).toBe(false)
  })

  it("detecta vendas originadas de OS", () => {
    expect(isServiceOrderOriginSale({ origin_type: "service_order" })).toBe(true)
    expect(isServiceOrderOriginSale({ origin_type: "pdv" })).toBe(false)
    expect(isServiceOrderOriginSale(null)).toBe(false)
  })

  it("detecta pagamento liquidado", () => {
    expect(isPaidAmountSettled("paid", 0)).toBe(true)
    expect(isPaidAmountSettled("partially_paid", 0)).toBe(true)
    expect(isPaidAmountSettled("unpaid", 10)).toBe(true)
    expect(isPaidAmountSettled("unpaid", 0)).toBe(false)
  })
})

describe("computeServiceOrderAmounts", () => {
  it("separa bruto, desconto e líquido", () => {
    const result = computeServiceOrderAmounts({
      total_service_amount: 100,
      total_product_amount: 50,
      other_costs: 10,
      total_amount: 130,
    })
    expect(result.productsRevenue).toBe(50)
    expect(result.servicesRevenue).toBe(110)
    expect(result.discount).toBe(30)
    expect(result.net).toBe(130)
  })

  it("sem desconto o bruto iguala o líquido", () => {
    const result = computeServiceOrderAmounts({
      total_service_amount: 200,
      total_product_amount: 0,
      other_costs: 0,
      total_amount: 200,
    })
    expect(result.discount).toBe(0)
    expect(result.servicesRevenue).toBe(200)
  })

  it("lida com valores ausentes", () => {
    expect(computeServiceOrderAmounts(null)).toEqual({ productsRevenue: 0, servicesRevenue: 0, discount: 0, net: 0 })
    expect(computeServiceOrderAmounts({}).discount).toBe(0)
  })
})

describe("computeProratedMonthlyTax", () => {
  it("mês completo retorna o valor cheio", () => {
    expect(computeProratedMonthlyTax(82, "2026-03-01", "2026-03-31")).toBe(82)
  })

  it("rateia mês parcial por dia", () => {
    // Março tem 31 dias; 15 dias => 82 * 15/31
    expect(computeProratedMonthlyTax(82, "2026-03-01", "2026-03-15")).toBe(Number(((82 * 15) / 31).toFixed(2)))
  })

  it("soma múltiplos meses", () => {
    // 15 dias de março (31) + 30 dias de abril (30)
    const expected = Number(((82 * 15) / 31 + 82).toFixed(2))
    expect(computeProratedMonthlyTax(82, "2026-03-17", "2026-04-30")).toBe(expected)
  })

  it("retorna 0 para valores inválidos", () => {
    expect(computeProratedMonthlyTax(0, "2026-03-01", "2026-03-31")).toBe(0)
    expect(computeProratedMonthlyTax(82, "2026-03-31", "2026-03-01")).toBe(0)
  })
})

describe("getTaxRegimeLabel", () => {
  it("rotula pessoa física", () => {
    expect(getTaxRegimeLabel("pf", "1")).toBe("Pessoa Física (CPF)")
  })

  it("rotula MEI quando crt = 4", () => {
    expect(getTaxRegimeLabel("pj", "4")).toBe("MEI (SIMEI)")
  })

  it("rotula Simples Nacional quando crt = 1 ou 2", () => {
    expect(getTaxRegimeLabel("pj", "1")).toBe("Simples Nacional")
    expect(getTaxRegimeLabel("pj", "2")).toBe("Simples Nacional")
  })

  it("rotula regime normal quando crt = 3", () => {
    expect(getTaxRegimeLabel("pj", "3")).toBe("Lucro Presumido / Lucro Real")
  })
})
