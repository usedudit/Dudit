import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { sanitizeUUID } from "@/lib/security/input-sanitizer"
import { getR2ImageUrl } from "@/lib/utils/get-r2-image-url"
import {
  getOrderRevenueBucket,
  isOrderDerivedTransaction,
  isRealizedServiceOrder,
  isCancelledServiceOrder,
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
} from "@/lib/services/dre-rules"

export type DreRegime = "competencia" | "caixa"

export interface DreFilters {
  partnerId: string
  storeId?: string | null
  allowedStoreIds?: string[] | null
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
  percentageOfGroup?: number
  transactionCount?: number
  helpText?: string
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

export interface DreCompanyInfo {
  partnerName: string
  tradeName?: string
  documentNumber?: string
  documentType?: "cpf" | "cnpj"
  storeName?: string
  taxRegimeLabel?: string
  partnerAvatar?: string
  generatedAt: string
}

export interface DreDataIntegrityAlerts {
  zeroCostItemsCount: number
  unclassifiedTransactionsCount: number
  unclassifiedTransactionsAmount: number
}

export interface DreReportData {
  period: {
    startDate: string
    endDate: string
    previousStartDate?: string
    previousEndDate?: string
    regime: DreRegime
  }
  companyInfo?: DreCompanyInfo
  alerts: DreDataIntegrityAlerts
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
    totalSalesAndOrdersCount: number
    averageTicketAmount: number
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
 * Calcula datas do período comparativo anterior com mesma duração exata.
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
 * Motor central de cálculo do DRE na Dudit.
 * Executa todas as consultas em paralelo com proteção de volume e precisão contábil.
 */
async function computeDrePeriod(
  partnerId: string,
  storeId: string | null | undefined,
  startDate: string,
  endDate: string,
  regime: DreRegime,
  allowedStoreIds?: string[] | null,
) {
  const supabase = createAdminClient()
  const startIso = `${startDate}T00:00:00`
  const endIso = `${endDate}T23:59:59`

  // ── Preparação das Queries com Cláusulas Otimizadas ─────────────────────────

  // 0. Configurações da Loja e Parceiro
  let storeQuery = supabase
    .from("stores")
    .select("id, name, razao_social, nome_fantasia, logo_url, person_type, crt, cnpj, cpf, simples_tax_rate_products, simples_tax_rate_services, mei_fixed_tax_amount, is_headquarters")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })

  if (storeId) {
    storeQuery = storeQuery.eq("id", storeId)
  } else if (allowedStoreIds && allowedStoreIds.length > 0) {
    storeQuery = storeQuery.in("id", allowedStoreIds)
  }

  // 1. Vendas PDV (`sales` + `sale_items`)
  let salesQuery = supabase
    .from("sales")
    .select(`
      id, total_amount, discount_amount, final_amount, paid_amount,
      payment_status, status, origin_type, created_at,
      payment_method_fee_amount, payment_method_fixed_fee_amount,
      payment_method_interest_amount,
      sale_items (id, product_id, variant_id, product_name, quantity,
        unit_price, unit_cost, total_price, subtotal,
        original_price, is_gift)
    `)
    .eq("partner_id", partnerId)
    .neq("status", "cancelled")
    .limit(10000)

  if (storeId) {
    salesQuery = salesQuery.eq("store_id", storeId)
  } else if (allowedStoreIds && allowedStoreIds.length > 0) {
    salesQuery = salesQuery.in("store_id", allowedStoreIds)
  }
  if (regime === "competencia") {
    salesQuery = salesQuery.gte("created_at", startIso).lte("created_at", endIso)
  } else {
    salesQuery = salesQuery.in("payment_status", ["paid", "partially_paid"]).gte("created_at", startIso).lte("created_at", endIso)
  }

  // 2. Pedidos Online (`orders` + `order_items`)
  let ordersQuery = supabase
    .from("orders")
    .select(`
      id, total_amount, discount_amount, discount_value, discount_type,
      manual_discount_amount, item_discount_amount, campaign_discount_amount,
      paid_amount, delivery_fee, situation, created_at, paid_at, order_source,
      source_service_order_id, delivery_payer, subtotal_original,
       payment_method_fee_amount, payment_method_fixed_fee_amount,
       payment_method_interest_amount, payment_method_discount_amount,
       payment_method_extra_amount,
      order_items (id, product_id, variant_id, product_name, quantity,
        product_price, unit_cost, subtotal, original_price, is_gift, discount_amount)
    `)
    .eq("partner_id", partnerId)
    .limit(10000)

