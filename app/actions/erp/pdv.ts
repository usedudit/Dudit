"use server";

import { getSupabaseServerClient } from "@/lib/supabase/request-client";
import { createAdminClient } from "@/lib/supabase/server";
import { sanitizeInput } from "@/lib/input-validator";
import {
  requireUser,
  requireStoreAccess,
  ForbiddenError,
} from "@/lib/auth/authorization";
import { requirePermission } from "@/lib/permissions/access";
import {
  revalidateOrders,
  revalidateTransactions,
  revalidateStockMovements,
} from "@/lib/utils/revalidation";
import { invalidateProductCache } from "@/lib/cache/invalidation";
import { getActiveCashSessionAction } from "@/app/actions/erp/cash-register";
import { generateSKUBase } from "@/lib/utils/code-generators";
import { requireRateLimit } from "@/lib/security/require-rate-limit";
import { RateLimitCategory } from "@/lib/rate-limiter";
import { sanitizeNotes } from "@/lib/input-validator";
import { logAuditEvent } from "@/lib/services/timeline.service";
import {
  validateCoupon,
  findBestAutomaticCoupon,
} from "@/lib/services/coupons";
import {
  calculateOrderPricing,
  type PricingItem,
} from "@/lib/services/pricing-engine";
import {
  recalculateSplitPaymentFromBaseAmounts,
  toStoredBreakdownAmounts,
  type SplitInputRow,
} from "@/lib/payments/split-breakdown";
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation";
import { createCommissionExpenseForEntity } from "@/lib/services/commission-ledger.service";
import { applySaleToGoals } from "@/lib/services/sales-goals.service";
import { formatPaymentMethodLabel } from "@/lib/payments/payment-method";
import { resolveDeliverySettingsRow } from "@/app/actions/shared/delivery";
import { resolvePaymentMethodsForStore } from "@/lib/data/payment-methods";
import { listStoreProducts } from "@/lib/store-products";
import { listStoreServices } from "@/lib/store-services";
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities";
import { checkLimit } from "@/lib/services/subscription.service";
import { enrichAddressData } from "@/lib/services/location.service";

type DraftItemInput = {
  productId?: string | null;
  serviceId?: string | null;
  variantId?: string | null;
  variantName?: string | null;
  name: string;
  qty: number;
  price: number;
  totalPrice?: number;
  image?: string | null;
  listUnitPrice?: number | null;
  lineDiscountType?: "fixed" | "percentage" | null;
  lineDiscountValue?: number | null;
  isGift?: boolean;
  originalPrice?: number | null;
  isPromotional?: boolean;
  promotionId?: string | null;
  isManualPrice?: boolean | null;
  allowSellWithoutStock?: boolean | null;
  selectedAddons?: Array<{
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    price: number;
  }> | null;
};

type DraftUpsertInput = {
  partnerId: string;
  preSaleId?: string | null;
  customerId?: string | null;
  notes?: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  shippingFee?: number;
  distanceKm?: number | null;
  deliveryBreakdown?: Record<string, unknown> | null;
  otherCosts?: number;
  items: DraftItemInput[];
  couponId?: string | null;
  couponCode?: string | null;
  couponDiscountAmount?: number;
  storeId?: string | null;
};

type FinalizePaymentEntry = {
  method: string;
  amount: number;
  amountReceived?: number;
  paymentMethodId?: string | null;
  installmentNumber?: number;
  wantsChange?: boolean;
  payWithAmount?: number;
};

type FinalizePreSaleInput = {
  partnerId: string;
  preSaleId?: string | null;
  checkoutId?: string | null;
  draft?: {
    customerId?: string | null;
    items: DraftItemInput[];
    subtotal: number;
    discountAmount: number;
    totalAmount: number;
    shippingFee?: number;
    otherCosts?: number;
    notes?: string;
    deliveryBreakdown?: Record<string, unknown> | null;
    couponId?: string | null;
    couponCode?: string | null;
    couponDiscountAmount?: number;
  };
  financeAccountId?: string | null;
  paidAmount: number;
  paymentMethod?: string | null;
  paymentBreakdown?: FinalizePaymentEntry[];
  isPendingDelivery?: boolean;
  paymentProvider?: string;
  mpPaymentId?: string | null;
  sellerId?: string | null;
  storeId?: string | null;
};

type PosPaymentResolveResult =
  | { ok: false; error: string }
  | {
      ok: true;
      totalAmount: number;
      adjustedBreakdown: Array<{
        method: string;
        amount: number;
        paymentMethodId: string | null;
        installmentNumber: number;
        installmentCostAmount?: number;
        installmentFeeBearer?: string | null;
        feeBearer?: string | null;
        interestAmount?: number;
        feeAmount?: number;
        fixedFeeAmount?: number;
        paymentMethodDiscountAmount?: number;
      }>;
    };

async function resolvePosFinalTotalWithPaymentMethod(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  storeId?: string | null;
  preSaleId?: string | null;
  baseTotal?: number;
  paymentBreakdown: Array<{
    method?: string;
    amount?: number;
    amountReceived?: number;
    paymentMethodId?: string | null;
    installmentNumber?: number;
    wantsChange?: boolean;
    payWithAmount?: number;
  }>;
}): Promise<PosPaymentResolveResult | null> {
  let baseTotal: number;
  if (params.baseTotal != null) {
    baseTotal = Math.max(0, Number(params.baseTotal || 0));
  } else {
    if (!params.preSaleId) return null;
    const { data: draft } = await params.supabase
      .from("pre_sales")
      .select("total_amount")
      .eq("id", params.preSaleId)
      .eq("partner_id", params.partnerId)
      .eq("status", "draft")
      .maybeSingle();
    if (!draft) return null;
    baseTotal = Math.max(0, Number(draft.total_amount || 0));
  }
  const rawRows = params.paymentBreakdown || [];
  if (rawRows.length === 0) {
    return { ok: true, totalAmount: baseTotal, adjustedBreakdown: [] };
  }

  const methodIds = Array.from(
    new Set(rawRows.map((row) => row.paymentMethodId).filter(Boolean)),
  ) as string[];

  const [{ data: methods }, { data: fees }] = await Promise.all([
    methodIds.length > 0
      ? resolvePaymentMethodsForStore(
          params.supabase,
          { partnerId: params.partnerId, storeId: params.storeId },
          {
            select:
              "id, fee_percent, fee_fixed, fee_bearer, installment_fee_bearer, discount_percent, max_installments",
          },
        ).in("id", methodIds)
      : Promise.resolve({ data: [] as any[] }),
    methodIds.length > 0
      ? params.supabase
          .from("payment_method_installment_fees")
          .select("payment_method_id, installment_number, fee_percent")
          .in("payment_method_id", methodIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const methodById = new Map<string, any>(
    (methods || []).map((m: any) => [String(m.id), m]),
  );
  const feesByMethod = new Map<
    string,
    Array<{ installmentNumber: number; feePercent: number }>
  >();
  for (const row of fees || []) {
    const key = String((row as any).payment_method_id || "");
    if (!key) continue;
    const list = feesByMethod.get(key) || [];
    list.push({
      installmentNumber: Number((row as any).installment_number || 1),
      feePercent: Number((row as any).fee_percent || 0),
    });
    feesByMethod.set(key, list);
  }

  const splitRows: SplitInputRow[] = rawRows.map((row) => ({
    method: String(row.method || "PDV").trim() || "PDV",
    amount: safeMoney(Number(row.amount || 0)),
    amountReceived: safeMoney(Number((row.amountReceived ?? row.amount) || 0)),
    paymentMethodId: row.paymentMethodId || null,
    installmentNumber: Math.max(
      1,
      Math.floor(Number(row.installmentNumber || 1)),
    ),
  }));

  const recalculated = recalculateSplitPaymentFromBaseAmounts(
    baseTotal,
    splitRows,
    methodById,
    feesByMethod,
  );
  if (!recalculated.ok) {
    return { ok: false, error: recalculated.error };
  }

  const stored = toStoredBreakdownAmounts(recalculated.adjustedRows);
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
    installmentFeeBearer: s.installmentFeeBearer,
    paymentMethodDiscountAmount: s.paymentMethodDiscountAmount ?? 0,
    interestAmount: s.interestAmount,
    installmentCostAmount: s.installmentCostAmount,
    feeAmount: s.feeAmount,
    fixedFeeAmount: s.fixedFeeAmount,
    paymentMethodId: s.paymentMethodId,
    installmentNumber:
      recalculated.adjustedRows[i]?.installmentNumber ??
      splitRows[i]?.installmentNumber ??
      1,
    wantsChange: rawRows[i]?.wantsChange || undefined,
    payWithAmount:
      rawRows[i]?.payWithAmount != null
        ? safeMoney(Number(rawRows[i].payWithAmount))
        : undefined,
  }));

  const sumBase = splitRows.reduce((acc, r) => acc + r.amount, 0);

  // Use the correctly computed per-leg discount from recalculateSplitPayment
  const baseDiscount = recalculated.paymentMethodDiscountAmount;

  const isPartial = sumBase < baseTotal - 0.005;
  const finalTotal = recalculated.finalTotal;

  return {
    ok: true,
    totalAmount: finalTotal,
    adjustedBreakdown,
  };
}

function safeMoney(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
}

