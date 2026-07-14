"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { revalidateOrders, revalidateTransactions, revalidateStockMovements } from "@/lib/utils/revalidation"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { getActiveCashSessionAction } from "@/app/actions/erp/cash-register"
import { generateSKUBase } from "@/lib/utils/code-generators"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { validateCoupon, findBestAutomaticCoupon } from "@/lib/services/coupons"
import { calculateOrderPricing, type PricingItem } from "@/lib/services/pricing-engine"
import {
    recalculateSplitPaymentFromBaseAmounts,
    toStoredBreakdownAmounts,
    type SplitInputRow,
} from "@/lib/payments/split-breakdown"
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation"
import { createCommissionExpenseForEntity } from "@/lib/services/commission-ledger.service"
import { applySaleToGoals } from "@/lib/services/sales-goals.service"
import { formatPaymentMethodLabel } from "@/lib/payments/payment-method"

type DraftItemInput = {
    productId?: string | null
    variantId?: string | null
    variantName?: string | null
    name: string
    qty: number
    price: number
    totalPrice?: number
    image?: string | null
    listUnitPrice?: number | null
    lineDiscountType?: "fixed" | "percentage" | null
    lineDiscountValue?: number | null
    isGift?: boolean
    originalPrice?: number | null
    isPromotional?: boolean
    promotionId?: string | null
    isManualPrice?: boolean | null
}

type DraftUpsertInput = {
    partnerId: string
    preSaleId?: string | null
    customerId?: string | null
    notes?: string
    subtotal: number
    discountAmount: number
    totalAmount: number
    shippingFee?: number
    distanceKm?: number | null
    deliveryBreakdown?: Record<string, unknown> | null
    otherCosts?: number
    items: DraftItemInput[]
    couponId?: string | null
    couponCode?: string | null
    couponDiscountAmount?: number
}

type FinalizePaymentEntry = {
    method: string
    amount: number
    paymentMethodId?: string | null
    installmentNumber?: number
}

type FinalizePreSaleInput = {
    partnerId: string
    preSaleId: string
    financeAccountId?: string | null
    paidAmount: number
    paymentMethod?: string | null
    paymentBreakdown?: FinalizePaymentEntry[]
    isPendingDelivery?: boolean
    paymentProvider?: string
    mpPaymentId?: string | null
    sellerId?: string | null
}

type PosPaymentResolveResult =
    | { ok: false; error: string }
    | {
        ok: true
        totalAmount: number
        adjustedBreakdown: Array<{ method: string; amount: number; paymentMethodId: string | null; installmentNumber: number }>
    }

async function resolvePosFinalTotalWithPaymentMethod(params: {
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
    partnerId: string
    preSaleId: string
    paymentBreakdown: Array<{ method?: string; amount?: number; paymentMethodId?: string | null; installmentNumber?: number }>
}): Promise<PosPaymentResolveResult | null> {
    const { data: draft } = await params.supabase
        .from("pre_sales")
        .select("total_amount")
        .eq("id", params.preSaleId)
        .eq("partner_id", params.partnerId)
        .eq("status", "draft")
        .maybeSingle()
    if (!draft) return null
    const baseTotal = Math.max(0, Number(draft.total_amount || 0))
    const rawRows = params.paymentBreakdown || []
    if (rawRows.length === 0) {
        return { ok: true, totalAmount: baseTotal, adjustedBreakdown: [] }
    }

    const methodIds = Array.from(new Set(rawRows.map((row) => row.paymentMethodId).filter(Boolean))) as string[]

    const [{ data: methods }, { data: fees }] = await Promise.all([
        methodIds.length > 0
            ? params.supabase
                .from("payment_methods")
                .select("id, fee_percent, fee_fixed, fee_bearer, discount_percent, max_installments")
                .eq("partner_id", params.partnerId)
                .eq("is_active", true)
                .in("id", methodIds)
            : Promise.resolve({ data: [] as any[] }),
        methodIds.length > 0
            ? params.supabase
                .from("payment_method_installment_fees")
                .select("payment_method_id, installment_number, fee_percent")
                .in("payment_method_id", methodIds)
            : Promise.resolve({ data: [] as any[] }),
    ])
    const methodById = new Map<string, any>((methods || []).map((m: any) => [String(m.id), m]))
    const feesByMethod = new Map<string, Array<{ installmentNumber: number; feePercent: number }>>()
    for (const row of fees || []) {
        const key = String((row as any).payment_method_id || "")
        if (!key) continue
        const list = feesByMethod.get(key) || []
        list.push({
            installmentNumber: Number((row as any).installment_number || 1),
            feePercent: Number((row as any).fee_percent || 0),
        })
        feesByMethod.set(key, list)
    }

    const splitRows: SplitInputRow[] = rawRows.map((row) => ({
        method: String(row.method || "PDV").trim() || "PDV",
        amount: safeMoney(Number(row.amount || 0)),
        amountReceived: safeMoney(Number(row.amount || 0)),
        paymentMethodId: row.paymentMethodId || null,
        installmentNumber: Math.max(1, Math.floor(Number(row.installmentNumber || 1))),
    }))

    const recalculated = recalculateSplitPaymentFromBaseAmounts(
        baseTotal,
        splitRows,
        methodById,
        feesByMethod,
    )
    if (!recalculated.ok) {
        return { ok: false, error: recalculated.error }
    }

    const stored = toStoredBreakdownAmounts(recalculated.adjustedRows)
    const adjustedBreakdown = stored.map((s, i) => ({
        method: splitRows[i]?.method ?? "PDV",
        amount: s.amount,
        amountReceived: s.amountReceived,
        adjustmentType: s.adjustmentType,
        adjustmentPercent: s.adjustmentPercent,
        adjustmentAmount: s.adjustmentAmount,
        effectiveAmount: s.effectiveAmount,
        netAmount: s.netAmount,
        feeBearer: s.feeBearer,
        interestAmount: s.interestAmount,
        feeAmount: s.feeAmount,
        fixedFeeAmount: s.fixedFeeAmount,
        paymentMethodId: s.paymentMethodId,
        installmentNumber: recalculated.adjustedRows[i]?.installmentNumber ?? splitRows[i]?.installmentNumber ?? 1,
    }))

    const sumBase = splitRows.reduce((acc, r) => acc + r.amount, 0)

    // Compute discount on baseTotal (not on amountReceived) to stay consistent with frontend
    const baseDiscount = splitRows.reduce((acc, row) => {
        const method = row.paymentMethodId ? methodById.get(row.paymentMethodId) : null
        const dp = method ? Math.max(0, Number(method.discount_percent || 0)) : 0
        return acc + (dp > 0 ? safeMoney(baseTotal * dp / 100) : 0)
    }, 0)

    const isPartial = sumBase < baseTotal - 0.005
    const finalTotal = isPartial
        ? Math.max(0, safeMoney(baseTotal + recalculated.feeAmount + recalculated.interestAmount - baseDiscount))
        : Math.max(sumBase, recalculated.finalTotal)

    return {
        ok: true,
        totalAmount: finalTotal,
        adjustedBreakdown,
    }
}

