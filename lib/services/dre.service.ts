import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"

export type DreRegime = "competencia" | "caixa"

export interface DreFilters {
  partnerId: string
  storeId?: string | null
  startDate: string // YYYY-MM-DD
  endDate: string // YYYY-MM-DD
  regime?: DreRegime
  compareWithPrevious?: boolean
}

export interface DreSubItem {
  id: string
  name: string
  amount: number
  verticalPercent: number // % em relação à Receita Bruta
  previousAmount?: number
  horizontalVariation?: number // % de variação vs período anterior
  transactionCount?: number
}

export interface DreNode {
  key: string
  title: string
  type: "income" | "expense" | "subtotal" | "result"
  amount: number
  verticalPercent: number
  previousAmount?: number
  horizontalVariation?: number
  items: DreSubItem[]
  helpText?: string
}

export interface DreReportData {
  period: {
    startDate: string
    endDate: string
    previousStartDate?: string
    previousEndDate?: string
    regime: DreRegime
  }
  kpis: {
    grossRevenue: number
    netRevenue: number
    grossProfit: number
    grossMarginPercent: number
    contributionMarginAmount: number
    contributionMarginPercent: number
    fixedExpensesAmount: number
    breakEvenPointAmount: number
    ebitdaAmount: number
    ebitdaMarginPercent: number
    netProfitAmount: number
    netMarginPercent: number
  }
  structure: {
    grossRevenue: DreNode
    deductions: DreNode
    netRevenue: DreNode
    cogs: DreNode
    grossProfit: DreNode
    commercialExpenses: DreNode
    administrativeExpenses: DreNode
    proLaboreExpenses: DreNode
    ebitda: DreNode
    financialResults: DreNode
    nonOperationalResults: DreNode
    netProfit: DreNode
  }
}

/**
 * Calcula datas do período comparativo anterior com mesma duração.
 */