function normalizeDraftItems(items: DraftItemInput[]) {
  const normalized = (items || []).map((item) => ({
    product_id: item.productId || null,
    service_id: item.serviceId || null,
    variant_id: item.variantId || null,
    variant_name: item.variantName?.trim() || null,
    name: String(item.name || "").trim(),
    quantity: Math.max(0, Number(item.qty || 0)),
    unit_price: safeMoney(Number(item.price || 0)),
    total_price: safeMoney(
      Number(
        item.totalPrice || Number(item.qty || 0) * Number(item.price || 0),
      ),
    ),
    image: item.image || null,
    list_unit_price:
      item.listUnitPrice != null && Number.isFinite(Number(item.listUnitPrice))
        ? safeMoney(Number(item.listUnitPrice))
        : null,
    line_discount_type:
      item.lineDiscountType === "fixed" ||
      item.lineDiscountType === "percentage"
        ? item.lineDiscountType
        : null,
    line_discount_value:
      item.lineDiscountValue != null &&
      Number.isFinite(Number(item.lineDiscountValue))
        ? item.lineDiscountType === "percentage"
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round(Number(item.lineDiscountValue) * 100) / 100,
              ),
            )
          : safeMoney(Number(item.lineDiscountValue))
        : null,
    is_gift: Boolean(item.isGift),
    original_price:
      item.originalPrice != null ? Number(item.originalPrice) : null,
    is_promotional: Boolean(item.isPromotional),
    promotion_id: item.promotionId || null,
    is_manual_price: Boolean(item.isManualPrice),
    allow_sell_without_stock: Boolean(item.allowSellWithoutStock),
  }));

  for (const item of normalized) {
    if (!item.name) return { error: "Todo item precisa ter nome." as const };
    if (item.quantity <= 0)
      return { error: `Quantidade inválida para "${item.name}".` as const };
    if (item.unit_price < 0)
      return { error: `Preço inválido para "${item.name}".` as const };
  }

  return { items: normalized };
}

function computeSubtotal(
  items: Array<{ quantity: number; unit_price: number }>,
) {
  return safeMoney(
    items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0),
  );
}

/**
 * Mirrors POS `sales` into `orders` so the ERP pedidos list shows PDV checkout.
 * Uses the service-role client: partner RLS often allows only marketplace buyers to INSERT orders.
 */
