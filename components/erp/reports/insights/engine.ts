import type { Insight } from "./types"

function pct(current: number, previous: number): number {
  if (previous <= 0 && current <= 0) return 0
  if (previous <= 0) return 100
  return Math.round(((current - previous) / previous) * 100)
}

function brl(v: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
}

interface SalesInsightInput {
  revenue: number
  previousRevenue: number
  orderCount: number
  previousOrderCount: number
  ticketMedio: number
  previousTicketMedio: number
}

interface ProductsInsightInput {
  totalProducts: number
  outOfStock: number
  lowStock: number
  topProductName?: string
  topProductSales?: number
  topProductPreviousSales?: number
  idleProductCount: number
}

interface ServicesInsightInput {
  todayAppointments: number
  cancelledCount: number
  totalAppointments: number
  attendanceRate: number
  topStaffName?: string
  topStaffRevenue?: number
}

interface FinancialInsightInput {
  balance: number
  receivable: number
  payable: number
  incomeTotal: number
  expenseTotal: number
}

interface CustomerInsightInput {
  totalCustomers: number
  newCustomers: number
  activeCustomers: number
  topCustomerName?: string
  topCustomerRevenue?: number
  inactiveVipCount?: number
  avgTicket: number
  previousAvgTicket: number
}

interface MarketingInsightInput {
  totalCoupons: number
  couponUsageRate: number
  revenueBySource: Record<string, number>
  topSource?: string
  topSourcePercent: number
}

interface ReturnsInsightInput {
  returnRate: number
  previousReturnRate: number
  totalRefunded: number
  topReason?: string
  returnCount: number
}

interface DeliveryInsightInput {
  totalDeliveries: number
  lateCount: number
  avgTimeMinutes: number
  previousAvgTimeMinutes: number
  onTimeRate: number
}

interface ProductivityInsightInput {
  topStaffName?: string
  topStaffRevenue?: number
  goalProgress?: number
  staffCount: number
  totalRevenue: number
}

export function generateSalesInsights(input: SalesInsightInput): Insight[] {
  const insights: Insight[] = []
  const revenuePct = pct(input.revenue, input.previousRevenue)
  const ordersPct = pct(input.orderCount, input.previousOrderCount)
  const ticketPct = pct(input.ticketMedio, input.previousTicketMedio)

  if (revenuePct > 0) {
    insights.push({
      id: "sales-revenue-up",
      message: `Faturamento aumentou ${revenuePct}% neste período.`,
      tone: "positive",
      category: "Vendas",
      priority: 1,
    })
  } else if (revenuePct < -5) {
    insights.push({
      id: "sales-revenue-down",
      message: `Faturamento caiu ${Math.abs(revenuePct)}% - vale revisar suas estratégias de venda.`,
      tone: "negative",
      category: "Vendas",
      priority: 1,
    })
  }

  if (ordersPct > 10) {
    insights.push({
      id: "sales-orders-up",
      message: `Volume de pedidos cresceu ${ordersPct}% comparado ao período anterior.`,
      tone: "positive",
      category: "Vendas",
      priority: 2,
    })
  } else if (ordersPct < -10) {
    insights.push({
      id: "sales-orders-down",
      message: `${Math.abs(ordersPct)}% menos pedidos que no período anterior.`,
      tone: "warning",
      category: "Vendas",
      priority: 2,
    })
  }

  if (ticketPct > 5) {
    insights.push({
      id: "sales-ticket-up",
      message: `Ticket médio subiu ${ticketPct}% - seus clientes estão comprando mais por pedido.`,
      tone: "positive",
      category: "Vendas",
      priority: 3,
    })
  } else if (ticketPct < -5) {
    insights.push({
      id: "sales-ticket-down",
      message: `Ticket médio caiu ${Math.abs(ticketPct)}%. Considere upsell ou combos.`,
      tone: "warning",
      category: "Vendas",
      priority: 3,
    })
  }

  return insights
}