function getPreviousPeriodDates(startDate: string, endDate: string) {
  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T23:59:59Z`)
  const diffTime = Math.abs(end.getTime() - start.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - (diffDays - 1) * 24 * 60 * 60 * 1000)

  return {
    previousStartDate: prevStart.toISOString().slice(0, 10),
    previousEndDate: prevEnd.toISOString().slice(0, 10),
  }
}

/**
 * Calcula a variação horizontal (%) entre dois períodos.
 */
function calcHorizontalVariation(current: number, previous?: number): number {
  if (previous === undefined || previous === 0) {
    return current > 0 ? 100 : 0
  }
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(2))
}

/**
 * Calcula a análise vertical (%) em relação à receita bruta.
 */
function calcVerticalPercent(amount: number, grossRevenue: number): number {
  if (grossRevenue <= 0) return 0
  return Number(((amount / grossRevenue) * 100).toFixed(2))
}

/**
 * Motor central de cálculo do DRE no Dudit.
 */
async function computeDrePeriod(
  partnerId: string,
  storeId: string | null | undefined,
  startDate: string,
  endDate: string,
  regime: DreRegime,
) {
  const supabase = createAdminClient()
  const startIso = `${startDate}T00:00:00`
  const endIso = `${endDate}T23:59:59`

  // ── 0. Configurações da Loja / Fiscal ───────────────────────────────────────
  let storeQuery = supabase.from("stores").select("id, person_type, crt, simples_tax_rate_products, simples_tax_rate_services, mei_fixed_tax_amount").eq("partner_id", partnerId)
  if (storeId) storeQuery = storeQuery.eq("id", storeId)
  const { data: stores } = await storeQuery
  const activeStore = stores && stores.length > 0 ? stores[0] : null

  const simplesProductTaxRate = Number(activeStore?.simples_tax_rate_products || 0) / 100
  const simplesServiceTaxRate = Number(activeStore?.simples_tax_rate_services || 0) / 100
  const meiFixedTax = Number(activeStore?.mei_fixed_tax_amount || 0)

  // ── 1. Buscar Vendas PDV (`sales` + `sale_items`) ─────────────────────────
  let salesQuery = supabase
    .from("sales")
    .select(`
      id, total_amount, discount_amount, final_amount, paid_amount, fee_amount, fixed_fee_amount,
      payment_status, status, created_at,
      sale_items (id, product_id, variant_id, product_name, quantity, unit_price, unit_cost, total_price, subtotal)
    `)
    .eq("partner_id", partnerId)
    .neq("status", "cancelled")

  if (storeId) salesQuery = salesQuery.eq("store_id", storeId)

  if (regime === "competencia") {
    salesQuery = salesQuery.gte("created_at", startIso).lte("created_at", endIso)
  } else {
    // Caixa: Vendas com pagamento aprovado/parcial
    salesQuery = salesQuery.in("payment_status", ["paid", "partially_paid"]).gte("created_at", startIso).lte("created_at", endIso)
  }

  const { data: salesList } = await salesQuery

  // ── 2. Buscar Pedidos Online (`orders` + `order_items`) ───────────────────
  let ordersQuery = supabase
    .from("orders")
    .select(`
      id, total_amount, discount_amount, paid_amount, situation, created_at,
      order_items (id, product_id, variant_id, title, quantity, price, unit_cost, total)
    `)
    .eq("partner_id", partnerId)
    .not("situation", "in", '("cancelled","pending_payment")')

  if (storeId) ordersQuery = ordersQuery.eq("store_id", storeId)

  if (regime === "competencia") {
    ordersQuery = ordersQuery.gte("created_at", startIso).lte("created_at", endIso)
  } else {
    ordersQuery = ordersQuery.in("situation", ["paid", "preparing", "shipped", "delivered", "completed"]).gte("created_at", startIso).lte("created_at", endIso)
  }

  const { data: ordersList } = await ordersQuery

  // ── 3. Buscar Ordens de Serviço (`service_orders`) ─────────────────────────
  let soQuery = supabase
    .from("service_orders")
    .select("id, total_amount, discount_amount, final_amount, paid_amount, status, created_at")
    .eq("partner_id", partnerId)
    .not("status", "in", '("cancelled","draft")')

  if (storeId) soQuery = soQuery.eq("store_id", storeId)

  if (regime === "competencia") {
    soQuery = soQuery.gte("created_at", startIso).lte("created_at", endIso)
  } else {
    soQuery = soQuery.eq("status", "completed").gte("created_at", startIso).lte("created_at", endIso)
  }

  const { data: serviceOrdersList } = await soQuery

  // ── 4. Buscar Agendamentos (`appointments`) ───────────────────────────────
  let apptQuery = supabase
    .from("appointments")
    .select("id, price, status, start_date, created_at")
    .eq("partner_id", partnerId)
    .not("status", "in", '("cancelled")')

  if (storeId) apptQuery = apptQuery.eq("store_id", storeId)

  if (regime === "competencia") {
    apptQuery = apptQuery.gte("start_date", startDate).lte("start_date", endDate)
  } else {
    apptQuery = apptQuery.eq("status", "completed").gte("start_date", startDate).lte("start_date", endDate)
  }

  const { data: appointmentsList } = await apptQuery

  // ── 5. Buscar Transações Financeiras (`transactions`) com Categorias ──────
  let txQuery = supabase
    .from("transactions")
    .select(`
      id, description, amount, paid_amount, discount_amount, interest_amount, fee_amount,
      transaction_type, status, due_date, payment_date, created_at, origin,
      category_id, dre_group:financial_categories!category_id(id, name, dre_group, category_type)
    `)
    .eq("partner_id", partnerId)
    .neq("status", "cancelled")

  if (storeId) txQuery = txQuery.eq("store_id", storeId)

  if (regime === "competencia") {
    txQuery = txQuery.gte("due_date", startDate).lte("due_date", endDate)
  } else {
    txQuery = txQuery.eq("status", "paid").gte("payment_date", startIso).lte("payment_date", endIso)
  }

  const { data: transactionsList } = await txQuery

  // ── 6. Buscar Devoluções e Reembolsos (`returns`) ─────────────────────────
  let returnsQuery = supabase
    .from("returns")
    .select("id, refund_amount, status, created_at")
    .eq("partner_id", partnerId)
    .eq("status", "completed")
    .gte("created_at", startIso)
    .lte("created_at", endIso)

  if (storeId) returnsQuery = returnsQuery.eq("store_id", storeId)
  const { data: returnsList } = await returnsQuery

  // ── 7. Buscar Comissões de Vendedores (`employee_commissions`) ────────────
  let commissionsQuery = supabase
    .from("employee_commissions")
    .select("id, amount, status, created_at")
    .eq("partner_id", partnerId)
    .gte("created_at", startIso)
    .lte("created_at", endIso)

  if (storeId) commissionsQuery = commissionsQuery.eq("store_id", storeId)
  const { data: commissionsList } = await commissionsQuery

  // ── 8. Buscar Fretes e Entregas (`deliveries`) ────────────────────────────
  let deliveriesQuery = supabase
    .from("deliveries")
    .select("id, fee, driver_payout, status, created_at")
    .eq("partner_id", partnerId)
    .neq("status", "cancelled")
    .gte("created_at", startIso)
    .lte("created_at", endIso)

  if (storeId) deliveriesQuery = deliveriesQuery.eq("store_id", storeId)
  const { data: deliveriesList } = await deliveriesQuery

  // ==========================================================================
  // CONSOLIDAÇÃO DOS NÓS DA DRE
  // ==========================================================================

  // 1. Receita Operacional Bruta
  let productsRevenue = 0
  let servicesRevenue = 0
  let recurringRevenue = 0
  let otherIncome = 0

  // 1.1 Venda de Produtos (PDV)
  let posSaleCount = 0
  for (const s of salesList || []) {
    const val = regime === "competencia" ? Number(s.total_amount || 0) : Number(s.paid_amount || s.final_amount || 0)
    productsRevenue += val
    posSaleCount++
  }

  // 1.2 Venda de Produtos (Online / Pedidos)
  let orderCount = 0
  for (const o of ordersList || []) {
    const val = regime === "competencia" ? Number(o.total_amount || 0) : Number(o.paid_amount || o.total_amount || 0)
    productsRevenue += val
    orderCount++
  }

  // 1.3 Prestação de Serviços (OS + Agendamentos)
  let soCount = 0
  for (const so of serviceOrdersList || []) {
    const val = regime === "competencia" ? Number(so.total_amount || so.final_amount || 0) : Number(so.paid_amount || so.final_amount || 0)
    servicesRevenue += val
    soCount++
  }

  let apptCount = 0
  for (const a of appointmentsList || []) {
    servicesRevenue += Number(a.price || 0)
    apptCount++
  }

  // 1.4 Transações Manuais de Receita (filtrando para não duplicar origin system)
  let manualTxIncomeCount = 0
  for (const tx of transactionsList || []) {
    if (tx.transaction_type === "income" && tx.origin !== "system") {
      const g = (tx.dre_group as any)?.dre_group
      const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)
      if (g === "receita_financeira") {
        // Vai para resultado financeiro
      } else if (g === "nao_operacional") {
        // Vai para não operacional
      } else if (g === "receita_bruta" || !g) {
        const catName = (tx.dre_group as any)?.name?.toLowerCase() || ""
        if (catName.includes("assinatura") || catName.includes("recorren")) {
          recurringRevenue += val
        } else if (catName.includes("servi")) {
          servicesRevenue += val
        } else if (catName.includes("produto") || catName.includes("venda")) {
          productsRevenue += val
        } else {
          otherIncome += val
        }
        manualTxIncomeCount++
      }
    }
  }

  const grossRevenueTotal = productsRevenue + servicesRevenue + recurringRevenue + otherIncome

  // 2. Deduções da Receita Bruta
  let paymentFees = 0
  let discountsGiven = 0
  let returnsAndRefunds = 0
  let salesTaxes = 0

  // 2.1 Taxas de Maquininha / Gateways gravadas no PDV
  for (const s of salesList || []) {
    paymentFees += Number(s.fee_amount || 0) + Number(s.fixed_fee_amount || 0)
    discountsGiven += Number(s.discount_amount || 0)
  }

  for (const o of ordersList || []) {
    discountsGiven += Number(o.discount_amount || 0)
  }

  // Devoluções
  for (const r of returnsList || []) {
    returnsAndRefunds += Number(r.refund_amount || 0)
  }

  // Impostos sobre faturamento (DAS Simples ou MEI)
  if (simplesProductTaxRate > 0 || simplesServiceTaxRate > 0) {
    salesTaxes += productsRevenue * simplesProductTaxRate
    salesTaxes += servicesRevenue * simplesServiceTaxRate
  } else if (meiFixedTax > 0) {
    salesTaxes += meiFixedTax
  }

  // Transações avulsas de dedução
  for (const tx of transactionsList || []) {
    if (tx.transaction_type === "expense") {
      const g = (tx.dre_group as any)?.dre_group
      const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)
      if (g === "deducao_receita") {
        const catName = (tx.dre_group as any)?.name?.toLowerCase() || ""
        if (catName.includes("taxa") || catName.includes("cartao") || catName.includes("maquin")) {
          paymentFees += val
        } else if (catName.includes("desconto")) {
          discountsGiven += val
        } else if (catName.includes("imposto") || catName.includes("das")) {
          salesTaxes += val
        } else {
          returnsAndRefunds += val
        }
      }
    }
  }

  const totalDeductions = paymentFees + discountsGiven + returnsAndRefunds + salesTaxes
  const netRevenueTotal = Math.max(0, grossRevenueTotal - totalDeductions)

  // 3. Custos Diretos (CMV e CSP)
  let cogsProducts = 0
  let cogsServices = 0
  let cogsSupplies = 0

  // CMV de itens vendidos no PDV
  for (const s of salesList || []) {
    for (const item of (s.sale_items as any[]) || []) {
      const qty = Number(item.quantity || 0)
      const cost = Number(item.unit_cost || 0)
      cogsProducts += qty * cost
    }
  }

  // CMV de itens vendidos online
  for (const o of ordersList || []) {
    for (const item of (o.order_items as any[]) || []) {
      const qty = Number(item.quantity || 0)
      const cost = Number(item.unit_cost || 0)
      cogsProducts += qty * cost
    }
  }

  // Transações manuais categorizadas como CMV/Insumos
  for (const tx of transactionsList || []) {
    if (tx.transaction_type === "expense") {
      const g = (tx.dre_group as any)?.dre_group
      const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)
      if (g === "custo_direto_cmv") {
        const catName = (tx.dre_group as any)?.name?.toLowerCase() || ""
        if (catName.includes("servi") || catName.includes("peça")) {
          cogsServices += val
        } else if (catName.includes("insumo") || catName.includes("embalag")) {
          cogsSupplies += val
        } else {
          cogsProducts += val
        }
      }
    }
  }

  const totalCogs = cogsProducts + cogsServices + cogsSupplies
  const grossProfitTotal = netRevenueTotal - totalCogs

  // 4. Despesas Operacionais
  let commercialExpenses = 0
  let administrativeExpenses = 0
  let proLaboreExpenses = 0

  // 4.1 Comissões
  let commissionsTotal = 0
  for (const c of commissionsList || []) {
    commissionsTotal += Number(c.amount || 0)
  }
  commercialExpenses += commissionsTotal

  // 4.2 Fretes de Entrega pagos a motoristas
  let deliveriesTotal = 0
  for (const d of deliveriesList || []) {
    deliveriesTotal += Number(d.driver_payout || d.fee || 0)
  }
  commercialExpenses += deliveriesTotal

  // 4.3 Despesas das Transações por dre_group
  const dynamicCommercialItems: Record<string, number> = {}
  const dynamicAdminItems: Record<string, number> = {}
  const dynamicProLaboreItems: Record<string, number> = {}

  let financialIncome = 0
  let financialExpenses = 0
  let nonOperationalTotal = 0

  for (const tx of transactionsList || []) {
    const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)
    const g = (tx.dre_group as any)?.dre_group
    const catName = (tx.dre_group as any)?.name || tx.description || "Geral"

    if (tx.transaction_type === "expense") {
      if (g === "despesa_comercial") {
        commercialExpenses += val
        dynamicCommercialItems[catName] = (dynamicCommercialItems[catName] || 0) + val
      } else if (g === "despesa_administrativa" || (!g && tx.origin !== "system")) {
        administrativeExpenses += val
        dynamicAdminItems[catName] = (dynamicAdminItems[catName] || 0) + val
      } else if (g === "pro_labore") {
        proLaboreExpenses += val
        dynamicProLaboreItems[catName] = (dynamicProLaboreItems[catName] || 0) + val
      } else if (g === "despesa_financeira") {
        financialExpenses += val
      } else if (g === "nao_operacional") {
        nonOperationalTotal -= val
      }
    } else if (tx.transaction_type === "income") {
      if (g === "receita_financeira") {
        financialIncome += val
      } else if (g === "nao_operacional") {
        nonOperationalTotal += val
      }
    }
  }

  const totalOperationalExpenses = commercialExpenses + administrativeExpenses + proLaboreExpenses
  const ebitdaTotal = grossProfitTotal - totalOperationalExpenses

  const netFinancialResult = financialIncome - financialExpenses
  const netProfitTotal = ebitdaTotal + netFinancialResult + nonOperationalTotal

  // ==========================================================================
  // KPIs FINANCEIROS
  // ==========================================================================
  const grossMarginPercent = netRevenueTotal > 0 ? (grossProfitTotal / netRevenueTotal) * 100 : 0
  const variableCosts = totalCogs + paymentFees + commissionsTotal + deliveriesTotal
  const contributionMarginAmount = netRevenueTotal - variableCosts
  const contributionMarginPercent = netRevenueTotal > 0 ? (contributionMarginAmount / netRevenueTotal) * 100 : 0

  const fixedExpenses = administrativeExpenses + proLaboreExpenses
  const breakEvenPointAmount = contributionMarginPercent > 0 ? (fixedExpenses / (contributionMarginPercent / 100)) : 0

  const ebitdaMarginPercent = netRevenueTotal > 0 ? (ebitdaTotal / netRevenueTotal) * 100 : 0
  const netMarginPercent = netRevenueTotal > 0 ? (netProfitTotal / netRevenueTotal) * 100 : 0

  return {
    raw: {
      grossRevenue: grossRevenueTotal,
      productsRevenue,
      servicesRevenue,
      recurringRevenue,
      otherIncome,
      paymentFees,
      discountsGiven,
      returnsAndRefunds,
      salesTaxes,
      totalDeductions,
      netRevenue: netRevenueTotal,
      cogsProducts,
      cogsServices,
      cogsSupplies,
      totalCogs,
      grossProfit: grossProfitTotal,
      commercialExpenses,
      commissionsTotal,
      deliveriesTotal,
      dynamicCommercialItems,
      administrativeExpenses,
      dynamicAdminItems,
      proLaboreExpenses,
      dynamicProLaboreItems,
      totalOperationalExpenses,
      ebitda: ebitdaTotal,
      financialIncome,
      financialExpenses,
      netFinancialResult,
      nonOperationalTotal,
      netProfit: netProfitTotal,
    },
    kpis: {
      grossRevenue: grossRevenueTotal,
      netRevenue: netRevenueTotal,
      grossProfit: grossProfitTotal,
      grossMarginPercent: Number(grossMarginPercent.toFixed(2)),
      contributionMarginAmount,
      contributionMarginPercent: Number(contributionMarginPercent.toFixed(2)),
      fixedExpensesAmount: fixedExpenses,
      breakEvenPointAmount: Number(breakEvenPointAmount.toFixed(2)),
      ebitdaAmount: ebitdaTotal,
      ebitdaMarginPercent: Number(ebitdaMarginPercent.toFixed(2)),
      netProfitAmount: netProfitTotal,
      netMarginPercent: Number(netMarginPercent.toFixed(2)),
    },
  }
}

/**
 * Monta o relatório final da DRE com análise vertical e horizontal.
 */
export async function getDreReport(filters: DreFilters): Promise<DreReportData> {
  const regime = filters.regime || "competencia"
  const partnerId = sanitizeUUID(filters.partnerId)
  const storeId = filters.storeId ? sanitizeUUID(filters.storeId) : null

  // 1. Calcula o período atual
  const currentData = await computeDrePeriod(partnerId, storeId, filters.startDate, filters.endDate, regime)
  const cur = currentData.raw
  const grossRev = cur.grossRevenue

  // 2. Calcula período comparativo anterior (se solicitado)
  let prevDates: { previousStartDate: string; previousEndDate: string } | undefined
  let prev: typeof cur | undefined

  if (filters.compareWithPrevious) {
    prevDates = getPreviousPeriodDates(filters.startDate, filters.endDate)
    const prevData = await computeDrePeriod(partnerId, storeId, prevDates.previousStartDate, prevDates.previousEndDate, regime)
    prev = prevData.raw
  }

  // ── Montagem da Árvore Hierárquica ─────────────────────────────────────────
  return {
    period: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      previousStartDate: prevDates?.previousStartDate,
      previousEndDate: prevDates?.previousEndDate,
      regime,
    },
    kpis: currentData.kpis,
    structure: {
      // 1. Receita Bruta
      grossRevenue: {
        key: "1_receita_bruta",
        title: "(+) 1. RECEITA OPERACIONAL BRUTA",
        type: "income",
        amount: cur.grossRevenue,
        verticalPercent: 100,
        previousAmount: prev?.grossRevenue,
        horizontalVariation: calcHorizontalVariation(cur.grossRevenue, prev?.grossRevenue),
        items: [
          {
            id: "1.1",
            name: "Venda de Produtos e Mercadorias (PDV / Online)",
            amount: cur.productsRevenue,
            verticalPercent: calcVerticalPercent(cur.productsRevenue, grossRev),
            previousAmount: prev?.productsRevenue,
            horizontalVariation: calcHorizontalVariation(cur.productsRevenue, prev?.productsRevenue),
          },
          {
            id: "1.2",
            name: "Prestação de Serviços (Agendamentos / OS)",
            amount: cur.servicesRevenue,
            verticalPercent: calcVerticalPercent(cur.servicesRevenue, grossRev),
            previousAmount: prev?.servicesRevenue,
            horizontalVariation: calcHorizontalVariation(cur.servicesRevenue, prev?.servicesRevenue),
          },
          {
            id: "1.3",
            name: "Receitas Recorrentes e Assinaturas",
            amount: cur.recurringRevenue,
            verticalPercent: calcVerticalPercent(cur.recurringRevenue, grossRev),
            previousAmount: prev?.recurringRevenue,
            horizontalVariation: calcHorizontalVariation(cur.recurringRevenue, prev?.recurringRevenue),
          },
          {
            id: "1.4",
            name: "Outras Receitas Operacionais",
            amount: cur.otherIncome,
            verticalPercent: calcVerticalPercent(cur.otherIncome, grossRev),
            previousAmount: prev?.otherIncome,
            horizontalVariation: calcHorizontalVariation(cur.otherIncome, prev?.otherIncome),
          },
        ],
      },

      // 2. Deduções
      deductions: {
        key: "2_deducoes",
        title: "(-) 2. DEDUÇÕES DA RECEITA BRUTA",
        type: "expense",
        amount: cur.totalDeductions,
        verticalPercent: calcVerticalPercent(cur.totalDeductions, grossRev),
        previousAmount: prev?.totalDeductions,
        horizontalVariation: calcHorizontalVariation(cur.totalDeductions, prev?.totalDeductions),
        items: [
          {
            id: "2.1",
            name: "Taxas de Cartão, Maquininhas e Gateways",
            amount: cur.paymentFees,
            verticalPercent: calcVerticalPercent(cur.paymentFees, grossRev),
            previousAmount: prev?.paymentFees,
            horizontalVariation: calcHorizontalVariation(cur.paymentFees, prev?.paymentFees),
          },
          {
            id: "2.2",
            name: "Devoluções, Trocas e Estornos",
            amount: cur.returnsAndRefunds,
            verticalPercent: calcVerticalPercent(cur.returnsAndRefunds, grossRev),
            previousAmount: prev?.returnsAndRefunds,
            horizontalVariation: calcHorizontalVariation(cur.returnsAndRefunds, prev?.returnsAndRefunds),
          },
          {
            id: "2.3",
            name: "Descontos Comerciais e Cupons Concedidos",
            amount: cur.discountsGiven,
            verticalPercent: calcVerticalPercent(cur.discountsGiven, grossRev),
            previousAmount: prev?.discountsGiven,
            horizontalVariation: calcHorizontalVariation(cur.discountsGiven, prev?.discountsGiven),
          },
          {
            id: "2.4",
            name: "Impostos sobre Faturamento (DAS Simples/MEI)",
            amount: cur.salesTaxes,
            verticalPercent: calcVerticalPercent(cur.salesTaxes, grossRev),
            previousAmount: prev?.salesTaxes,
            horizontalVariation: calcHorizontalVariation(cur.salesTaxes, prev?.salesTaxes),
          },
        ],
      },

      // 3. Receita Líquida
      netRevenue: {
        key: "3_receita_liquida",
        title: "(=) 3. RECEITA OPERACIONAL LÍQUIDA",
        type: "subtotal",
        amount: cur.netRevenue,
        verticalPercent: calcVerticalPercent(cur.netRevenue, grossRev),
        previousAmount: prev?.netRevenue,
        horizontalVariation: calcHorizontalVariation(cur.netRevenue, prev?.netRevenue),
        items: [],
      },

      // 4. Custos Diretos
      cogs: {
        key: "4_custos_diretos",
        title: "(-) 4. CUSTOS DIRETOS DA OPERAÇÃO (CMV / CSP)",
        type: "expense",
        amount: cur.totalCogs,
        verticalPercent: calcVerticalPercent(cur.totalCogs, grossRev),
        previousAmount: prev?.totalCogs,
        horizontalVariation: calcHorizontalVariation(cur.totalCogs, prev?.totalCogs),
        items: [
          {
            id: "4.1",
            name: "CMV - Custo das Mercadorias Vendidas (Produtos)",
            amount: cur.cogsProducts,
            verticalPercent: calcVerticalPercent(cur.cogsProducts, grossRev),
            previousAmount: prev?.cogsProducts,
            horizontalVariation: calcHorizontalVariation(cur.cogsProducts, prev?.cogsProducts),
          },
          {
            id: "4.2",
            name: "CSP - Peças e Materiais Aplicados em Serviços",
            amount: cur.cogsServices,
            verticalPercent: calcVerticalPercent(cur.cogsServices, grossRev),
            previousAmount: prev?.cogsServices,
            horizontalVariation: calcHorizontalVariation(cur.cogsServices, prev?.cogsServices),
          },
          {
            id: "4.3",
            name: "Insumos Diretos e Embalagens de Envio",
            amount: cur.cogsSupplies,
            verticalPercent: calcVerticalPercent(cur.cogsSupplies, grossRev),
            previousAmount: prev?.cogsSupplies,
            horizontalVariation: calcHorizontalVariation(cur.cogsSupplies, prev?.cogsSupplies),
          },
        ],
      },

      // 5. Lucro Bruto
      grossProfit: {
        key: "5_lucro_bruto",
        title: "(=) 5. LUCRO BRUTO OPERACIONAL",
        type: "subtotal",
        amount: cur.grossProfit,
        verticalPercent: calcVerticalPercent(cur.grossProfit, grossRev),
        previousAmount: prev?.grossProfit,
        horizontalVariation: calcHorizontalVariation(cur.grossProfit, prev?.grossProfit),
        items: [],
      },

      // 6.1 Despesas Comerciais
      commercialExpenses: {
        key: "6_1_despesas_comerciais",
        title: "(-) 6.1 DESPESAS COM VENDAS E MARKETING",
        type: "expense",
        amount: cur.commercialExpenses,
        verticalPercent: calcVerticalPercent(cur.commercialExpenses, grossRev),
        previousAmount: prev?.commercialExpenses,
        horizontalVariation: calcHorizontalVariation(cur.commercialExpenses, prev?.commercialExpenses),
        items: [
          {
            id: "6.1.1",
            name: "Comissões de Vendedores e Atendentes",
            amount: cur.commissionsTotal,
            verticalPercent: calcVerticalPercent(cur.commissionsTotal, grossRev),
            previousAmount: prev?.commissionsTotal,
            horizontalVariation: calcHorizontalVariation(cur.commissionsTotal, prev?.commissionsTotal),
          },
          {
            id: "6.1.2",
            name: "Fretes e Entregas (Repasse a Entregadores)",
            amount: cur.deliveriesTotal,
            verticalPercent: calcVerticalPercent(cur.deliveriesTotal, grossRev),
            previousAmount: prev?.deliveriesTotal,
            horizontalVariation: calcHorizontalVariation(cur.deliveriesTotal, prev?.deliveriesTotal),
          },
          ...Object.entries(cur.dynamicCommercialItems).map(([name, amount], idx) => ({
            id: `6.1.${idx + 3}`,
            name,
            amount,
            verticalPercent: calcVerticalPercent(amount, grossRev),
            previousAmount: prev?.dynamicCommercialItems?.[name] || 0,
            horizontalVariation: calcHorizontalVariation(amount, prev?.dynamicCommercialItems?.[name]),
          })),
        ],
      },

      // 6.2 Despesas Administrativas
      administrativeExpenses: {
        key: "6_2_despesas_administrativas",
        title: "(-) 6.2 DESPESAS ADMINISTRATIVAS E GERAIS",
        type: "expense",
        amount: cur.administrativeExpenses,
        verticalPercent: calcVerticalPercent(cur.administrativeExpenses, grossRev),
        previousAmount: prev?.administrativeExpenses,
        horizontalVariation: calcHorizontalVariation(cur.administrativeExpenses, prev?.administrativeExpenses),
        items: Object.entries(cur.dynamicAdminItems).map(([name, amount], idx) => ({
          id: `6.2.${idx + 1}`,
          name,
          amount,
          verticalPercent: calcVerticalPercent(amount, grossRev),
          previousAmount: prev?.dynamicAdminItems?.[name] || 0,
          horizontalVariation: calcHorizontalVariation(amount, prev?.dynamicAdminItems?.[name]),
        })),
      },

      // 6.3 Pró-Labore
      proLaboreExpenses: {
        key: "6_3_pro_labore",
        title: "(-) 6.3 PRÓ-LABORE E RETIRADAS DE SÓCIOS",
        type: "expense",
        amount: cur.proLaboreExpenses,
        verticalPercent: calcVerticalPercent(cur.proLaboreExpenses, grossRev),
        previousAmount: prev?.proLaboreExpenses,
        horizontalVariation: calcHorizontalVariation(cur.proLaboreExpenses, prev?.proLaboreExpenses),
        items: Object.entries(cur.dynamicProLaboreItems).map(([name, amount], idx) => ({
          id: `6.3.${idx + 1}`,
          name,
          amount,
          verticalPercent: calcVerticalPercent(amount, grossRev),
          previousAmount: prev?.dynamicProLaboreItems?.[name] || 0,
          horizontalVariation: calcHorizontalVariation(amount, prev?.dynamicProLaboreItems?.[name]),
        })),
      },

      // 7. EBITDA / LAJIDA
      ebitda: {
        key: "7_ebitda",
        title: "(=) 7. RESULTADO OPERACIONAL (EBITDA / LAJIDA)",
        type: "subtotal",
        amount: cur.ebitda,
        verticalPercent: calcVerticalPercent(cur.ebitda, grossRev),
        previousAmount: prev?.ebitda,
        horizontalVariation: calcHorizontalVariation(cur.ebitda, prev?.ebitda),
        items: [],
      },

      // 8. Resultado Financeiro
      financialResults: {
        key: "8_resultado_financeiro",
        title: "(+/-) 8. RESULTADO FINANCEIRO LÍQUIDO",
        type: cur.netFinancialResult >= 0 ? "income" : "expense",
        amount: cur.netFinancialResult,
        verticalPercent: calcVerticalPercent(Math.abs(cur.netFinancialResult), grossRev),
        previousAmount: prev?.netFinancialResult,
        horizontalVariation: calcHorizontalVariation(cur.netFinancialResult, prev?.netFinancialResult),
        items: [
          {
            id: "8.1",
            name: "(+) Receitas Financeiras (Juros Recebidos / Rendimentos)",
            amount: cur.financialIncome,
            verticalPercent: calcVerticalPercent(cur.financialIncome, grossRev),
            previousAmount: prev?.financialIncome,
            horizontalVariation: calcHorizontalVariation(cur.financialIncome, prev?.financialIncome),
          },
          {
            id: "8.2",
            name: "(-) Despesas Financeiras (Juros Pagos / Tarifas Bancárias)",
            amount: cur.financialExpenses,
            verticalPercent: calcVerticalPercent(cur.financialExpenses, grossRev),
            previousAmount: prev?.financialExpenses,
            horizontalVariation: calcHorizontalVariation(cur.financialExpenses, prev?.financialExpenses),
          },
        ],
      },

      // 9. Não Operacionais
      nonOperationalResults: {
        key: "9_nao_operacionais",
        title: "(+/-) 9. OUTRAS RECEITAS E DESPESAS NÃO OPERACIONAIS",
        type: cur.nonOperationalTotal >= 0 ? "income" : "expense",
        amount: cur.nonOperationalTotal,
        verticalPercent: calcVerticalPercent(Math.abs(cur.nonOperationalTotal), grossRev),
        previousAmount: prev?.nonOperationalTotal,
        horizontalVariation: calcHorizontalVariation(cur.nonOperationalTotal, prev?.nonOperationalTotal),
        items: [],
      },

      // 10. Lucro Líquido
      netProfit: {
        key: "10_lucro_liquido",
        title: "(=) 10. LUCRO LÍQUIDO DO EXERCÍCIO",
        type: "result",
        amount: cur.netProfit,
        verticalPercent: calcVerticalPercent(cur.netProfit, grossRev),
        previousAmount: prev?.netProfit,
        horizontalVariation: calcHorizontalVariation(cur.netProfit, prev?.netProfit),
        items: [],
      },
    },
  }
}