async function syncPosSaleToOrders(params: {
  partnerId: string;
  storeId?: string | null;
  saleId: string;
  preSaleId: string;
  financeAccountId?: string | null;
  defaultPaymentMethod: string;
  actorUserId: string;
  sellerPartnerUserId?: string | null;
  isPendingDelivery?: boolean;
  paymentProvider?: string;
  mpPaymentId?: string | null;
  paymentBreakdown?: any[] | null;
}): Promise<string | null> {
  const admin = createAdminClient();
  const [{ data: sale }, { data: saleItems }, { data: draft }] =
    await Promise.all([
      admin
        .from("sales")
        .select(
          "id, sale_number, customer_id, notes, payment_status, final_amount, paid_amount, discount_amount, created_at",
        )
        .eq("id", params.saleId)
        .eq("partner_id", params.partnerId)
        .single(),
      admin.from("sale_items").select("*").eq("sale_id", params.saleId),
      admin
        .from("pre_sales")
        .select(
          "id, shipping_fee, distance_km, delivery_breakdown, other_costs, discount_amount, coupon_discount_amount, coupon_id",
        )
        .eq("id", params.preSaleId)
        .maybeSingle(),
    ]);

  if (!sale) {
    throw new Error(`Venda ${params.saleId} não encontrada.`);
  }

  // Use the pre-generated DDT number instead of creating a PDV- prefix
  const finalOrderNumber =
    sale.sale_number ||
    `DDT-${String(params.saleId).substring(0, 8).toUpperCase()}`;

  const { data: existingOrder } = await admin
    .from("orders")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("order_number", finalOrderNumber)
    .limit(1)
    .maybeSingle();

  if (existingOrder?.id) return existingOrder.id;

  let customerName: string | null = null;
  if (sale.customer_id) {
    const { data: cust } = await admin
      .from("customers")
      .select("name")
      .eq("id", sale.customer_id)
      .eq("partner_id", params.partnerId)
      .maybeSingle();
    customerName = cust?.name?.trim() || null;
  }

  // Normalize customer name and ensure it's "Consumidor final" if empty or incorrectly set
  if (!customerName || customerName.toLowerCase().includes("cliente balcão")) {
    customerName = "Consumidor final";
  }

  const shippingFee = safeMoney(Number(draft?.shipping_fee || 0));
  const distanceKm =
    draft?.distance_km == null ? null : Number(draft.distance_km || 0);
  const deliveryBreakdown = (draft as any)?.delivery_breakdown || null;
  const otherCosts = safeMoney(Number(draft?.other_costs || 0));
  const manualDiscount = safeMoney(
    Number((draft as any)?.discount_amount ?? sale.discount_amount ?? 0),
  );
  const couponDiscount = safeMoney(
    Number((draft as any)?.coupon_discount_amount ?? 0),
  );

  // ── Central pricing engine ───────────────────────────────────────────
  const pricingItems: PricingItem[] = (saleItems || []).map((item: any) => ({
    productId: item.product_id || null,
    unitPrice: Number(item.unit_price || 0),
    quantity: Number(item.quantity || 0),
    basePrice:
      item.original_price != null
        ? Number(item.original_price)
        : Number(item.unit_price || 0),
  }));
  const pricingResult = calculateOrderPricing({
    items: pricingItems,
    shippingCost: shippingFee,
    additionalCosts: otherCosts,
    manualDiscount:
      manualDiscount > 0 ? { type: "fixed", value: manualDiscount } : null,
  });

  const subtotalValue = pricingResult.subtotal;

  // Use actual breakdown values (all components read regardless of adjustmentType)
  let paymentMethodDiscountAmount = 0;
  let paymentMethodInterestAmount = 0;
  let paymentMethodFeeAmount = 0;
  let paymentMethodFixedFeeAmount = 0;
  let customerExtraFees = 0;
  if (params.paymentBreakdown && params.paymentBreakdown.length > 0) {
    for (const entry of params.paymentBreakdown) {
      const pmDiscount =
        entry.paymentMethodDiscountAmount !== undefined
          ? Math.max(0, Number(entry.paymentMethodDiscountAmount || 0))
          : entry.adjustmentType === "discount"
            ? Math.max(0, Number(entry.adjustmentAmount || 0))
            : 0;
      paymentMethodDiscountAmount = safeMoney(
        paymentMethodDiscountAmount + pmDiscount,
      );
      const entryInterest = Number(entry.interestAmount || 0);
      const entryInstallmentCost = Number(entry.installmentCostAmount || 0);
      const entryFixedInterest = Math.max(
        0,
        entryInterest - entryInstallmentCost,
      );
      const entryFeeAmount = Number(entry.feeAmount || 0);
      const entryFixedFeeAmount = Number(entry.fixedFeeAmount || 0);
      const isCustomerFeeBearer =
        String(entry.feeBearer || "merchant").toLowerCase() === "customer";
      const isCustomerInstallmentFeeBearer =
        String(entry.installmentFeeBearer || "merchant").toLowerCase() ===
        "customer";

      // Merchant-absorbed amounts
      if (!isCustomerFeeBearer) {
        paymentMethodInterestAmount = safeMoney(
          paymentMethodInterestAmount + entryFixedInterest,
        );
        if (!isCustomerInstallmentFeeBearer) {
          paymentMethodInterestAmount = safeMoney(
            paymentMethodInterestAmount + entryInstallmentCost,
          );
        } else {
          customerExtraFees = safeMoney(
            customerExtraFees + entryInstallmentCost,
          );
        }
        paymentMethodFeeAmount = safeMoney(
          paymentMethodFeeAmount + entryFeeAmount,
        );
        paymentMethodFixedFeeAmount = safeMoney(
          paymentMethodFixedFeeAmount + entryFixedFeeAmount,
        );
      } else {
        // Customer pays all relevant costs
        customerExtraFees = safeMoney(customerExtraFees + entryFixedInterest);
        if (isCustomerInstallmentFeeBearer) {
          customerExtraFees = safeMoney(
            customerExtraFees + entryInstallmentCost,
          );
        }
        customerExtraFees = safeMoney(
          customerExtraFees + entryFeeAmount + entryFixedFeeAmount,
        );
      }
    }
  }
  const paymentMethodExtraAmount = safeMoney(customerExtraFees);
  const deliveryType = shippingFee > 0 ? "delivery" : "pickup";
  let deliveryStatus = shippingFee > 0 ? "preparing" : "delivered";
  if (params.isPendingDelivery) {
    deliveryStatus =
      deliveryType === "pickup" ? "pickup_available" : "preparing";
  }
  const paymentSituation =
    sale.payment_status === "paid"
      ? "paid"
      : sale.payment_status === "partially_paid"
        ? "partially_paid"
        : "pending";

  const productIds = Array.from(
    new Set(
      (saleItems || []).map((item: any) => item.product_id).filter(Boolean),
    ),
  ) as string[];
  // Current strategy: use stores.opening_hours when storeId is provided (multi-store),
  // fall back to legacy partners.opening_hours for backward compatibility
  const [{ data: preparationProducts }, { data: storeHours }] =
    await Promise.all([
      productIds.length > 0
        ? admin
            .from("products")
            .select("id, availability_value, availability_unit")
            .eq("partner_id", params.partnerId)
            .in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
      params.storeId
        ? admin
            .from("stores")
            .select("opening_hours")
            .eq("id", params.storeId)
            .eq("partner_id", params.partnerId)
            .maybeSingle()
        : admin
            .from("stores")
            .select("opening_hours")
            .eq("partner_id", params.partnerId)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle(),
    ]);

  const preparationEstimate = computeOrderPreparationEstimate({
    products: (preparationProducts || []).map((product: any) => ({
      availability_value: Number(product.availability_value || 0),
      availability_unit: product.availability_unit || "Minutos",
    })),
    // M6: partners fallback mantido para compatibilidade com parceiros sem opening_hours na store
    openingHours: (storeHours as any)?.opening_hours || null,
    pickupWindowMinutes: 30,
    deliveryTimeEstimateMinutes: 0,
  });

  // Fetch delivery_payer for snapshot (store-aware)
  const deliveryRow = await resolveDeliverySettingsRow(
    admin,
    params.partnerId,
    params.storeId,
  );
  const deliveryPayer: "customer" | "seller" =
    deliveryRow?.delivery_payer === "seller" ? "seller" : "customer";
  if (params.storeId && deliveryRow?.store_id === params.storeId) {
    console.log(
      `[delivery_payer] PDV sync using store override: store=${params.storeId}, partner=${params.partnerId}, payer=${deliveryPayer}`,
    );
  }

  // Calculate seller_commission_amount for snapshot
  let sellerCommissionAmount = 0;
  if (params.sellerPartnerUserId) {
    const { data: sellerCommissions } = await admin
      .from("employee_commissions")
      .select("*")
      .eq("partner_id", params.partnerId)
      .eq("role", "seller")
      .maybeSingle();

    if (sellerCommissions && sellerCommissions.commission_type !== "none") {
      const subtotalValue = Math.max(0, Number(sale.subtotal || 0));
      const { calculateCommission } =
        await import("@/lib/services/commission.service");
      sellerCommissionAmount = calculateCommission({
        userId: params.sellerPartnerUserId,
        role: "seller",
        commissionType: sellerCommissions.commission_type,
        value: Number(sellerCommissions.value || 0),
        saleAmount: subtotalValue,
      });
    }
  }

  // Fetch product/variant/service names and cost prices for order_items snapshot
  const variantIds = (saleItems || [])
    .filter((i: any) => i.variant_id)
    .map((i: any) => i.variant_id);
  const serviceIds = (saleItems || [])
    .filter((i: any) => i.service_id)
    .map((i: any) => i.service_id);

  const [{ data: products }, { data: variants }, { data: services }] =
    await Promise.all([
      productIds.length > 0
        ? admin
            .from("products")
            .select("id, name, cost_price")
            .eq("partner_id", params.partnerId)
            .in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
      variantIds.length > 0
        ? admin
            .from("product_variants")
            .select("id, variant_name, product_id")
            .in("id", variantIds)
        : Promise.resolve({ data: [] as any[] }),
      serviceIds.length > 0
        ? admin
            .from("services")
            .select("id, name, service_name, cost_price")
            .eq("partner_id", params.partnerId)
            .in("id", serviceIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const productCostMap = new Map<string, number>(
    (products || []).map((p: { id: string; cost_price: number | null }) => [
      p.id,
      Number(p.cost_price || 0),
    ]),
  );
  const variantCostMap = new Map<string, number>(
    (variants || []).map((v: { id: string; product_id: string }) => [
      v.id,
      Number(productCostMap.get(v.product_id) || 0),
    ]),
  );
  const serviceCostMap = new Map<string, number>(
    (services || []).map((s: { id: string; cost_price: number | null }) => [
      s.id,
      Number(s.cost_price || 0),
    ]),
  );

  const productNameMap = new Map<string, string>(
    (products || []).map((p: any) => [p.id, String(p.name || "").trim()]),
  );
  const variantNameMap = new Map<string, string>(
    (variants || []).map((v: any) => [
      v.id,
      String(v.variant_name || "").trim(),
    ]),
  );
  const serviceNameMap = new Map<string, string>(
    (services || []).map((s: any) => [
      s.id,
      String(s.service_name || s.name || "").trim(),
    ]),
  );

  const orderPayload: Record<string, unknown> = {
    partner_id: params.partnerId,
    store_id: params.storeId || null,
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
    payment_method_interest_amount: paymentMethodInterestAmount,
    payment_method_fee_amount: paymentMethodFeeAmount,
    payment_method_fixed_fee_amount: paymentMethodFixedFeeAmount,
    payment_method_extra_amount: paymentMethodExtraAmount,
    coupon_id: draft?.coupon_id || null,
    delivery_fee: Number(deliveryBreakdown?.originalFee || shippingFee || 0),
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
    delivery_payer:
      (deliveryBreakdown?.deliveryPayer as "seller" | "customer") ||
      deliveryPayer,
    seller_commission_amount: sellerCommissionAmount,
    ...(preparationEstimate
      ? {
          preparation_time_minutes: preparationEstimate.preparationTimeMinutes,
          estimated_ready_at: preparationEstimate.readyAt.toISOString(),
          pickup_window_start:
            preparationEstimate.pickupWindowStart.toISOString(),
          pickup_window_end: preparationEstimate.pickupWindowEnd.toISOString(),
          estimated_delivery_at:
            deliveryType === "delivery"
              ? preparationEstimate.estimatedDeliveryAt.toISOString()
              : null,
        }
      : {}),
  };

  const insertWithPosFlag = { ...orderPayload, is_pos_sale: true };
  let createdOrderId: string | null = null;
  const { data: insertedWithPosFlag, error: insertError } = await admin
    .from("orders")
    .insert(insertWithPosFlag)
    .select("id")
    .single();

  if (insertError) {
    const insertErrorMessage = String(insertError.message || "").toLowerCase();
    const missingPosFlagColumn = insertErrorMessage.includes("is_pos_sale");
    const missingPaymentDeltaColumns =
      insertErrorMessage.includes("payment_method_discount_amount") ||
      insertErrorMessage.includes("payment_method_extra_amount") ||
      insertErrorMessage.includes("payment_method_interest_amount") ||
      insertErrorMessage.includes("payment_method_fee_amount") ||
      insertErrorMessage.includes("payment_method_fixed_fee_amount");
    if (!missingPosFlagColumn && !missingPaymentDeltaColumns) {
      console.error(
        "[syncPosSaleToOrders] orders insert failed:",
        insertError.message,
        insertError,
      );
      return null;
    }

    const fallbackOrderPayload = { ...orderPayload };
    if (missingPaymentDeltaColumns) {
      delete (fallbackOrderPayload as any).payment_method_discount_amount;
      delete (fallbackOrderPayload as any).payment_method_extra_amount;
      delete (fallbackOrderPayload as any).payment_method_interest_amount;
      delete (fallbackOrderPayload as any).payment_method_fee_amount;
      delete (fallbackOrderPayload as any).payment_method_fixed_fee_amount;
    }
    const { data: insertedWithoutPosFlag, error: insertError2 } = await admin
      .from("orders")
      .insert(fallbackOrderPayload)
      .select("id")
      .single();
    if (insertError2) {
      console.error(
        "[syncPosSaleToOrders] orders insert (no is_pos_sale) failed:",
        insertError2.message,
        insertError2,
      );
      return null;
    }
    createdOrderId = insertedWithoutPosFlag?.id || null;
  } else {
    createdOrderId = insertedWithPosFlag?.id || null;
  }

  if (!createdOrderId) return null;

  const draftItemsList: any[] = Array.isArray((draft as any)?.items)
    ? (draft as any).items
    : [];

  const orderItems = (saleItems || []).map((item: any, index: number) => {
    let unitCost = 0;
    if (item.service_id) {
      unitCost = serviceCostMap.get(item.service_id) || 0;
    } else if (item.variant_id) {
      unitCost = variantCostMap.get(item.variant_id) || 0;
    } else if (item.product_id) {
      unitCost = productCostMap.get(item.product_id) || 0;
    }

    const draftMatch = draftItemsList.find(
      (d: any) =>
        (d.productId === item.product_id || d.product_id === item.product_id) &&
        (!item.variant_id ||
          d.variantId === item.variant_id ||
          d.variant_id === item.variant_id),
    );

    const nameFromItem =
      item.product_name && item.product_name !== "Item"
        ? item.product_name
        : null;
    const nameFromDraft =
      draftMatch?.name ||
      draftMatch?.customName ||
      draftMatch?.custom_name ||
      draftMatch?.product_name ||
      draftMatch?.title ||
      null;
    const nameFromProduct = item.product_id
      ? productNameMap.get(item.product_id)
      : item.service_id
        ? serviceNameMap.get(item.service_id)
        : null;
    const nameFromVariant = item.variant_id
      ? variantNameMap.get(item.variant_id)
      : null;

    let resolvedProductName =
      nameFromItem || nameFromDraft || nameFromProduct || "Produto";
    if (
      nameFromVariant &&
      !resolvedProductName.toLowerCase().includes(nameFromVariant.toLowerCase())
    ) {
      resolvedProductName = `${resolvedProductName} (${nameFromVariant})`;
    }

    return {
      order_id: createdOrderId,
      product_id: item.product_id || null,
      variant_id: item.variant_id || null,
      product_name: resolvedProductName,
      product_price: safeMoney(Number(item.unit_price || 0)),
      quantity: Number(item.quantity || 0),
      subtotal: safeMoney(Number(item.subtotal || 0)),
      sort_order: index,
      is_gift: Boolean(item.is_gift),
      original_price:
        item.original_price != null ? Number(item.original_price) : null,
      is_promotional: Boolean(item.is_promotional),
      promotion_id: item.promotion_id || null,
      unit_cost: unitCost,
    };
  });

  if (orderItems.length > 0) {
    const { error: itemsErr } = await admin
      .from("order_items")
      .insert(orderItems);
    if (itemsErr) {
      console.error(
        "[syncPosSaleToOrders] order_items insert failed:",
        itemsErr.message,
        itemsErr,
      );
      await admin
        .from("orders")
        .delete()
        .eq("id", createdOrderId)
        .eq("partner_id", params.partnerId);
      return null;
    }
  }

  if (params.preSaleId) {
    await admin
      .from("pre_sales")
      .update({
        order_id: createdOrderId,
        status: "completed",
      })
      .eq("id", params.preSaleId)
      .eq("partner_id", params.partnerId);
  }

  await logAuditEvent({
    partnerId: params.partnerId,
    actorUserId: params.actorUserId,
    entityType: "order",
    entityId: createdOrderId,
    actionType: "created",
    changeLines: [
      `Criou a venda no PDV (${finalOrderNumber}) no valor de R$ ${safeMoney(Number(sale.final_amount || 0)).toFixed(2)}.`,
    ],
    source: "erp",
    storeId: params.storeId || null,
  });

  return createdOrderId;
}

function inputPaymentMethodLabel(paymentMethod?: string | null) {
  return String(paymentMethod || "").trim() || "PDV";
}
export async function getPOSInitialDataAction(
  partnerId: string,
  storeId?: string | null,
) {
  await requireUser();
  await requirePermission(partnerId, "pdv", "view");

  // Read with admin client after authz so invited users can load POS datasets.
  const supabase = createAdminClient();

  let draftsQuery = supabase
    .from("pre_sales")
    .select(
      "id, customer_id, subtotal, discount_amount, total_amount, shipping_fee, other_costs, notes, status, items, created_at, updated_at, coupon_id, coupon_code, coupon_discount_amount",
    )
    .eq("partner_id", partnerId)
    .eq("status", "draft");
  if (storeId) {
    draftsQuery = draftsQuery.eq("store_id", storeId);
  }
  const draftsPromise = draftsQuery
    .order("created_at", { ascending: false })
    .limit(20);

  let accountsQuery = supabase
    .from("finance_accounts")
    .select("id, name, type, is_default, is_active")
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .eq("type", "cash");
  if (storeId) {
    accountsQuery = accountsQuery.eq("store_id", storeId);
  } else {
    accountsQuery = accountsQuery.is("store_id", null);
  }
  const accountsPromise = accountsQuery.order("is_default", {
    ascending: false,
  });

  const customersPromise = supabase
    .from("customers")
    .select("id, name, image_url")
    .eq("partner_id", partnerId)
    .order("name")
    .limit(120);

  const paymentMethodsPromise = supabase
    .from("payment_methods")
    .select(
      "id, name, type, is_default, is_active, fee_percent, discount_percent, priority, store_id",
    )
    .eq("partner_id", partnerId)
    .eq("is_active", true)
    .order("is_default", { ascending: false })
    .order("priority", { ascending: false })
    .order("name");

  const catalogPromise = storeId
    ? Promise.all([
        listStoreProducts(partnerId, storeId, {
          isActive: true,
          includeVariants: true,
        }),
        listStoreServices(partnerId, storeId, { isActive: true }).catch(
          () => [],
        ),
      ]).then(([pList, sList]) => ({
        products: pList || [],
        rawServices: sList || [],
        error: null,
      }))
    : Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, sku, price, promotional_price, category:product_categories!category_id(id, name), stock_available, min_stock, allow_sell_without_stock, images, product_type, has_variants, technical_specs, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)",
          )
          .eq("partner_id", partnerId)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(150),
        supabase
          .from("services")
          .select(
            "id, name, service_name, sku, price, promotional_price, category:service_categories!category_id(id, name), images, status, is_active",
          )
          .eq("partner_id", partnerId)
          .or("status.eq.ativo,is_active.eq.true")
          .order("created_at", { ascending: false })
          .limit(150),
      ]).then(([productsRes, servicesRes]) => ({
        products: productsRes.data || [],
        rawServices: servicesRes.error ? [] : servicesRes.data || [],
        error: productsRes.error ? productsRes.error.message : null,
      }));

  const [catalogRes, draftsRes, customersRes, accountsRes, paymentMethodsRes] =
    await Promise.all([
      catalogPromise,
      draftsPromise,
      customersPromise,
      accountsPromise,
      paymentMethodsPromise,
    ]);

  if (catalogRes.error)
    return { success: false as const, error: catalogRes.error };
  let products: any[] = catalogRes.products;
  let rawServices: any[] = catalogRes.rawServices;

  const formattedProducts = (products || []).map((p: any) => {
    const rawVariants =
      Array.isArray(p.product_variants) && p.product_variants.length > 0
        ? p.product_variants
        : Array.isArray(p.variants)
          ? p.variants
          : [];

    const normalizedVariants = rawVariants.map((v: any) => ({
      id: String(v.id),
      variant_name: String(v.variant_name || v.name || "Variação"),
      sku: v.sku || null,
      price_adjustment: Number(v.price_adjustment || 0),
      stock_available: Number(
        v.stock_available ?? v.stock_quantity ?? v.resolved_stock_quantity ?? 0,
      ),
      variant_options: v.variant_options || null,
      price:
        v.price !== undefined
          ? Number(v.price)
          : Number(p.price || 0) + Number(v.price_adjustment || 0),
    }));

    const hasVariants =
      normalizedVariants.length > 0 || Boolean(p.has_variants);
    const totalStock =
      hasVariants && normalizedVariants.length > 0
        ? normalizedVariants.reduce(
            (sum: number, v: any) => sum + Number(v.stock_available || 0),
            0,
          )
        : Number(
            p.stock_available ??
              p.stock_quantity ??
              p.resolved_stock_quantity ??
              0,
          );

    const addonGroups =
      Array.isArray(p.addon_groups) && p.addon_groups.length > 0
        ? p.addon_groups
        : Array.isArray(p.technical_specs?.addon_groups) &&
            p.technical_specs.addon_groups.length > 0
          ? p.technical_specs.addon_groups
          : [];

    const categoryObj =
      p.category && typeof p.category === "object"
        ? p.category
        : p.category
          ? { id: p.category_id || "cat", name: String(p.category) }
          : null;

    return {
      ...p,
      id: String(p.id),
      name: String(p.name || "Produto"),
      category: categoryObj,
      sku: p.sku || null,
      gtin: p.gtin || null,
      price: Number(p.price || 0),
      promotional_price:
        p.promotional_price != null ? Number(p.promotional_price) : null,
      stock_available: totalStock,
      min_stock: p.min_stock != null ? Number(p.min_stock) : null,
      allow_sell_without_stock: Boolean(p.allow_sell_without_stock),
      images: Array.isArray(p.images)
        ? p.images
        : p.image_url
          ? [p.image_url]
          : null,
      product_type: p.product_type || "product",
      has_variants: hasVariants,
      product_variants: normalizedVariants,
      variants: normalizedVariants,
      addon_groups: addonGroups,
      technical_specs: p.technical_specs || null,
    };
  });

  const formattedServices = (rawServices || []).map((s: any) => {
    const categoryName =
      typeof s.category === "string"
        ? s.category
        : s.category?.name || "Serviços";
    const categoryId = s.category_id || s.category?.id || "service_cat";
    return {
      id: s.id,
      name: String(s.name || s.service_name || "Serviço").trim(),
      category: { id: categoryId, name: categoryName },
      sku: s.sku || null,
      price: Number(s.price || s.resolved_price || 0),
      promotional_price:
        s.promotional_price != null ? Number(s.promotional_price) : null,
      stock_available: 999999,
      min_stock: 0,
      allow_sell_without_stock: true,
      images: Array.isArray(s.images)
        ? s.images
        : s.image_url
          ? [s.image_url]
          : null,
      product_type: "service",
      product_variants: [],
      variants: [],
      addon_groups: [],
      has_variants: false,
    };
  });

  products = [...formattedProducts, ...formattedServices];

  const rawMethods = paymentMethodsRes.error
    ? []
    : paymentMethodsRes.data || [];
  const filteredMethods = storeId
    ? rawMethods.filter((m: any) => !m.store_id || m.store_id === storeId)
    : rawMethods.filter((m: any) => !m.store_id);

  return {
    success: true as const,
    data: {
      products,
      customers: customersRes.error
        ? []
        : (customersRes.data || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            avatar_url: c.image_url || null,
          })),
      financeAccounts: accountsRes.error ? [] : accountsRes.data || [],
      preSales: draftsRes.error ? [] : draftsRes.data || [],
      paymentMethods: filteredMethods,
    },
  };
}

