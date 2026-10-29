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

export function calculateOrderFinancialBreakdown(order: any, itemsInput?: any[]): FinancialBreakdownData {
  const orderItems: any[] = itemsInput || order.order_items || []

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
  let totalRepassedFees = 0
  let totalRepassedFixedFees = 0
  let totalRepassedInterest = 0
  const feeLines: { method: string; fee: number }[] = []
  const fixedFeeLines: { method: string; fee: number }[] = []

  const hasBreakdown = paymentBreakdown.length > 0

  // Use breakdown for per-method display, stored columns for totals
  for (const entry of paymentBreakdown) {
    const method = String(entry.method || "").trim()
    const bearer = String(entry.feeBearer || "merchant").toLowerCase().trim()
    const isCustomerBearer = bearer === "customer" || bearer === "buyer"
    const adjType = String(entry.adjustmentType || "").toLowerCase().trim()

    // Payment method discount applies to order total
    const pmDiscount = Math.max(0, Number(entry.paymentMethodDiscountAmount || 0))
    if (pmDiscount > 0 && (adjType === "discount" || adjType === "" || adjType === "none")) {
      totalBreakdownMethodDiscount += pmDiscount
    }

    const installmentFeeBearer = String(entry.installmentFeeBearer || "merchant").toLowerCase().trim()
    const isCustomerInstallmentBearer = installmentFeeBearer === "customer" || installmentFeeBearer === "buyer"
    const pFee = Math.max(0, Number(entry.feeAmount || 0))
    const fFee = Math.max(0, Number(entry.fixedFeeAmount || 0))
    const entryInterest = Math.max(0, Number(entry.interestAmount || 0))
    const entryInstallmentCost = Math.max(0, Number(entry.installmentCostAmount || 0))
    const entryFixedInterest = Math.max(0, entryInterest - entryInstallmentCost)

    // Percentage fee (taxa) - sempre é um custo cobrado pelo gateway do método
    if (pFee > 0) {
      totalPercentageFees += pFee
      feeLines.push({ method: method || "pagamento", fee: pFee })
      if (isCustomerBearer) {
        totalRepassedFees += pFee
      }
    }

    // Fixed fee (custo fixo do método) - custo cobrado pelo gateway
    if (fFee > 0) {
      totalFixedFees += fFee
      fixedFeeLines.push({ method: method || "pagamento", fee: fFee })
      if (isCustomerBearer) {
        totalRepassedFixedFees += fFee
      }
    }

    // Juros
    if (entryFixedInterest > 0) {
      totalInterest += entryFixedInterest
      if (isCustomerBearer) {
        totalRepassedInterest += entryFixedInterest
      }
    }
    if (entryInstallmentCost > 0) {
      totalInterest += entryInstallmentCost
      if (isCustomerInstallmentBearer) {
        totalRepassedInterest += entryInstallmentCost
      }
    }
  }

  // Use breakdown values when available, fallback to stored columns when no breakdown
  const storedMethodExtra = Math.max(0, Number(order.payment_method_extra_amount || 0))
  const finalMethodDiscount = hasBreakdown
    ? totalBreakdownMethodDiscount
    : storedMethodDiscount

  const mergedFee = hasBreakdown ? totalPercentageFees : storedMethodFee
  const mergedFixedFee = hasBreakdown ? totalFixedFees : storedMethodFixedFee
  const mergedInterest = hasBreakdown ? totalInterest : storedMethodInterest

  if (mergedFee > 0 && feeLines.length === 0) {
    feeLines.push({ method: String(order.payment_method || "pagamento"), fee: mergedFee })
  }
  if (mergedFixedFee > 0 && fixedFeeLines.length === 0) {
    fixedFeeLines.push({ method: String(order.payment_method || "pagamento"), fee: mergedFixedFee })
  }

  totalPercentageFees = mergedFee
  totalFixedFees = mergedFixedFee
  totalInterest = mergedInterest
  if (!hasBreakdown && storedMethodExtra > 0) {
    totalRepassedFees = storedMethodExtra
  }

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
  if (totalRepassedFees > 0) revenueLines.push({ label: "Taxa do método repassada", value: totalRepassedFees })
  if (totalRepassedFixedFees > 0) revenueLines.push({ label: "Custo do método repassado", value: totalRepassedFixedFees })
  if (totalRepassedInterest > 0) revenueLines.push({ label: "Juros repassados", value: totalRepassedInterest })
  const totalRevenue = round2(
    productsValue +
    servicesValue +
    (deliveryPayer === "customer" ? deliveryFee : 0) +
    totalRepassedFees +
    totalRepassedFixedFees +
    totalRepassedInterest,
  )

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
    costLines.push({ label: `Custo do método (${displayName})`, value: -f.fee })
  }
  if (totalInterest > 0) costLines.push({ label: "Juros", value: -totalInterest })
  if (deliverySubsidy > 0) costLines.push({ label: "Subsídio da entrega", value: -deliverySubsidy })
  if (sellerCommission > 0) costLines.push({ label: "Comissão do vendedor", value: -sellerCommission })

  const totalCosts = round2(-(productCosts + serviceCosts + totalPercentageFees + totalFixedFees + totalInterest + deliverySubsidy + sellerCommission))

  const totalDeductions = round2(totalDiscounts + totalCosts)
  const netProfit = round2(totalRevenue + totalDeductions)
  const netMargin = totalRevenue > 0 ? round2((netProfit / totalRevenue) * 100) : 0

  return {
    revenue: { label: "Receita", lines: revenueLines, total: totalRevenue },
    discounts: { label: "Descontos", lines: discountLines, total: totalDiscounts },
    costs: { label: "Custos", lines: costLines, total: totalCosts },
    totalDeductions,
    netProfit,
    netMargin,
  }
}