  if (storeId) {
    ordersQuery = ordersQuery.eq("store_id", storeId)
  } else if (allowedStoreIds && allowedStoreIds.length > 0) {
    ordersQuery = ordersQuery.in("store_id", allowedStoreIds)
  }
  if (regime === "competencia") {
    ordersQuery = ordersQuery.gte("created_at", startIso).lte("created_at", endIso)
  } else {
    // `paid_at` não é gravado pela aplicação; a data real de caixa é
    // `mp_date_approved` (carimbo do gateway) e, na sua ausência, `updated_at`
    // (sempre preenchido e que coincide com o momento do pagamento).
    ordersQuery = ordersQuery.or(
      `and(mp_date_approved.gte.${startIso},mp_date_approved.lte.${endIso}),and(mp_date_approved.is.null,updated_at.gte.${startIso},updated_at.lte.${endIso})`,
    )
  }

  // 3. Ordens de Serviço (`service_orders`)
  let soQuery = supabase
    .from("service_orders")
    .select("id, total_amount, total_service_amount, total_product_amount, other_costs, discount_value, discount_type, coupon_discount_amount, status, payment_status, paid_amount, created_at, completed_at")
    .eq("partner_id", partnerId)
    .limit(10000)

  if (storeId) {
    soQuery = soQuery.eq("store_id", storeId)
  } else if (allowedStoreIds && allowedStoreIds.length > 0) {
    soQuery = soQuery.in("store_id", allowedStoreIds)
  }
  // A OS é reconhecida quando realizada: usamos a data de conclusão
  // (ou, na ausência, a de criação) como referência de período.
  soQuery = soQuery.or(
    `and(completed_at.gte.${startIso},completed_at.lte.${endIso}),and(completed_at.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`,
  )

  // 4. Agendamentos (`appointments`)
  let apptQuery = supabase
    .from("appointments")
    .select("id, price, status, payment_status, paid_amount, start_date, created_at, marketplace_order_id")
    .eq("partner_id", partnerId)
    .limit(10000)

  if (storeId) {
    apptQuery = apptQuery.eq("store_id", storeId)
  } else if (allowedStoreIds && allowedStoreIds.length > 0) {
    apptQuery = apptQuery.in("store_id", allowedStoreIds)
  }
  apptQuery = apptQuery.gte("start_date", startDate).lte("start_date", endDate)

  // 5. Transações Financeiras (`transactions`)
  let txQuery = supabase
    .from("transactions")
    .select(`
      id, description, amount, paid_amount, discount_amount, interest_amount, fee_amount,
      transaction_type, status, due_date, payment_date, transaction_date, created_at, origin, kind,
      category_id, dre_group:financial_categories!category_id(id, name, dre_group, category_type)
    `)
    .eq("partner_id", partnerId)
    .neq("status", "cancelled")
    .limit(10000)

  if (storeId) {
    txQuery = txQuery.eq("store_id", storeId)
  } else if (allowedStoreIds && allowedStoreIds.length > 0) {
    txQuery = txQuery.in("store_id", allowedStoreIds)
  }
  if (regime === "competencia") {
    txQuery = txQuery.or(`and(due_date.gte.${startDate},due_date.lte.${endDate}),and(due_date.is.null,created_at.gte.${startIso},created_at.lte.${endIso})`)
  } else {
    txQuery = txQuery.eq("status", "paid").gte("payment_date", startIso).lte("payment_date", endIso)
  }

  // 6. Devoluções e Reembolsos (`returns`)
  let returnsQuery = supabase
    .from("returns")
    .select("id, refund_amount, status, created_at, refund_transaction_id")
    .eq("partner_id", partnerId)
    .eq("status", "completed")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .limit(5000)

  if (storeId) {
    returnsQuery = returnsQuery.eq("store_id", storeId)
  } else if (allowedStoreIds && allowedStoreIds.length > 0) {
    returnsQuery = returnsQuery.in("store_id", allowedStoreIds)
  }