export async function upsertPreSaleDraftAction(input: DraftUpsertInput) {
  let user: any = null;
  try {
    user = await requireUser();
    await requirePermission(input.partnerId, "pdv", "sell");

    // Validate discount permission if a discount or coupon is being applied
    if (input.discountAmount > 0 || input.couponCode || input.couponId) {
      await requirePermission(input.partnerId, "pdv", "can_apply_discount");
    }
  } catch (err: any) {
    if (err instanceof ForbiddenError || err?.name === "ForbiddenError") {
      return { success: false as const, error: err.message };
    }
    throw err;
  }

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL);
  if (!rl.success)
    return { success: false as const, error: rl.error || "Muitas tentativas." };

  const supabase = createAdminClient();

  const normalizedItemsResult = normalizeDraftItems(input.items);
  if ("error" in normalizedItemsResult)
    return { success: false as const, error: normalizedItemsResult.error };
  const normalizedItems = normalizedItemsResult.items;

  const subtotalFromItems = computeSubtotal(normalizedItems);
  const subtotal = subtotalFromItems;
  const discountAmount = safeMoney(
    Math.min(Math.max(0, input.discountAmount), subtotalFromItems),
  );

  // Validate max discount percent configured for partner
  if (discountAmount > 0) {
    const { getSalesSettingsAction } =
      await import("@/app/actions/erp/sales-settings");
    const salesSettingsResult = await getSalesSettingsAction(input.partnerId);
    if (
      salesSettingsResult.success &&
      salesSettingsResult.data.maxDiscountPercent !== null &&
      salesSettingsResult.data.maxDiscountPercent < 100
    ) {
      const effectiveDiscountPercent =
        subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;
      if (
        effectiveDiscountPercent >
        salesSettingsResult.data.maxDiscountPercent + 0.05
      ) {
        const { logPolicyLimitExceeded } =
          await import("@/lib/auth/auth-logger");
        logPolicyLimitExceeded({
          userId: user?.id,
          partnerId: input.partnerId,
          policy: "maxDiscountPercent",
          attemptedValue: `${effectiveDiscountPercent.toFixed(1)}%`,
          allowedLimit: `${salesSettingsResult.data.maxDiscountPercent}%`,
          details: { subtotal, discountAmount },
        });
        return {
          success: false as const,
          error: `O desconto de ${effectiveDiscountPercent.toFixed(1)}% ultrapassa o limite máximo permitido (${salesSettingsResult.data.maxDiscountPercent}%) configurado para as vendas da empresa.`,
        };
      }
    }
  }

  const shippingFee = safeMoney(input.shippingFee ?? 0);
  const otherCosts = safeMoney(input.otherCosts ?? 0);
  const {
    listActivePromotionsForMarketplaceAction,
    filterRawPromotionsByGiftStock,
  } = await import("@/app/actions/shared/promotions");
  const rawPromotions = await listActivePromotionsForMarketplaceAction(
    input.partnerId,
    input.customerId || null,
  );
  const filteredPromotions = await filterRawPromotionsByGiftStock(
    rawPromotions,
    supabase,
  );

  const pricingResult = calculateOrderPricing({
    items: normalizedItems.map((item) => ({
      productId: item.product_id || null,
      unitPrice: Number(item.unit_price || 0),
      quantity: Number(item.quantity || 0),
      basePrice:
        item.list_unit_price != null
          ? Number(item.list_unit_price)
          : Number(item.unit_price || 0),
      isManualPrice: item.is_manual_price,
    })),
    shippingCost: shippingFee,
    additionalCosts: otherCosts,
    manualDiscount:
      discountAmount > 0 ? { type: "fixed", value: discountAmount } : null,
    coupon: null,
    promotions: filteredPromotions,
  });
  const totalAmount = safeMoney(pricingResult.finalTotal);

  const giftIds = pricingResult.appliedGiftProductIds || [];
  if (giftIds.length > 0) {
    const [productsRes, servicesRes] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, price, images")
        .in("id", giftIds),
      supabase
        .from("services")
        .select("id, name, price, images")
        .in("id", giftIds),
    ]);
    const giftProducts = productsRes.data || [];
    const giftServices = servicesRes.data || [];

    for (const giftId of giftIds) {
      const promo = filteredPromotions.find(
        (p) => p.giftProductId === giftId || p.giftServiceId === giftId,
      );
      if (!promo) continue;

      const prod = giftProducts.find((p: any) => p.id === giftId);
      if (prod) {
        normalizedItems.push({
          product_id: prod.id,
          service_id: null,
          variant_id: null,
          variant_name: null,
          name: `[BRINDE] ${prod.name}`,
          quantity: 1,
          unit_price: 0,
          total_price: 0,
          image:
            prod.images && Array.isArray(prod.images) && prod.images[0]
              ? prod.images[0]
              : null,
          list_unit_price: null,
          line_discount_type: null,
          line_discount_value: null,
          is_gift: true,
          original_price: Number(prod.price || 0),
          is_promotional: true,
          promotion_id: promo.id,
          is_manual_price: false,
          allow_sell_without_stock: false,
        });
      } else {
        const serv = giftServices.find((s: any) => s.id === giftId);
        if (serv) {
          normalizedItems.push({
            product_id: null,
            service_id: serv.id,
            variant_id: null,
            variant_name: null,
            name: `[BRINDE] ${serv.name}`,
            quantity: 1,
            unit_price: 0,
            total_price: 0,
            image:
              serv.images && Array.isArray(serv.images) && serv.images[0]
                ? serv.images[0]
                : null,
            list_unit_price: null,
            line_discount_type: null,
            line_discount_value: null,
            is_gift: true,
            original_price: Number(serv.price || 0),
            is_promotional: true,
            promotion_id: promo.id,
            is_manual_price: false,
            allow_sell_without_stock: false,
          });
        }
      }
    }
  }

  if (normalizedItems.length === 0)
    return {
      success: false as const,
      error: "Não é possível salvar pré-venda sem itens.",
    };
  if (
    discountAmount < 0 ||
    totalAmount < 0 ||
    shippingFee < 0 ||
    otherCosts < 0
  ) {
    return {
      success: false as const,
      error: "Valores negativos não são permitidos.",
    };
  }

  const payload: Record<string, unknown> = {
    partner_id: input.partnerId,
    store_id: input.storeId || null,
    customer_id: input.customerId || null,
    items: normalizedItems,
    subtotal,
    discount_amount: discountAmount,
    total_amount: totalAmount,
    notes: sanitizeNotes(input.notes),
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  payload.shipping_fee = shippingFee;
  payload.distance_km =
    input.distanceKm == null ? null : Number(input.distanceKm);
  payload.delivery_breakdown = input.deliveryBreakdown || null;
  payload.other_costs = otherCosts;
  payload.coupon_id = input.couponId || null;
  payload.coupon_code = input.couponCode || null;
  payload.coupon_discount_amount = safeMoney(input.couponDiscountAmount ?? 0);

  if (input.preSaleId) {
    const { data, error } = await supabase
      .from("pre_sales")
      .update(payload)
      .eq("id", input.preSaleId)
      .eq("partner_id", input.partnerId)
      .eq("status", "draft")
      .select("*")
      .single();
    if (error) return { success: false as const, error: error.message };
    return { success: true as const, data };
  }

  const { data, error } = await supabase
    .from("pre_sales")
    .insert(payload)
    .select("*")
    .single();
  if (error) return { success: false as const, error: error.message };

  return { success: true as const, data };
}