export function generateProductsInsights(input: ProductsInsightInput): Insight[] {
  const insights: Insight[] = []
  const stockIssuePct = input.totalProducts > 0 ? Math.round(((input.outOfStock + input.lowStock) / input.totalProducts) * 100) : 0

  if (input.outOfStock > 0) {
    insights.push({
      id: "prod-out-of-stock",
      message: `${input.outOfStock} produto${input.outOfStock > 1 ? "s" : ""} sem estoque.`,
      tone: "negative",
      category: "Produtos",
      priority: 1,
    })
  }

  if (stockIssuePct > 20) {
    insights.push({
      id: "prod-stock-risk",
      message: `${stockIssuePct}% dos produtos estão com estoque crítico ou zerado.`,
      tone: "warning",
      category: "Produtos",
      priority: 2,
    })
  }

  if (input.idleProductCount > 5) {
    insights.push({
      id: "prod-idle",
      message: `${input.idleProductCount} produtos não tiveram vendas no período. Avalie promoções ou descontinuação.`,
      tone: "neutral",
      category: "Produtos",
      priority: 3,
    })
  }

  if (input.topProductName && input.topProductPreviousSales && input.topProductSales !== undefined) {
    const prodPct = pct(input.topProductSales, input.topProductPreviousSales)
    if (prodPct > 20) {
      insights.push({
        id: "prod-top-up",
        message: `${input.topProductName} vendeu ${prodPct}% mais neste período.`,
        tone: "positive",
        category: "Produtos",
        priority: 2,
      })
    } else if (prodPct < -20) {
      insights.push({
        id: "prod-top-down",
        message: `${input.topProductName} vendeu ${Math.abs(prodPct)}% menos - vale investigar.`,
        tone: "warning",
        category: "Produtos",
        priority: 2,
      })
    }
  }

  return insights
}

export function generateServicesInsights(input: ServicesInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.totalAppointments > 0 && input.attendanceRate < 70) {
    insights.push({
      id: "serv-attendance-low",
      message: `Taxa de comparecimento é de ${input.attendanceRate}% - ${Math.round(100 - input.attendanceRate)}% dos clientes não compareceram.`,
      tone: "warning",
      category: "Serviços",
      priority: 1,
    })
  }

  if (input.cancelledCount > 5 && input.totalAppointments > 0) {
    const cancelPct = Math.round((input.cancelledCount / input.totalAppointments) * 100)
    if (cancelPct > 20) {
      insights.push({
        id: "serv-cancel-high",
        message: `${cancelPct}% dos agendamentos foram cancelados. Avalie a política de cancelamento.`,
        tone: "negative",
        category: "Serviços",
        priority: 1,
      })
    }
  }

  if (input.topStaffName && input.topStaffRevenue) {
    insights.push({
      id: "serv-top-staff",
      message: `${input.topStaffName} gerou ${brl(input.topStaffRevenue)} em serviços.`,
      tone: "positive",
      category: "Serviços",
      priority: 3,
    })
  }

  if (input.todayAppointments > 0) {
    insights.push({
      id: "serv-today",
      message: `${input.todayAppointments} agendamento${input.todayAppointments > 1 ? "s" : ""} para hoje.`,
      tone: "info",
      category: "Serviços",
      priority: 2,
    })
  }

  return insights
}

export function generateFinancialInsights(input: FinancialInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.balance < 0) {
    insights.push({
      id: "fin-negative-balance",
      message: `Saldo negativo de ${brl(Math.abs(input.balance))}. Reveja contas a pagar e a receber.`,
      tone: "negative",
      category: "Financeiro",
      priority: 1,
    })
  } else if (input.balance > 0) {
    insights.push({
      id: "fin-positive-balance",
      message: `Saldo positivo de ${brl(input.balance)}.`,
      tone: "positive",
      category: "Financeiro",
      priority: 3,
    })
  }

  if (input.receivable > input.payable * 1.5) {
    insights.push({
      id: "fin-healthy",
      message: `A receber (${brl(input.receivable)}) é maior que a pagar (${brl(input.payable)}) - situação confortável.`,
      tone: "positive",
      category: "Financeiro",
      priority: 2,
    })
  } else if (input.payable > input.receivable) {
    insights.push({
      id: "fin-warning",
      message: `Contas a pagar (${brl(input.payable)}) superam o a receber (${brl(input.receivable)}).`,
      tone: "warning",
      category: "Financeiro",
      priority: 1,
    })
  }

  if (input.incomeTotal > 0) {
    const expenseRatio = Math.round((input.expenseTotal / input.incomeTotal) * 100)
    if (expenseRatio > 80) {
      insights.push({
        id: "fin-expense-high",
        message: `${expenseRatio}% da receita vai para despesas. Margem apertada.`,
        tone: "warning",
        category: "Financeiro",
        priority: 2,
      })
    }
  }

  return insights
}