  // ── Execução Paralela Simultânea de Todas as Queries em 1 Roundtrip ─────────
  const [
    storesRes,
    salesRes,
    ordersRes,
    soRes,
    apptRes,
    txRes,
    returnsRes,
  ] = await Promise.all([
    storeQuery,
    salesQuery,
    ordersQuery,
    soQuery,
    apptQuery,
    txQuery,
    returnsQuery,
  ])

  const stores = storesRes.data || []
  const hqStore = stores.find((s: any) => s.is_headquarters) || stores[0] || null
  const selectedStore = storeId ? stores.find((s: any) => s.id === storeId) || hqStore : null
  const activeStore = selectedStore || hqStore

  const simplesProductTaxRate = Number(activeStore?.simples_tax_rate_products || 0) / 100
  const simplesServiceTaxRate = Number(activeStore?.simples_tax_rate_services || 0) / 100
  const meiFixedTax = Number(activeStore?.mei_fixed_tax_amount || 0)

  const salesList = salesRes.data || []
  const ordersList = ordersRes.data || []
  const serviceOrdersList = soRes.data || []
  const appointmentsList = apptRes.data || []
  const transactionsList = txRes.data || []
  const returnsList = returnsRes.data || []

  // ==========================================================================
  // 1. RECEITA OPERACIONAL BRUTA (Valor Nominal Cheio)
  // ==========================================================================
  let productsRevenue = 0
  let servicesRevenue = 0
  let recurringRevenue = 0
  let otherIncome = 0

  let posSaleCount = 0
  let posDiscounts = 0
  let posFees = 0

  // 1.1 PDV: Receita Bruta = Subtotal nominal (original_price x qty, excluindo brindes)
  // Descontos = item_discount_amount (preço promocional/campanha) + manual + cupom + pm discount
  // CMV = unit_cost x qty (inclui brindes, receita 0)
  for (const s of salesList) {
    // Vendas geradas por baixa de Ordem de Serviço são contabilizadas na OS,
    // não aqui (evita dupla contagem de receita).
    if (isServiceOrderOriginSale(s as any)) continue

    // Receita bruta nominal por item
    let saleNominalGross = 0
    for (const item of (s.sale_items as any[]) || []) {
      const qty = Number(item.quantity || 0)
      const chargedPrice = Number(item.unit_price || 0)
      const nominalPrice = Number(item.original_price || 0) > 0
        ? Number(item.original_price)
        : chargedPrice
      if (item.is_gift) continue // brinde: receita 0
      saleNominalGross += nominalPrice * qty
    }
    productsRevenue += saleNominalGross

    // Descontos por item: derivados do preço nominal (`original_price`) menos o
    // preço cobrado. Não lemos `sale_items.discount_amount` diretamente para
    // continuar funcionando em bancos que ainda não aplicaram a migration.
    const derivedItemDiscount = (s.sale_items as any[])?.reduce((sum: number, it: any) => {
      if (it.is_gift) return sum
      const qty = Number(it.quantity || 1)
      const charged = Number(it.unit_price || 0) * qty
      const nominal = (Number(it.original_price || 0) > 0 ? Number(it.original_price) : Number(it.unit_price || 0)) * qty
      return sum + Math.max(0, nominal - charged)
    }, 0) || 0

    const couponDiscount = Number(s.discount_amount || 0) // cupom no PDV
    const pmDiscount = Number((s as any).payment_method_discount_amount || 0)

    // No POS, discount_amount = cupom/desconto da venda; payment_method_discount_amount (se presente)
    posDiscounts += derivedItemDiscount + couponDiscount + pmDiscount

    // Taxas de cartão/gateway do PDV
    posFees += Number(s.payment_method_fee_amount || 0) + Number(s.payment_method_fixed_fee_amount || 0)
    posSaleCount++
  }

  // 1.2 Pedidos Online: Receita Bruta nominal (original_price x qty, excluindo brindes)
  // Descontos = item_discount_amount + manual_discount_amount + discount_amount (cupom) + payment_method_discount_amount
  // CMV = unit_cost x qty (inclui brindes, receita 0) — calculado no mesmo loop
  let orderCount = 0
  let orderDiscounts = 0
  let orderFees = 0
  let orderCogsProducts = 0
  let orderCogsServices = 0
  let orderCogsSupplies = 0
  let orderZeroCostItems = 0

  // Pedidos vinculados a agendamentos são contabilizados na tabela appointments.
  const appointmentLinkedOrderIds = new Set(
    appointmentsList.map((a: any) => a.marketplace_order_id).filter(Boolean),
  )