export async function deletePreSaleDraftAction(
  partnerId: string,
  preSaleId: string,
  storeId?: string | null,
) {
  await requireUser();
  await requirePermission(partnerId, "pdv", "view");
  if (storeId) {
    await requireStoreAccess(storeId, partnerId);
  }
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("pre_sales")
    .delete()
    .eq("id", preSaleId)
    .eq("partner_id", partnerId)
    .eq("status", "draft");

  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
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
  let user: any = null;
  try {
    user = await requireUser();
    await requirePermission(input.partnerId, "pdv", "sell");
    if (input.storeId) {
      await requireStoreAccess(input.storeId, input.partnerId);
    }
  } catch (err: any) {
    if (err instanceof ForbiddenError || err?.name === "ForbiddenError") {
      return { success: false as const, error: err.message };
    }
    throw err;
  }

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL);
  if (!rl.success)
    return { success: false as const, error: rl.error || "Muitas tentativas." };

  const supabase = createAdminClient();

  const paidAmount = safeMoney(Number(input.paidAmount || 0));

  // A new POS cart can be finalized directly. Existing saved drafts still
  // use the persisted pre-sale as the source of truth and remain idempotent.
  let preSaleDraft: any = null;
  if (input.draft) {
    preSaleDraft = {
      status: "draft",
      customer_id: input.draft.customerId || null,
      items: input.draft.items || [],
      subtotal: input.draft.subtotal,
      discount_amount: input.draft.discountAmount,
      total_amount: input.draft.totalAmount,
      shipping_fee: input.draft.shippingFee || 0,
      other_costs: input.draft.otherCosts || 0,
      notes: input.draft.notes || null,
      delivery_breakdown: input.draft.deliveryBreakdown || null,
      coupon_id: input.draft.couponId || null,
      coupon_code: input.draft.couponCode || null,
      coupon_discount_amount: input.draft.couponDiscountAmount || 0,
    };
  } else if (input.preSaleId) {
    const { data } = await supabase
      .from("pre_sales")
      .select("*")
      .eq("id", input.preSaleId)
      .eq("partner_id", input.partnerId)
      .maybeSingle();
    preSaleDraft = data;
  }

  if (!preSaleDraft) {
    return {
      success: false as const,
      error: "Carrinho ou pré-venda não encontrado.",
    };
  }

  if (!input.preSaleId && input.checkoutId) {
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("id", input.checkoutId)
      .eq("partner_id", input.partnerId)
      .maybeSingle();
    if (existingOrder) {
      return {
        success: true as const,
        data: {
          saleId: existingOrder.id,
          saleNumber: existingOrder.order_number,
          orderId: existingOrder.id,
        },
      };
    }
  }

  if (
    input.preSaleId &&
    preSaleDraft.status === "completed" &&
    preSaleDraft.order_id
  ) {
    // Idempotent: return existing order if already completed
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, order_number")
      .eq("id", preSaleDraft.order_id)
      .maybeSingle();
    if (existingOrder) {
      return {
        success: true as const,
        data: {
          saleId: existingOrder.id,
          saleNumber: existingOrder.order_number,
          orderId: existingOrder.id,
        },
      };
    }
  }

  // Validate discount permission if pre-sale has a discount or coupon applied
  const hasDiscount = Number(preSaleDraft.discount_amount || 0) > 0;
  const hasCoupon = !!preSaleDraft.coupon_id || !!preSaleDraft.coupon_code;
  if (hasDiscount || hasCoupon) {
    try {
      await requirePermission(input.partnerId, "pdv", "can_apply_discount");
    } catch (err: any) {
      if (err instanceof ForbiddenError || err?.name === "ForbiddenError") {
        return { success: false as const, error: err.message };
      }
      throw err;
    }

    // Validate max discount percent configured in sales settings
    const { getSalesSettingsAction } =
      await import("@/app/actions/erp/sales-settings");
    const salesSettingsResult = await getSalesSettingsAction(input.partnerId);
    if (
      salesSettingsResult.success &&
      salesSettingsResult.data.maxDiscountPercent !== null &&
      salesSettingsResult.data.maxDiscountPercent < 100
    ) {
      const subtotal = Math.max(0, Number(preSaleDraft.subtotal || 0));
      const totalDiscount =
        Math.max(0, Number(preSaleDraft.discount_amount || 0)) +
        Number(preSaleDraft.coupon_discount_amount || 0);
      const effectiveDiscountPercent =
        subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;
      if (
        effectiveDiscountPercent >
        salesSettingsResult.data.maxDiscountPercent + 0.05
      ) {
        const { logPolicyLimitExceeded } =
          await import("@/lib/auth/auth-logger");
        logPolicyLimitExceeded({
          userId: user?.id,
          partnerId: input.partnerId,
          storeId: input.storeId,
          policy: "maxDiscountPercent",
          attemptedValue: `${effectiveDiscountPercent.toFixed(1)}%`,
          allowedLimit: `${salesSettingsResult.data.maxDiscountPercent}%`,
          details: {
            subtotal,
            discountAmount: preSaleDraft.discount_amount,
            totalDiscount,
          },
        });
        return {
          success: false as const,
          error: `O desconto de ${effectiveDiscountPercent.toFixed(1)}% ultrapassa o limite máximo permitido (${salesSettingsResult.data.maxDiscountPercent}%) configurado para as vendas da empresa.`,
        };
      }
    }
  }

  const capabilities = await getPartnerCapabilities(input.partnerId, {
    storeId: input.storeId,
  });

  // Start this independent check before validating the finance account so
  // the two database calls overlap.
  const activeSessionPromise = capabilities.hasFinancial
    ? getActiveCashSessionAction(input.partnerId, input.storeId)
    : Promise.resolve({ success: true as const, data: null });

  // Validate finance account
  if (capabilities.hasFinancial && input.financeAccountId) {
    const { data: acc } = await supabase
      .from("finance_accounts")
      .select("id")
      .eq("id", input.financeAccountId)
      .eq("partner_id", input.partnerId)
      .eq("is_active", true)
      .maybeSingle();
    if (!acc?.id)
      return {
        success: false as const,
        error: "Conta financeira inválida ou inativa.",
      };
  }

  // Require open cash session only if financial module is enabled
  const activeSessionResult = await activeSessionPromise;
  if (capabilities.hasFinancial) {
    if (!activeSessionResult.success) {
      return {
        success: false as const,
        error: "Não foi possível validar o caixa aberto.",
      };
    }
    if (!activeSessionResult.data?.id) {
      return {
        success: false as const,
        error: "Abra um caixa para finalizar vendas no PDV.",
      };
    }
  }

  // Build payment breakdown
  const resolvedBreakdown: Array<{
    method: string;
    amount: number;
    amountReceived: number;
    paymentMethodId: string | null;
    payment_method_id: string | null;
    installmentNumber?: number;
    wantsChange?: boolean;
    payWithAmount?: number;
  }> = [];
  for (const entry of input.paymentBreakdown || []) {
    const amount = safeMoney(Number(entry.amount || 0));
    if (amount <= 0) continue;
    const paymentMethodId = entry.paymentMethodId || null;
    if (!paymentMethodId) {
      return {
        success: false as const,
        error: `Método de pagamento inválido no PDV (${String(entry.method || "não informado")}). Selecione um método ativo e tente novamente.`,
      };
    }
    const methodLabel =
      String(entry.method || input.paymentMethod || "PDV").trim() || "PDV";
    const explicitReceived = Number((entry as any).amountReceived || 0);
    const payWith = Number((entry as any).payWithAmount || 0);
    const receivedValue =
      explicitReceived > 0.005
        ? explicitReceived
        : payWith > 0.005
          ? payWith
          : amount;
    resolvedBreakdown.push({
      method: methodLabel,
      amount,
      amountReceived: receivedValue,
      wantsChange: entry.wantsChange || undefined,
      payWithAmount:
        entry.payWithAmount != null
          ? safeMoney(Number(entry.payWithAmount))
          : undefined,
      paymentMethodId,
      payment_method_id: paymentMethodId,
      installmentNumber: Math.max(
        1,
        Math.floor(Number(entry.installmentNumber || 1)),
      ),
    });
  }

  let breakdownForOrder = resolvedBreakdown;
  const paymentAwarePromise = resolvePosFinalTotalWithPaymentMethod({
    supabase,
    partnerId: input.partnerId,
    storeId: input.storeId,
    preSaleId: input.preSaleId,
    baseTotal: Math.max(0, Number(preSaleDraft.total_amount || 0)),
    paymentBreakdown: resolvedBreakdown,
  });
  const customerNamePromise = preSaleDraft.customer_id
    ? supabase
        .from("customers")
        .select("name")
        .eq("id", preSaleDraft.customer_id)
        .eq("partner_id", input.partnerId)
        .maybeSingle()
    : Promise.resolve({ data: null });
  const [paymentAware, customerNameResult] = await Promise.all([
    paymentAwarePromise,
    customerNamePromise,
  ]);
  if (
    paymentAware &&
    paymentAware.ok &&
    (paymentAware.adjustedBreakdown || []).length > 0
  ) {
    const resolvedBreakdownByMethod = new Map(
      resolvedBreakdown.map((r, i) => [i, r]),
    );
    breakdownForOrder = paymentAware.adjustedBreakdown.map(
      (row: any, i: number) => {
        const source = resolvedBreakdownByMethod.get(i) || row;
        return {
          method: row.method,
          amount: safeMoney(Number(row.amount || 0)),
          amountReceived: safeMoney(
            Number(
              row.amountReceived ?? source.amountReceived ?? row.amount ?? 0,
            ),
          ),
          adjustmentType: row.adjustmentType || "none",
          adjustmentPercent: Math.max(0, Number(row.adjustmentPercent || 0)),
          adjustmentAmount: Math.max(0, Number(row.adjustmentAmount || 0)),
          effectiveAmount: safeMoney(
            Number(row.effectiveAmount ?? row.amount ?? 0),
          ),
          netAmount: safeMoney(
            Number(row.netAmount ?? row.effectiveAmount ?? row.amount ?? 0),
          ),
          feeBearer: row.feeBearer || null,
          installmentFeeBearer: row.installmentFeeBearer || null,
          paymentMethodDiscountAmount: Math.max(
            0,
            Number(row.paymentMethodDiscountAmount || 0),
          ),
          interestAmount: Math.max(0, Number(row.interestAmount || 0)),
          installmentCostAmount: Math.max(
            0,
            Number(row.installmentCostAmount || 0),
          ),
          feeAmount: Math.max(0, Number(row.feeAmount || 0)),
          fixedFeeAmount: Math.max(0, Number(row.fixedFeeAmount || 0)),
          paymentMethodId: row.paymentMethodId || null,
          payment_method_id: row.paymentMethodId || null,
          installmentNumber: Math.max(
            1,
            Math.floor(Number(row.installmentNumber || 1)),
          ),
          wantsChange: source.wantsChange || undefined,
          payWithAmount:
            source.payWithAmount != null
              ? Number(source.payWithAmount)
              : undefined,
        };
      },
    );
  }

  const totalPaidAmount =
    breakdownForOrder.length > 0
      ? safeMoney(
          breakdownForOrder.reduce(
            (acc, row) =>
              acc + Number((row as any).amountReceived ?? row.amount ?? 0),
            0,
          ),
        )
      : paidAmount;

  const totalSaleTarget = safeMoney(Number(preSaleDraft.total_amount || 0));
  const isUnderpaid = totalPaidAmount < totalSaleTarget - 0.005;
  const derivedPaymentStatus: "paid" | "partially_paid" | "unpaid" =
    totalPaidAmount <= 0.005
      ? "unpaid"
      : isUnderpaid
        ? "partially_paid"
        : "paid";

  // Customer name lookup if customer_id is provided
  const customerName: string | undefined =
    customerNameResult.data?.name?.trim() || undefined;

  const hasShipping = Number(preSaleDraft.shipping_fee || 0) > 0;
  let finalDeliveryStatus: "delivered" | "preparing" | "pickup_available" =
    hasShipping ? "preparing" : "delivered";
  if (input.isPendingDelivery) {
    finalDeliveryStatus = hasShipping ? "preparing" : "pickup_available";
  }

  // Map draft items to ERPItemPayload
  const draftItemsList = Array.isArray(preSaleDraft.items)
    ? preSaleDraft.items
    : [];
  const erpItems: import("./orders").ERPItemPayload[] = draftItemsList.map(
    (item: any, index: number) => {
      const isService = Boolean(
        item.service_id ||
        item.serviceId ||
        item.line_type === "service_booking" ||
        item.line_type === "service",
      );
      const addons = Array.isArray(item.selectedAddons)
        ? item.selectedAddons
        : [];
      const addonsText = addons
        .map((a: any) => a.optionName || a.name)
        .filter(Boolean)
        .join(", ");
      const variantText = item.variant_name || item.variantName || null;
      let computedCustomName = item.customName || item.name || undefined;
      if (addonsText) {
        computedCustomName = `${computedCustomName || "Item"} (+ ${addonsText})`;
      }

      return {
        productId: isService
          ? undefined
          : item.product_id || item.productId || undefined,
        serviceId:
          item.service_id ||
          item.serviceId ||
          (isService ? item.product_id || item.productId : undefined),
        lineType:
          item.line_type ||
          item.lineType ||
          (isService ? "service_booking" : "product"),
        variantId: item.variant_id || item.variantId || undefined,
        customName: computedCustomName,
        unitPrice: safeMoney(Number(item.unit_price ?? item.price ?? 0)),
        quantity: Math.max(
          1,
          Math.floor(Number(item.quantity ?? item.qty ?? 1)),
        ),
        sortOrder: index,
        allowSellWithoutStock: Boolean(
          item.allow_sell_without_stock || item.allowSellWithoutStock,
        ),
      };
    },
  );

  const { createERPOrderAction } = await import("./orders");
  const orderResult = await createERPOrderAction({
    id: !input.preSaleId ? input.checkoutId || undefined : undefined,
    partnerId: input.partnerId,
    storeId: input.storeId || undefined,
    customerId: preSaleDraft.customer_id || undefined,
    customerName: customerName || "Consumidor final",
    salesChannel: "Presencial",
    deliveryMethod: hasShipping ? "delivery" : "pickup",
    deliveryStatus: finalDeliveryStatus,
    paymentStatus: derivedPaymentStatus,
    paidAmount: totalPaidAmount,
    totalAmount: totalSaleTarget,
    paymentMethod: input.paymentMethod || "PDV",
    paymentBreakdown: breakdownForOrder as any,
    financeAccountId: input.financeAccountId || null,
    items: erpItems,
    subtotal: safeMoney(Number(preSaleDraft.subtotal || 0)),
    discountValue: safeMoney(Number(preSaleDraft.discount_amount || 0)),
    discountType: "fixed",
    couponCode: preSaleDraft.coupon_code || undefined,
    couponId: preSaleDraft.coupon_id || undefined,
    couponDiscountAmount: safeMoney(
      Number(preSaleDraft.coupon_discount_amount || 0),
    ),
    shippingCost: safeMoney(Number(preSaleDraft.shipping_fee || 0)),
    additionalCosts: safeMoney(Number(preSaleDraft.other_costs || 0)),
    deliveryBreakdown: preSaleDraft.delivery_breakdown || null,
    notes: preSaleDraft.notes || undefined,
    skipCSRF: true,
    sellerPartnerUserId: input.sellerId || null,
    skipPostPaymentSellerSideEffects: true,
    skipPostCreateRevalidation: true,
  });

  if (orderResult.error || !orderResult.orderId) {
    return {
      success: false as const,
      error: orderResult.error || "Falha ao criar pedido no PDV.",
    };
  }

  const orderId = orderResult.orderId;
  const orderNumber = orderResult.orderNumber || orderId;

  // Mark pre_sale as completed. It is independent from cash, commission and
  // goals now that the order id exists, so start it without blocking them.
  const preSaleCompletionPromise = input.preSaleId
    ? supabase
        .from("pre_sales")
        .update({
          status: "completed",
          order_id: orderId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.preSaleId)
        .eq("partner_id", input.partnerId)
    : Promise.resolve();

  // These post-sale side effects are independent after the order exists.
  // Start them together so the slowest one, rather than their sum, determines
  // the remaining time shown by the PDV.
  const cashMovementsPromise =
    capabilities.hasFinancial &&
    activeSessionResult.data?.id &&
    breakdownForOrder.length > 0
      ? supabase.from("cash_movements").insert(
          breakdownForOrder.map((entry) => ({
            partner_id: input.partnerId,
            store_id: input.storeId || null,
            cash_session_id: activeSessionResult.data!.id,
            type: "sale",
            description: `Venda PDV ${orderNumber}`,
            amount: entry.amount,
            payment_method_id:
              entry.payment_method_id || entry.paymentMethodId || null,
            created_by_user_id: user.id,
            reference_id: orderId,
          })),
        )
      : Promise.resolve();

  // Seller commission
  const sellerPartnerUserId = input.sellerId || null;
  const sellerCommissionPromise =
    capabilities.hasProductivity && sellerPartnerUserId
      ? createCommissionExpenseForEntity({
          supabase,
          partnerId: input.partnerId,
          storeId: input.storeId || null,
          partnerUserId: sellerPartnerUserId,
          role: "seller",
          saleAmount: totalPaidAmount,
          entityType: "sale",
          entityId: orderId,
          accountId: input.financeAccountId || null,
          createdByUserId: user.id,
        })
      : Promise.resolve();

  // Goals tracking
  const goalsPromise =
    capabilities.hasGoals && user.id
      ? applySaleToGoals({
          supabase,
          partnerId: input.partnerId,
          sellerUserId: user.id,
          saleAmount: totalPaidAmount,
          createdByUserId: user.id,
          accountId: input.financeAccountId || null,
        })
      : Promise.resolve();

  // Record coupon usage if coupon was applied
  const couponUsagePromise =
    capabilities.hasCoupons && preSaleDraft.coupon_id && orderId
      ? supabase.from("coupon_usages").upsert(
          {
            coupon_id: preSaleDraft.coupon_id,
            customer_id: preSaleDraft.customer_id || null,
            order_id: orderId,
          },
          { onConflict: "coupon_id,order_id", ignoreDuplicates: true },
        )
      : Promise.resolve();

  // Invalidate product & order caches asynchronously in background (non-blocking for PDV response)
  const productIds = new Set<string>(
    erpItems.map((item) => item.productId).filter(Boolean) as string[],
  );
  Promise.all([
    ...Array.from(productIds).map((productId) =>
      invalidateProductCache(productId, input.partnerId, "update", {
        silent: true,
      }),
    ),
    revalidateOrders(input.partnerId),
    revalidateTransactions(input.partnerId),
    revalidateStockMovements(input.partnerId),
  ]).catch((err) => {
    console.error(
      "[finalizePreSaleAction] Background cache invalidation error:",
      err,
    );
  });

  await Promise.all([
    cashMovementsPromise,
    sellerCommissionPromise,
    goalsPromise,
    preSaleCompletionPromise,
    couponUsagePromise,
  ]);

  return {
    success: true as const,
    data: { saleId: orderId, saleNumber: orderNumber, orderId },
  };
}