function safeMoney(n: number) {
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.round(n * 100) / 100)
}

function normalizeDraftItems(items: DraftItemInput[]) {
    const normalized = (items || []).map((item) => ({
        product_id: item.productId || null,
        variant_id: item.variantId || null,
        variant_name: item.variantName?.trim() || null,
        name: String(item.name || "").trim(),
        quantity: Math.max(0, Number(item.qty || 0)),
        unit_price: safeMoney(Number(item.price || 0)),
        total_price: safeMoney(
            Number(item.totalPrice || (Number(item.qty || 0) * Number(item.price || 0)))
        ),
        image: item.image || null,
        list_unit_price:
            item.listUnitPrice != null && Number.isFinite(Number(item.listUnitPrice))
                ? safeMoney(Number(item.listUnitPrice))
                : null,
        line_discount_type: item.lineDiscountType === "fixed" || item.lineDiscountType === "percentage"
            ? item.lineDiscountType
            : null,
        line_discount_value:
            item.lineDiscountValue != null && Number.isFinite(Number(item.lineDiscountValue))
                ? item.lineDiscountType === "percentage"
                    ? Math.max(0, Math.min(100, Math.round(Number(item.lineDiscountValue) * 100) / 100))
                    : safeMoney(Number(item.lineDiscountValue))
                : null,
        is_gift: Boolean(item.isGift),
        original_price: item.originalPrice != null ? Number(item.originalPrice) : null,
        is_promotional: Boolean(item.isPromotional),
        promotion_id: item.promotionId || null,
        is_manual_price: Boolean(item.isManualPrice),
    }))

    for (const item of normalized) {
        if (!item.name) return { error: "Todo item precisa ter nome." as const }
        if (item.quantity <= 0) return { error: `Quantidade inválida para "${item.name}".` as const }
        if (item.unit_price < 0) return { error: `Preço inválido para "${item.name}".` as const }
    }

    return { items: normalized }
}

function computeSubtotal(items: Array<{ quantity: number; unit_price: number }>) {
    return safeMoney(items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0))
}

/**
 * Mirrors POS `sales` into `orders` so the ERP pedidos list shows PDV checkout.
 * Uses the service-role client: partner RLS often allows only marketplace buyers to INSERT orders.
 */