  for (const o of ordersList) {
    // Pedidos criados por Ordem de Serviço são contabilizados na própria OS.
    if (isServiceOrderLinkedOrder(o as any)) continue
    // Pedidos criados por agendamento são contabilizados na tabela appointments.
    if ((o as any).id && appointmentLinkedOrderIds.has((o as any).id)) continue

    const situation = (o as any).situation
    const countsInRegime = regime === "caixa"
      ? isOrderCashCollected(situation)
      : isOrderRevenueRecognized(situation)
    if (!countsInRegime) continue

    // Descontos: colunas persistidas (imutáveis)
    const itemDiscount = Math.max(0, Number(o.item_discount_amount || 0))
    const manualDiscount = Math.max(0, Number(o.manual_discount_amount || 0))
    const couponDiscount = Math.max(0, Number(o.discount_amount || 0))
    const pmDiscount = Math.max(0, Number(o.payment_method_discount_amount || 0))
    const totalOrderDiscount = itemDiscount + manualDiscount + couponDiscount + pmDiscount

    // Receita bruta nominal por item
    let itemsNominalGross = 0
    for (const item of (o.order_items as any[]) || []) {
      const qty = Number(item.quantity || 0)
      const chargedPrice = Number(item.product_price || 0)
      const nominalPrice = Number(item.original_price || 0) > 0
        ? Number(item.original_price)
        : chargedPrice
      if (item.is_gift) continue // brinde: receita 0
      itemsNominalGross += nominalPrice * qty
    }

    const revenueBucket = getOrderRevenueBucket((o as any).order_source)
    const addToRevenue = (value: number) => {
      if (revenueBucket === "recurring") recurringRevenue += value
      else productsRevenue += value
    }

    if (itemsNominalGross > 0) {
      addToRevenue(itemsNominalGross)
    } else {
      // Fallback conservador: total_amount + descontos - delivery
      const deliveryFee = Number(o.delivery_fee || 0)
      const reconstructedGross = Math.max(0, Number(o.total_amount || 0) + totalOrderDiscount - deliveryFee)
      addToRevenue(reconstructedGross)
    }

    orderDiscounts += totalOrderDiscount

    // Taxas de cartão/gateway (juros de parcelamento cobrados do cliente NÃO são taxa)
    orderFees += Number(o.payment_method_fee_amount || 0) + Number(o.payment_method_fixed_fee_amount || 0)

    // CMV dos itens deste pedido (mesmo regime/reconhecimento)
    for (const item of (o.order_items as any[]) || []) {
      const qty = Number(item.quantity || 0)
      const cost = Number(item.unit_cost || 0)
      if (!item.is_gift && cost <= 0) {
        orderZeroCostItems++
      }
      // Brindes entram no CMV (receita 0, custo real)
      const isServiceLine = item.service_id || item.line_type === "service_booking"
      if (isServiceLine) {
        orderCogsServices += qty * cost
      } else {
        orderCogsProducts += qty * cost
      }
    }

    orderCount++
  }

  // 1.3 Prestação de Serviços (OS + Agendamentos)
  // Reconhecimento por competência: apenas serviços realizados
  // (OS concluída/entregue; agendamento concluído).
  let soCount = 0
  let soDiscounts = 0
  for (const so of serviceOrdersList) {
    const realized = isRealizedServiceOrder((so as any).status)
    const cancelled = isCancelledServiceOrder((so as any).status)
    const cashSettled = isPaidAmountSettled((so as any).payment_status, (so as any).paid_amount)
    // No regime Caixa, o foco é o dinheiro que entrou: reconhecemos a OS
    // quando foi paga (não cancelada), mesmo sem estar concluída.
    const countsInRegime = regime === "caixa" ? (!cancelled && cashSettled) : realized
    if (!countsInRegime) continue

    const amounts = computeServiceOrderAmounts(so as any)
    productsRevenue += amounts.productsRevenue
    servicesRevenue += amounts.servicesRevenue
    soDiscounts += amounts.discount
    soCount++
  }