export async function createPOSQuickProductAction(input: {
  partnerId: string;
  name: string;
  price: number;
  stockQuantity: number;
  storeId?: string | null;
}) {
  await requireUser();
  await requirePermission(input.partnerId, "products", "create");

  const capabilities = await getPartnerCapabilities(input.partnerId, {
    storeId: input.storeId,
  });
  if (!capabilities.hasProducts) {
    return {
      success: false as const,
      error:
        "O recurso de catálogo de produtos não está ativo nas configurações.",
    };
  }

  const limitCheck = await checkLimit(input.partnerId, "items");
  if (!limitCheck.allowed) {
    return {
      success: false as const,
      error:
        limitCheck.message ||
        "Limite de itens do catálogo atingido para o seu plano.",
    };
  }

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL);
  if (!rl.success)
    return { success: false as const, error: rl.error || "Muitas tentativas." };

  const name = String(input.name || "").trim();
  const price = safeMoney(Number(input.price || 0));
  const stockQuantity = Math.max(
    0,
    Math.floor(Number(input.stockQuantity || 0)),
  );

  if (!name)
    return { success: false as const, error: "Informe o nome do produto." };
  if (price < 0) return { success: false as const, error: "Preço inválido." };
  if (stockQuantity < 0)
    return { success: false as const, error: "Estoque inválido." };

  const supabase = createAdminClient();

  // Resolve store for the product: use explicit storeId or fall back to first store
  let targetStoreId = input.storeId || null;
  if (!targetStoreId) {
    const { data: store } = await supabase
      .from("stores")
      .select("id")
      .eq("partner_id", input.partnerId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    targetStoreId = store?.id || null;
  }

  if (!targetStoreId) {
    return {
      success: false as const,
      error: "Nenhuma loja encontrada para cadastrar o produto.",
    };
  }

  // Validate user has access to the target store
  if (targetStoreId) {
    const { userHasStoreAccess } = await import("@/lib/store-members");
    const hasAccess = await userHasStoreAccess(input.partnerId, targetStoreId);
    if (!hasAccess) {
      return {
        success: false as const,
        error: "Você não tem acesso a esta loja.",
      };
    }
  }

  const skuBase = generateSKUBase(name);
  const sku = `${skuBase}-${Date.now().toString().slice(-5)}`;

  const { data: product, error } = await supabase
    .from("products")
    .insert({
      partner_id: input.partnerId,
      store_id: targetStoreId,
      name,
      sku,
      price,
      stock_quantity: stockQuantity,
      status: "ativo",
      allow_sell_without_stock: false,
    })
    .select(
      "id, name, category, sku, price, stock_available, allow_sell_without_stock, images, product_variants(id, variant_name, sku, price_adjustment, stock_available, variant_options)",
    )
    .single();

  if (error) return { success: false as const, error: error.message };

  return { success: true as const, data: product };
}

