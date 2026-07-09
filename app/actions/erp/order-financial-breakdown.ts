"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerRouteAccess } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { calculateCommission } from "@/lib/services/commission.service"

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
  const admin = getAdminClient()

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId)

  // 1. Fetch order with cost data from products and services
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

  const orderItems = order.order_items || []

  // Separate products and services
  const productItems = orderItems.filter((item: any) => !item.service_id && item.line_type !== "service_booking")
  const serviceItems = orderItems.filter((item: any) => item.service_id || item.line_type === "service_booking")

  // 2. Compute product and service values (revenue) and costs
  const productsValue = round2(productItems.reduce((sum: number, item: any) => {
    const displayPrice = item.is_gift ? 0 : Number(item.subtotal || item.product_price * item.quantity || 0)
    return sum + displayPrice
  }, 0))

  const servicesValue = round2(serviceItems.reduce((sum: number, item: any) => {
    return sum + Number(item.subtotal || item.product_price * item.quantity || 0)
  }, 0))

  const productCosts = round2(productItems.reduce((sum: number, item: any) => {
    const costPrice = Number(item.products?.cost_price || 0)
    const qty = Number(item.quantity || 1)
    return sum + (costPrice * qty)
  }, 0))

  const serviceCosts = round2(serviceItems.reduce((sum: number, item: any) => {
    const costPrice = Number(item.services?.cost_price || 0)
    const qty = Number(item.quantity || 1)
    return sum + (costPrice * qty)
  }, 0))

  // 3. Delivery fee info
  const deliveryFee = Math.max(0, Number(order.delivery_fee || 0))

  // 4. Fetch delivery settings for delivery_payer
  const { data: deliverySettings } = await admin
    .from("delivery_settings")
    .select("delivery_payer")
    .eq("partner_id", partnerId)
    .maybeSingle()

  const deliveryPayer: "customer" | "seller" = deliverySettings?.delivery_payer === "seller" ? "seller" : "customer"

  // 5. Discounts
  const couponDiscount = Math.max(0, Number(order.coupon_discount_amount || 0))
  const manualDiscount = Math.max(0, Number(order.discount_value || 0))
  const methodDiscount = Math.max(0, Number(order.payment_method_discount_amount || 0))

  // 6. Payment method fees
  // Fetch payment method fee configurations
  const { data: paymentMethods } = await admin
    .from("payment_methods")
    .select(`
      id,
      name,
      payment_type,
      payment_method_fees(id, installment_number, fee_type, percentage_rate, fixed_amount)
    `)
    .eq("partner_id", partnerId)
    .eq("is_active", true)

  const paymentBreakdown = Array.isArray(order.payment_breakdown) ? order.payment_breakdown : []

  // Compute fees per payment method
  let totalFees = 0
  const feeLines: { method: string; fee: number }[] = []

  for (const entry of paymentBreakdown) {
    const method = String(entry.method || "").toLowerCase().trim()
    const amount = Number(entry.amount || 0)
    const installments = Math.max(1, Number(entry.installmentNumber || 1))

    // MP fees: use actual feeAmount from payment_breakdown
    if (String(entry.provider || "").toLowerCase().includes("mercado pago") || method.includes("mercado pago")) {
      const feeAmount = Math.max(0, Number(entry.feeAmount || 0))
      if (feeAmount > 0) {
        totalFees += feeAmount
        feeLines.push({ method: "Mercado Pago", fee: feeAmount })
      }
      continue
    }

    // For other methods, check fee configuration
    const matchedPM = (paymentMethods || []).find((pm: any) => {
      const pmName = String(pm.name || "").toLowerCase().trim()
      const pmType = String(pm.payment_type || "").toLowerCase().trim()
      return pmName === method || pmType === method || method.includes(pmName) || method.includes(pmType)
    })

    if (matchedPM?.payment_method_fees?.length > 0) {
      // Find the fee config for this installment number, or use the first available
      const feeConfig = matchedPM.payment_method_fees.find((f: any) => Number(f.installment_number) === installments)
        || matchedPM.payment_method_fees[0]

      if (feeConfig) {
        let fee = 0
        if (feeConfig.fee_type === "percentage" || feeConfig.fee_type === "both") {
          fee += amount * Number(feeConfig.percentage_rate || 0)
        }
        if (feeConfig.fee_type === "fixed" || feeConfig.fee_type === "both") {
          fee += Number(feeConfig.fixed_amount || 0)
        }
        if (fee > 0) {
          totalFees += fee
          feeLines.push({ method: matchedPM.name || method, fee: round2(fee) })
        }
      }
    } else {
      // Default fees for known methods
      if (method.includes("boleto")) {
        const boletoFee = 3.50
        totalFees += boletoFee
        feeLines.push({ method: "Boleto", fee: boletoFee })
      } else if (method.includes("pix")) {
        // Pix usually has very low or no fee
        const pixFee = 0
        if (pixFee > 0) {
          totalFees += pixFee
          feeLines.push({ method: "Pix", fee: pixFee })
        }
      }
    }
  }

  // 7. Interest (payment_method_extra_amount)
  const interestAmount = Math.max(0, Number(order.payment_method_extra_amount || 0))

  // 8. Delivery subsidy
  const deliverySubsidy = deliveryPayer === "seller" ? deliveryFee : 0

  // 9. Seller commission
  let sellerCommission = 0
  if (order.created_by) {
    const { data: sellerCommissions } = await admin
      .from("employee_commissions")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("role", "seller")
      .maybeSingle()

    if (sellerCommissions && sellerCommissions.commission_type !== "none") {
      const subtotalValue = Math.max(0, Number(order.subtotal_value || order.total_amount || 0))
      sellerCommission = calculateCommission({
        userId: order.created_by,
        role: "seller",
        commissionType: sellerCommissions.commission_type,
        value: Number(sellerCommissions.value || 0),
        saleAmount: subtotalValue,
      })
    }
  }

  // Build revenue section
  const revenueLines: FinancialBreakdownLine[] = []
  if (productsValue > 0) revenueLines.push({ label: "Valor dos produtos", value: productsValue })
  if (servicesValue > 0) revenueLines.push({ label: "Valor dos serviços", value: servicesValue })
  if (deliveryFee > 0 && deliveryPayer === "customer") revenueLines.push({ label: "Entrega", value: deliveryFee })
  const totalRevenue = round2(productsValue + servicesValue + (deliveryPayer === "customer" ? deliveryFee : 0))

  // Build discounts section
  const discountLines: FinancialBreakdownLine[] = []
  if (couponDiscount > 0) discountLines.push({ label: "Desconto de cupom", value: -couponDiscount })
  if (manualDiscount > 0) discountLines.push({ label: "Desconto manual", value: -manualDiscount })
  if (methodDiscount > 0) discountLines.push({ label: "Desconto do método", value: -methodDiscount })
  const totalDiscounts = round2(-(couponDiscount + manualDiscount + methodDiscount))

  // Build costs section
  const costLines: FinancialBreakdownLine[] = []
  if (productCosts > 0) costLines.push({ label: "Custo dos produtos", value: -productCosts })
  if (serviceCosts > 0) costLines.push({ label: "Custo dos serviços", value: -serviceCosts })

  // Fee breakdown per method
  for (const f of feeLines) {
    costLines.push({ label: `Taxa (${f.method})`, value: -f.fee })
  }

  if (interestAmount > 0) costLines.push({ label: "Juros", value: -interestAmount })
  if (deliverySubsidy > 0) costLines.push({ label: "Subsídio da entrega", value: -deliverySubsidy })
  if (sellerCommission > 0) costLines.push({ label: "Comissão do vendedor", value: -sellerCommission })

  const totalCosts = round2(-(productCosts + serviceCosts + totalFees + interestAmount + deliverySubsidy + sellerCommission))

  const totalDeductions = round2(totalDiscounts + totalCosts)
  const netProfit = round2(totalRevenue + totalDeductions)
  const netMargin = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0

  return {
    success: true as const,
    data: {
      revenue: {
        label: "Receita",
        lines: revenueLines,
        total: totalRevenue,
      },
      discounts: {
        label: "Descontos",
        lines: discountLines,
        total: totalDiscounts,
      },
      costs: {
        label: "Custos",
        lines: costLines,
        total: totalCosts,
      },
      totalDeductions,
      netProfit,
      netMargin,
    } satisfies FinancialBreakdownData,
  }
}