export function generateCustomerInsights(input: CustomerInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.activeCustomers > 0 && input.totalCustomers > 0) {
    const activePct = Math.round((input.activeCustomers / input.totalCustomers) * 100)
    if (activePct < 30) {
      insights.push({
        id: "cust-low-active",
        message: `Apenas ${activePct}% dos clientes compraram neste período.`,
        tone: "warning",
        category: "Clientes",
        priority: 1,
      })
    }
  }

  if (input.newCustomers > 0) {
    insights.push({
      id: "cust-new",
      message: `${input.newCustomers} novo${input.newCustomers > 1 ? "s" : ""} cliente${input.newCustomers > 1 ? "s" : ""} no período.`,
      tone: "positive",
      category: "Clientes",
      priority: 2,
    })
  }

  if (input.inactiveVipCount && input.inactiveVipCount > 0) {
    insights.push({
      id: "cust-vip-risk",
      message: `${input.inactiveVipCount} cliente${input.inactiveVipCount > 1 ? "s" : ""} VIP está${input.inactiveVipCount > 1 ? "o" : ""} há mais de 45 dias sem comprar.`,
      tone: "warning",
      category: "Clientes",
      priority: 1,
    })
  }

  const ticketPct = pct(input.avgTicket, input.previousAvgTicket)
  if (ticketPct > 5) {
    insights.push({
      id: "cust-ticket-up",
      message: `Ticket médio por cliente subiu ${ticketPct}%.`,
      tone: "positive",
      category: "Clientes",
      priority: 3,
    })
  } else if (ticketPct < -5) {
    insights.push({
      id: "cust-ticket-down",
      message: `Ticket médio por cliente caiu ${Math.abs(ticketPct)}%.`,
      tone: "neutral",
      category: "Clientes",
      priority: 3,
    })
  }

  if (input.topCustomerName && input.topCustomerRevenue) {
    insights.push({
      id: "cust-top",
      message: `${input.topCustomerName} é o cliente que mais gerou receita: ${brl(input.topCustomerRevenue)}.`,
      tone: "info",
      category: "Clientes",
      priority: 3,
    })
  }

  return insights
}

export function generateMarketingInsights(input: MarketingInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.topSource && input.topSourcePercent > 0) {
    insights.push({
      id: "mkt-top-source",
      message: `${input.topSource} representa ${input.topSourcePercent}% do faturamento.`,
      tone: "info",
      category: "Marketing",
      priority: 2,
    })
  }

  if (input.couponUsageRate > 0) {
    if (input.couponUsageRate > 30) {
      insights.push({
        id: "mkt-coupon-high",
        message: `${Math.round(input.couponUsageRate)}% dos pedidos usam cupom - a margem pode estar comprometida.`,
        tone: "warning",
        category: "Marketing",
        priority: 2,
      })
    } else {
      insights.push({
        id: "mkt-coupon-ok",
        message: `${Math.round(input.couponUsageRate)}% dos pedidos com cupom.`,
        tone: "neutral",
        category: "Marketing",
        priority: 3,
      })
    }
  }

  return insights
}

export function generateReturnsInsights(input: ReturnsInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.returnRate > 10) {
    insights.push({
      id: "ret-rate-high",
      message: `Taxa de devolução de ${input.returnRate}% - acima do ideal.`,
      tone: "negative",
      category: "Trocas/Devoluções",
      priority: 1,
    })
  } else if (input.returnRate > 0) {
    insights.push({
      id: "ret-rate",
      message: `Taxa de devolução de ${input.returnRate}% no período.`,
      tone: "neutral",
      category: "Trocas/Devoluções",
      priority: 2,
    })
  }

  const returnPct = pct(input.returnRate, input.previousReturnRate)
  if (returnPct > 20) {
    insights.push({
      id: "ret-rate-up",
      message: `Taxa de devolução aumentou ${returnPct}% em relação ao período anterior.`,
      tone: "negative",
      category: "Trocas/Devoluções",
      priority: 1,
    })
  } else if (returnPct < -10) {
    insights.push({
      id: "ret-rate-down",
      message: `Taxa de devolução caiu ${Math.abs(returnPct)}% - ótimo sinal.`,
      tone: "positive",
      category: "Trocas/Devoluções",
      priority: 2,
    })
  }

  if (input.totalRefunded > 0) {
    insights.push({
      id: "ret-refunded",
      message: `Total reembolsado: ${brl(input.totalRefunded)}.`,
      tone: "negative",
      category: "Trocas/Devoluções",
      priority: 3,
    })
  }

  if (input.topReason) {
    insights.push({
      id: "ret-top-reason",
      message: `Principal motivo: ${input.topReason}.`,
      tone: "info",
      category: "Trocas/Devoluções",
      priority: 3,
    })
  }

  return insights
}