export async function createPOSCustomerQuickAction(input: {
  partnerId: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  address?: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
}) {
  await requireUser();
  await requirePermission(input.partnerId, "customers", "create");

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL);
  if (!rl.success)
    return { success: false as const, error: rl.error || "Muitas tentativas." };

  const name = sanitizeInput(String(input.name || ""), 150).trim();
  const email = String(input.email || "")
    .trim()
    .toLowerCase();
  const phone = String(input.phone || "").trim();
  const cpfDigits = String(input.cpf || "").replace(/\D/g, "");

  if (!name)
    return { success: false as const, error: "Informe o nome do cliente." };

  // Check for existing customer before creating
  if (email || cpfDigits) {
    const { findExistingCustomer } =
      await import("@/lib/services/marketplace-customer");
    const match = await findExistingCustomer({
      partnerId: input.partnerId,
      email: email || null,
      cpf: cpfDigits || null,
    });
    if (match) {
      return {
        success: false as const,
        error: `Já existe cliente com este ${match.matchBy === "email" ? "e-mail" : "CPF"}: "${match.customer.name}".`,
        existingCustomerId: match.customer.id,
      };
    }
  }

  const supabase = createAdminClient();
  let encryptedCpf: string | null = null;
  if (cpfDigits) {
    const { encryptCPF } = await import("@/lib/crypto");
    encryptedCpf = await encryptCPF(cpfDigits);
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
    .single();

  if (error) return { success: false as const, error: error.message };

  const address = input.address || {};
  const hasAddress = !!(address.street || address.city || address.zipCode);
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
    });
  }

  return {
    success: true as const,
    data: {
      id: customer.id,
      name: customer.name,
      email: customer.email || null,
      phone: customer.phone || null,
      cpf: cpfDigits || null,
      address: hasAddress
        ? {
            zipCode: address.zipCode || "",
            street: address.street || "",
            number: address.number || "",
            complement: address.complement || "",
            neighborhood: address.neighborhood || "",
            city: address.city || "",
            state: address.state || "",
          }
        : null,
    },
  };
}