  let apptCount = 0
  for (const a of appointmentsList) {
    const realized = isRealizedAppointment((a as any).status)
    const excluded = isExcludedAppointmentFromRevenue((a as any).status)
    const cashSettled = isPaidAmountSettled((a as any).payment_status, (a as any).paid_amount)
    // No regime Caixa, reconhecemos o agendamento quando houve pagamento
    // (e não está cancelado/ausência), independentemente de concluído.
    const countsInRegime = regime === "caixa" ? (!excluded && cashSettled) : realized
    if (!countsInRegime) continue
    servicesRevenue += Number(a.price || 0)
    apptCount++
  }

  // 1.4 Transações Manuais de Receita (filtrando origin system para não duplicar vendas)
  let manualTxIncomeCount = 0
  let unclassifiedTransactionsCount = 0
  let unclassifiedTransactionsAmount = 0

  for (const tx of transactionsList) {
    if (isOrderDerivedTransaction(tx)) continue

    const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)
    const g = (tx.dre_group as any)?.dre_group

    if (!g && tx.origin !== "system") {
      unclassifiedTransactionsCount++
      unclassifiedTransactionsAmount += val
    }

    if (tx.transaction_type === "income" && tx.origin !== "system") {
      if (g === "receita_financeira" || g === "nao_operacional") {
        // Apurado nos grupos 8 e 9
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

  // ==========================================================================
  // 2. DEDUÇÕES DA RECEITA BRUTA
  // ==========================================================================
  let paymentFees = posFees + orderFees
  let discountsGiven = posDiscounts + orderDiscounts + soDiscounts
  let returnsAndRefunds = 0
  let salesTaxes = 0

  // 2.1 Devoluções e Reembolsos de Pedidos/PDV
  const returnTxIds = new Set<string>()
  for (const r of returnsList) {
    returnsAndRefunds += Number(r.refund_amount || 0)
    if (r.refund_transaction_id) {
      returnTxIds.add(r.refund_transaction_id)
    }
  }

  // 2.2 Impostos sobre faturamento (Simples Nacional / DAS-MEI)
  if (simplesProductTaxRate > 0 || simplesServiceTaxRate > 0) {
    salesTaxes += (productsRevenue + recurringRevenue) * simplesProductTaxRate
    salesTaxes += servicesRevenue * simplesServiceTaxRate
  } else if (meiFixedTax > 0) {
    // DAS do MEI é valor fixo mensal; rateamos por dia no período selecionado.
    salesTaxes += computeProratedMonthlyTax(meiFixedTax, startDate, endDate)
  }

  // 2.3 Transações financeiras manuais de dedução (sem duplicar as já calculadas)
  for (const tx of transactionsList) {
    if (tx.transaction_type === "expense" && !returnTxIds.has(tx.id)) {
      const g = (tx.dre_group as any)?.dre_group
      const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)

      if (g === "deducao_receita") {
        const catName = (tx.dre_group as any)?.name?.toLowerCase() || ""
        if (catName.includes("taxa") || catName.includes("cartao") || catName.includes("maquin") || catName.includes("gateway")) {
          paymentFees += val
        } else if (catName.includes("desconto") || catName.includes("abatimento")) {
          discountsGiven += val
        } else if (catName.includes("imposto") || catName.includes("das") || catName.includes("tributo")) {
          salesTaxes += val
        } else {
          returnsAndRefunds += val
        }
      }
    }
  }

  const totalDeductions = paymentFees + discountsGiven + returnsAndRefunds + salesTaxes
  // Não limitar a zero: uma sobre-dedução (ex.: DAS fixo em mês fraco) deve
  // aparecer como receita líquida negativa, sinalizando distorção real.
  const netRevenueTotal = grossRevenueTotal - totalDeductions

  // ==========================================================================
  // 3. CUSTOS DIRETOS DA OPERAÇÃO (CMV / CSP / Insumos)
  // ==========================================================================
  let cogsProducts = 0
  let cogsServices = 0
  let cogsSupplies = 0
  let zeroCostItemsCount = 0

  // 3.1 CMV de itens vendidos no PDV (exclui vendas originadas de OS)
  // Não conta brindes em zeroCostItemsCount (brinde tem receita 0, custo real)
  for (const s of salesList) {
    if (isServiceOrderOriginSale(s as any)) continue
    for (const item of (s.sale_items as any[]) || []) {
      const qty = Number(item.quantity || 0)
      const cost = Number(item.unit_cost || 0)
      if (!item.is_gift && cost <= 0) {
        zeroCostItemsCount++
      }
      cogsProducts += qty * cost
    }
  }

  // 3.2 CMV de itens vendidos online — já calculado no loop de receita (mesmo regime/reconhecimento)
  cogsProducts += orderCogsProducts
  cogsServices += orderCogsServices
  cogsSupplies += orderCogsSupplies
  zeroCostItemsCount += orderZeroCostItems

  // 3.3 Transações financeiras manuais de Custo Direto / CMV / Peças
  for (const tx of transactionsList) {
    if (isOrderDerivedTransaction(tx)) continue

    if (tx.transaction_type === "expense") {
      const g = (tx.dre_group as any)?.dre_group
      const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)
      if (g === "custo_direto_cmv") {
        const catName = (tx.dre_group as any)?.name?.toLowerCase() || ""
        if (catName.includes("servi") || catName.includes("peça") || catName.includes("peca")) {
          cogsServices += val
        } else if (catName.includes("insumo") || catName.includes("embalag") || catName.includes("materia")) {
          cogsSupplies += val
        } else {
          cogsProducts += val
        }
      }
    }
  }