export function generateDeliveryInsights(input: DeliveryInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.lateCount > 0) {
    const latePct = Math.round((input.lateCount / Math.max(input.totalDeliveries, 1)) * 100)
    if (latePct > 20) {
      insights.push({
        id: "del-late-high",
        message: `${latePct}% das entregas estão atrasadas.`,
        tone: "negative",
        category: "Entregas",
        priority: 1,
      })
    } else {
      insights.push({
        id: "del-late",
        message: `${input.lateCount} entrega${input.lateCount > 1 ? "s" : ""} atrasada${input.lateCount > 1 ? "s" : ""}.`,
        tone: "warning",
        category: "Entregas",
        priority: 2,
      })
    }
  }

  if (input.avgTimeMinutes > 0) {
    const timePct = pct(input.avgTimeMinutes, input.previousAvgTimeMinutes)
    if (timePct < -5) {
      insights.push({
        id: "del-time-down",
        message: `Tempo médio de entrega caiu ${Math.abs(timePct)}% - mais eficiência.`,
        tone: "positive",
        category: "Entregas",
        priority: 2,
      })
    } else if (timePct > 10) {
      insights.push({
        id: "del-time-up",
        message: `Tempo médio de entrega aumentou ${timePct}%.`,
        tone: "warning",
        category: "Entregas",
        priority: 2,
      })
    }

    insights.push({
      id: "del-avg-time",
      message: `Tempo médio de entrega: ${input.avgTimeMinutes} min.`,
      tone: "info",
      category: "Entregas",
      priority: 3,
    })
  }

  return insights
}

export function generateProductivityInsights(input: ProductivityInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.topStaffName && input.topStaffRevenue) {
    insights.push({
      id: "prod-top-staff",
      message: `${input.topStaffName} é o destaque com ${brl(input.topStaffRevenue)} em vendas.`,
      tone: "positive",
      category: "Produtividade",
      priority: 1,
    })
  }

  if (input.goalProgress !== undefined && input.goalProgress >= 100) {
    insights.push({
      id: "prod-goal-met",
      message: `Meta atingida! ${Math.round(input.goalProgress)}% da meta realizada.`,
      tone: "positive",
      category: "Produtividade",
      priority: 1,
    })
  } else if (input.goalProgress !== undefined && input.goalProgress >= 80) {
    insights.push({
      id: "prod-goal-close",
      message: `${Math.round(input.goalProgress)}% da meta atingida.`,
      tone: "info",
      category: "Produtividade",
      priority: 2,
    })
  }

  return insights
}

interface AppointmentsInsightInput {
  totalAppointments: number
  completedCount: number
  cancelledCount: number
  noShowCount: number
  repeatCustomerRate: number
  avgDuration: number
  topServiceName?: string
  topServiceCount?: number
  totalRevenue: number
}

export function generateAppointmentsInsights(input: AppointmentsInsightInput): Insight[] {
  const insights: Insight[] = []

  if (input.totalAppointments > 0 && input.cancelledCount > 0) {
    const cancelPct = Math.round((input.cancelledCount / input.totalAppointments) * 100)
    if (cancelPct > 20) {
      insights.push({
        id: "appt-cancel-high",
        message: `${cancelPct}% dos agendamentos foram cancelados. Considere revisar a política de cancelamento.`,
        tone: "negative",
        category: "Agendamentos",
        priority: 1,
      })
    } else if (cancelPct > 10) {
      insights.push({
        id: "appt-cancel-moderate",
        message: `${cancelPct}% de cancelamentos no período.`,
        tone: "warning",
        category: "Agendamentos",
        priority: 2,
      })
    }
  }

  if (input.noShowCount > 0 && input.totalAppointments > 0) {
    const noShowPct = Math.round((input.noShowCount / input.totalAppointments) * 100)
    if (noShowPct > 10) {
      insights.push({
        id: "appt-noshow-high",
        message: `${noShowPct}% de ausências — considere confirmação automática por WhatsApp.`,
        tone: "warning",
        category: "Agendamentos",
        priority: 1,
      })
    }
  }

  if (input.repeatCustomerRate > 50) {
    insights.push({
      id: "appt-repeat-high",
      message: `${Math.round(input.repeatCustomerRate)}% dos clientes são recorrentes — excelente fidelização.`,
      tone: "positive",
      category: "Agendamentos",
      priority: 2,
    })
  } else if (input.repeatCustomerRate < 20 && input.totalAppointments > 10) {
    insights.push({
      id: "appt-repeat-low",
      message: `Apenas ${Math.round(input.repeatCustomerRate)}% dos clientes retornam. Considere programas de fidelidade.`,
      tone: "warning",
      category: "Agendamentos",
      priority: 2,
    })
  }

  if (input.topServiceName && input.topServiceCount) {
    insights.push({
      id: "appt-top-service",
      message: `${input.topServiceName} é o serviço mais agendado com ${input.topServiceCount} agendamentos.`,
      tone: "info",
      category: "Agendamentos",
      priority: 3,
    })
  }

  if (input.totalRevenue > 0) {
    insights.push({
      id: "appt-revenue",
      message: `Receita de agendamentos: ${brl(input.totalRevenue)}.`,
      tone: "positive",
      category: "Agendamentos",
      priority: 3,
    })
  }

  return insights
}