export async function getPOSCustomerDetailsAction(input: {
  partnerId: string;
  customerId: string;
}) {
  await requireUser();
  await requirePermission(input.partnerId, "customers", "view");

  const supabase = createAdminClient();
  const [{ data: customer, error: customerError }, { data: address }] =
    await Promise.all([
      supabase
        .from("customers")
        .select("id, name, email, phone, cpf, image_url, store_credit")
        .eq("partner_id", input.partnerId)
        .eq("id", input.customerId)
        .single(),
      supabase
        .from("addresses")
        .select(
          "zip_code, street, number, complement, neighborhood, city, state, country, latitude, longitude",
        )
        .eq("customer_id", input.customerId)
        .eq("address_type", "primary")
        .limit(1)
        .maybeSingle(),
    ]);

  if (customerError || !customer) {
    return {
      success: false as const,
      error: customerError?.message || "Cliente não encontrado.",
    };
  }

  let plainCpf: string | null = null;
  if (customer.cpf) {
    try {
      const { decryptCPF } = await import("@/lib/crypto");
      plainCpf = await decryptCPF(customer.cpf);
    } catch {
      plainCpf = null;
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
      image_url: customer.image_url || null,
      store_credit: Math.max(0, Number((customer as any).store_credit || 0)),
      address: address
        ? {
            zipCode: address.zip_code || "",
            street: address.street || "",
            number: address.number || "",
            complement: address.complement || "",
            neighborhood: address.neighborhood || "",
            city: address.city || "",
            state: address.state || "",
            country: address.country || "BR",
            latitude:
              (address as any).latitude != null
                ? Number((address as any).latitude)
                : null,
            longitude:
              (address as any).longitude != null
                ? Number((address as any).longitude)
                : null,
          }
        : null,
    },
  };
}

export async function createPOSCustomerAddressAction(input: {
  partnerId: string;
  customerId: string;
  address: {
    zipCode?: string;
    street?: string;
    number?: string;
    complement?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    latitude?: number | null;
    longitude?: number | null;
  };
}) {
  await requireUser();
  await requirePermission(input.partnerId, "customers", "edit");

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL);
  if (!rl.success)
    return { success: false as const, error: rl.error || "Muitas tentativas." };

  const supabase = createAdminClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("partner_id", input.partnerId)
    .eq("id", input.customerId)
    .maybeSingle();

  if (customerError || !customer?.id) {
    return {
      success: false as const,
      error: customerError?.message || "Cliente não encontrado.",
    };
  }

  const address = input.address || {};
  const hasAddress = !!(address.street || address.city || address.zipCode);
  if (!hasAddress) {
    return { success: false as const, error: "Informe um endereço válido." };
  }

  const enrichedPayload = await enrichAddressData({
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
    latitude: address.latitude ?? undefined,
    longitude: address.longitude ?? undefined,
  });

  const { data: existingPrimary } = await supabase
    .from("addresses")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("address_type", "primary")
    .limit(1)
    .maybeSingle();

  if (existingPrimary?.id) {
    const { error } = await supabase
      .from("addresses")
      .update(enrichedPayload)
      .eq("id", existingPrimary.id)
      .eq("customer_id", customer.id);

    if (error) return { success: false as const, error: error.message };
  } else {
    const { error } = await supabase.from("addresses").insert(enrichedPayload);
    if (error) return { success: false as const, error: error.message };
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
  };
}

// ============================================================================
// POS COUPON ACTIONS
// ============================================================================

export async function applyCouponToPreSaleAction(input: {
  partnerId: string;
  preSaleId: string;
  couponCode: string;
  customerId?: string | null;
  subtotal: number;
  shippingCost?: number;
  items?: Array<{ productId?: string | null; serviceId?: string | null }>;
}) {
  await requireUser();
  await requirePermission(input.partnerId, "pdv", "can_apply_discount");

  const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL);
  if (!rl.success)
    return { success: false as const, error: rl.error || "Muitas tentativas." };

  const result = await validateCoupon({
    partnerId: input.partnerId,
    code: input.couponCode,
    customerId: input.customerId,
    subtotal: input.subtotal,
    shippingCost: input.shippingCost,
    items: input.items,
  });

  if (!result.valid) {
    return {
      success: false as const,
      error: result.errorMessage || "Cupom inválido.",
    };
  }

  const supabase = createAdminClient();
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
    .eq("status", "draft");

  if (error) return { success: false as const, error: error.message };

  return {
    success: true as const,
    data: {
      couponId: result.couponId || null,
      couponCode: result.couponCode || input.couponCode.trim().toUpperCase(),
      discountAmount: result.discountAmount,
      pricingCoupon: result.pricingCoupon || null,
      freeShipping: result.freeShipping || false,
    },
  };
}

export async function removeCouponFromPreSaleAction(input: {
  partnerId: string;
  preSaleId: string;
}) {
  await requireUser();
  await requirePermission(input.partnerId, "pdv", "can_apply_discount");

  const supabase = createAdminClient();
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
    .eq("status", "draft");

  if (error) return { success: false as const, error: error.message };
  return { success: true as const };
}

export async function findAutomaticCouponForPOSAction(input: {
  partnerId: string;
  customerId?: string | null;
  subtotal: number;
  shippingCost?: number;
  items?: Array<{ productId?: string | null; serviceId?: string | null }>;
}) {
  await requireUser();
  await requirePermission(input.partnerId, "pdv", "can_apply_discount");

  const result = await findBestAutomaticCoupon({
    partnerId: input.partnerId,
    customerId: input.customerId,
    subtotal: input.subtotal,
    shippingCost: input.shippingCost,
    items: input.items,
  });

  if (!result.valid) {
    return { success: false as const };
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
  };
}