async function syncPosSaleToOrders(params: {
    partnerId: string
    saleId: string
    preSaleId: string
    financeAccountId?: string | null
    defaultPaymentMethod: string
    actorUserId: string
    sellerPartnerUserId?: string | null
    isPendingDelivery?: boolean
    paymentProvider?: string
    mpPaymentId?: string | null
    paymentBreakdown?: any[] | null
}): Promise<string | null> {
    const admin = createAdminClient()
    const [{ data: sale }, { data: saleItems }, { data: draft }] = await Promise.all([
        admin
            .from("sales")
            .select("id, sale_number, customer_id, notes, payment_status, final_amount, paid_amount, discount_amount, created_at")
            .eq("id", params.saleId)
            .eq("partner_id", params.partnerId)
            .single(),
        admin
            .from("sale_items")
            .select("*")
            .eq("sale_id", params.saleId),
        admin
            .from("pre_sales")
            .select("id, shipping_fee, distance_km, delivery_breakdown, other_costs, discount_amount, coupon_discount_amount, coupon_id")
            .eq("id", params.preSaleId)
            .maybeSingle(),
    ])

    if (!sale) {
        throw new Error(`Venda ${params.saleId} não encontrada.`)
    }

    // Use the pre-generated DDT number instead of creating a PDV- prefix
    const finalOrderNumber = sale.sale_number || `DDT-${String(params.saleId).substring(0, 8).toUpperCase()}`

    const { data: existingOrder } = await admin
        .from("orders")
        .select("id")
        .eq("partner_id", params.partnerId)
        .eq("order_number", finalOrderNumber)
        .limit(1)
        .maybeSingle()

    if (existingOrder?.id) return existingOrder.id

    let customerName: string | null = null
    if (sale.customer_id) {
        const { data: cust } = await admin
            .from("customers")
            .select("name")
            .eq("id", sale.customer_id)
            .eq("partner_id", params.partnerId)
            .maybeSingle()
        customerName = cust?.name?.trim() || null
    }

    // Normalize customer name and ensure it's "Consumidor final" if empty or incorrectly set
    if (!customerName || customerName.toLowerCase().includes("cliente balcão")) {
        customerName = "Consumidor final"
    }

    const shippingFee = safeMoney(Number(draft?.shipping_fee || 0))
    const distanceKm = draft?.distance_km == null ? null : Number(draft.distance_km || 0)
    const deliveryBreakdown = (draft as any)?.delivery_breakdown || null
    const otherCosts = safeMoney(Number(draft?.other_costs || 0))
    const manualDiscount = safeMoney(Number((draft as any)?.discount_amount ?? sale.discount_amount ?? 0))
    const couponDiscount = safeMoney(Number((draft as any)?.coupon_discount_amount ?? 0))

    // ── Central pricing engine ───────────────────────────────────────────
    const pricingItems: PricingItem[] = (saleItems || []).map((item: any) => ({
        productId: item.product_id || null,
        unitPrice: Number(item.unit_price || 0),
        quantity: Number(item.quantity || 0),
        basePrice: item.original_price != null ? Number(item.original_price) : Number(item.unit_price || 0),
    }))
    const pricingResult = calculateOrderPricing({
        items: pricingItems,
        shippingCost: shippingFee,
        additionalCosts: otherCosts,
        manualDiscount: manualDiscount > 0 ? { type: "fixed", value: manualDiscount } : null,
    })

    const subtotalValue = pricingResult.subtotal
    const baseBeforePaymentMethod = safeMoney(Math.max(0, pricingResult.finalTotal - couponDiscount))
    const finalTotal = safeMoney(Number(sale.final_amount || 0))
    const paymentMethodDiscountAmount = safeMoney(Math.max(0, baseBeforePaymentMethod - finalTotal))
    const paymentMethodExtraAmount = safeMoney(Math.max(0, finalTotal - baseBeforePaymentMethod))
    const deliveryType = shippingFee > 0 ? "delivery" : "pickup"
    let deliveryStatus = shippingFee > 0 ? "preparing" : "delivered"
    if (params.isPendingDelivery) {
        deliveryStatus = deliveryType === "pickup" ? "pickup_available" : "preparing"
    }
    const paymentSituation = sale.payment_status === "paid"
        ? "paid"
        : sale.payment_status === "partially_paid"
            ? "partially_paid"
            : "pending"

const productIds = Array.from(
        new Set((saleItems || []).map((item: any) => item.product_id).filter(Boolean))
    ) as string[]
const [{ data: preparationProducts }, { data: partnerHours }] = await Promise.all([
        productIds.length > 0
            ? admin
                .from("products")
                .select("id, availability_value, availability_unit")
                .eq("partner_id", params.partnerId)
                .in("id", productIds)
            : Promise.resolve({ data: [] as any[] }),
        admin
            .from("partners")
            .select("opening_hours")
            .eq("id", params.partnerId)
            .maybeSingle(),
    ])

    const preparationEstimate = computeOrderPreparationEstimate({
        products: (preparationProducts || []).map((product: any) => ({
            availability_value: Number(product.availability_value || 0),
            availability_unit: product.availability_unit || "Minutos",
        })),
        openingHours: (partnerHours as any)?.opening_hours || null,
        pickupWindowMinutes: 30,
        deliveryTimeEstimateMinutes: 0,
    })

    // Fetch delivery_payer for snapshot
    const { data: deliverySettings } = await admin
        .from("delivery_settings")
        .select("delivery_payer")
        .eq("partner_id", params.partnerId)
        .maybeSingle()

    const deliveryPayer: "customer" | "seller" = deliverySettings?.delivery_payer === "seller" ? "seller" : "customer"

    // Calculate seller_commission_amount for snapshot
    let sellerCommissionAmount = 0
    if (params.sellerPartnerUserId) {
        const { data: sellerCommissions } = await admin
            .from("employee_commissions")
            .select("*")
            .eq("partner_id", params.partnerId)
            .eq("role", "seller")
            .maybeSingle()

        if (sellerCommissions && sellerCommissions.commission_type !== "none") {
            const subtotalValue = Math.max(0, Number(sale.subtotal || 0))
            const { calculateCommission } = await import("@/lib/services/commission.service")
            sellerCommissionAmount = calculateCommission({
                userId: params.sellerPartnerUserId,
                role: "seller",
                commissionType: sellerCommissions.commission_type,
                value: Number(sellerCommissions.value || 0),
                saleAmount: subtotalValue,
            })
        }
    }

    // Fetch cost prices for unit_cost snapshot - reuse productIds
    const variantIds = (saleItems || []).filter((i: any) => i.variant_id).map((i: any) => i.variant_id)
    const serviceIds = (saleItems || []).filter((i: any) => i.service_id).map((i: any) => i.service_id)

    const [{ data: products }, { data: variants }, { data: services }] = await Promise.all([
        productIds.length > 0
            ? admin.from("products").select("id, cost_price").eq("partner_id", params.partnerId).in("id", productIds)
            : Promise.resolve({ data: [] as any[] }),
        variantIds.length > 0
            ? admin.from("product_variants").select("id, cost_price").in("id", variantIds)
            : Promise.resolve({ data: [] as any[] }),
        serviceIds.length > 0
            ? admin.from("services").select("id, cost_price").eq("partner_id", params.partnerId).in("id", serviceIds)
            : Promise.resolve({ data: [] as any[] }),
    ])

    const productCostMap = new Map<string, number>((products || []).map((p: { id: string; cost_price: number | null }) => [p.id, Number(p.cost_price || 0)]))
    const variantCostMap = new Map<string, number>((variants || []).map((v: { id: string; cost_price: number | null }) => [v.id, Number(v.cost_price || 0)]))
    const serviceCostMap = new Map<string, number>((services || []).map((s: { id: string; cost_price: number | null }) => [s.id, Number(s.cost_price || 0)]))

    const orderPayload: Record<string, unknown> = {
        partner_id: params.partnerId,
        buyer_id: sale.customer_id || null,
        customer_name: customerName,
        order_source: "Presencial",
        delivery_type: deliveryType,
        delivery_status: deliveryStatus,
        situation: paymentSituation,
        total_amount: safeMoney(Number(sale.final_amount || 0)),
        paid_amount: safeMoney(Number(sale.paid_amount || 0)),
        discount_value: manualDiscount,
        discount_type: "fixed",
        discount_amount: couponDiscount,
        payment_method_discount_amount: paymentMethodDiscountAmount,
        payment_method_extra_amount: paymentMethodExtraAmount,
        coupon_id: draft?.coupon_id || null,
        delivery_fee: shippingFee,
        distance_km: distanceKm,
        delivery_breakdown: deliveryBreakdown,
        additional_costs: otherCosts,
        notes: sanitizeNotes(sale.notes),
        payment_method: formatPaymentMethodLabel(params.defaultPaymentMethod),
        payment_breakdown: params.paymentBreakdown || [],
        payment_provider: params.paymentProvider || null,
        mp_payment_id: params.mpPaymentId || null,
        finance_account_id: params.financeAccountId || null,
        created_by: params.actorUserId,
        seller_partner_user_id: params.sellerPartnerUserId || null,
        inventory_deducted: true,
        order_number: finalOrderNumber,
        pricing_version: pricingResult.pricingVersion,
        delivery_payer: deliveryPayer,
        seller_commission_amount: sellerCommissionAmount,
        ...(preparationEstimate ? {
            preparation_time_minutes: preparationEstimate.preparationTimeMinutes,
            estimated_ready_at: preparationEstimate.readyAt.toISOString(),
            pickup_window_start: preparationEstimate.pickupWindowStart.toISOString(),
            pickup_window_end: preparationEstimate.pickupWindowEnd.toISOString(),
            estimated_delivery_at: deliveryType === "delivery" ? preparationEstimate.estimatedDeliveryAt.toISOString() : null,
        } : {}),
    }

    const insertWithPosFlag = { ...orderPayload, is_pos_sale: true }
    let createdOrderId: string | null = null
    const { data: insertedWithPosFlag, error: insertError } = await admin
        .from("orders")
        .insert(insertWithPosFlag)
        .select("id")
        .single()

    if (insertError) {
        const insertErrorMessage = String(insertError.message || "").toLowerCase()
        const missingPosFlagColumn = insertErrorMessage.includes("is_pos_sale")
        const missingPaymentDeltaColumns =
            insertErrorMessage.includes("payment_method_discount_amount") ||
            insertErrorMessage.includes("payment_method_extra_amount")
        if (!missingPosFlagColumn && !missingPaymentDeltaColumns) {
            console.error("[syncPosSaleToOrders] orders insert failed:", insertError.message, insertError)
            return null
        }

        const fallbackOrderPayload = { ...orderPayload }
        if (missingPaymentDeltaColumns) {
            delete (fallbackOrderPayload as any).payment_method_discount_amount
            delete (fallbackOrderPayload as any).payment_method_extra_amount
        }
        const { data: insertedWithoutPosFlag, error: insertError2 } = await admin
            .from("orders")
            .insert(fallbackOrderPayload)
            .select("id")
            .single()
        if (insertError2) {
            console.error("[syncPosSaleToOrders] orders insert (no is_pos_sale) failed:", insertError2.message, insertError2)
            return null
        }
        createdOrderId = insertedWithoutPosFlag?.id || null
    } else {
        createdOrderId = insertedWithPosFlag?.id || null
    }

    if (!createdOrderId) return null

    const orderItems = (saleItems || []).map((item: any, index: number) => {
        let unitCost = 0
        if (item.service_id) {
            unitCost = serviceCostMap.get(item.service_id) || 0
        } else if (item.variant_id) {
            unitCost = variantCostMap.get(item.variant_id) || 0
        } else if (item.product_id) {
            unitCost = productCostMap.get(item.product_id) || 0
        }
        return {
            order_id: createdOrderId,
            product_id: item.product_id || null,
            variant_id: item.variant_id || null,
            product_name: item.product_name || "Item",
            product_price: safeMoney(Number(item.unit_price || 0)),
            quantity: Number(item.quantity || 0),
            subtotal: safeMoney(Number(item.subtotal || 0)),
            sort_order: index,
            is_gift: Boolean(item.is_gift),
            original_price: item.original_price != null ? Number(item.original_price) : null,
            is_promotional: Boolean(item.is_promotional),
            promotion_id: item.promotion_id || null,
            unit_cost: unitCost,
        }
    })

    if (orderItems.length > 0) {
        const { error: itemsErr } = await admin.from("order_items").insert(orderItems)
        if (itemsErr) {
            console.error("[syncPosSaleToOrders] order_items insert failed:", itemsErr.message, itemsErr)
            await admin.from("orders").delete().eq("id", createdOrderId).eq("partner_id", params.partnerId)
            return null
        }
    }

    return createdOrderId
}

