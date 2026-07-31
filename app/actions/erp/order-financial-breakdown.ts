"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerRouteAccess } from "@/lib/auth/authorization"

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

export type FinancialBreakdownLine = {
  label: string
  value: number
}

export type FinancialBreakdownSection = {
  label: string
  lines: FinancialBreakdownLine[]
  total?: number
}

export type FinancialBreakdownData = {
  revenue: FinancialBreakdownSection
  discounts: FinancialBreakdownSection
  costs: FinancialBreakdownSection
  totalDeductions: number
  netProfit: number
  netMargin: number
}

export async function getOrderFinancialBreakdownAction(orderId: string, partnerId: string) {
  await requirePartnerRouteAccess(partnerId, "orders")
  const supabase = await getSupabaseServerClient()

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)

  // Fetch order with items (cost_price as fallback for pre-snapshot orders)
  const orderQuery = supabase
    .from("orders")
    .select(`
      *,
      order_items(*,
        products(id, name, sku, images, stock_quantity, stock_available, allow_sell_without_stock, unit, cost_price),
        product_variants(id, variant_name, sku, stock_quantity, stock_available),
        services(id, name, images, cost_price)
      )
    `)
    .eq("partner_id", partnerId)

  if (isUuid) {
    orderQuery.eq("id", orderId)
  } else {
    orderQuery.eq("order_number", orderId)
  }

  const { data: order, error } = await orderQuery.maybeSingle()
  if (error || !order) {
    return { success: false as const, error: error?.message || "Pedido não encontrado" }
  }

  const orderItems: any[] = order.order_items || []

  // ── Separate products and services ──
  const productItems = orderItems.filter((item: any) => !item.service_id && item.line_type !== "service_booking")
  const serviceItems = orderItems.filter((item: any) => item.service_id || item.line_type === "service_booking")

  // ── Revenue ──
  const productsValue = round2(productItems.reduce((sum: number, item: any) => {
    if (item.is_gift) return sum
    return sum + Number(item.subtotal || item.product_price * item.quantity || 0)
  }, 0))

  const servicesValue = round2(serviceItems.reduce((sum: number, item: any) => {
    return sum + Number(item.subtotal || item.product_price * item.quantity || 0)
  }, 0))

  const deliveryFee = Math.max(0, Number(order.delivery_fee || 0))

  // Use snapshot delivery_payer (fallback to "customer" for orders before migration)
  const deliveryPayer: "customer" | "seller" =
    String(order.delivery_payer || "customer") === "seller" ? "seller" : "customer"

  // ── Costs from snapshots (unit_cost) or fallback to current cost_price ──
  const productCosts = round2(productItems.reduce((sum: number, item: any) => {
    const unitCost = Number(item.unit_cost || item.products?.cost_price || 0)
    return sum + (unitCost * Number(item.quantity || 1))
  }, 0))

  const serviceCosts = round2(serviceItems.reduce((sum: number, item: any) => {
    const unitCost = Number(item.unit_cost || item.services?.cost_price || 0)
    return sum + (unitCost * Number(item.quantity || 1))
  }, 0))

  // ── Discounts (same calculation as getOrderDetailsAction) ──
  const itemsSubtotal = round2(orderItems.reduce((sum: number, item: any) => {
    return sum + Number(item.subtotal || item.product_price * item.quantity || 0)
  }, 0))
  const manualDiscount = Math.max(0, Number(order.discount_value || 0))
  const couponDiscount = Math.max(0, Number(order.discount_amount || order.coupon_discount_amount || 0))
  const shippingCost = Math.max(0, Number(order.delivery_fee || order.shipping_cost || 0))
  const additionalCosts = Math.max(0, Number(order.additional_costs || 0))

  // Use stored order columns (separated by our fix) instead of residual calculation
  const storedMethodDiscount = Math.max(0, Number(order.payment_method_discount_amount || 0))
  const storedMethodInterest = Math.max(0, Number(order.payment_method_interest_amount || 0))
  const storedMethodFee = Math.max(0, Number(order.payment_method_fee_amount || 0))
  const storedMethodFixedFee = Math.max(0, Number(order.payment_method_fixed_fee_amount || 0))

  // ── Payment method fees from payment_breakdown (already immutable) ──
  const paymentBreakdown: any[] = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []

  let totalPercentageFees = 0
  let totalFixedFees = 0
  let totalInterest = 0
  let totalBreakdownMethodDiscount = 0
  const feeLines: { method: string; fee: number }[] = []
  const fixedFeeLines: { method: string; fee: number }[] = []

  // Use breakdown for per-method display, stored columns for totals
  for (const entry of paymentBreakdown) {
    const method = String(entry.method || "").toLowerCase().trim()
    const bearer = String(entry.feeBearer || "merchant")
    const pmDiscount = Math.max(0, Number(entry.paymentMethodDiscountAmount || 0))
    if (pmDiscount > 0) {
      totalBreakdownMethodDiscount += pmDiscount
    }

    // Only merchant-borne fees are costs for the business
    if (bearer !== "merchant") continue

    const pFee = Math.max(0, Number(entry.feeAmount || 0))
    const fFee = Math.max(0, Number(entry.fixedFeeAmount || 0))
    const intFee = Math.max(0, Number(entry.interestAmount || 0))

    if (pFee > 0) {
      totalPercentageFees += pFee
      feeLines.push({ method, fee: pFee })
    }
    if (fFee > 0) {
      totalFixedFees += fFee
      fixedFeeLines.push({ method, fee: fFee })
    }
    if (intFee > 0) {
      totalInterest += intFee
    }
  }

  const finalMethodDiscount = Math.max(totalBreakdownMethodDiscount, storedMethodDiscount)

  // Merge stored columns as safety net (breakdown values take priority,
  // stored columns fill gaps when breakdown has 0 for a specific category)
  const mergedFee = Math.max(totalPercentageFees, storedMethodFee)
  const mergedFixedFee = Math.max(totalFixedFees, storedMethodFixedFee)
  const mergedInterest = Math.max(totalInterest, storedMethodInterest)
  if (mergedFee > totalPercentageFees && storedMethodFee > 0) {
    feeLines.push({ method: "pagamento", fee: storedMethodFee })
  }
  if (mergedFixedFee > totalFixedFees && storedMethodFixedFee > 0) {
    fixedFeeLines.push({ method: "pagamento", fee: storedMethodFixedFee })
  }
  totalPercentageFees = mergedFee
  totalFixedFees = mergedFixedFee
  totalInterest = mergedInterest

  // ── Delivery subsidy ──
  const deliveryBreakdownObj: any = order.delivery_breakdown || {}
  const calculatedOriginalFee = Math.max(0, Number(deliveryBreakdownObj.originalFee || deliveryBreakdownObj.deliverySubsidy || 0))
  let deliverySubsidy = 0

  if (deliveryPayer === "seller") {
    deliverySubsidy = calculatedOriginalFee > 0 ? calculatedOriginalFee : deliveryFee
  } else if (calculatedOriginalFee > 0 && deliveryFee === 0) {
    // Free delivery threshold or coupon granted to customer, absorbed by seller
    deliverySubsidy = calculatedOriginalFee
  }

  // ── Seller commission (from snapshot, 0 = no commission or pre-snapshot) ──
  const sellerCommission = Math.max(0, Number(order.seller_commission_amount || 0))

  // ── Build revenue section ──
  const revenueLines: FinancialBreakdownLine[] = []
  if (productsValue > 0) revenueLines.push({ label: "Valor dos produtos", value: productsValue })
  if (servicesValue > 0) revenueLines.push({ label: "Valor dos serviços", value: servicesValue })
  if (deliveryFee > 0 && deliveryPayer === "customer") revenueLines.push({ label: "Entrega", value: deliveryFee })
  const totalRevenue = round2(productsValue + servicesValue + (deliveryPayer === "customer" ? deliveryFee : 0))

  // ── Build discounts section ──
  const discountLines: FinancialBreakdownLine[] = []
  if (couponDiscount > 0) discountLines.push({ label: "Desconto de cupom", value: -couponDiscount })
  if (manualDiscount > 0) discountLines.push({ label: "Desconto manual", value: -manualDiscount })
  if (finalMethodDiscount > 0) discountLines.push({ label: "Desconto do método", value: -finalMethodDiscount })
  const totalDiscounts = round2(-(couponDiscount + manualDiscount + finalMethodDiscount))

  // ── Build costs section ──
  const costLines: FinancialBreakdownLine[] = []
  if (productCosts > 0) costLines.push({ label: "Custo dos produtos", value: -productCosts })
  if (serviceCosts > 0) costLines.push({ label: "Custo dos serviços", value: -serviceCosts })

  for (const f of feeLines) {
    const displayName = f.method.charAt(0).toUpperCase() + f.method.slice(1)
    costLines.push({ label: `Taxa (${displayName})`, value: -f.fee })
  }
  for (const f of fixedFeeLines) {
    const displayName = f.method.charAt(0).toUpperCase() + f.method.slice(1)
    costLines.push({ label: `Custo fixo (${displayName})`, value: -f.fee })
  }
  if (totalInterest > 0) costLines.push({ label: "Juros", value: -totalInterest })
  if (deliverySubsidy > 0) costLines.push({ label: "Subsídio da entrega", value: -deliverySubsidy })
  if (sellerCommission > 0) costLines.push({ label: "Comissão do vendedor", value: -sellerCommission })

  const totalCosts = round2(-(productCosts + serviceCosts + totalPercentageFees + totalFixedFees + totalInterest + deliverySubsidy + sellerCommission))

  const totalDeductions = round2(totalDiscounts + totalCosts)
  const netProfit = round2(totalRevenue + totalDeductions)
  const netMargin = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0

  return {
    success: true as const,
    data: {
      revenue: { label: "Receita", lines: revenueLines, total: totalRevenue },
      discounts: { label: "Descontos", lines: discountLines, total: totalDiscounts },
      costs: { label: "Custos", lines: costLines, total: totalCosts },
      totalDeductions,
      netProfit,
      netMargin,
    } satisfies FinancialBreakdownData,
  }
}