  const totalCogs = cogsProducts + cogsServices + cogsSupplies
  const grossProfitTotal = netRevenueTotal - totalCogs

  // ==========================================================================
  // 4. DESPESAS OPERACIONAIS (Comerciais, Administrativas e Pró-Labore)
  // ==========================================================================
  let commercialExpenses = 0
  let administrativeExpenses = 0
  let proLaboreExpenses = 0

  // 4.1 Despesas Comerciais e Operacionais registradas nas transações
  let commissionsTotal = 0
  let deliveriesTotal = 0

  // 4.2 Despesas das Transações por dre_group
  const dynamicCommercialItems: Record<string, number> = {}
  const dynamicAdminItems: Record<string, number> = {}
  const dynamicProLaboreItems: Record<string, number> = {}

  let financialIncome = 0
  let financialExpenses = 0
  let nonOperationalTotal = 0

  for (const tx of transactionsList) {
    if (isOrderDerivedTransaction(tx)) continue

    const val = regime === "competencia" ? Number(tx.amount || 0) : Number(tx.paid_amount || tx.amount || 0)
    const g = (tx.dre_group as any)?.dre_group
    const catName = (tx.dre_group as any)?.name || tx.description || "Outras Despesas"

    if (tx.transaction_type === "expense") {
      if (g === "despesa_comercial") {
        commercialExpenses += val
        const lowerCat = catName.toLowerCase()
        if (lowerCat.includes("comiss")) {
          commissionsTotal += val
        } else if (
          lowerCat.includes("frete") ||
          lowerCat.includes("entrega") ||
          lowerCat.includes("logíst") ||
          lowerCat.includes("logist") ||
          lowerCat.includes("motoboy")
        ) {
          deliveriesTotal += val
        } else {
          dynamicCommercialItems[catName] = (dynamicCommercialItems[catName] || 0) + val
        }
      } else if (g === "despesa_administrativa" || (!g && tx.origin !== "system")) {
        administrativeExpenses += val
        dynamicAdminItems[catName] = (dynamicAdminItems[catName] || 0) + val
      } else if (g === "pro_labore") {
        const lowerCat = catName.toLowerCase()
        if (lowerCat.includes("distribui") || lowerCat.includes("dividendo") || lowerCat.includes("retirada de lucro")) {
          // Distribuição de lucros / Dividendos não é despesa operacional da empresa (é destinação do lucro líquido)
          nonOperationalTotal -= val
        } else {
          proLaboreExpenses += val
          dynamicProLaboreItems[catName] = (dynamicProLaboreItems[catName] || 0) + val
        }
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
  // 5. KPIs E INDICADORES CONTÁBEIS / GERENCIAIS
  // ==========================================================================
  const totalSalesCount = posSaleCount + orderCount + soCount + apptCount
  const averageTicket = totalSalesCount > 0 ? grossRevenueTotal / totalSalesCount : 0

  const grossMarginPercent = netRevenueTotal > 0 ? (grossProfitTotal / netRevenueTotal) * 100 : 0
  const variableCosts = totalCogs + paymentFees + commissionsTotal + deliveriesTotal
  const contributionMarginAmount = netRevenueTotal - variableCosts
  const contributionMarginPercent = netRevenueTotal > 0 ? (contributionMarginAmount / netRevenueTotal) * 100 : 0

  const fixedExpenses = administrativeExpenses + proLaboreExpenses
  const breakEvenPointAmount = contributionMarginPercent > 0 ? (fixedExpenses / (contributionMarginPercent / 100)) : 0

  const ebitdaMarginPercent = netRevenueTotal > 0 ? (ebitdaTotal / netRevenueTotal) * 100 : 0
  const netMarginPercent = netRevenueTotal > 0 ? (netProfitTotal / netRevenueTotal) * 100 : 0

  // Resolve and decrypt the document (CPF/CNPJ) for display on the DRE.
  // CPF is stored encrypted (AES-256-GCM) and must be decrypted before display.
  // CNPJ is stored in plain text and can be used as-is.
  async function resolveDocument(store: any): Promise<{ documentNumber: string; documentType: "cpf" | "cnpj" | undefined }> {
    if (!store) return { documentNumber: "", documentType: undefined }
    if (store.cnpj) return { documentNumber: store.cnpj, documentType: "cnpj" }
    if (store.cpf) {
      try {
        const { decryptCPF } = await import("@/lib/crypto")
        const decrypted = await decryptCPF(store.cpf)
        return { documentNumber: decrypted, documentType: "cpf" }
      } catch (e) {
        console.error("[DRE] Failed to decrypt CPF:", e)
        return { documentNumber: "", documentType: undefined }
      }
    }
    return { documentNumber: "", documentType: undefined }
  }

  const resolvedDoc = await resolveDocument(selectedStore || hqStore)

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
      zeroCostItemsCount,
      unclassifiedTransactionsCount,
      unclassifiedTransactionsAmount,
      totalSalesCount,
      averageTicket,
    },
    companyInfo: {
      partnerName: activeStore?.razao_social || activeStore?.nome_fantasia || hqStore?.name || "Empresa Matriz",
      tradeName: activeStore?.nome_fantasia || hqStore?.name,
      documentNumber: resolvedDoc.documentNumber || undefined,
      documentType: resolvedDoc.documentType,
      partnerAvatar: (selectedStore?.logo_url || hqStore?.logo_url) ? getR2ImageUrl(selectedStore?.logo_url || hqStore?.logo_url) : undefined,
      storeName: storeId
        ? (selectedStore?.name || "Loja Selecionada")
        : (allowedStoreIds && allowedStoreIds.length === 1
          ? (stores.find((s: any) => s.id === allowedStoreIds[0])?.name || "Loja Selecionada")
          : "Todas as Lojas (Consolidado)"),
      taxRegimeLabel: getTaxRegimeLabel(activeStore?.person_type, activeStore?.crt),
      generatedAt: new Date().toLocaleString("pt-BR"),
    },
    alerts: {
      zeroCostItemsCount,
      unclassifiedTransactionsCount,
      unclassifiedTransactionsAmount,
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
      totalSalesAndOrdersCount: totalSalesCount,
      averageTicketAmount: Number(averageTicket.toFixed(2)),
    },
  }
}

/**
 * Monta o relatório final da DRE com análise vertical, horizontal e estrutura contábil.
 */
export async function getDreReport(filters: DreFilters): Promise<DreReportData> {
  const regime = filters.regime || "competencia"
  const partnerId = sanitizeUUID(filters.partnerId) || filters.partnerId
  const storeId = filters.storeId ? sanitizeUUID(filters.storeId) : null
  const allowedStoreIds = filters.allowedStoreIds && filters.allowedStoreIds.length > 0
    ? filters.allowedStoreIds.map(id => sanitizeUUID(id) || id)
    : null

  let prevDates: { previousStartDate: string; previousEndDate: string } | undefined
  if (filters.compareWithPrevious) {
    prevDates = getPreviousPeriodDates(filters.startDate, filters.endDate)
  }

  // Executa o período atual e o comparativo simultaneamente em paralelo
  const [currentData, prevData] = await Promise.all([
    computeDrePeriod(partnerId, storeId, filters.startDate, filters.endDate, regime, allowedStoreIds),
    prevDates
      ? computeDrePeriod(partnerId, storeId, prevDates.previousStartDate, prevDates.previousEndDate, regime, allowedStoreIds)
      : Promise.resolve(null),
  ])

  const cur = currentData.raw
  const prev = prevData?.raw
  const grossRev = cur.grossRevenue

  // ── Montagem da Árvore Hierárquica da DRE ──────────────────────────────────
  return {
    period: {
      startDate: filters.startDate,
      endDate: filters.endDate,
      previousStartDate: prevDates?.previousStartDate,
      previousEndDate: prevDates?.previousEndDate,
      regime,
    },
    companyInfo: currentData.companyInfo,
    alerts: currentData.alerts,
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
        helpText: "Faturamento bruto total gerado pelas vendas de mercadorias, produtos e prestação de serviços antes de quaisquer deduções.",
        items: [
          {
            id: "1.1",
            name: "Venda de Mercadorias e Produtos (PDV / Online)",
            amount: cur.productsRevenue,
            verticalPercent: calcVerticalPercent(cur.productsRevenue, grossRev),
            previousAmount: prev?.productsRevenue,
            horizontalVariation: calcHorizontalVariation(cur.productsRevenue, prev?.productsRevenue),
          },
          {
            id: "1.2",
            name: "Prestação de Serviços (Ordens de Serviço / Agendamentos)",
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
        helpText: "Descontos comerciais, taxas de meios de pagamento/maquininhas, devoluções/estornos de clientes e impostos sobre vendas.",
        items: [
          {
            id: "2.1",
            name: "Taxas de Cartão, Maquininhas e Gateways Online",
            amount: cur.paymentFees,
            verticalPercent: calcVerticalPercent(cur.paymentFees, grossRev),
            previousAmount: prev?.paymentFees,
            horizontalVariation: calcHorizontalVariation(cur.paymentFees, prev?.paymentFees),
          },
          {
            id: "2.2",
            name: "Descontos Comerciais, Cupons e Abatimentos",
            amount: cur.discountsGiven,
            verticalPercent: calcVerticalPercent(cur.discountsGiven, grossRev),
            previousAmount: prev?.discountsGiven,
            horizontalVariation: calcHorizontalVariation(cur.discountsGiven, prev?.discountsGiven),
          },
          {
            id: "2.3",
            name: "Devoluções, Trocas e Estornos Concedidos",
            amount: cur.returnsAndRefunds,
            verticalPercent: calcVerticalPercent(cur.returnsAndRefunds, grossRev),
            previousAmount: prev?.returnsAndRefunds,
            horizontalVariation: calcHorizontalVariation(cur.returnsAndRefunds, prev?.returnsAndRefunds),
          },
          {
            id: "2.4",
            name: "Impostos sobre Faturamento (Simples Nacional / DAS-MEI)",
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
        helpText: "Receita real que efetivamente ingressa na empresa para cobrir custos e despesas.",
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
        helpText: "Custos incorridos diretamente para produzir o produto vendido ou prestar o serviço.",
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
        helpText: "Resultado da Receita Líquida subtraída dos Custos Diretos. Indica a eficiência produtiva.",
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
        helpText: "Gastos com promoção, comissões de atendentes/vendedores e taxas de entrega/logística.",
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
        helpText: "Gastos fixos de estrutura como aluguel, luz, internet, sistemas/softwares e honorários contábeis.",
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
        title: "(-) 6.3 PRÓ-LABORE DOS SÓCIOS / ADMINISTRADORES",
        type: "expense",
        amount: cur.proLaboreExpenses,
        verticalPercent: calcVerticalPercent(cur.proLaboreExpenses, grossRev),
        previousAmount: prev?.proLaboreExpenses,
        horizontalVariation: calcHorizontalVariation(cur.proLaboreExpenses, prev?.proLaboreExpenses),
        helpText: "Remuneração mensal dos sócios e administradores pelo trabalho na gestão da empresa (exclui distribuição de lucros pós-apuração).",
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
        helpText: "Geração pura de caixa operacional antes de juros, impostos sobre o lucro, depreciações e amortizações.",
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
        helpText: "Saldo entre receitas financeiras (rendimentos/juros auferidos) e despesas financeiras (tarifas/juros pagos).",
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
        helpText: "Ganhos ou perdas eventuais não ligados à atividade principal (venda de ativos, indenizações).",
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
        helpText: "Resultado financeiro final da empresa no período. Valor que sobra para distribuição ou reinvestimento.",
        items: [],
      },
    },
  }
}