function inputPaymentMethodLabel(paymentMethod?: string | null) {
    return String(paymentMethod || "").trim() || "PDV"
}

export async function getPOSInitialDataAction(partnerId: string) {
    await requireUser()
    await requirePermission(partnerId, "pdv", "view")
    // Read with admin client after authz so invited users can load POS datasets.
    const supabase = createAdminClient()

    const [productsRes, customersRes, accountsRes, draftsRes, paymentMethodsRes] = await Promise.all([
        supabase
            .from("products")
            .select("id, name, sku, price, promotional_price, category:product_categories!category_id(id, name), stock_available, min_stock, allow_sell_without_stock, images, product_type, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .order("created_at", { ascending: false })
            .limit(150),
        supabase
            .from("customers")
            .select("id, name")
            .eq("partner_id", partnerId)
            .order("name")
            .limit(120),
        supabase
            .from("finance_accounts")
            .select("id, name, type, is_default, is_active")
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .eq("type", "cash")
            .order("is_default", { ascending: false }),
        supabase
            .from("pre_sales")
            .select("id, customer_id, subtotal, discount_amount, total_amount, shipping_fee, other_costs, notes, status, items, created_at, updated_at, coupon_id, coupon_code, coupon_discount_amount")
            .eq("partner_id", partnerId)
            .eq("status", "draft")
            .order("created_at", { ascending: false })
            .limit(20),
        supabase
            .from("payment_methods")
            .select("id, name, type, is_default, is_active, fee_percent, discount_percent, priority")
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .order("is_default", { ascending: false })
            .order("priority", { ascending: false })
            .order("name"),
    ])

    if (productsRes.error) return { success: false as const, error: productsRes.error.message }

    return {
        success: true as const,
        data: {
            products: productsRes.data || [],
            customers: customersRes.error ? [] : (customersRes.data || []).map((c: any) => ({ id: c.id, name: c.name, avatar_url: null })),
            financeAccounts: accountsRes.error ? [] : (accountsRes.data || []),
            preSales: draftsRes.error ? [] : (draftsRes.data || []),
            paymentMethods: paymentMethodsRes.error ? [] : (paymentMethodsRes.data || []),
        },
    }
}

export async function upsertPreSaleDraftAction(input: DraftUpsertInput) {
    await requireUser()
    await requirePermission(input.partnerId, "pdv", "sell")

    // Validate discount permission if a discount or coupon is being applied
    if (input.discountAmount > 0 || input.couponCode || input.couponId) {
        await requirePermission(input.partnerId, "pdv", "can_apply_discount")
    }

    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

    const supabase = createAdminClient()

    const normalizedItemsResult = normalizeDraftItems(input.items)
    if ("error" in normalizedItemsResult) return { success: false as const, error: normalizedItemsResult.error }
    const normalizedItems = normalizedItemsResult.items

    const subtotalFromItems = computeSubtotal(normalizedItems)
    const subtotal = subtotalFromItems
    const discountAmount = safeMoney(Math.min(Math.max(0, input.discountAmount), subtotalFromItems))
    const shippingFee = safeMoney(input.shippingFee ?? 0)
    const otherCosts = safeMoney(input.otherCosts ?? 0)
    const { listActivePromotionsForMarketplaceAction, filterRawPromotionsByGiftStock } = await import("@/app/actions/shared/promotions")
    const rawPromotions = await listActivePromotionsForMarketplaceAction(input.partnerId, input.customerId || null)
    const filteredPromotions = await filterRawPromotionsByGiftStock(rawPromotions, supabase)

    const pricingResult = calculateOrderPricing({
        items: normalizedItems.map((item) => ({
            productId: item.product_id || null,
            unitPrice: Number(item.unit_price || 0),
            quantity: Number(item.quantity || 0),
            basePrice: item.list_unit_price != null ? Number(item.list_unit_price) : Number(item.unit_price || 0),
            isManualPrice: item.is_manual_price,
        })),
        shippingCost: shippingFee,
        additionalCosts: otherCosts,
        manualDiscount: discountAmount > 0 ? { type: "fixed", value: discountAmount } : null,
        coupon: null,
        promotions: filteredPromotions,
    })
    const totalAmount = safeMoney(pricingResult.finalTotal)

    const giftIds = pricingResult.appliedGiftProductIds || []
    if (giftIds.length > 0) {
        const [productsRes, servicesRes] = await Promise.all([
            supabase.from("products").select("id, name, price, images").in("id", giftIds),
            supabase.from("services").select("id, name, price, images").in("id", giftIds),
        ])
        const giftProducts = productsRes.data || []
        const giftServices = servicesRes.data || []

        for (const giftId of giftIds) {
            const promo = filteredPromotions.find(p => p.giftProductId === giftId || p.giftServiceId === giftId)
            if (!promo) continue

            const prod = giftProducts.find((p: any) => p.id === giftId)
            if (prod) {
                normalizedItems.push({
                    product_id: prod.id,
                    variant_id: null,
                    variant_name: null,
                    name: `[BRINDE] ${prod.name}`,
                    quantity: 1,
                    unit_price: 0,
                    total_price: 0,
                    image: prod.images && Array.isArray(prod.images) && prod.images[0] ? prod.images[0] : null,
                    list_unit_price: null,
                    line_discount_type: null,
                    line_discount_value: null,
                    is_gift: true,
                    original_price: Number(prod.price || 0),
                    is_promotional: true,
                    promotion_id: promo.id,
                    is_manual_price: false,
                })
            } else {
                const serv = giftServices.find((s: any) => s.id === giftId)
                if (serv) {
                    normalizedItems.push({
                        product_id: null,
                        variant_id: null,
                        variant_name: null,
                        name: `[BRINDE] ${serv.name}`,
                        quantity: 1,
                        unit_price: 0,
                        total_price: 0,
                        image: serv.images && Array.isArray(serv.images) && serv.images[0] ? serv.images[0] : null,
                        list_unit_price: null,
                        line_discount_type: null,
                        line_discount_value: null,
                        is_gift: true,
                        original_price: Number(serv.price || 0),
                        is_promotional: true,
                        promotion_id: promo.id,
                        is_manual_price: false,
                    })
                }
            }
        }
    }

    if (normalizedItems.length === 0) return { success: false as const, error: "Não é possível salvar pré-venda sem itens." }
    if (discountAmount < 0 || totalAmount < 0 || shippingFee < 0 || otherCosts < 0) {
        return { success: false as const, error: "Valores negativos não são permitidos." }
    }

    const payload: Record<string, unknown> = {
        partner_id: input.partnerId,
        customer_id: input.customerId || null,
        items: normalizedItems,
        subtotal,
        discount_amount: discountAmount,
        total_amount: totalAmount,
        notes: sanitizeNotes(input.notes),
        status: "draft",
        updated_at: new Date().toISOString(),
    }

    payload.shipping_fee = shippingFee
    payload.distance_km = input.distanceKm == null ? null : Number(input.distanceKm)
    payload.delivery_breakdown = input.deliveryBreakdown || null
    payload.other_costs = otherCosts
    payload.coupon_id = input.couponId || null
    payload.coupon_code = input.couponCode || null
    payload.coupon_discount_amount = safeMoney(input.couponDiscountAmount ?? 0)

    if (input.preSaleId) {
        const { data, error } = await supabase
            .from("pre_sales")
            .update(payload)
            .eq("id", input.preSaleId)
            .eq("partner_id", input.partnerId)
            .eq("status", "draft")
            .select("*")
            .single()
        if (error) return { success: false as const, error: error.message }
        return { success: true as const, data }
    }

    const { data, error } = await supabase
        .from("pre_sales")
        .insert(payload)
        .select("*")
        .single()
    if (error) return { success: false as const, error: error.message }

    return { success: true as const, data }
}

export async function deletePreSaleDraftAction(partnerId: string, preSaleId: string) {
    await requireUser()
    await requirePermission(partnerId, "pdv", "view")
    const supabase = createAdminClient()

    const { error } = await supabase
        .from("pre_sales")
        .delete()
        .eq("id", preSaleId)
        .eq("partner_id", partnerId)
        .eq("status", "draft")

    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

/**
 * Finalize a POS pre-sale using an atomic PostgreSQL RPC
 *
 * The RPC `finalize_pos_sale` runs inside a single DB transaction with
 * SELECT ... FOR UPDATE on product/variant rows, ensuring:
 * - No race conditions on stock
 * - All-or-nothing creation of sale + items + stock movement + transaction + cash movements
 * - Server-side total recalculation (never trusts frontend values)
 * - Idempotent: returns existing sale ID if already finalized
 */
export async function finalizePreSaleAction(input: FinalizePreSaleInput) {
    const user = await requireUser()
    await requirePermission(input.partnerId, "pdv", "sell")

    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

    const supabase = createAdminClient()

    // Pre-validate inputs before calling RPC
    if (!input.preSaleId) return { success: false as const, error: "ID da pré-venda é obrigatório." }
    const paidAmount = safeMoney(Number(input.paidAmount || 0))

    // Validate discount permission if the pre-sale has a discount applied
    const { data: draftCheck } = await supabase
        .from("pre_sales")
        .select("discount_amount, coupon_id")
        .eq("id", input.preSaleId)
        .eq("partner_id", input.partnerId)
        .single()
    if (draftCheck) {
        const hasDiscount = Number(draftCheck.discount_amount || 0) > 0
        const hasCoupon = !!draftCheck.coupon_id
        if (hasDiscount || hasCoupon) {
            await requirePermission(input.partnerId, "pdv", "can_apply_discount")
        }
    }

    // Validate finance account belongs to partner
    if (input.financeAccountId) {
        const { data: acc } = await supabase
            .from("finance_accounts")
            .select("id")
            .eq("id", input.financeAccountId)
            .eq("partner_id", input.partnerId)
            .eq("is_active", true)
            .maybeSingle()
        if (!acc?.id) return { success: false as const, error: "Conta financeira inválida ou inativa." }
    }

    // Require open cash session
    const activeSessionResult = await getActiveCashSessionAction(input.partnerId)
    if (!activeSessionResult.success) {
        return { success: false as const, error: "Não foi possível validar o caixa aberto." }
    }
    if (!activeSessionResult.data?.id) {
        return { success: false as const, error: "Abra um caixa para finalizar vendas no PDV." }
    }

    // Build payment breakdown for RPC
    const resolvedBreakdown: Array<{
        method: string
        amount: number
        paymentMethodId: string | null
        payment_method_id: string | null
        installmentNumber?: number
    }> = []
    for (const entry of input.paymentBreakdown || []) {
        const amount = safeMoney(Number(entry.amount || 0))
        if (amount <= 0) continue
        const paymentMethodId = entry.paymentMethodId || null
        if (!paymentMethodId) {
            return {
                success: false as const,
                error: `Método de pagamento inválido no PDV (${String(entry.method || "não informado")}). Selecione um método ativo e tente novamente.`,
            }
        }
        const methodLabel = String(entry.method || input.paymentMethod || "PDV").trim() || "PDV"
        resolvedBreakdown.push({
            method: methodLabel,
            amount,
            paymentMethodId,
            payment_method_id: paymentMethodId,
            installmentNumber: Math.max(1, Math.floor(Number(entry.installmentNumber || 1))),
        })
    }

    let breakdownForRpc = resolvedBreakdown

    const paymentAware = await resolvePosFinalTotalWithPaymentMethod({
        supabase,
        partnerId: input.partnerId,
        preSaleId: input.preSaleId,
        paymentBreakdown: resolvedBreakdown,
    })
    if (paymentAware === null) {
        return { success: false as const, error: "Pré-venda não encontrada ou indisponível para finalizar." }
    }
    if (!paymentAware.ok) {
        return { success: false as const, error: paymentAware.error }
    }
    if ((paymentAware.adjustedBreakdown || []).length > 0) {
        breakdownForRpc = paymentAware.adjustedBreakdown.map((row: any) => ({
            method: row.method,
            amount: safeMoney(Number(row.amount || 0)),
            amountReceived: safeMoney(Number(row.amountReceived ?? row.amount ?? 0)),
            adjustmentType: row.adjustmentType || 'none',
            adjustmentPercent: Math.max(0, Number(row.adjustmentPercent || 0)),
            adjustmentAmount: Math.max(0, Number(row.adjustmentAmount || 0)),
            effectiveAmount: safeMoney(Number(row.effectiveAmount ?? row.amount ?? 0)),
            netAmount: safeMoney(Number(row.netAmount ?? row.effectiveAmount ?? row.amount ?? 0)),
            feeBearer: row.feeBearer || null,
            interestAmount: Math.max(0, Number(row.interestAmount || 0)),
            feeAmount: Math.max(0, Number(row.feeAmount || 0)),
            fixedFeeAmount: Math.max(0, Number(row.fixedFeeAmount || 0)),
            paymentMethodId: row.paymentMethodId || null,
            payment_method_id: row.paymentMethodId || null,
            installmentNumber: Math.max(1, Math.floor(Number(row.installmentNumber || 1))),
        }))
    }
    // `pre_sales.total_amount` stays the line-item / merch base total so `finalize_pos_sale` RPC
    // consistency checks (draft vs recalculated subtotal) keep passing. Final charged amounts
    // per method are only in `p_payment_breakdown` (post discount/interest/fee per leg).
    const paidAmountForRpc =
        breakdownForRpc.length > 0
            ? safeMoney(breakdownForRpc.reduce((acc, row) => acc + Number(row.amount || 0), 0))
            : paidAmount

    // Call atomic RPC
    const { data: saleId, error: rpcError } = await supabase.rpc("finalize_pos_sale", {
        p_partner_id: input.partnerId,
        p_pre_sale_id: input.preSaleId,
        p_finance_account_id: input.financeAccountId || null,
        p_cash_session_id: activeSessionResult.data.id,
        p_paid_amount: paidAmountForRpc,
        p_payment_method: input.paymentMethod || "PDV",
        p_payment_breakdown: breakdownForRpc.length > 0 ? breakdownForRpc : null,
        p_user_id: user.id,
    })

    if (rpcError) {
        // Surface clean error messages from RAISE EXCEPTION
        const msg = rpcError.message || "Falha ao finalizar venda."
        return { success: false as const, error: msg }
    }

    if (!saleId) {
        return { success: false as const, error: "Falha ao finalizar venda - nenhum ID retornado." }
    }

    const { data: finalizedPreSale } = await supabase
        .from("pre_sales")
        .select("shipping_fee, distance_km, delivery_breakdown, coupon_id, coupon_code, coupon_discount_amount, customer_id")
        .eq("id", input.preSaleId)
        .eq("partner_id", input.partnerId)
        .limit(1)
        .maybeSingle()

    const hasShipping = Number(finalizedPreSale?.shipping_fee || 0) > 0
    let finalDeliveryStatus = hasShipping ? "preparing" : "delivered"
    if (input.isPendingDelivery) {
        finalDeliveryStatus = hasShipping ? "preparing" : "pickup_available"
    }

    await supabase
        .from("sales")
        .update({ delivery_status: finalDeliveryStatus })
        .eq("id", saleId)
        .eq("partner_id", input.partnerId)

    if (finalizedPreSale) {
        await supabase
            .from("sales")
            .update({
                delivery_fee: Number(finalizedPreSale.shipping_fee || 0),
                distance_km: Number((finalizedPreSale as any).distance_km || 0),
                delivery_breakdown: (finalizedPreSale as any).delivery_breakdown || null,
            })
            .eq("id", saleId)
            .eq("partner_id", input.partnerId)
    }

    // Ensure the sale's final_amount, paid_amount and payment_status match the recalculated paymentAware totals
    const updatedPaidAmount = Math.min(paymentAware.totalAmount, paidAmountForRpc)
    const isPaid = updatedPaidAmount >= paymentAware.totalAmount - 0.005
    const newStatus = isPaid ? "paid" : (updatedPaidAmount > 0 ? "partially_paid" : "unpaid")
    await supabase
        .from("sales")
        .update({
            final_amount: paymentAware.totalAmount,
            paid_amount: updatedPaidAmount,
            payment_status: newStatus,
            status: newStatus,
        })
        .eq("id", saleId)
        .eq("partner_id", input.partnerId)

    const sellerPartnerUserId = input.sellerId || null
    const { data: sellerPartnerUser } = sellerPartnerUserId
        ? await supabase
            .from("partner_users")
            .select("user_id")
            .eq("id", sellerPartnerUserId)
            .eq("partner_id", input.partnerId)
            .maybeSingle()
        : { data: null as { user_id?: string | null } | null }
    if (sellerPartnerUserId) {
        await createCommissionExpenseForEntity({
            supabase,
            partnerId: input.partnerId,
            partnerUserId: sellerPartnerUserId,
            role: "seller",
            saleAmount: Number(paymentAware.totalAmount || 0),
            entityType: "sale",
            entityId: saleId,
            accountId: input.financeAccountId || null,
            createdByUserId: user.id,
        })
    }

    {
        const goalSellerUserId = (() => {
            if (!sellerPartnerUserId) return user.id
            const match = sellerPartnerUser?.user_id
            return match ? String(match) : user.id
        })()

        if (goalSellerUserId) {
            await applySaleToGoals({
                supabase,
                partnerId: input.partnerId,
                sellerUserId: goalSellerUserId,
                saleAmount: Number(paymentAware.totalAmount || 0),
                createdByUserId: user.id,
                accountId: input.financeAccountId || null,
            })
        }
    }

    const syncedOrderId = await syncPosSaleToOrders({
        partnerId: input.partnerId,
        saleId,
        preSaleId: input.preSaleId,
        financeAccountId: input.financeAccountId || null,
        defaultPaymentMethod: input.paymentMethod || "PDV",
        actorUserId: user.id,
        sellerPartnerUserId: sellerPartnerUserId || null,
        isPendingDelivery: input.isPendingDelivery,
        paymentProvider: input.paymentProvider,
        mpPaymentId: input.mpPaymentId,
        paymentBreakdown: breakdownForRpc.length > 0 ? breakdownForRpc : null,
    })

    // Invalidate caches (non-blocking - sale is already safely committed)
    const draftItems = await supabase
        .from("sale_items")
        .select("product_id")
        .eq("sale_id", saleId)
        .eq("partner_id", input.partnerId)

    const productIds = new Set<string>(
        ((draftItems.data || []) as Array<{ product_id: string | null }>)
            .map((item) => item.product_id)
            .filter(Boolean) as string[]
    )
    for (const productId of productIds) {
        await invalidateProductCache(productId, input.partnerId, "update", { silent: true })
    }

    await revalidateOrders(input.partnerId)
    await revalidateTransactions(input.partnerId)
    await revalidateStockMovements(input.partnerId)

    await logAuditEvent({
        partnerId: input.partnerId,
        actorUserId: user.id,
        entityType: "sale",
        entityId: saleId,
        actionType: "created",
        changeLines: [`finalizou venda PDV no valor de R$ ${paidAmount.toFixed(2)}.`],
        source: "manual",
    })

    // ── Record coupon usage if coupon was applied ─────────────────────────
    if (finalizedPreSale?.coupon_id && syncedOrderId) {
        const adminForCoupon = createAdminClient()
        await adminForCoupon.from("coupon_usages").upsert(
            {
                coupon_id: finalizedPreSale.coupon_id,
                customer_id: finalizedPreSale.customer_id || null,
                order_id: syncedOrderId,
            },
            { onConflict: "coupon_id,order_id", ignoreDuplicates: true }
        )
    }

    // Fetch the human-readable sale_number (DDT-XXXXXX) to display on the frontend
    const { data: saleRecord } = await supabase
        .from("sales")
        .select("sale_number")
        .eq("id", saleId)
        .eq("partner_id", input.partnerId)
        .maybeSingle()

    const saleNumber = saleRecord?.sale_number || null

    return { success: true as const, data: { saleId, saleNumber } }
}

export async function createPOSQuickProductAction(input: {
    partnerId: string
    name: string
    price: number
    stockQuantity: number
}) {
    await requireUser()
    await requirePermission(input.partnerId, "products", "create")

    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

    const name = String(input.name || "").trim()
    const price = safeMoney(Number(input.price || 0))
    const stockQuantity = Math.max(0, Math.floor(Number(input.stockQuantity || 0)))

    if (!name) return { success: false as const, error: "Informe o nome do produto." }
    if (price < 0) return { success: false as const, error: "Preço inválido." }
    if (stockQuantity < 0) return { success: false as const, error: "Estoque inválido." }

    const supabase = createAdminClient()
    const { data: store } = await supabase
        .from("stores")
        .select("id")
        .eq("partner_id", input.partnerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()

    if (!store?.id) {
        return { success: false as const, error: "Nenhuma loja encontrada para cadastrar o produto." }
    }

    const skuBase = generateSKUBase(name)
    const sku = `${skuBase}-${Date.now().toString().slice(-5)}`

    const { data: product, error } = await supabase
        .from("products")
        .insert({
            partner_id: input.partnerId,
            store_id: store.id,
            name,
            sku,
            price,
            stock_quantity: stockQuantity,
            is_active: true,
            allow_sell_without_stock: false,
        })
        .select("id, name, category, sku, price, stock_available, allow_sell_without_stock, images, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)")
        .single()

    if (error) return { success: false as const, error: error.message }
    return { success: true as const, data: product }
}

export async function createPOSCustomerQuickAction(input: {
    partnerId: string
    name: string
    email?: string
    phone?: string
    cpf?: string
    address?: {
        zipCode?: string
        street?: string
        number?: string
        complement?: string
        neighborhood?: string
        city?: string
        state?: string
    }
}) {
    await requireUser()
    await requirePermission(input.partnerId, "customers", "create")

    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

    const name = String(input.name || "").trim()
    const email = String(input.email || "").trim().toLowerCase()
    const phone = String(input.phone || "").trim()
    const cpfDigits = String(input.cpf || "").replace(/\D/g, "")

    if (!name) return { success: false as const, error: "Informe o nome do cliente." }

    // Check for existing customer before creating
    if (email || cpfDigits) {
        const { findExistingCustomer } = await import("@/lib/services/marketplace-customer")
        const match = await findExistingCustomer({
            partnerId: input.partnerId,
            email: email || null,
            cpf: cpfDigits || null,
        })
        if (match) {
            return {
                success: false as const,
                error: `Já existe cliente com este ${match.matchBy === "email" ? "e-mail" : "CPF"}: "${match.customer.name}".`,
                existingCustomerId: match.customer.id,
            }
        }
    }

    const supabase = createAdminClient()
    let encryptedCpf: string | null = null
    if (cpfDigits) {
        const { encryptCPF } = await import("@/lib/crypto")
        encryptedCpf = await encryptCPF(cpfDigits)
    }

    const { data: customer, error } = await supabase
        .from("customers")
        .insert({
            partner_id: input.partnerId,
            name,
            email: email || null,
            phone: phone || null,
            person_type: "pf",
            cpf: encryptedCpf,
            status: "ativo",
        })
        .select("id, name, email, phone")
        .single()

    if (error) return { success: false as const, error: error.message }

    const address = input.address || {}
    const hasAddress = !!(address.street || address.city || address.zipCode)
    if (hasAddress) {
        await supabase.from("addresses").insert({
            customer_id: customer.id,
            address_type: "primary",
            zip_code: address.zipCode || null,
            street: address.street || null,
            number: address.number || null,
            complement: address.complement || null,
            neighborhood: address.neighborhood || null,
            city: address.city || null,
            state: address.state || null,
            country: "BR",
            is_default: true,
        })
    }

    return {
        success: true as const,
        data: {
            id: customer.id,
            name: customer.name,
            email: customer.email || null,
            phone: customer.phone || null,
            cpf: cpfDigits || null,
            address: hasAddress ? {
                zipCode: address.zipCode || "",
                street: address.street || "",
                number: address.number || "",
                complement: address.complement || "",
                neighborhood: address.neighborhood || "",
                city: address.city || "",
                state: address.state || "",
            } : null,
        },
    }
}

export async function getPOSCustomerDetailsAction(input: {
    partnerId: string
    customerId: string
}) {
    await requireUser()
    await requirePermission(input.partnerId, "customers", "view")

    const supabase = createAdminClient()
    const [{ data: customer, error: customerError }, { data: address }] = await Promise.all([
        supabase
            .from("customers")
            .select("id, name, email, phone, cpf")
            .eq("partner_id", input.partnerId)
            .eq("id", input.customerId)
            .single(),
        supabase
            .from("addresses")
            .select("zip_code, street, number, complement, neighborhood, city, state, country")
            .eq("customer_id", input.customerId)
            .eq("address_type", "primary")
            .limit(1)
            .maybeSingle(),
    ])

    if (customerError || !customer) {
        return { success: false as const, error: customerError?.message || "Cliente não encontrado." }
    }

    let plainCpf: string | null = null
    if (customer.cpf) {
        try {
            const { decryptCPF } = await import("@/lib/crypto")
            plainCpf = await decryptCPF(customer.cpf)
        } catch {
            plainCpf = null
        }
    }

    return {
        success: true as const,
        data: {
            id: customer.id,
            name: customer.name,
            email: customer.email || null,
            phone: customer.phone || null,
            cpf: plainCpf,
            address: address ? {
                zipCode: address.zip_code || "",
                street: address.street || "",
                number: address.number || "",
                complement: address.complement || "",
                neighborhood: address.neighborhood || "",
                city: address.city || "",
                state: address.state || "",
                country: address.country || "BR",
            } : null,
        },
    }
}

export async function createPOSCustomerAddressAction(input: {
    partnerId: string
    customerId: string
    address: {
        zipCode?: string
        street?: string
        number?: string
        complement?: string
        neighborhood?: string
        city?: string
        state?: string
    }
}) {
    await requireUser()
    await requirePermission(input.partnerId, "customers", "edit")

    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

    const supabase = createAdminClient()

    const { data: customer, error: customerError } = await supabase
        .from("customers")
        .select("id")
        .eq("partner_id", input.partnerId)
        .eq("id", input.customerId)
        .maybeSingle()

    if (customerError || !customer?.id) {
        return { success: false as const, error: customerError?.message || "Cliente não encontrado." }
    }

    const address = input.address || {}
    const hasAddress = !!(address.street || address.city || address.zipCode)
    if (!hasAddress) {
        return { success: false as const, error: "Informe um endereço válido." }
    }

    const basePayload = {
        customer_id: customer.id,
        address_type: "primary",
        zip_code: address.zipCode || null,
        street: address.street || null,
        number: address.number || null,
        complement: address.complement || null,
        neighborhood: address.neighborhood || null,
        city: address.city || null,
        state: address.state || null,
        country: "BR",
        is_default: true,
    }

    const { data: existingPrimary } = await supabase
        .from("addresses")
        .select("id")
        .eq("customer_id", customer.id)
        .eq("address_type", "primary")
        .limit(1)
        .maybeSingle()

    if (existingPrimary?.id) {
        const { error } = await supabase
            .from("addresses")
            .update(basePayload)
            .eq("id", existingPrimary.id)
            .eq("customer_id", customer.id)

        if (error) return { success: false as const, error: error.message }
    } else {
        const { error } = await supabase.from("addresses").insert(basePayload)
        if (error) return { success: false as const, error: error.message }
    }

    return {
        success: true as const,
        data: {
            address: {
                zipCode: address.zipCode || "",
                street: address.street || "",
                number: address.number || "",
                complement: address.complement || "",
                neighborhood: address.neighborhood || "",
                city: address.city || "",
                state: address.state || "",
                country: "BR",
            },
        },
    }
}

// ============================================================================
// POS COUPON ACTIONS
// ============================================================================

export async function applyCouponToPreSaleAction(input: {
    partnerId: string
    preSaleId: string
    couponCode: string
    customerId?: string | null
    subtotal: number
    shippingCost?: number
    items?: Array<{ productId?: string | null; serviceId?: string | null }>
}) {
    await requireUser()
    await requirePermission(input.partnerId, "pdv", "can_apply_discount")

    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return { success: false as const, error: rl.error || "Muitas tentativas." }

    const result = await validateCoupon({
        partnerId: input.partnerId,
        code: input.couponCode,
        customerId: input.customerId,
        subtotal: input.subtotal,
        shippingCost: input.shippingCost,
        items: input.items,
    })

    if (!result.valid) {
        return { success: false as const, error: result.errorMessage || "Cupom inválido." }
    }

    const supabase = createAdminClient()
    const { error } = await supabase
        .from("pre_sales")
        .update({
            coupon_id: result.couponId || null,
            coupon_code: result.couponCode || input.couponCode.trim().toUpperCase(),
            coupon_discount_amount: safeMoney(result.discountAmount),
            updated_at: new Date().toISOString(),
        })
        .eq("id", input.preSaleId)
        .eq("partner_id", input.partnerId)
        .eq("status", "draft")

    if (error) return { success: false as const, error: error.message }

    return {
        success: true as const,
        data: {
            couponId: result.couponId || null,
            couponCode: result.couponCode || input.couponCode.trim().toUpperCase(),
            discountAmount: result.discountAmount,
            pricingCoupon: result.pricingCoupon || null,
            freeShipping: result.freeShipping || false,
        },
    }
}

export async function removeCouponFromPreSaleAction(input: {
    partnerId: string
    preSaleId: string
}) {
    await requireUser()
    await requirePermission(input.partnerId, "pdv", "can_apply_discount")

    const supabase = createAdminClient()
    const { error } = await supabase
        .from("pre_sales")
        .update({
            coupon_id: null,
            coupon_code: null,
            coupon_discount_amount: 0,
            updated_at: new Date().toISOString(),
        })
        .eq("id", input.preSaleId)
        .eq("partner_id", input.partnerId)
        .eq("status", "draft")

    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
}

export async function findAutomaticCouponForPOSAction(input: {
    partnerId: string
    customerId?: string | null
    subtotal: number
    shippingCost?: number
    items?: Array<{ productId?: string | null; serviceId?: string | null }>
}) {
    await requireUser()
    await requirePermission(input.partnerId, "pdv", "can_apply_discount")

    const result = await findBestAutomaticCoupon({
        partnerId: input.partnerId,
        customerId: input.customerId,
        subtotal: input.subtotal,
        shippingCost: input.shippingCost,
        items: input.items,
    })

    if (!result.valid) {
        return { success: false as const }
    }

    return {
        success: true as const,
        data: {
            couponId: result.couponId || null,
            couponCode: result.couponCode || null,
            discountAmount: result.discountAmount,
            pricingCoupon: result.pricingCoupon || null,
            freeShipping: result.freeShipping || false,
        },
    }
}
