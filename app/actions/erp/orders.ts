"use server";

import { getSupabaseServerClient } from "@/lib/supabase/request-client";
import { createAdminClient } from "@/lib/supabase/server";
import { revalidateOrders, revalidateOrderHistory } from "@/lib/utils/revalidation";
import { formatDateTime, resolveTimelineActorName, humanizeTimelineChangeLine } from "@/lib/utils/formatters";
import { formatCurrency } from "@/lib/utils";
import { requireUser } from "@/lib/auth/authorization";
import { requireStorePermission } from "@/lib/auth/authorization";
import { requirePermission } from "@/lib/permissions/access";
import { getCurrentPartnerContext } from "@/lib/auth/partner-context";
import { can } from "@/lib/permissions/can";
import type { RbacUserLike } from "@/lib/permissions/rbac-types";
import { RateLimitCategory } from "@/lib/rate-limiter";
import { requireRateLimit } from "@/lib/security/require-rate-limit";
import { sanitizeNotes } from "@/lib/input-validator";
import {
  checkLimit,
  increment_usage_counter,
} from "@/lib/services/subscription.service";
import {
  getDeliveryStatusLabel,
  getPaymentStatusLabel,
} from "@/lib/orders/status";
import { getOrderHistoryEntries } from "@/lib/services/order-history.service";
import { logAuditEvent } from "@/lib/services/timeline.service";
import { syncCancelledOrderAppointmentsAndTransactions } from "@/lib/services/sync-cancellation";
import { invalidateProductCache } from "@/lib/cache/invalidation";
import { revalidateStockMovements } from "@/lib/utils/revalidation";
import {
  finalizeOrderInventory,
  releaseOrderInventory,
  reserveOrderInventory,
  shouldDeductInventory,
} from "@/lib/stock/reservations";
import { validateCoupon, validateCouponById } from "@/lib/services/coupons";
import { calculateOrderPricing } from "@/lib/services/pricing-engine";
import {
  recalculateSplitPaymentFromBaseAmounts,
  toStoredBreakdownAmounts,
  type SplitInputRow,
} from "@/lib/payments/split-breakdown";
import { computeOrderPreparationEstimate } from "@/lib/utils/order-preparation";
import {
  createCommissionExpenseForEntity,
  reverseCommissionForEntity,
} from "@/lib/services/commission-ledger.service";
import {
  applySaleToGoals,
  reverseSaleFromGoals,
} from "@/lib/services/sales-goals.service";
import {
  syncReceivableForOrder,
  cancelPendingSettlementsForOrder,
} from "@/lib/services/transaction.service";
import {
  resolveOrderRefundFinanceAccount,
  summarizeRefundAccountResolution,
} from "@/lib/payments/order-refund-account";
import type { PaymentBreakdownEntry } from "@/lib/payments/financial-engine";
import {
  getOrderDepositSummary,
  mergeCheckoutFulfillment,
  patchDepositCheckoutOnPayment,
} from "@/lib/payments/order-financial-state";
import {
  buildOrderPaymentMethodLabel,
  hasReceivedAmount,
  normalizeOrderPaymentBreakdown,
  sumReceivedAmount,
  sumReceivedByMethod,
} from "@/lib/payments/payment-ledger";
import { formatPaymentMethodLabel } from "@/lib/utils/payment-method-label";
import { isStoreCreditMethod } from "@/lib/payments/payment-method";
import { resolveDeliverySettingsRow } from "@/app/actions/shared/delivery";
import { buildNotificationContent } from "@/lib/notifications/templates";
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities";
import { cancelCarrierLabelForOrder } from "@/lib/services/shipping/superfrete-label-cancel";
import { getCachedErpPage } from "@/lib/data/erp-page-cache";
import { requireAdminScope } from "@/lib/auth/admin-authorization";
import { adminAuditLog } from "@/lib/admin/audit";
import { AdminActionType } from "@/lib/admin/types";
import { applyAdminActionContext, type AdminActionContext } from "@/lib/admin/action-context";
import { TAGS } from "@/lib/utils/revalidation-tags";
import { isUuid } from "@/lib/utils/short-id";
import {
  DEFAULT_SALES_SETTINGS,
  type SalesSettings,
} from "@/lib/sales/sales-settings-types";
import { normalizeBusinessInfo } from "@/lib/business-info";
import {
  evaluatePaymentAlerts,
  evaluateDeliveryAlerts,
  evaluateStagnantOrders,
  evaluateReturnAlerts,
  type OrdersInsightsResult,
} from "@/lib/erp/order-insights";

export type ERPItemPayload = {
  productId?: string | null;
  variantId?: string | null;
  serviceId?: string | null;
  lineType?: string | null;
  fulfillmentMode?: string | null;
  customName?: string;
  quantity: number;
  unitPrice: number;
  /** Preço nominal (catálogo, antes de promoção/campanha). */
  basePrice?: number | null;
  sortOrder: number;
  /** POS: user accepted the "no stock, continue anyway" prompt for this line. */
  allowSellWithoutStock?: boolean | null;
};

export type ERPOrderPayload = {
  id?: string | null;
  partnerId: string;
  customerId?: string;
  customerName?: string;
  /** When set, enforces at most one ERP order per quote (unique index). */
  sourceQuoteId?: string | null;
  salesChannel?: string;
  deliveryMethod: "delivery" | "pickup";
  storeId?: string;
  financeAccountId?: string | null;
  paymentStatus: "paid" | "partially_paid" | "unpaid";
  deliveryStatus:
  | "not_sent"
  | "preparing"
  | "sent"
  | "delivered"
  | "pickup_available"
  | "delivery_failed";
  items: ERPItemPayload[];
  subtotal: number;
  discountValue: number;
  discountType: "fixed" | "percentage" | "coupon";
  couponCode?: string;
  couponId?: string | null;
  couponDiscountAmount?: number;
  shippingCost: number;
  additionalCosts: number;
  deliveryBreakdown?: Record<string, unknown> | null;
  totalAmount: number;
  paidAmount?: number;
  notes?: string;
  paymentMethod: string;
  paymentBreakdown?: PaymentBreakdownEntry[];
  address?: {
    zipCode: string;
    street: string;
    number: string;
    complement?: string;
    neighborhood: string;
    city: string;
    state: string;
  };
  csrf_token?: string;
  skipCSRF?: boolean;
  sellerPartnerUserId?: string | null;
  /** PDV persists commission/goals in its finalization path. */
  skipPostPaymentSellerSideEffects?: boolean;
  /** PDV performs the final cache refresh after completing the pre-sale. */
  skipPostCreateRevalidation?: boolean;
  paymentProvider?: string | null;
  mpPaymentId?: string | null;
  checkoutFulfillment?: Record<string, unknown> | null;
};

type OrderStockItem = {
  product_id?: string | null;
  variant_id?: string | null;
  quantity: number;
};

function isMissingOrdersIsPosSaleColumnError(error: unknown): boolean {
  const message = String((error as any)?.message || "").toLowerCase();
  return message.includes("is_pos_sale") && message.includes("orders");
}

// P5: cache em memória (por processo) indicando se a coluna orders.is_pos_sale existe.
// Evita que TODA listagem dispare uma 1ª query que sempre falha quando a coluna não
// existe. null = ainda desconhecido; true/false = resultado já detectado.
let ordersHasPosSaleColumn: boolean | null = null;

function isMissingOrdersPaymentMethodDeltaColumnsError(
  error: unknown,
): boolean {
  const message = String((error as any)?.message || "").toLowerCase();
  return (
    (message.includes("payment_method_discount_amount") ||
      message.includes("payment_method_extra_amount") ||
      message.includes("payment_method_interest_amount") ||
      message.includes("payment_method_fee_amount") ||
      message.includes("payment_method_fixed_fee_amount") ||
      message.includes("item_discount_amount") ||
      message.includes("campaign_discount_amount") ||
      message.includes("manual_discount_amount")) &&
    message.includes("orders")
  );
}

function buildOrderSource(
  salesChannel: string | undefined,
  deliveryMethod: "delivery" | "pickup",
) {
  const value = salesChannel?.trim();
  if (value) return value;
  return deliveryMethod === "pickup" ? "Balcão" : "Entrega";
}

function normalizeOrderNotes(value?: string | null) {
  if (!value) return "";
  return String(value)
    .replace(/\n*Pedido cancelado por:[\s\S]*$/i, "")
    .replace(/service_order:[0-9a-f-]+:order/gi, "")
    .replace(/^Pedido criado a partir do orçamento\s+[^\n.]*(\.|\n|$)/gim, "")
    .trim();
}

function buildCancelledOrderNotes(params: {
  currentNotes?: string | null;
  userName: string;
  timestamp: string;
  reason?: string;
}) {
  const baseNotes = normalizeOrderNotes(params.currentNotes);
  const cancelLine = `Pedido cancelado por: ${params.userName} as ${params.timestamp}${params.reason ? ` - ${params.reason.trim()}` : ""}`;
  return [baseNotes, cancelLine].filter(Boolean).join("\n");
}

function normalizePaymentSituation(
  paymentStatus: ERPOrderPayload["paymentStatus"],
) {
  return paymentStatus === "paid"
    ? "paid"
    : paymentStatus === "partially_paid"
      ? "partially_paid"
      : "pending";
}

function clampPaidAmount(value: number, totalAmount: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, Math.max(totalAmount, 0)));
}

function resolvePaymentState(params: {
  requestedStatus: ERPOrderPayload["paymentStatus"];
  totalAmount: number;
  paidAmount?: number;
  fallbackPaidAmount?: number;
}) {
  const totalAmount = Math.max(Number(params.totalAmount || 0), 0);
  const requestedPaidAmount = clampPaidAmount(
    Number(params.paidAmount ?? params.fallbackPaidAmount ?? 0),
    totalAmount,
  );

  let situation = normalizePaymentSituation(params.requestedStatus);
  let paidAmount = requestedPaidAmount;

  if (situation === "paid") {
    if (paidAmount >= totalAmount - 0.005) {
      paidAmount = totalAmount;
    } else if (paidAmount > 0.005) {
      situation = "partially_paid";
    } else {
      situation = "pending";
      paidAmount = 0;
    }
  } else if (situation === "partially_paid") {
    if (paidAmount >= totalAmount - 0.005) {
      situation = "paid";
      paidAmount = totalAmount;
    } else if (paidAmount <= 0.005) {
      situation = "pending";
      paidAmount = 0;
    }
  } else {
    paidAmount = 0;
  }

  return { situation, paidAmount };
}

function normalizePaymentMethodLabel(value?: string | null) {
  if (!value) return "";
  return formatPaymentMethodLabel(value, null);
}

async function resolvePartnerCustomerId(
  supabase: any,
  partnerId: string,
  requestedCustomerId?: string | null,
): Promise<string | null> {
  const customerId = requestedCustomerId || null;
  if (!customerId) return null;

  const { data: customer, error } = await supabase
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (error) throw new Error("NÃ£o foi possÃ­vel validar o cliente da venda.");
  if (!customer?.id) throw new Error("Cliente invÃ¡lido para este parceiro.");
  return customer.id;
}

export async function applyStoreCreditDeduction(
  supabase: any,
  params: {
    partnerId: string;
    customerId: string | null;
    amount: number;
  },
) {
  if (!params.customerId || params.amount <= 0.009) return;
  const amountToDeduct = Math.max(0, Number(params.amount.toFixed(2)));
  if (amountToDeduct <= 0) return;

  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("store_credit")
      .eq("id", params.customerId)
      .eq("partner_id", params.partnerId)
      .maybeSingle();

    if (customer) {
      const currentBalance = Math.max(0, Number(customer.store_credit || 0));
      const newBalance = Math.max(
        0,
        Number((currentBalance - amountToDeduct).toFixed(2)),
      );
      await supabase
        .from("customers")
        .update({ store_credit: newBalance })
        .eq("id", params.customerId)
        .eq("partner_id", params.partnerId);
    }

    const { data: credits } = await supabase
      .from("store_credits")
      .select("id, remaining_amount")
      .eq("partner_id", params.partnerId)
      .eq("customer_id", params.customerId)
      .eq("status", "ACTIVE")
      .gt("remaining_amount", 0)
      .order("created_at", { ascending: true });

    let remainingToDeduct = amountToDeduct;
    for (const credit of credits || []) {
      if (remainingToDeduct <= 0.009) break;
      const cur = Number(credit.remaining_amount || 0);
      if (cur <= 0) continue;

      const deduction = Math.min(cur, remainingToDeduct);
      const newRem = Math.max(0, Number((cur - deduction).toFixed(2)));
      remainingToDeduct = Number((remainingToDeduct - deduction).toFixed(2));

      await supabase
        .from("store_credits")
        .update({
          remaining_amount: newRem,
          status: newRem <= 0.009 ? "USED" : "ACTIVE",
        })
        .eq("id", credit.id);
    }
  } catch (err) {
    console.error(
      "[applyStoreCreditDeduction] Error deducting store credit:",
      err,
    );
  }
}

export async function restoreStoreCreditDeduction(
  supabase: any,
  params: {
    partnerId: string;
    customerId: string | null;
    amount: number;
  },
) {
  if (!params.customerId || params.amount <= 0.009) return;
  const amountToRestore = Math.max(0, Number(params.amount.toFixed(2)));

  try {
    const { data: customer } = await supabase
      .from("customers")
      .select("store_credit")
      .eq("id", params.customerId)
      .eq("partner_id", params.partnerId)
      .maybeSingle();

    if (customer) {
      const currentBalance = Math.max(0, Number(customer.store_credit || 0));
      const newBalance = Number((currentBalance + amountToRestore).toFixed(2));
      await supabase
        .from("customers")
        .update({ store_credit: newBalance })
        .eq("id", params.customerId)
        .eq("partner_id", params.partnerId);
    }
  } catch (err) {
    console.error(
      "[restoreStoreCreditDeduction] Error restoring store credit:",
      err,
    );
  }
}

function sanitizePaymentBreakdown(
  entries: ERPOrderPayload["paymentBreakdown"],
) {
  const mapped = (entries || []).map((entry) => {
    const amt = Math.max(0, Number(entry?.amount || 0));
    const effectiveAmt =
      entry?.effectiveAmount != null
        ? Math.max(0, Number(entry.effectiveAmount))
        : amt;
    const adjType = String(entry?.adjustmentType || "")
      .toLowerCase()
      .trim();
    const pmDiscount = Math.max(
      0,
      Number(
        entry?.paymentMethodDiscountAmount ||
        (adjType === "discount" ? entry?.adjustmentAmount : 0) ||
        0,
      ),
    );
    return {
      method: normalizePaymentMethodLabel(entry?.method),
      amount: effectiveAmt,
      amountReceived: Math.max(0, Number(entry?.amountReceived ?? 0)),
      adjustmentType: entry?.adjustmentType || "none",
      adjustmentPercent: Math.max(0, Number(entry?.adjustmentPercent || 0)),
      adjustmentAmount: Math.max(0, Number(entry?.adjustmentAmount || 0)),
      effectiveAmount: effectiveAmt,
      netAmount:
        entry?.netAmount != null
          ? Math.max(0, Number(entry.netAmount))
          : effectiveAmt,
      feeBearer: entry?.feeBearer || null,
      paymentMethodDiscountAmount: pmDiscount,
      interestAmount: Math.max(0, Number(entry?.interestAmount || 0)),
      feeAmount: Math.max(0, Number(entry?.feeAmount || 0)),
      fixedFeeAmount: Math.max(0, Number(entry?.fixedFeeAmount || 0)),
      paymentMethodId: entry?.paymentMethodId || null,
      installmentNumber: Math.max(
        1,
        Math.floor(Number(entry?.installmentNumber || 1)),
      ),
      installmentCostAmount: Math.max(
        0,
        Number(entry?.installmentCostAmount || 0),
      ),
      installmentFeeBearer: entry?.installmentFeeBearer || null,
      wantsChange: entry?.wantsChange || undefined,
      payWithAmount:
        entry?.payWithAmount != null ? Number(entry.payWithAmount) : undefined,
      changeAmount:
        entry?.changeAmount != null
          ? Math.max(0, Number(entry.changeAmount))
          : undefined,
      provider: entry?.provider || null,
      paymentTypeId: entry?.paymentTypeId || null,
      paymentStatus: entry?.paymentStatus || null,
      paymentStatusDetail: entry?.paymentStatusDetail || null,
      mpPaymentId: entry?.mpPaymentId || null,
      mpPaymentMethodId: entry?.mpPaymentMethodId || null,
      paymentKind: entry?.paymentKind || null,
      netReceivedAmount:
        entry?.netReceivedAmount != null
          ? Math.max(0, Number(entry.netReceivedAmount))
          : undefined,
      feeDetails: Array.isArray(entry?.feeDetails)
        ? entry.feeDetails
        : undefined,
      installmentAmount:
        entry?.installmentAmount != null
          ? Math.max(0, Number(entry.installmentAmount))
          : undefined,
      cardLastDigits: entry?.cardLastDigits || null,
      cardFirstDigits: entry?.cardFirstDigits || null,
      cardholderName: entry?.cardholderName || null,
    };
  });

  return mapped.filter(
    (entry) =>
      entry.method && (entry.effectiveAmount > 0.009 || mapped.length === 1),
  );
}

type ApplyPaymentMethodPricingResult =
  | {
    ok: true;
    finalTotal: number;
    feeAmount: number;
    interestAmount: number;
    paymentMethodDiscountAmount: number;
    adjustedBreakdown: PaymentBreakdownEntry[];
  }
  | { ok: false; error: string };

async function applyPaymentMethodPricingToTotal(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  baseTotal: number,
  paymentBreakdown: PaymentBreakdownEntry[],
  options?: { skipPricing?: boolean },
): Promise<ApplyPaymentMethodPricingResult> {
  const safeBase = Math.max(0, Math.round(Number(baseTotal || 0) * 100) / 100);
  const breakdown = paymentBreakdown || [];
  if (options?.skipPricing || breakdown.length === 0) {
    return {
      ok: true,
      finalTotal: safeBase,
      feeAmount: 0,
      interestAmount: 0,
      paymentMethodDiscountAmount: 0,
      adjustedBreakdown: breakdown as PaymentBreakdownEntry[],
    };
  }

  for (const row of breakdown) {
    if (!row.paymentMethodId) {
      return {
        ok: false,
        error: `Método de pagamento inválido (${row.method || "não informado"}). Selecione um método ativo e tente novamente.`,
      };
    }
  }

  const methodIds = Array.from(
    new Set(breakdown.map((b) => b.paymentMethodId).filter(Boolean)),
  ) as string[];

  const [{ data: methods }, { data: fees }] = await Promise.all([
    methodIds.length > 0
      ? supabase
        .from("payment_methods")
        .select(
          "id, fee_percent, fee_fixed, fee_bearer, installment_fee_bearer, discount_percent, max_installments",
        )
        .eq("partner_id", partnerId)
        .eq("is_active", true)
        .in("id", methodIds)
      : Promise.resolve({ data: [] as any[] }),
    methodIds.length > 0
      ? supabase
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
    const arr = feesByMethod.get(key) || [];
    arr.push({
      installmentNumber: Number((row as any).installment_number || 1),
      feePercent: Number((row as any).fee_percent || 0),
    });
    feesByMethod.set(key, arr);
  }

  const splitRows: SplitInputRow[] = breakdown.map((row) => ({
    method: row.method,
    amount: Math.max(0, Math.round(Number(row.amount || 0) * 100) / 100),
    amountReceived: Number(row.amountReceived || 0),
    paymentMethodId: row.paymentMethodId || null,
    installmentNumber: Math.max(
      1,
      Math.floor(Number(row.installmentNumber || 1)),
    ),
  }));

  const recalculated = recalculateSplitPaymentFromBaseAmounts(
    safeBase,
    splitRows,
    methodById,
    feesByMethod,
  );
  if (!recalculated.ok) {
    return { ok: false, error: recalculated.error };
  }

  const stored = toStoredBreakdownAmounts(recalculated.adjustedRows);
  const adjustedBreakdown: PaymentBreakdownEntry[] = stored.map((s, i) => ({
    method: s.method,
    amount: s.amount,
    amountReceived: s.amountReceived,
    adjustmentType: s.adjustmentType,
    adjustmentPercent: s.adjustmentPercent,
    adjustmentAmount: s.adjustmentAmount,
    effectiveAmount: s.effectiveAmount,
    netAmount: s.netAmount,
    feeBearer: s.feeBearer,
    paymentMethodDiscountAmount: s.paymentMethodDiscountAmount,
    interestAmount: s.interestAmount,
    feeAmount: s.feeAmount,
    fixedFeeAmount: s.fixedFeeAmount,
    paymentMethodId: s.paymentMethodId,
    installmentNumber: splitRows[i]?.installmentNumber || 1,
    wantsChange: breakdown[i]?.wantsChange || undefined,
    payWithAmount:
      breakdown[i]?.payWithAmount != null
        ? Number(breakdown[i].payWithAmount)
        : undefined,
  }));

  const sumBase = splitRows.reduce((acc, r) => acc + r.amount, 0);
  const isPartial = sumBase < safeBase - 0.005;
  const finalTotal = isPartial
    ? Math.max(
      0,
      Math.round(
        (safeBase +
          recalculated.feeAmount +
          recalculated.interestAmount -
          recalculated.paymentMethodDiscountAmount) *
        100,
      ) / 100,
    )
    : recalculated.finalTotal;

  return {
    ok: true,
    finalTotal,
    feeAmount: recalculated.feeAmount,
    interestAmount: recalculated.interestAmount,
    paymentMethodDiscountAmount: recalculated.paymentMethodDiscountAmount,
    adjustedBreakdown,
  };
}

function buildPaymentMethodSummary(
  paymentBreakdown: PaymentBreakdownEntry[],
  fallbackMethod?: string | null,
  options?: {
    usesDeposit?: boolean;
    paidAmount?: number;
    totalAmount?: number;
  },
) {
  const receivedBreakdown = (paymentBreakdown || []).filter((entry) =>
    hasReceivedAmount(entry as any),
  );
  const source =
    receivedBreakdown.length > 0 ? receivedBreakdown : paymentBreakdown || [];

  if (options?.usesDeposit) {
    return buildOrderPaymentMethodLabel(source as any, {
      fallbackMethod,
      usesDeposit: true,
      paidAmount: options.paidAmount,
      totalAmount: options.totalAmount,
    });
  }

  const labels = Array.from(
    new Set(
      source
        .map((entry) => normalizePaymentMethodLabel(entry.method))
        .filter(Boolean),
    ),
  );

  if (labels.length > 0) {
    return labels.join(", ");
  }

  const fallbackLabel = normalizePaymentMethodLabel(fallbackMethod);
  return fallbackLabel || "Não informado";
}

function describeItem(item: {
  customName?: string | null;
  product_name?: string | null;
}) {
  return item.customName?.trim() || item.product_name?.trim() || "item";
}

function normalizeItemMap(
  items: Array<{
    productId?: string | null;
    product_id?: string | null;
    variantId?: string | null;
    variant_id?: string | null;
    customName?: string | null;
    product_name?: string | null;
    quantity: number;
    unitPrice?: number;
    product_price?: number;
  }>,
) {
  const map = new Map<
    string,
    { name: string; quantity: number; unitPrice: number }
  >();

  for (const item of items) {
    const name = describeItem(item);
    const productId = item.productId || item.product_id || null;
    const variantId = item.variantId || item.variant_id || null;
    const key = variantId
      ? `variant:${variantId}`
      : productId
        ? `product:${productId}`
        : `custom:${name.toLowerCase()}`;
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice ?? item.product_price ?? 0);
    const current = map.get(key);

    if (current) {
      current.quantity += quantity;
      current.unitPrice = unitPrice;
    } else {
      map.set(key, { name, quantity, unitPrice });
    }
  }

  return map;
}

function buildItemChangeLines(
  previousItems: Array<{
    product_id?: string | null;
    product_name?: string | null;
    quantity: number;
    product_price?: number;
  }>,
  nextItems: ERPItemPayload[],
) {
  const lines: string[] = [];
  const previousMap = normalizeItemMap(previousItems);
  const nextMap = normalizeItemMap(nextItems);

  for (const [key, nextItem] of nextMap.entries()) {
    const previousItem = previousMap.get(key);

    if (!previousItem) {
      lines.push(`adicionou ${nextItem.quantity} ${nextItem.name}`);
      continue;
    }

    if (previousItem.quantity !== nextItem.quantity) {
      lines.push(
        `alterou quantidade de ${nextItem.name}: ${previousItem.quantity} -> ${nextItem.quantity}`,
      );
    }

    if (Math.abs(previousItem.unitPrice - nextItem.unitPrice) > 0.009) {
      lines.push(
        `alterou valor de ${nextItem.name}: ${formatCurrency(previousItem.unitPrice)} -> ${formatCurrency(nextItem.unitPrice)}`,
      );
    }
  }

  for (const [key, previousItem] of previousMap.entries()) {
    if (!nextMap.has(key)) {
      lines.push(`removeu ${previousItem.quantity} ${previousItem.name}`);
    }
  }

  return lines;
}

function buildOrderChangeLines(currentOrder: any, payload: ERPOrderPayload) {
  const lines: string[] = [];
  const paymentState = resolvePaymentState({
    requestedStatus: payload.paymentStatus,
    totalAmount: payload.totalAmount,
    paidAmount: payload.paidAmount,
    fallbackPaidAmount: Number(currentOrder.paid_amount || 0),
  });
  const nextSituation = paymentState.situation;
  const nextOrderSource = buildOrderSource(
    payload.salesChannel,
    payload.deliveryMethod,
  );
  const previousNotes = (currentOrder.notes || "").trim();
  const nextNotes = (payload.notes || "").trim();
  const nextDeliveryAddress =
    payload.deliveryMethod === "delivery" && payload.address
      ? `${payload.address.street}, ${payload.address.number}${payload.address.complement ? ` (${payload.address.complement})` : ""}, ${payload.address.neighborhood}, ${payload.address.city} - ${payload.address.state}, ${payload.address.zipCode}`
      : "";

  lines.push(
    ...buildItemChangeLines(currentOrder.order_items || [], payload.items),
  );

  if (
    (currentOrder.customer_name || "Consumidor final") !==
    (payload.customerName || "Consumidor final")
  ) {
    lines.push(
      `alterou cliente: ${currentOrder.customer_name || "Consumidor final"} -> ${payload.customerName || "Consumidor final"}`,
    );
  }

  if ((currentOrder.order_source || "Manual") !== nextOrderSource) {
    lines.push(
      `alterou canal de venda: ${currentOrder.order_source || "Manual"} -> ${nextOrderSource}`,
    );
  }

  if ((currentOrder.situation || "pending") !== nextSituation) {
    lines.push(
      `alterou status de pagamento: ${getPaymentStatusLabel(currentOrder.situation)} -> ${getPaymentStatusLabel(nextSituation)}`,
    );
  }

  if ((currentOrder.delivery_status || "not_sent") !== payload.deliveryStatus) {
    lines.push(
      `alterou status de entrega: ${getDeliveryStatusLabel(currentOrder.delivery_status)} -> ${getDeliveryStatusLabel(payload.deliveryStatus)}`,
    );
  }

  if ((currentOrder.delivery_type || "pickup") !== payload.deliveryMethod) {
    lines.push(
      `alterou tipo de entrega: ${currentOrder.delivery_type === "delivery" ? "Entrega" : "Retirada"} -> ${payload.deliveryMethod === "delivery" ? "Entrega" : "Retirada"}`,
    );
  }

  if ((currentOrder.delivery_address || "") !== nextDeliveryAddress) {
    lines.push("alterou endereço de entrega");
  }

  const nextPaymentMethodSummary = buildPaymentMethodSummary(
    sanitizePaymentBreakdown(payload.paymentBreakdown),
    payload.paymentMethod,
  );
  if (
    (currentOrder.finance_account_id || "") !== (payload.financeAccountId || "")
  ) {
    lines.push("alterou conta de recebimento do pedido");
  }

  if (
    (currentOrder.payment_method || "Não informado") !==
    nextPaymentMethodSummary
  ) {
    lines.push(
      `alterou forma de pagamento: ${currentOrder.payment_method || "Não informado"} -> ${nextPaymentMethodSummary}`,
    );
  }

  if (
    Math.abs(
      Number(currentOrder.discount_value || 0) -
      Number(payload.discountValue || 0),
    ) > 0.009
  ) {
    lines.push(
      `alterou valor de desconto: ${formatCurrency(currentOrder.discount_value || 0)} -> ${formatCurrency(payload.discountValue || 0)}`,
    );
  }

  if (
    Math.abs(
      Number(currentOrder.delivery_fee || 0) -
      Number(payload.shippingCost || 0),
    ) > 0.009
  ) {
    lines.push(
      `alterou entrega: ${formatCurrency(currentOrder.delivery_fee || 0)} -> ${formatCurrency(payload.shippingCost || 0)}`,
    );
  }

  if (
    Math.abs(
      Number(currentOrder.additional_costs || 0) -
      Number(payload.additionalCosts || 0),
    ) > 0.009
  ) {
    lines.push(
      `alterou custos adicionais: ${formatCurrency(currentOrder.additional_costs || 0)} -> ${formatCurrency(payload.additionalCosts || 0)}`,
    );
  }

  if (
    Math.abs(
      Number(currentOrder.total_amount || 0) - Number(payload.totalAmount || 0),
    ) > 0.009
  ) {
    lines.push(
      `alterou valor total: ${formatCurrency(currentOrder.total_amount || 0)} -> ${formatCurrency(payload.totalAmount || 0)}`,
    );
  }

  if (
    Math.abs(
      Number(currentOrder.paid_amount || 0) -
      Number(paymentState.paidAmount || 0),
    ) > 0.009
  ) {
    lines.push(
      `alterou valor pago: ${formatCurrency(currentOrder.paid_amount || 0)} -> ${formatCurrency(paymentState.paidAmount || 0)}`,
    );
  }

  if (previousNotes !== nextNotes) {
    lines.push("alterou observações internas");
  }

  return lines.filter(Boolean);
}

function sanitizeERPItems(items: ERPItemPayload[]) {
  if (!Array.isArray(items) || items.length === 0 || items.length > 500) {
    return { error: "O pedido deve conter de 1 a 500 itens." as const };
  }

  const normalizedItems = items.map((item) => {
    if (!item || typeof item !== "object") return null;
    const isServiceItem = Boolean(
      item.serviceId ||
      item.lineType === "service_booking" ||
      item.lineType === "service",
    );
    return {
      ...item,
      productId: isServiceItem ? null : item.productId || null,
      serviceId:
        item.serviceId || (isServiceItem ? item.productId : null) || null,
      lineType:
        item.lineType || (isServiceItem ? "service_booking" : "product"),
      variantId: item.variantId || null,
      customName:
        typeof item.customName === "string"
          ? item.customName.trim().substring(0, 150) || undefined
          : undefined,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      basePrice:
        item.basePrice != null && Number.isFinite(Number(item.basePrice))
          ? Math.max(0, Number(item.basePrice))
          : null,
      sortOrder: Number(item.sortOrder),
    };
  });

  if (normalizedItems.some((item) => !item)) {
    return { error: "Um dos itens do pedido é inválido." as const };
  }
  const sanitizedItems = normalizedItems.filter((item): item is NonNullable<typeof item> => item !== null);

  for (let index = 0; index < sanitizedItems.length; index++) {
    const item = sanitizedItems[index]!;
    if (
      item.lineType &&
      !["product", "service_booking", "service"].includes(item.lineType)
    ) {
      return { error: "Tipo de item inválido." as const };
    }
    if (
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) ||
      item.unitPrice < 0
    ) {
      return { error: "Quantidade ou preço inválido no pedido." as const };
    }
    if (item.variantId && !item.productId) {
      return { error: "Uma variação precisa estar vinculada a um produto." as const };
    }
    if (item.productId && item.serviceId) {
      return { error: "O item não pode referenciar produto e serviço ao mesmo tempo." as const };
    }
    item.sortOrder =
      Number.isSafeInteger(item.sortOrder) && item.sortOrder >= 0
        ? item.sortOrder
        : index;
    if (!item.productId && !item.serviceId && !item.customName) {
      return {
        error:
          "Preencha o nome dos itens adicionados manualmente antes de salvar o pedido." as const,
      };
    }

    if (!item.productId && !item.serviceId && item.unitPrice <= 0) {
      return {
        error:
          "Preencha o preço dos itens adicionados manualmente antes de salvar o pedido." as const,
      };
    }
  }

  return { items: sanitizedItems };
}

async function validateERPItemReferences(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  storeId?: string | null;
  items: ERPItemPayload[];
}): Promise<string | null> {
  const productIds = Array.from(
    new Set(params.items.map((item) => item.productId).filter(Boolean)),
  ) as string[];
  const variantIds = Array.from(
    new Set(params.items.map((item) => item.variantId).filter(Boolean)),
  ) as string[];
  const serviceIds = Array.from(
    new Set(params.items.map((item) => item.serviceId).filter(Boolean)),
  ) as string[];

  const [productsResult, variantsResult, servicesResult] = await Promise.all([
    productIds.length
      ? params.supabase
        .from("products")
        .select("id, store_id")
        .eq("partner_id", params.partnerId)
        .in("id", productIds)
      : Promise.resolve({ data: [], error: null }),
    variantIds.length
      ? params.supabase
        .from("product_variants")
        .select("id, product_id")
        .in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    serviceIds.length
      ? params.supabase
        .from("services")
        .select("id, store_id")
        .eq("partner_id", params.partnerId)
        .in("id", serviceIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsResult.error || variantsResult.error || servicesResult.error) {
    return "Não foi possível validar os itens do pedido.";
  }

  const productsById = new Map((productsResult.data || []).map((row: any) => [String(row.id), row]));
  const variantsById = new Map((variantsResult.data || []).map((row: any) => [String(row.id), row]));
  const servicesById = new Map((servicesResult.data || []).map((row: any) => [String(row.id), row]));
  if (
    productsById.size !== productIds.length ||
    variantsById.size !== variantIds.length ||
    servicesById.size !== serviceIds.length
  ) {
    return "Um produto, serviço ou variação não pertence a este parceiro.";
  }

  for (const item of params.items) {
    const product = item.productId ? productsById.get(String(item.productId)) : null;
    const variant = item.variantId ? variantsById.get(String(item.variantId)) : null;
    const service = item.serviceId ? servicesById.get(String(item.serviceId)) : null;
    if (
      item.variantId &&
      (!product ||
        !variant ||
        String(variant.product_id) !== String(item.productId))
    ) {
      return "A variação não pertence ao produto informado.";
    }
    for (const resource of [product, service]) {
      if (
        resource?.store_id &&
        resource.store_id !== (params.storeId || null)
      ) {
        return "Um item do pedido pertence a outra loja.";
      }
    }
  }

  return null;
}

async function validateERPItemsStock(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  items: Array<{
    productId?: string | null;
    variantId?: string | null;
    serviceId?: string | null;
    lineType?: string | null;
    customName?: string;
    quantity: number;
    allowSellWithoutStock?: boolean | null;
  }>;
  salesSettings?: SalesSettings | null;
  baselineQuantities?: Map<string, number>;
}) {
  const isGlobalNegativeStockAllowed =
    params.salesSettings?.allowNegativeStock !== false;

  // Config global "permitir venda com estoque zerado/negativo" ativa: nenhuma
  // linha do pedido é travada (mesma regra aplicada no PDV).
  if (isGlobalNegativeStockAllowed) return null;

  const stockItems = params.items.filter(
    (item) =>
      !item.serviceId &&
      item.lineType !== "service_booking" &&
      item.lineType !== "service" &&
      item.productId &&
      (!item.allowSellWithoutStock || !isGlobalNegativeStockAllowed),
  );

  const productIds = Array.from(
    new Set(stockItems.map((item) => item.productId).filter(Boolean)),
  ) as string[];
  if (productIds.length === 0) return null;

  const variantIds = Array.from(
    new Set(stockItems.map((item) => item.variantId).filter(Boolean)),
  ) as string[];

  const { data: products, error: productsError } = await params.supabase
    .from("products")
    .select("id, name, stock_available, allow_sell_without_stock")
    .eq("partner_id", params.partnerId)
    .in("id", productIds);

  if (productsError) {
    console.error("[validateERPItemsStock] Products error:", productsError);
    return "Não foi possível validar o estoque dos itens.";
  }

  const foundProductIds = new Set((products || []).map((p: any) => p.id));
  const missingProductIds = productIds.filter((id) => !foundProductIds.has(id));

  let serviceIdsFoundInMissing = new Set<string>();
  if (missingProductIds.length > 0) {
    const { data: foundServices } = await params.supabase
      .from("services")
      .select("id")
      .eq("partner_id", params.partnerId)
      .in("id", missingProductIds);

    if (foundServices && foundServices.length > 0) {
      serviceIdsFoundInMissing = new Set(foundServices.map((s: any) => s.id));
    }
  }

  const productMap = new Map<
    string,
    { name: string; stock: number; allowSellWithoutStock: boolean }
  >(
    (products || []).map((product: any) => [
      product.id,
      {
        name: product.name || "Produto",
        stock: Number(product.stock_available ?? 0),
        allowSellWithoutStock: Boolean(product.allow_sell_without_stock),
      },
    ]),
  );

  const variantMap = new Map<
    string,
    { name: string; stock: number; productId: string }
  >();
  if (variantIds.length > 0) {
    const { data: variants, error: variantsError } = await params.supabase
      .from("product_variants")
      .select("id, product_id, variant_name, stock_available")
      .in("id", variantIds);

    if (variantsError) {
      console.error("[validateERPItemsStock] Variants error:", variantsError);
      return "Não foi possível validar o estoque das variações.";
    }

    for (const variant of variants || []) {
      variantMap.set(variant.id, {
        name: variant.variant_name || "Variação",
        stock: Number(variant.stock_available ?? 0),
        productId: variant.product_id,
      });
    }
  }

  const requestedMap = new Map<
    string,
    {
      quantity: number;
      productId: string;
      variantId?: string | null;
      displayName: string;
      allowSellWithoutStock?: boolean | null;
    }
  >();

  for (const item of stockItems) {
    if (!item.productId) continue;
    if (serviceIdsFoundInMissing.has(item.productId)) continue;

    const key = item.variantId
      ? `variant:${item.variantId}`
      : `product:${item.productId}`;
    const existing = requestedMap.get(key);
    if (existing) {
      existing.quantity += Number(item.quantity || 0);
      existing.allowSellWithoutStock =
        existing.allowSellWithoutStock || item.allowSellWithoutStock;
      continue;
    }

    const productInfo = productMap.get(item.productId);
    const variantInfo = item.variantId ? variantMap.get(item.variantId) : null;
    requestedMap.set(key, {
      quantity: Number(item.quantity || 0),
      productId: item.productId,
      variantId: item.variantId || null,
      displayName: variantInfo
        ? `${productInfo?.name || "Produto"} - ${variantInfo.name}`
        : productInfo?.name || item.customName || "Produto",
      allowSellWithoutStock: item.allowSellWithoutStock,
    });
  }

  for (const request of requestedMap.values()) {
    const productInfo = productMap.get(request.productId);
    if (!productInfo) {
      return "Um dos produtos do pedido não foi encontrado para validar o estoque.";
    }

    // Product specific exemption: always allows selling without stock if enabled individually on product
    if (productInfo.allowSellWithoutStock) continue;

    // If global negative stock is enabled and item was marked as allowSellWithoutStock, bypass
    if (isGlobalNegativeStockAllowed && request.allowSellWithoutStock) continue;

    const availableStock = request.variantId
      ? variantMap.get(request.variantId)?.stock
      : productInfo.stock;

    if (availableStock === undefined) {
      return `Não foi possível validar o estoque de "${request.displayName}".`;
    }

    // Estoque que este pedido já reserva/deduz. Somado ao disponível para que a
    // validação não trave o próprio estoque já segurado pelo pedido.
    const baselineKey = request.variantId
      ? `variant:${request.variantId}`
      : `product:${request.productId}`;
    const heldQuantity = params.baselineQuantities?.get(baselineKey) || 0;
    const availableForOrder = availableStock + heldQuantity;

    if (request.quantity > availableForOrder) {
      if (!isGlobalNegativeStockAllowed) {
        return `O produto "${request.displayName}" não possui estoque suficiente (${availableForOrder} disponíveis) e as configurações da empresa bloqueiam vendas com estoque negativo.`;
      }
      return `A quantidade de "${request.displayName}" está maior que o estoque disponível.`;
    }
  }

  return null;
}

// Calcula quanto falta reservar para cada item. O pedido pode já ter a reserva
// feita (feito na criação), então reservar a quantidade inteira novamente
// duplicaria a baixa de estoque.
async function buildStockShortfallItems(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  items: Array<{
    product_id?: string | null;
    variant_id?: string | null;
    quantity: number;
    allow_sell_without_stock?: boolean | null;
  }>,
) {
  const variantIds = Array.from(
    new Set(items.map((item) => item.variant_id).filter(Boolean)),
  ) as string[];
  const productIds = Array.from(
    new Set(
      items
        .filter((item) => item.product_id && !item.variant_id)
        .map((item) => item.product_id),
    ),
  ) as string[];

  const reservedByVariant = new Map<string, number>();
  const reservedByProduct = new Map<string, number>();

  if (variantIds.length > 0) {
    const { data: variants } = await supabase
      .from("product_variants")
      .select("id, stock_reserved")
      .in("id", variantIds);

    for (const variant of variants || []) {
      reservedByVariant.set(variant.id, Number(variant.stock_reserved || 0));
    }
  }

  if (productIds.length > 0) {
    const { data: products } = await supabase
      .from("products")
      .select("id, stock_reserved")
      .eq("partner_id", partnerId)
      .in("id", productIds);

    for (const product of products || []) {
      reservedByProduct.set(product.id, Number(product.stock_reserved || 0));
    }
  }

  const shortfall: typeof items = [];
  for (const item of items) {
    if (!item.product_id) continue;
    const reserved = item.variant_id
      ? reservedByVariant.get(item.variant_id) || 0
      : reservedByProduct.get(item.product_id) || 0;
    const missing = Number(item.quantity || 0) - reserved;
    if (missing > 0) shortfall.push({ ...item, quantity: missing });
  }

  return shortfall;
}

function buildInventoryMovementDelta(
  previousItems: Array<{
    product_id?: string | null;
    variant_id?: string | null;
    product_name?: string | null;
    quantity: number;
  }>,
  nextItems: Array<{
    productId?: string | null;
    variantId?: string | null;
    customName?: string;
    quantity: number;
    allowSellWithoutStock?: boolean | null;
  }>,
) {
  const previousMap = new Map<
    string,
    { product_id: string; variant_id: string | null; quantity: number }
  >();
  const nextMap = new Map<
    string,
    {
      product_id: string;
      variant_id: string | null;
      quantity: number;
      allowSellWithoutStock: boolean;
    }
  >();

  for (const item of previousItems) {
    if (!item.product_id) continue;
    const key = item.variant_id
      ? `variant:${item.variant_id}`
      : `product:${item.product_id}`;
    const current = previousMap.get(key);
    if (current) {
      current.quantity += Number(item.quantity || 0);
    } else {
      previousMap.set(key, {
        product_id: item.product_id,
        variant_id: item.variant_id || null,
        quantity: Number(item.quantity || 0),
      });
    }
  }

  for (const item of nextItems) {
    if (!item.productId) continue;
    const key = item.variantId
      ? `variant:${item.variantId}`
      : `product:${item.productId}`;
    const current = nextMap.get(key);
    if (current) {
      current.quantity += Number(item.quantity || 0);
      current.allowSellWithoutStock =
        current.allowSellWithoutStock || Boolean(item.allowSellWithoutStock);
    } else {
      nextMap.set(key, {
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: Number(item.quantity || 0),
        allowSellWithoutStock: Boolean(item.allowSellWithoutStock),
      });
    }
  }

  const outgoing: Array<{
    product_id: string;
    variant_id?: string | null;
    quantity: number;
    allow_sell_without_stock?: boolean;
  }> = [];
  const incoming: Array<{
    product_id: string;
    variant_id?: string | null;
    quantity: number;
  }> = [];

  for (const [key, nextItem] of nextMap.entries()) {
    const previousItem = previousMap.get(key);
    const previousQty = Number(previousItem?.quantity || 0);
    if (nextItem.quantity > previousQty) {
      outgoing.push({
        product_id: nextItem.product_id,
        variant_id: nextItem.variant_id,
        quantity: nextItem.quantity - previousQty,
        allow_sell_without_stock: nextItem.allowSellWithoutStock || undefined,
      });
    }
  }

  for (const [key, previousItem] of previousMap.entries()) {
    const nextItem = nextMap.get(key);
    const nextQty = Number(nextItem?.quantity || 0);
    if (previousItem.quantity > nextQty) {
      incoming.push({
        product_id: previousItem.product_id,
        variant_id: previousItem.variant_id,
        quantity: previousItem.quantity - nextQty,
      });
    }
  }

  return { outgoing, incoming };
}

async function fulfillMarketplaceOrderIfNeeded(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  orderId: string,
) {
  try {
    const { data: order } = await supabase
      .from("orders")
      .select("order_source, checkout_fulfillment")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return;

    const source = (order.order_source || "").toLowerCase().trim();
    const isMarketplace =
      source === "vitrine online" ||
      source === "marketplace" ||
      source === "online store" ||
      Boolean((order.checkout_fulfillment as any)?.lines?.length) ||
      Boolean((order.checkout_fulfillment as any)?.depositCheckout);

    if (!isMarketplace) {
      return;
    }

    const { fulfillMarketplaceOrder } =
      await import("@/lib/services/marketplace-checkout-fulfillment");
    await fulfillMarketplaceOrder(supabase, orderId);
  } catch (error) {
    console.error(
      "[orders_fulfillment] fulfillMarketplaceOrderIfNeeded:",
      error,
    );
  }
}

async function createFinancialTransactionsForPaidOrder(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  params: {
    orderNumber: string;
    partnerId: string;
    totalAmount: number;
    paymentMethod?: string | null;
    paymentProvider?: string | null;
    paymentBreakdown?: Array<{
      method: string;
      amount: number;
      paymentMethodId?: string | null;
      installmentNumber?: number;
    }> | null;
    customerId?: string | null;
    customerName?: string | null;
    paymentDate?: string | null;
    financeAccountId?: string | null;
    orderSource?: string | null;
    orderId?: string | null;
    mpPaymentId?: string | null;
    storeId?: string | null;
  },
) {
  try {
    const { createTransactionFromOrder } =
      await import("@/lib/services/transaction.service");
    await createTransactionFromOrder(supabase, {
      order_number: params.orderNumber,
      partner_id: params.partnerId,
      store_id: params.storeId || null,
      total_amount: params.totalAmount,
      payment_method: params.paymentMethod || null,
      payment_provider: params.paymentProvider || null,
      payment_breakdown: params.paymentBreakdown || null,
      payment_date: params.paymentDate || new Date().toISOString(),
      customer_id: params.customerId || null,
      customer_name: params.customerName || null,
      finance_account_id: params.financeAccountId || null,
      order_source: params.orderSource || "manual",
      order_id: params.orderId || null,
      mp_payment_id: params.mpPaymentId || null,
    });
  } catch (error) {
    console.error(
      "[orders_financial] createFinancialTransactionsForPaidOrder:",
      error,
    );
  }
}

export async function createFinancialTransactionsForReceivedAmount(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  params: {
    orderId: string;
    orderNumber: string;
    partnerId: string;
    totalAmount: number;
    newBreakdown: any[];
    oldBreakdown: any[];
    paymentMethod?: string | null;
    customerId?: string | null;
    customerName?: string | null;
    financeAccountId?: string | null;
    orderSource?: string | null;
    storeId?: string | null;
  },
) {
  try {
    const { createTransactionFromOrder } =
      await import("@/lib/services/transaction.service");

    const oldBreakdown = Array.isArray(params.oldBreakdown)
      ? params.oldBreakdown
      : [];
    const newBreakdown = Array.isArray(params.newBreakdown)
      ? params.newBreakdown
      : [];

    if (
      newBreakdown.length === 0 &&
      params.totalAmount > 0.009 &&
      params.paymentMethod
    ) {
      await createTransactionFromOrder(supabase, {
        order_number: params.orderNumber,
        partner_id: params.partnerId,
        store_id: params.storeId || null,
        total_amount: params.totalAmount,
        payment_method: params.paymentMethod,
        payment_breakdown: null,
        payment_date: new Date().toISOString(),
        customer_id: params.customerId || null,
        customer_name: params.customerName || null,
        finance_account_id: params.financeAccountId || null,
        order_source: params.orderSource || "manual",
        reference_note: `sale-tx:${params.orderNumber}:fallback`,
        order_id: params.orderId || null,
      });
      return;
    }

    const oldByMethod = sumReceivedByMethod(oldBreakdown);
    const newByMethod = sumReceivedByMethod(newBreakdown);

    const breakdownPromises = Array.from(newByMethod.entries()).map(
      async ([methodKey, newEntry]) => {
        if (!methodKey || !newEntry?.leg) return;

        const oldReceived = oldByMethod.get(methodKey)?.amount || 0;
        const delta = newEntry.amount - oldReceived;
        if (delta <= 0.009) return;

        const methodLabel = String(newEntry.leg.method || methodKey);
        const oldFormatted = oldReceived.toFixed(2);
        const newFormatted = newEntry.amount.toFixed(2);
        const refNote = `sale-tx:${params.orderNumber}:${methodLabel}:${oldFormatted}_to_${newFormatted}`;

        let legAccountId = params.financeAccountId || null;
        const paymentMethodId = newEntry.leg.paymentMethodId;
        if (!legAccountId && paymentMethodId && isUuid(paymentMethodId)) {
          const { data: pm } = await supabase
            .from("payment_methods")
            .select("default_finance_account_id")
            .eq("id", paymentMethodId)
            .eq("partner_id", params.partnerId)
            .maybeSingle();
          if (pm?.default_finance_account_id) {
            legAccountId = pm.default_finance_account_id;
          }
        }

        const provider =
          newEntry.leg.provider ||
          (String(methodLabel).toLowerCase().includes("mercado pago")
            ? "Mercado Pago"
            : null);

        // Recebimentos via Mercado Pago devem ir para a conta gateway MP,
        // mesmo quando o pedido tinha finance_account_id bancário/cash.
        const isMpProvider = String(provider || "")
          .toLowerCase()
          .includes("mercado pago");
        if (!legAccountId && isMpProvider) {
          const { resolveMarketplaceOrderFinanceAccountId } = await import(
            "@/app/actions/erp/finance-accounts"
          );
          legAccountId = await resolveMarketplaceOrderFinanceAccountId(
            supabase,
            params.partnerId,
            true,
          );
        }

        await createTransactionFromOrder(supabase, {
          order_number: params.orderNumber,
          partner_id: params.partnerId,
          store_id: params.storeId || null,
          total_amount: delta,
          payment_method: methodLabel,
          payment_provider: provider,
          payment_breakdown: [
            {
              method: methodLabel,
              amount: delta,
              amountReceived: delta,
              paymentMethodId:
                paymentMethodId && isUuid(paymentMethodId)
                  ? paymentMethodId
                  : null,
              installmentNumber: Number(newEntry.leg.installmentNumber || 1),
              provider,
              mpPaymentId: newEntry.leg.mpPaymentId || null,
              paymentKind: newEntry.leg.paymentKind || null,
            },
          ],
          payment_date: new Date().toISOString(),
          customer_id: params.customerId || null,
          customer_name: params.customerName || null,
          finance_account_id: legAccountId,
          order_source: params.orderSource || "manual",
          reference_note: refNote,
          order_id: params.orderId || null,
        });
      },
    );
    await Promise.all(breakdownPromises);
  } catch (error) {
    console.error(
      "[orders_financial] createFinancialTransactionsForReceivedAmount:",
      error,
    );
  }
}

async function resolvePartnerUserIdFromUserId(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  partnerId: string,
  userId?: string | null,
) {
  if (!userId) return null;
  const { data } = await supabase
    .from("partner_users")
    .select("id")
    .eq("partner_id", partnerId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function createSellerCommissionForPaidOrder(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  orderId: string;
  sellerUserId?: string | null;
  saleAmount: number;
  accountId?: string | null;
  createdByUserId?: string | null;
  storeId?: string | null;
}) {
  const partnerUserId = await resolvePartnerUserIdFromUserId(
    params.supabase,
    params.partnerId,
    params.sellerUserId || null,
  );
  if (!partnerUserId) return;

  await createCommissionExpenseForEntity({
    supabase: params.supabase,
    partnerId: params.partnerId,
    storeId: params.storeId || null,
    partnerUserId,
    role: "seller",
    saleAmount: params.saleAmount,
    entityType: "sale",
    entityId: params.orderId,
    accountId: params.accountId || null,
    createdByUserId: params.createdByUserId || null,
  });

  if (params.sellerUserId) {
    await applySaleToGoals({
      supabase: params.supabase,
      partnerId: params.partnerId,
      sellerUserId: String(params.sellerUserId),
      saleAmount: Number(params.saleAmount || 0),
      createdByUserId: params.createdByUserId || null,
      accountId: params.accountId || null,
    });
  }
}

async function createRefundTransactionForCancelledOrder(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  orderNumber: string;
  orderId: string;
  customerId?: string | null;
  customerName?: string | null;
  paidAmount: number;
  financeAccountId?: string | null;
  createdByUserId?: string | null;
  storeId?: string | null;
}) {
  const paidAmount = Math.max(0, Number(params.paidAmount || 0));
  if (paidAmount <= 0.009) return { success: true as const };
  const financeAccountId = params.financeAccountId || null;
  if (!financeAccountId) {
    return {
      error:
        "Não foi possível gerar o reembolso automático: o pedido não tem conta financeira de origem. Atualize o pedido com a conta correta antes de cancelar.",
    } as const;
  }

  const { data: existingRefunds, error: existingRefundsError } =
    await params.supabase
      .from("transactions")
      .select("id, amount, status")
      .eq("partner_id", params.partnerId)
      .eq("reference_note", params.orderId)
      .or("kind.eq.refund,refund_kind.eq.revenue_refund");

  if (existingRefundsError) return { error: existingRefundsError.message };

  const alreadyRefundedAmount = (existingRefunds || []).reduce(
    (sum: number, tx: any) => {
      if (String(tx.status || "").toLowerCase() === "cancelled") return sum;
      return sum + Math.abs(Number(tx.amount || 0));
    },
    0,
  );
  const refundableAmount = Math.max(0, paidAmount - alreadyRefundedAmount);
  if (refundableAmount <= 0.009) return { success: true as const };

  const transactionContactId = await resolveTransactionContactByName({
    supabase: params.supabase,
    partnerId: params.partnerId,
    name: params.customerName,
  });

  const paymentDate = new Date().toISOString();
  const { error } = await params.supabase.from("transactions").insert({
    partner_id: params.partnerId,
    store_id: params.storeId || null,
    description: `Reembolso automático da venda ${params.orderNumber}`,
    category: "Reembolso",
    customer_id: params.customerId || null,
    contact_id: transactionContactId,
    contact_type: "customer",
    amount: refundableAmount,
    due_date: null,
    payment_date: paymentDate,
    transaction_date: paymentDate,
    status: "paid",
    notes: "Gerado automaticamente ao cancelar venda.",
    payment_type: "Reembolso",
    original_amount: refundableAmount,
    interest_amount: null,
    fee_amount: 0,
    transaction_type: "expense",
    origin: "system",
    refund_kind: "revenue_refund",
    reference_note: params.orderId,
    account_id: financeAccountId,
    created_by_user_id: params.createdByUserId || null,
    kind: "refund",
  });

  if (error) return { error: error.message };
  return { success: true as const };
}

async function restoreCancelledOrderInventory(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  items: Array<{
    product_id?: string | null;
    variant_id?: string | null;
    quantity: number;
  }>;
}) {
  const validItems = (params.items || []).filter(
    (item) => item.product_id && Number(item.quantity || 0) > 0,
  );
  if (validItems.length === 0) return { success: true as const };

  const movementItems = validItems.map((item) => ({
    product_id: item.product_id,
    variant_id: item.variant_id || null,
    quantity: Number(item.quantity || 0),
  }));

  const { error } = await createAdminClient().rpc("create_batch_stock_movement", {
    p_partner_id: params.partnerId,
    p_movement_type: "in",
    p_reason: "CANCEL",
    p_notes: "Restauração de inventário por cancelamento de pedido",
    p_created_by: null,
    p_items: movementItems,
  });

  if (error) return { error: error.message };
  return { success: true as const };
}

async function resolveTransactionContactByName(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  name?: string | null;
}) {
  const normalizedName = String(params.name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!normalizedName) return null;

  const { data: existing, error: existingError } = await params.supabase
    .from("transaction_contacts")
    .select("id")
    .eq("partner_id", params.partnerId)
    .eq("type", "customer")
    .ilike("name", normalizedName)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    console.error("[orders_cancel_refund] failed_to_find_transaction_contact", {
      partnerId: params.partnerId,
      name: normalizedName,
      error: existingError,
    });
    return null;
  }

  return existing?.id || null;
}

async function createRefundTransactionForCancelledOrderSafe(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  orderNumber: string;
  orderId: string;
  customerId?: string | null;
  customerName?: string | null;
  paidAmount: number;
  financeAccountId?: string | null;
  explicitRefundAccountId?: string | null;
  createdByUserId?: string | null;
  storeId?: string | null;
  paymentBreakdown?: Array<{
    method?: string | null;
    amount?: number;
    amountReceived?: number;
    paymentMethodId?: string | null;
    provider?: string | null;
  }> | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
}) {
  const paidAmount = Math.max(0, Number(params.paidAmount || 0));
  if (paidAmount <= 0.009) return { success: true as const };

  let financeAccountId = params.explicitRefundAccountId || null;

  if (!financeAccountId) {
    // Resolve the actual account that received payment for this order:
    // 1) paid income transactions -> 2) payment method default account ->
    // 3) Mercado Pago gateway account -> 4) order.finance_account_id
    const resolved = await resolveOrderRefundFinanceAccount(params.supabase, {
      partnerId: params.partnerId,
      storeId: params.storeId || null,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      financeAccountId: params.financeAccountId || null,
      paymentMethod: params.paymentMethod || null,
      paymentProvider: params.paymentProvider || null,
      paymentBreakdown: params.paymentBreakdown || null,
    });
    if (resolved.accountId) {
      let verifyQuery = params.supabase
        .from("finance_accounts")
        .select("id")
        .eq("id", resolved.accountId)
        .eq("partner_id", params.partnerId);
      verifyQuery = params.storeId
        ? verifyQuery.or(`store_id.is.null,store_id.eq.${params.storeId}`)
        : verifyQuery.is("store_id", null);
      const { data: verifiedAccount } = await verifyQuery.maybeSingle();
      if (verifiedAccount?.id) {
        financeAccountId = verifiedAccount.id;
      }
    }
  }

  if (!financeAccountId) {
    // Fallback 1: Try to query the partner's default active financial account
    let defaultAccountQuery = params.supabase
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", params.partnerId)
      .eq("is_default", true)
      .eq("is_active", true);
    defaultAccountQuery = params.storeId
      ? defaultAccountQuery.or(`store_id.is.null,store_id.eq.${params.storeId}`)
      : defaultAccountQuery.is("store_id", null);
    const { data: defaultAccount } = await defaultAccountQuery.maybeSingle();

    if (defaultAccount?.id) {
      financeAccountId = defaultAccount.id;
    }
  }

  if (!financeAccountId) {
    // Fallback 2: Try to query any active financial account for the partner
    let anyAccountQuery = params.supabase
      .from("finance_accounts")
      .select("id")
      .eq("partner_id", params.partnerId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });
    anyAccountQuery = params.storeId
      ? anyAccountQuery.or(`store_id.is.null,store_id.eq.${params.storeId}`)
      : anyAccountQuery.is("store_id", null);
    const { data: anyAccount } = await anyAccountQuery.limit(1).maybeSingle();

    if (anyAccount?.id) {
      financeAccountId = anyAccount.id;
    }
  }

  if (!financeAccountId) {
    const message =
      "Não foi possível gerar o reembolso automático: o pedido não tem conta financeira de origem. Atualize o pedido com a conta correta antes de cancelar.";
    console.error("[orders_cancel_refund] missing_finance_account", {
      orderId: params.orderId,
      partnerId: params.partnerId,
      paidAmount,
    });
    return { error: message };
  }

  const { data: existingRefunds, error: existingRefundsError } =
    await params.supabase
      .from("transactions")
      .select("id, amount, status")
      .eq("partner_id", params.partnerId)
      .eq("refund_kind", "revenue_refund")
      .eq("reference_note", params.orderId)
      .in("status", ["paid", "partially_paid"]);

  if (existingRefundsError) {
    console.error("[orders_cancel_refund] failed_to_check_existing_refunds", {
      orderId: params.orderId,
      partnerId: params.partnerId,
      error: existingRefundsError,
    });
    return { error: existingRefundsError.message };
  }

  const alreadyRefundedAmount = (existingRefunds || []).reduce(
    (sum: number, tx: any) => {
      return sum + Math.abs(Number(tx.amount || 0));
    },
    0,
  );
  const refundableAmount = Math.max(0, paidAmount - alreadyRefundedAmount);
  if (refundableAmount <= 0.009) return { success: true as const };

  // O reembolso deve respeitar o(s) método(s) de pagamento da venda: uma mov
  // financeira por método usado (payment_breakdown), cada uma com o método e o
  // valor do respectivo método. Sem breakdown, usa o método da venda (ou Reembolso).
  const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
  const breakdownEntries = (
    Array.isArray(params.paymentBreakdown) ? params.paymentBreakdown : []
  ).filter(
    (e: any) =>
      Number(e?.amount || 0) > 0.009 && String(e?.method || "").trim(),
  );

  const refundLegs: Array<{
    method: string;
    amount: number;
    paymentMethodId?: string | null;
  }> = [];
  if (breakdownEntries.length > 0) {
    const breakdownTotal = breakdownEntries.reduce(
      (sum: number, e: any) => sum + Math.max(0, Number(e?.amount || 0)),
      0,
    );
    let remaining = refundableAmount;
    for (let i = 0; i < breakdownEntries.length && remaining > 0.009; i += 1) {
      const entry = breakdownEntries[i];
      const isLast = i === breakdownEntries.length - 1;
      const share = isLast
        ? remaining
        : Math.min(
          round2(
            (Math.max(0, Number(entry?.amount || 0)) / breakdownTotal) *
            refundableAmount,
          ),
          remaining,
        );
      const legAmount = round2(share);
      remaining = round2(remaining - legAmount);
      if (legAmount <= 0.009) continue;
      refundLegs.push({
        method: String(entry?.method || "").trim(),
        amount: legAmount,
        paymentMethodId: entry?.paymentMethodId || null,
      });
    }
  }
  if (refundLegs.length === 0) {
    refundLegs.push({
      method: String(params.paymentMethod || "").trim() || "Reembolso",
      amount: refundableAmount,
      paymentMethodId: null,
    });
  }

  const { data, error } = await createAdminClient().rpc(
    "create_order_cancellation_refunds_atomic",
    {
      p_partner_id: params.partnerId,
      p_order_id: params.orderId,
      p_account_id: financeAccountId,
      p_created_by_user_id: params.createdByUserId || null,
      p_rows: refundLegs.map((leg) => ({
        amount: leg.amount,
        payment_type: leg.method,
        payment_method_id: leg.paymentMethodId || null,
      })),
    },
  );

  if (error) {
    console.error("[orders_cancel_refund] atomic_refund_failed", {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      partnerId: params.partnerId,
      financeAccountId,
      paidAmount,
      alreadyRefundedAmount,
      refundableAmount,
      error,
    });
    return { error: error.message || "Não foi possível gerar o reembolso automático." };
  }

  return { success: true as const, created: Number(data?.created || 0) };
}

function buildReopenStockErrorMessage(items: OrderStockItem[]) {
  const validItems = (items || []).filter(
    (item) => item.product_id && Number(item.quantity || 0) > 0,
  );
  return validItems.length <= 1
    ? "Estoque insuficiente para o item da venda."
    : "Estoque insuficiente para um ou mais itens.";
}

async function createOrderStockMovement(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  orderId: string;
  orderNumber?: string | null;
  createdBy: string;
  type: "in" | "out";
  reason: string;
  notes?: string;
  storeId?: string | null;
  items: Array<{
    product_id?: string | null;
    variant_id?: string | null;
    quantity: number;
  }>;
}) {
  const movementItems = params.items
    .filter((item) => item.product_id && Number(item.quantity || 0) > 0)
    .map((item) => ({
      product_id: item.product_id,
      variant_id: item.variant_id || null,
      quantity: Number(item.quantity || 0),
    }));

  if (movementItems.length === 0) {
    return { success: true as const };
  }

  const { data: movementRecord, error } = await createAdminClient().rpc(
    "create_batch_stock_movement",
    {
      p_partner_id: params.partnerId,
      p_movement_type: params.type,
      p_reason: params.reason,
      p_notes: params.notes || null,
      p_created_by: params.createdBy,
      p_items: movementItems,
      p_store_id: params.storeId || null,
    },
  );

  if (error) {
    console.error(
      "[orders_stock_movement] create_batch_stock_movement_failed",
      {
        partnerId: params.partnerId,
        orderId: params.orderId,
        type: params.type,
        reason: params.reason,
        items: movementItems,
        error,
      },
    );
    return { error: error.message };
  }

  const movementId = (movementRecord as any)?.id;
  if (movementId) {
    let orderNumber = params.orderNumber;
    if (!orderNumber) {
      const { data: orderRef } = await params.supabase
        .from("orders")
        .select("order_number")
        .eq("id", params.orderId)
        .single();
      orderNumber = (orderRef as any)?.order_number || params.orderId;
    }
    const { error: linkError } = await params.supabase
      .from("stock_movements")
      .update({
        order_id: params.orderId,
        reference_name: `Pedido #${orderNumber}`,
      })
      .eq("id", movementId);

    if (linkError) {
      console.error("[orders_stock_movement] failed_to_link_order", {
        partnerId: params.partnerId,
        orderId: params.orderId,
        movementId,
        error: linkError,
      });
    }
  }

  await revalidateStockMovements(params.partnerId);

  for (const item of movementItems) {
    if (item.product_id) {
      await invalidateProductCache(
        item.product_id,
        params.partnerId,
        "update",
        { silent: true },
      );
    }
  }

  return { success: true as const };
}

async function invalidateInventoryItems(
  partnerId: string,
  items: Array<{ product_id?: string | null }>,
) {
  const productIds = Array.from(
    new Set(items.map((item) => item.product_id).filter(Boolean)),
  ) as string[];

  await Promise.all(
    productIds.map((productId) =>
      invalidateProductCache(productId, partnerId, "update", { silent: true }),
    ),
  );
}

async function resolveOrderPreparationEstimate(params: {
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  partnerId: string;
  items: Array<{ productId?: string | null }>;
  deliveryMethod: "delivery" | "pickup";
}) {
  const productIds = Array.from(
    new Set(params.items.map((item) => item.productId).filter(Boolean)),
  ) as string[];
  if (productIds.length === 0) return null;

  const [{ data: products }, { data: partner }] = await Promise.all([
    params.supabase
      .from("products")
      .select("id, availability_value, availability_unit")
      .eq("partner_id", params.partnerId)
      .in("id", productIds),
    params.supabase
      .from("stores")
      .select("opening_hours")
      .eq("partner_id", params.partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const estimate = computeOrderPreparationEstimate({
    products: (products || []).map((product: any) => ({
      availability_value: Number(product.availability_value || 0),
      availability_unit: product.availability_unit || "Minutos",
    })),
    openingHours: (partner as any)?.opening_hours || null,
    pickupWindowMinutes: 30,
    deliveryTimeEstimateMinutes: 0,
  });

  if (!estimate) return null;
  return {
    preparation_time_minutes: estimate.preparationTimeMinutes,
    estimated_ready_at: estimate.readyAt.toISOString(),
    pickup_window_start: estimate.pickupWindowStart.toISOString(),
    pickup_window_end: estimate.pickupWindowEnd.toISOString(),
    estimated_delivery_at:
      params.deliveryMethod === "delivery"
        ? estimate.estimatedDeliveryAt.toISOString()
        : null,
  };
}

export async function createERPOrderAction(data: ERPOrderPayload) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL);
  const user = await requireUser();
  if (!user) return { error: "Não autenticado" };

  const partnerId = data.partnerId;
  const context = await getCurrentPartnerContext(user);
  if (!context?.partnerId || context.partnerId !== partnerId) {
    return { error: "O parceiro informado não corresponde ao contexto ativo" };
  }
  data.storeId = data.storeId || context.activeStoreId || undefined;
  const permissionPromise = requirePermission(partnerId, "orders", "create");
  if (data.storeId) await requireStorePermission(data.storeId, partnerId, "orders", "create");
  if (Number(data.paidAmount || 0) > 0.009 || data.paymentStatus === "paid" || data.paymentStatus === "partially_paid") {
    await requirePermission(partnerId, "financial", "create", user);
    if (data.storeId) await requireStorePermission(data.storeId, partnerId, "financial", "create");
  }
  const capabilitiesPromise = getPartnerCapabilities(partnerId, {
    storeId: data.storeId,
  });

  // Validate discount permission if a discount is being applied
  if (data.discountValue > 0 || data.couponCode) {
    await requirePermission(partnerId, "orders", "can_apply_discount");
    if (data.storeId) {
      await requireStorePermission(
        data.storeId,
        partnerId,
        "orders",
        "can_apply_discount",
      );
    }
  }

  if (!data.skipCSRF) {
    const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper");
    const csrfValidation = await requireCSRF(data.csrf_token);
    if (!csrfValidation.valid)
      return { error: csrfValidation.error || "Token CSRF inválido" };
  }

  const sanitizedItemsResult = sanitizeERPItems(data.items);
  if ("error" in sanitizedItemsResult)
    return { error: sanitizedItemsResult.error };
  const sanitizedItems = sanitizedItemsResult.items;

  const [capabilities] = await Promise.all([
    capabilitiesPromise,
    permissionPromise,
  ]);
  data.financeAccountId =
    capabilities.hasFinancial && data.financeAccountId?.trim()
      ? data.financeAccountId.trim()
      : null;

  const supabase = createAdminClient();
  const itemReferenceError = await validateERPItemReferences({
    supabase,
    partnerId,
    storeId: data.storeId,
    items: sanitizedItems,
  });
  if (itemReferenceError) return { error: itemReferenceError };
  if (data.sourceQuoteId) {
    const { data: sourceQuote, error: sourceQuoteError } = await supabase
      .from("quotes")
      .select("id")
      .eq("id", data.sourceQuoteId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (sourceQuoteError || !sourceQuote) {
      return { error: "Orçamento não encontrado neste parceiro." };
    }
  }

  // ── Consolidate all independent pre-order reads into parallel execution ──
  const limitCheckPromise = checkLimit(partnerId, "monthly_orders");
  const customerIdPromise = resolvePartnerCustomerId(
    supabase,
    partnerId,
    data.customerId,
  )
    .then((id) => ({ id, error: null }))
    .catch((err) => ({
      id: null,
      error: err?.message || "Cliente inválido para este parceiro.",
    }));

  const financeAccountPromise =
    capabilities.hasFinancial && data.financeAccountId
      ? supabase
        .from("finance_accounts")
        .select("id, store_id")
        .eq("id", data.financeAccountId)
        .eq("partner_id", partnerId)
        .limit(1)
        .maybeSingle()
      : Promise.resolve({ data: null });

  const partnerRowPromise = supabase
    .from("partners")
    .select("business_info")
    .eq("id", partnerId)
    .single();
  const deliveryRowPromise = resolveDeliverySettingsRow(
    supabase,
    partnerId,
    data.storeId,
  );

  const preparationEstimatePromise = resolveOrderPreparationEstimate({
    supabase,
    partnerId,
    items: sanitizedItems,
    deliveryMethod: data.deliveryMethod,
  });

  const productIds = sanitizedItems
    .filter((item) => item.productId)
    .map((item) => item.productId);
  const serviceIds = sanitizedItems
    .filter((item) => (item as any).serviceId)
    .map((item) => (item as any).serviceId);
  const variantIds = sanitizedItems
    .filter((item) => item.variantId)
    .map((item) => item.variantId);

  const itemCostPromise = Promise.all([
    productIds.length > 0
      ? supabase
        .from("products")
        .select("id, cost_price")
        .eq("partner_id", partnerId)
        .in("id", productIds)
      : Promise.resolve({ data: [] as any[] }),
    variantIds.length > 0
      ? supabase
        .from("product_variants")
        .select("id, product_id")
        .in("id", variantIds)
      : Promise.resolve({ data: [] as any[] }),
    serviceIds.length > 0
      ? supabase
        .from("services")
        .select("id, cost_price")
        .eq("partner_id", partnerId)
        .in("id", serviceIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const sellerCommissionPromise = (async () => {
    if (!user.id || !capabilities.hasProductivity) return 0;
    const { calculateCommission } =
      await import("@/lib/services/commission.service");
    const { data: sellerCommissions } = await supabase
      .from("employee_commissions")
      .select("*")
      .eq("partner_id", partnerId)
      .eq("role", "seller")
      .maybeSingle();
    if (!sellerCommissions || sellerCommissions.commission_type === "none")
      return 0;
    return calculateCommission({
      userId: user.id,
      role: "seller",
      commissionType: sellerCommissions.commission_type,
      value: Number(sellerCommissions.value || 0),
      saleAmount: Math.max(0, Number(data.subtotal || 0)),
    });
  })();

  const promotionsPromise = (async () => {
    if (!capabilities.hasCampaigns)
      return { rawPromotions: [] as any[], filteredPromotions: [] as any[] };
    const {
      listActivePromotionsForMarketplaceAction,
      filterRawPromotionsByGiftStock,
    } = await import("@/app/actions/shared/promotions");
    const raw = await listActivePromotionsForMarketplaceAction(
      partnerId,
      data.customerId || null,
    );
    const filtered =
      raw && raw.length > 0
        ? await filterRawPromotionsByGiftStock(raw, supabase)
        : [];
    return { rawPromotions: raw, filteredPromotions: filtered };
  })();

  const couponPromise = (async () => {
    if (!capabilities.hasCoupons)
      return {
        couponIdToSave: null,
        couponDiscountAmount: 0,
        couponPricingData: null as
          import("@/lib/services/pricing-engine").PricingCoupon | null,
        error: null as string | null,
      };
    if (data.couponCode?.trim()) {
      const resolvedCustId = await customerIdPromise
        .then((r) => r.id)
        .catch(() => null);
      const couponValidation = await validateCoupon({
        partnerId,
        code: data.couponCode,
        customerId: resolvedCustId,
        subtotal: Number(data.subtotal || 0),
        shippingCost: Number(data.shippingCost || 0),
        items: sanitizedItems.map((item) => ({
          productId: item.productId || null,
        })),
      });
      if (!couponValidation.valid) {
        return {
          couponIdToSave: null,
          couponDiscountAmount: 0,
          couponPricingData: null,
          error: couponValidation.errorMessage || "Cupom inválido.",
        };
      }
      return {
        couponIdToSave: couponValidation.couponId || null,
        couponDiscountAmount: Number(couponValidation.discountAmount || 0),
        couponPricingData: couponValidation.pricingCoupon || null,
        error: null,
      };
    } else if (data.couponId) {
      const resolvedCustId = await customerIdPromise
        .then((r) => r.id)
        .catch(() => null);
      const couponValidation = await validateCouponById(data.couponId, {
        partnerId,
        customerId: resolvedCustId,
        subtotal: Number(data.subtotal || 0),
        shippingCost: Number(data.shippingCost || 0),
        items: sanitizedItems.map((item) => ({
          productId: item.productId || null,
        })),
      });
      if (couponValidation.valid) {
        return {
          couponIdToSave: data.couponId,
          couponDiscountAmount: Number(couponValidation.discountAmount || 0),
          couponPricingData: couponValidation.pricingCoupon || null,
          error: null,
        };
      }
    }
    return {
      couponIdToSave: null,
      couponDiscountAmount: 0,
      couponPricingData: null,
      error: null,
    };
  })();

  const stockValidationPromise = (async () => {
    if (!capabilities.hasStockMovements) return null;
    const partnerRowRes = await partnerRowPromise;
    const pInfo = normalizeBusinessInfo(partnerRowRes.data?.business_info);
    const settings: SalesSettings = {
      ...DEFAULT_SALES_SETTINGS,
      ...((pInfo as any)?.salesSettings || {}),
    };
    return validateERPItemsStock({
      supabase,
      partnerId,
      items: sanitizedItems,
      salesSettings: settings,
    });
  })();

  const [
    limitCheck,
    customerResolved,
    { data: financeAccount },
    { data: partnerRow },
    deliveryRow,
    preparationEstimate,
    [{ data: productsCost }, { data: variantsCost }, { data: servicesCost }],
    sellerCommissionAmount,
    { filteredPromotions },
    couponResult,
    stockValidationError,
  ] = await Promise.all([
    limitCheckPromise,
    customerIdPromise,
    financeAccountPromise,
    partnerRowPromise,
    deliveryRowPromise,
    preparationEstimatePromise,
    itemCostPromise,
    sellerCommissionPromise,
    promotionsPromise,
    couponPromise,
    stockValidationPromise,
  ]);

  if (!limitCheck.allowed)
    return { error: limitCheck.message || "Limite mensal atingido." };
  if (customerResolved.error) return { error: customerResolved.error };
  const customerId = customerResolved.id;

  const partnerInfo = normalizeBusinessInfo(partnerRow?.business_info);
  const salesSettings: SalesSettings = {
    ...DEFAULT_SALES_SETTINGS,
    ...((partnerInfo as any)?.salesSettings || {}),
  };

  if (salesSettings.requireSeller && !data.sellerPartnerUserId) {
    return {
      error: "É obrigatório selecionar um vendedor para concluir a venda.",
    };
  }

  if (
    capabilities.hasFinancial &&
    data.financeAccountId &&
    !financeAccount?.id
  ) {
    return { error: "Conta de recebimento inválida para esta venda." };
  }
  if (capabilities.hasFinancial && data.financeAccountId && financeAccount?.store_id) {
    if (data.storeId && financeAccount.store_id !== data.storeId) {
      return { error: "A conta financeira pertence a outra loja." };
    }
    await requireStorePermission(financeAccount.store_id, partnerId, "financial", "create");
  }

  if (Number(data.totalAmount || 0) <= 0) {
    return { error: "A venda não pode ser salva com valor total zerado." };
  }

  if (stockValidationError) return { error: stockValidationError };
  if (couponResult.error) return { error: couponResult.error };

  const sanitizedPaymentBreakdown = sanitizePaymentBreakdown(
    data.paymentBreakdown,
  );
  let couponIdToSave: string | null = couponResult.couponIdToSave;
  let couponDiscountAmount = couponResult.couponDiscountAmount;
  let couponPricingData = couponResult.couponPricingData;

  // ── Server-side pricing recalculation ────────────────────────────────
  const { buildGiftOrderItems } =
    await import("@/app/actions/shared/promotions");
  const pricingResult = calculateOrderPricing({
    items: sanitizedItems.map((item) => ({
      productId: item.productId || null,
      serviceId: item.serviceId || null,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      // Preço nominal: evita reaplicar a campanha sobre um preço já promocional.
      basePrice: item.basePrice ?? item.unitPrice,
    })),
    shippingCost: data.deliveryMethod === "pickup" ? 0 : Number(data.shippingCost || 0),
    additionalCosts: Number(data.additionalCosts || 0),
    manualDiscount:
      data.discountValue > 0 && data.discountType !== "coupon"
        ? {
          type: data.discountType as "fixed" | "percentage",
          value: data.discountValue,
        }
        : null,
    coupon: couponPricingData,
    promotions: filteredPromotions,
  });

  const giftIds = pricingResult.appliedGiftProductIds || [];
  const giftItems =
    capabilities.hasCampaigns && giftIds.length > 0
      ? await buildGiftOrderItems(supabase, giftIds, filteredPromotions)
      : [];

  couponDiscountAmount = pricingResult.couponDiscountAmount;
  const serverComputedTotal = pricingResult.finalTotal;
  const serverShippingCost = pricingResult.shipping;

  if (
    salesSettings.maxDiscountPercent !== null &&
    salesSettings.maxDiscountPercent < 100
  ) {
    const subtotal = Math.max(0, Number(data.subtotal || 0));
    const totalDiscount =
      Math.max(0, Number(data.discountValue || 0)) + couponDiscountAmount;
    const effectiveDiscountPercent =
      subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;
    if (effectiveDiscountPercent > salesSettings.maxDiscountPercent + 0.05) {
      const { logPolicyLimitExceeded } = await import("@/lib/auth/auth-logger");
      logPolicyLimitExceeded({
        userId: user?.id,
        partnerId: data.partnerId,
        policy: "maxDiscountPercent",
        attemptedValue: `${effectiveDiscountPercent.toFixed(1)}%`,
        allowedLimit: `${salesSettings.maxDiscountPercent}%`,
        details: {
          subtotal,
          discountValue: data.discountValue,
          couponDiscountAmount,
          totalDiscount,
        },
      });
      return {
        error: `O desconto de ${effectiveDiscountPercent.toFixed(1)}% ultrapassa o limite máximo permitido (${salesSettings.maxDiscountPercent}%) configurado para as vendas.`,
      };
    }
  }

  const sumExplicitAmountReceived = sanitizedPaymentBreakdown.reduce((s, e) => {
    const amtRec = Number(e.amountReceived || 0);
    return s + (amtRec > 0.005 ? amtRec : 0);
  }, 0);

  let paymentMethodInterestAmount = 0;
  let paymentMethodFeeAmount = 0;
  let paymentMethodFixedFeeAmount = 0;
  let breakdownPaymentMethodDiscountAmount = 0;
  let paymentMethodStoreCreditAmount = 0;
  let customerExtraFees = 0;

  for (const entry of sanitizedPaymentBreakdown) {
    const m = String(entry.method || "")
      .toLowerCase()
      .trim();
    const bearer = String(entry.feeBearer || "merchant")
      .toLowerCase()
      .trim();
    const isCustomerBearer = bearer === "customer" || bearer === "buyer";
    const adjType = String(entry.adjustmentType || "")
      .toLowerCase()
      .trim();
    const pmDisc = Math.max(
      0,
      Number(
        entry.paymentMethodDiscountAmount ||
        (adjType === "discount" ? entry.adjustmentAmount : 0) ||
        0,
      ),
    );

    const entryInterest = Number(entry.interestAmount || 0);
    const entryInstallmentCost = Number(entry.installmentCostAmount || 0);
    const entryFixedInterest = Math.max(
      0,
      entryInterest - entryInstallmentCost,
    );
    const installmentFeeBearer = String(
      entry.installmentFeeBearer || "merchant",
    )
      .toLowerCase()
      .trim();
    const isCustomerInstallmentBearer =
      installmentFeeBearer === "customer" || installmentFeeBearer === "buyer";

    // Desconto de meio de pagamento sempre abata o total, independente de quem paga taxas
    breakdownPaymentMethodDiscountAmount = Math.max(
      0,
      breakdownPaymentMethodDiscountAmount + pmDisc,
    );

    if (!isCustomerBearer) {
      paymentMethodInterestAmount = Math.max(
        0,
        paymentMethodInterestAmount + entryFixedInterest,
      );
      if (!isCustomerInstallmentBearer) {
        paymentMethodInterestAmount = Math.max(
          0,
          paymentMethodInterestAmount + entryInstallmentCost,
        );
      }
      paymentMethodFeeAmount = Math.max(
        0,
        paymentMethodFeeAmount + Number(entry.feeAmount || 0),
      );
      paymentMethodFixedFeeAmount = Math.max(
        0,
        paymentMethodFixedFeeAmount + Number(entry.fixedFeeAmount || 0),
      );
      if (isCustomerInstallmentBearer) {
        customerExtraFees = Math.max(
          0,
          customerExtraFees + entryInstallmentCost,
        );
      }
    } else {
      customerExtraFees = Math.max(0, customerExtraFees + entryFixedInterest);
      if (isCustomerInstallmentBearer) {
        customerExtraFees = Math.max(
          0,
          customerExtraFees + entryInstallmentCost,
        );
      }
      customerExtraFees = Math.max(
        0,
        customerExtraFees +
        Number(entry.feeAmount || 0) +
        Number(entry.fixedFeeAmount || 0),
      );
    }
    if (isStoreCreditMethod(entry.method) || isStoreCreditMethod(m)) {
      paymentMethodStoreCreditAmount = Math.max(
        0,
        paymentMethodStoreCreditAmount +
        Number(entry.amount || entry.effectiveAmount || 0),
      );
    }
  }

  const paymentMethodDiscountAmount = breakdownPaymentMethodDiscountAmount;
  const paymentMethodExtraAmount = customerExtraFees;
  const serverTotalAmount = Math.max(
    0,
    serverComputedTotal -
    paymentMethodDiscountAmount +
    paymentMethodExtraAmount,
  );
  const adjustedPaymentBreakdown = sanitizedPaymentBreakdown;
  const paymentMethodSummary = buildPaymentMethodSummary(
    adjustedPaymentBreakdown,
    data.paymentMethod,
  );
  const effectivePaidAmount =
    data.paymentStatus === "unpaid"
      ? 0
      : data.paidAmount != null && !isNaN(Number(data.paidAmount))
        ? Math.max(0, Number(data.paidAmount))
        : sumExplicitAmountReceived > 0.005
          ? sumExplicitAmountReceived
          : data.paymentStatus === "paid"
            ? serverTotalAmount
            : 0;

  const paymentState = resolvePaymentState({
    requestedStatus: data.paymentStatus,
    totalAmount: serverTotalAmount,
    paidAmount: effectivePaidAmount,
    fallbackPaidAmount:
      data.paymentStatus === "paid"
        ? serverTotalAmount
        : data.paymentStatus === "partially_paid"
          ? Number(data.paidAmount || 0)
          : 0,
  });

  let deliveryAddressStr = "";
  if (data.deliveryMethod === "delivery" && data.address) {
    const { buildFormattedAddress } =
      await import("@/lib/utils/format-address");
    deliveryAddressStr = buildFormattedAddress(data.address);
  }

  const deliveryPayer: "customer" | "seller" =
    deliveryRow?.delivery_payer === "seller" ? "seller" : "customer";
  const effectiveDeliveryPayer =
    (data.deliveryBreakdown?.deliveryPayer as "seller" | "customer") ||
    deliveryPayer;

  // Baixa física ocorre somente quando o pedido já sai entregue/enviado (sent/delivered).
  // Pedidos pagos mas ainda não enviados/retirados permanecem reservados (stock_reserved),
  // espelhando o estoque físico real da prateleira e o comportamento do Tiny ERP.
  const isImmediateInventoryDeduction = shouldDeductInventory(data.deliveryStatus);

  let paymentExpiresAt: string | null = null;
  if (
    paymentState.situation === "pending" &&
    salesSettings.autoCancelManualOrdersHours > 0
  ) {
    paymentExpiresAt = new Date(
      Date.now() + salesSettings.autoCancelManualOrdersHours * 60 * 60 * 1000,
    ).toISOString();
  }

  const orderInsertPayload: Record<string, unknown> = {
    ...(data.id ? { id: data.id } : {}),
    partner_id: partnerId,
    customer_id: customerId,
    buyer_id: customerId,
    customer_name: data.customerName || null,
    source_quote_id: data.sourceQuoteId || null,
    order_source: buildOrderSource(data.salesChannel, data.deliveryMethod),
    delivery_type: data.deliveryMethod,
    store_id: data.storeId || null,
    situation: paymentState.situation,
    delivery_status: data.deliveryStatus,
    total_amount: serverTotalAmount,
    paid_amount: paymentState.paidAmount,
    discount_value: data.discountValue,
    discount_type: data.discountType,
    discount_amount: couponDiscountAmount,
    item_discount_amount: pricingResult.itemDiscountAmount,
    campaign_discount_amount: pricingResult.campaignDiscountAmount,
    manual_discount_amount: pricingResult.manualDiscountAmount,
    payment_method_discount_amount: paymentMethodDiscountAmount,
    payment_method_extra_amount: paymentMethodExtraAmount,
    payment_method_interest_amount: paymentMethodInterestAmount,
    payment_method_fee_amount: paymentMethodFeeAmount,
    payment_method_fixed_fee_amount: paymentMethodFixedFeeAmount,
    store_credit_amount: paymentMethodStoreCreditAmount,
    coupon_id: couponIdToSave,
    delivery_fee: data.deliveryMethod === "pickup" ? 0 : serverShippingCost,
    delivery_breakdown: data.deliveryMethod === "pickup" ? null : ((data.deliveryBreakdown as Record<string, unknown> | null) || null),
    additional_costs: data.additionalCosts,
    notes: sanitizeNotes(data.notes),
    payment_method: paymentMethodSummary,
    payment_breakdown: adjustedPaymentBreakdown,
    payment_provider: data.paymentProvider || null,
    mp_payment_id: data.mpPaymentId || null,
    checkout_fulfillment: data.checkoutFulfillment || null,
    delivery_address: deliveryAddressStr || null,
    finance_account_id: data.financeAccountId,
    created_by: user.id,
    seller_partner_user_id: data.sellerPartnerUserId || null,
    pricing_version: pricingResult.pricingVersion,
    delivery_payer: effectiveDeliveryPayer,
    seller_commission_amount: sellerCommissionAmount,
    inventory_deducted: isImmediateInventoryDeduction,
    ...(paymentExpiresAt ? { payment_expires_at: paymentExpiresAt } : {}),
    ...(preparationEstimate || {}),
  };

  let orderInsertResult = await supabase
    .from("orders")
    .insert(orderInsertPayload)
    .select()
    .single();

  if (
    orderInsertResult.error &&
    isMissingOrdersPaymentMethodDeltaColumnsError(orderInsertResult.error)
  ) {
    const fallbackInsertPayload = { ...orderInsertPayload };
    delete (fallbackInsertPayload as any).payment_method_discount_amount;
    delete (fallbackInsertPayload as any).payment_method_extra_amount;
    delete (fallbackInsertPayload as any).payment_method_interest_amount;
    delete (fallbackInsertPayload as any).payment_method_fee_amount;
    delete (fallbackInsertPayload as any).payment_method_fixed_fee_amount;
    delete (fallbackInsertPayload as any).item_discount_amount;
    delete (fallbackInsertPayload as any).campaign_discount_amount;
    delete (fallbackInsertPayload as any).manual_discount_amount;
    delete (fallbackInsertPayload as any).store_credit_amount;
    delete (fallbackInsertPayload as any).payment_expires_at;
    orderInsertResult = await supabase
      .from("orders")
      .insert(fallbackInsertPayload)
      .select()
      .single();
  }

  const order = orderInsertResult.data;
  const orderError = orderInsertResult.error;
  if (orderError) return { error: orderError.message };

  const productCostMap = new Map<string, number>(
    (productsCost || []).map((p: { id: string; cost_price: number | null }) => [
      p.id,
      Number(p.cost_price || 0),
    ]),
  );
  const variantCostMap = new Map<string, number>(
    (variantsCost || []).map((v: { id: string; product_id: string }) => [
      v.id,
      Number(productCostMap.get(v.product_id) || 0),
    ]),
  );
  const serviceCostMap = new Map<string, number>(
    (servicesCost || []).map((s: { id: string; cost_price: number | null }) => [
      s.id,
      Number(s.cost_price || 0),
    ]),
  );

  const giftItemsToInsert = giftItems.map((item, idx) => ({
    order_id: order.id,
    product_id: item.product_id,
    service_id: item.service_id ?? null,
    variant_id: null,
    product_name: item.product_name,
    product_price: 0,
    quantity: 1,
    subtotal: 0,
    sort_order: sanitizedItems.length + idx + 1,
    is_gift: true,
    original_price: item.original_price,
    discount_amount: 0,
    is_promotional: true,
    promotion_id: item.promotion_id,
    // Brinde: receita 0, custo real no CMV.
    unit_cost: Number(
      item.unit_cost ??
      (item.service_id
        ? serviceCostMap.get(item.service_id)
        : productCostMap.get(item.product_id)) ??
      0,
    ),
  }));
  const itemsToInsert = [
    ...sanitizedItems.map((item) => {
      let unitCost = 0;
      if ((item as any).serviceId) {
        unitCost = serviceCostMap.get((item as any).serviceId) || 0;
      } else if (item.variantId) {
        unitCost = variantCostMap.get(item.variantId) || 0;
      } else if (item.productId) {
        unitCost = productCostMap.get(item.productId) || 0;
      }
      return {
        order_id: order.id,
        product_id: item.productId,
        variant_id: item.variantId || null,
        product_name: item.customName || "Item manual",
        product_price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
        sort_order: item.sortOrder,
        is_gift: false,
        original_price:
          item.basePrice != null && item.basePrice > 0 ? item.basePrice : null,
        discount_amount: Math.max(
          0,
          Math.round(
            ((item.basePrice ?? item.unitPrice) - item.unitPrice) *
              item.quantity *
              100,
          ) / 100,
        ),
        is_promotional: false,
        promotion_id: null,
        service_id: (item as any).serviceId || null,
        line_type: (item as any).lineType || "product",
        fulfillment_mode: (item as any).fulfillmentMode || null,
        unit_cost: unitCost,
      };
    }),
    ...giftItemsToInsert,
  ];

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(itemsToInsert);
  if (itemsError) {
    await supabase.from("orders").delete().eq("id", order.id);
    return { error: itemsError.message };
  }

  const stockItems = [
    ...sanitizedItems
      .filter((item) => item.productId)
      .map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
        allow_sell_without_stock: Boolean(item.allowSellWithoutStock),
      })),
    ...giftItems
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        variant_id: null,
        quantity: 1,
      })),
  ];

  if (capabilities.hasStockMovements && stockItems.length > 0) {
    // Always reserve first: finalize_order_inventory requires stock_reserved >=
    // quantity, and variant reservations live in product_variants (products only
    // worked by coincidence with leftover reservations). The reserve RPC already
    // honours the per-item allow_sell_without_stock flag (stock bypass).
    const reserveResult = await reserveOrderInventory({
      client: supabase,
      partnerId,
      orderId: order.id,
      items: stockItems,
      storeId: data.storeId,
    });

    if ("error" in reserveResult) {
      await supabase.from("order_items").delete().eq("order_id", order.id);
      await supabase.from("orders").delete().eq("id", order.id);
      return { error: reserveResult.error };
    }

    if (isImmediateInventoryDeduction) {
      // Deduct right away, consuming the reservation created above.
      const finalizeResult = await finalizeOrderInventory({
        client: supabase,
        partnerId,
        orderId: order.id,
        createdBy: user.id,
        reason: "Venda de Produtos",
        notes: sanitizeNotes(data.notes) || undefined,
        items: stockItems,
        storeId: data.storeId,
      });

      if ("error" in finalizeResult) {
        await supabase.from("order_items").delete().eq("order_id", order.id);
        await supabase.from("orders").delete().eq("id", order.id);
        return { error: finalizeResult.error };
      }
    }
  }

  // ── Launch all remaining write operations simultaneously in parallel ──
  const postOrderPromises: Promise<any>[] = [];

  if (paymentMethodStoreCreditAmount > 0 && customerId) {
    postOrderPromises.push(
      applyStoreCreditDeduction(supabase, {
        partnerId,
        customerId,
        amount: paymentMethodStoreCreditAmount,
      }),
    );
  }

  if (capabilities.hasCoupons && couponIdToSave) {
    postOrderPromises.push(
      createAdminClient().from("coupon_usages").upsert(
        {
          coupon_id: couponIdToSave,
          customer_id: customerId,
          order_id: order.id,
        },
        { onConflict: "coupon_id,order_id", ignoreDuplicates: true },
      ),
    );
  }

  postOrderPromises.push(
    increment_usage_counter(partnerId, "orders_month_count"),
  );

  if (capabilities.hasFinancial && paymentState.paidAmount > 0.009) {
    const finalBreakdown =
      adjustedPaymentBreakdown && adjustedPaymentBreakdown.length > 0
        ? adjustedPaymentBreakdown
        : [
          {
            method:
              data.paymentMethod &&
                data.paymentMethod !== "Método não definido"
                ? data.paymentMethod
                : "Dinheiro",
            amount: paymentState.paidAmount,
            amountReceived: paymentState.paidAmount,
            effectiveAmount: paymentState.paidAmount,
          },
        ];

    postOrderPromises.push(
      createFinancialTransactionsForReceivedAmount(supabase, {
        orderId: order.id,
        orderNumber: order.order_number,
        partnerId,
        storeId: order.store_id || data.storeId || null,
        totalAmount: Number(order.total_amount || 0),
        newBreakdown: finalBreakdown,
        oldBreakdown: [],
        customerId: order.customer_id || order.buyer_id || null,
        customerName: order.customer_name,
        financeAccountId: order.finance_account_id || data.financeAccountId,
        orderSource: order.order_source || "manual",
        paymentMethod:
          paymentMethodSummary || data.paymentMethod || "Método não definido",
      }),
    );
  }

  if (
    capabilities.hasFinancial &&
    (paymentState.situation !== "paid" || data.id)
  ) {
    postOrderPromises.push(
      (async () => {
        const { syncReceivableForOrder } =
          await import("@/lib/services/transaction.service");
        return syncReceivableForOrder(supabase, {
          order_number: order.order_number,
          partner_id: partnerId,
          store_id: order.store_id || data.storeId || null,
          total_amount: Number(order.total_amount || 0),
          paid_amount: Number(paymentState.paidAmount || 0),
          situation: paymentState.situation,
          payment_method: paymentMethodSummary || data.paymentMethod,
          customer_id: order.customer_id || order.buyer_id || null,
          customer_name: order.customer_name,
          finance_account_id: order.finance_account_id || data.financeAccountId,
          order_source: order.order_source || "manual",
        });
      })(),
    );
  }

  if (paymentState.situation === "paid") {
    if (
      !data.skipPostPaymentSellerSideEffects &&
      capabilities.hasProductivity
    ) {
      postOrderPromises.push(
        createSellerCommissionForPaidOrder({
          supabase,
          partnerId,
          orderId: order.id,
          sellerUserId: user.id,
          saleAmount: Number(order.total_amount || 0),
          accountId: order.finance_account_id || data.financeAccountId,
          createdByUserId: user.id,
          storeId: order.store_id || data.storeId || null,
        }),
      );
    }
  }

  // Export order to Tiny ERP if configured (non-blocking)
  try {
    import("@/lib/services/integrations/erp-sync").then(({ exportOrderToConnectedErps }) => {
      exportOrderToConnectedErps(order.id).catch((err) => {
        console.error("[createERPOrderAction] ERP export failed:", err)
      })
    }).catch((erpErr) => {
      console.error("[createERPOrderAction] Error loading ERP sync:", erpErr)
    })
  } catch {}

  if (
    paymentState.situation === "paid" ||
    paymentState.situation === "partially_paid" ||
    paymentState.situation === "pending"
  ) {
    if (capabilities.hasAppointments) {
      postOrderPromises.push(
        supabase
          .from("appointments")
          .update({ payment_status: paymentState.situation })
          .eq("marketplace_order_id", order.id)
          .eq("partner_id", partnerId),
      );
    }
    if (capabilities.hasServiceOrders) {
      postOrderPromises.push(
        supabase
          .from("service_orders")
          .update({ payment_status: paymentState.situation })
          .eq("order_id", order.id)
          .eq("partner_id", partnerId),
      );
    }
  }

  await Promise.all(postOrderPromises);

  // ── Non-blocking background side effects (audit, cache invalidate, notifications) ──
  const skippedGifts = filteredPromotions.filter(
    (p: any) =>
      p.giftUnavailable && pricingResult.appliedPromotionIds.includes(p.id),
  );

  void (async () => {
    try {
      const auditPromises = [
        logAuditEvent({
          partnerId,
          actorUserId: user.id,
          entityType: "order",
          entityId: order.id,
          actionType: "created",
          changeLines: ["criou venda"],
          source: "erp",
        }),
        ...skippedGifts.map((promo: any) =>
          logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "order",
            entityId: order.id,
            actionType: "created",
            changeLines: [
              `Brinde da campanha "${promo.name}" temporariamente indisponível (sem estoque).`,
            ],
            source: "erp",
          }),
        ),
      ];
      await Promise.all(auditPromises);
      if (!data.skipPostCreateRevalidation) {
        await Promise.all([
          capabilities.hasStockMovements
            ? invalidateInventoryItems(partnerId, stockItems)
            : Promise.resolve(),
          revalidateOrders(partnerId),
        ]);
      }
      const { onOrderStatusChanged } =
        await import("@/lib/services/notification-automation.service");
      await onOrderStatusChanged(
        { ...order, partner_id: partnerId },
        paymentState.situation,
        order.delivery_status,
        "manual",
      );
    } catch (err) {
      console.error("[createERPOrderAction_background_tasks_error]", err);
    }
  })();

  return { success: true, orderId: order.id, orderNumber: order.order_number };
}

export async function getOrderDetailsAction(
  orderId: string,
  partnerId: string,
  opts?: { adminBypass?: boolean },
) {
  const user = await requireUser();
  if (!user) return { error: "Não autenticado" };

  if (opts?.adminBypass) {
    await requireAdminScope("moderation");
  } else {
    try {
      await requirePermission(partnerId, "orders", "view");
    } catch (permErr) {
      try {
        await requireAdminScope("moderation");
      } catch {
        throw permErr;
      }
    }
  }
  const supabase = createAdminClient();
  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      orderId,
    );

  const { data, error } = await getCachedErpPage(
    ["erp-order-detail", partnerId, orderId],
    [TAGS.orders(partnerId), `order-${orderId}`],
    async () => {
      const detailClient = createAdminClient();
      const orderQuery = detailClient
        .from("orders")
        .select(
          `
                    *,
                    order_items(*, products(id, name, sku, images, stock_quantity, stock_available, allow_sell_without_stock, unit), product_variants(id, variant_name, sku, stock_quantity, stock_available, variant_options), services(id, name, images)),
                    stores(name),
                    order_shipments(id, status, kind, carrier, provider_slug, service_code, service_name, price, tracking_number, tracking_url, label_url, external_label_id, created_at, updated_at, paid_at, delivered_at, cancelled_at),
                    coupons(*),
                    appointments(*),
                    return_requests!order_id(id, status, approved_resolution, desired_resolution, resolution_type, refund_amount, store_credit_amount, created_at, return_items!return_items_return_request_id_fkey(*))
                `,
        )
        .eq("partner_id", partnerId);

      if (isUuid) orderQuery.eq("id", orderId);
      else orderQuery.eq("order_number", orderId);

      return orderQuery.maybeSingle();
    },
  );

  if (error) return { error: error.message };
  if (data) {
    if (!opts?.adminBypass && data.store_id) {
      await requireStorePermission(data.store_id, partnerId, "orders", "view");
    }
    // P3: resolve cliente e vendedor em paralelo (consultas independentes entre si)
    // em vez de sequencialmente, reduzindo round-trips na abertura do detalhe.
    const resolveCustomer = async () => {
      if (!data.buyer_id) return null;
      const { data: customerData } = await supabase
        .from("customers")
        .select("id, name, email, phone, image_url, addresses(*)")
        .or(`id.eq.${data.buyer_id},user_id.eq.${data.buyer_id}`)
        .eq("partner_id", partnerId)
        .maybeSingle();
      if (customerData) return customerData;

      try {
        const { data: userProfile } = await supabase
          .from("user_profiles")
          .select("full_name, phone, avatar_url")
          .eq("user_id", data.buyer_id)
          .maybeSingle();

        return {
          id: data.buyer_id,
          name:
            data.customer_name ||
            userProfile?.full_name ||
            "Cliente Marketplace",
          email: data.buyer_email || null,
          phone: userProfile?.phone || null,
          image_url: userProfile?.avatar_url || null,
          addresses: [],
        };
      } catch (err) {
        console.error(
          "Error looking up customer profile for marketplace order:",
          err,
        );
      }
      return null;
    };

    const resolveSellerName = async () => {
      if (data.seller_partner_user_id) {
        const { data: pu } = await supabase
          .from("partner_users")
          .select("user_id")
          .eq("id", data.seller_partner_user_id)
          .maybeSingle();
        if (pu?.user_id) {
          const { data: profile } = await supabase
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", pu.user_id)
            .maybeSingle();
          if (profile?.full_name) return profile.full_name;
        }
      }
      if (!data.created_by) return null;
      const { data: sellerProfile } = await supabase
        .from("user_profiles")
        .select("full_name")
        .eq("user_id", data.created_by)
        .single();
      return sellerProfile?.full_name || null;
    };

    const resolvePlatformDriver = async () => {
      const { data: directAssignment } = await supabase
        .from("delivery_assignments")
        .select(
          "id, driver_id, status, assigned_at, accepted_at, picked_up_at, out_for_delivery_at, completed_at",
        )
        .eq("order_id", data.id)
        .in("status", [
          "available",
          "requested",
          "assigned",
          "accepted",
          "picked_up",
          "out_for_delivery",
          "delivered",
        ])
        .order("assigned_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let targetAssignment = directAssignment;

      if (!targetAssignment) {
        const { data: link } = await supabase
          .from("delivery_orders")
          .select("delivery_id")
          .eq("order_id", data.id)
          .limit(1)
          .maybeSingle();

        if (link?.delivery_id) {
          const { data: linkedAssignment } = await supabase
            .from("delivery_assignments")
            .select(
              "id, driver_id, status, assigned_at, accepted_at, picked_up_at, out_for_delivery_at, completed_at",
            )
            .eq("delivery_id", link.delivery_id)
            .in("status", [
              "available",
              "requested",
              "assigned",
              "accepted",
              "picked_up",
              "out_for_delivery",
              "delivered",
            ])
            .order("assigned_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          targetAssignment = linkedAssignment;
        }
      }

      if (!targetAssignment) {
        return { platformDriverId: null, platformDriver: null };
      }

      if (!targetAssignment.driver_id) {
        return {
          platformDriverId: "dudit_network",
          platformDriver: {
            id: "dudit_network",
            fullName: "Rede de Entregadores Dudit",
            status: targetAssignment.status,
            isPlatformDriver: true,
            isPendingAcceptance: true,
          },
        };
      }

      const driverUserId = String(targetAssignment.driver_id);
      const [
        { data: profile },
        { data: driverRow },
        { count: totalDeliveries },
      ] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("full_name, phone, avatar_url")
          .eq("user_id", driverUserId)
          .maybeSingle(),
        supabase
          .from("delivery_drivers")
          .select("vehicle_type, city")
          .eq("user_id", driverUserId)
          .maybeSingle(),
        supabase
          .from("delivery_assignments")
          .select("id", { count: "exact", head: true })
          .eq("driver_id", driverUserId)
          .eq("status", "delivered"),
      ]);

      const fullName = profile?.full_name || "Entregador Dudit";
      const vehicleType =
        driverRow?.vehicle_type === "moto"
          ? "Moto"
          : driverRow?.vehicle_type === "carro"
            ? "Carro"
            : null;

      return {
        platformDriverId: driverUserId,
        platformDriver: {
          id: driverUserId,
          fullName,
          phone: profile?.phone || null,
          avatarUrl: profile?.avatar_url || null,
          vehicleType,
          totalDeliveries: totalDeliveries || 0,
          status: targetAssignment.status,
          isPlatformDriver: true,
          isPendingAcceptance: false,
        },
      };
    };

    const resolveSourceServiceOrder = async () => {
      if ((data as any).source_service_order_id) {
        const { data: so } = await supabase
          .from("service_orders")
          .select("id, order_number, title, status")
          .eq("id", (data as any).source_service_order_id)
          .maybeSingle();
        if (so) return so;
      }
      const { data: soByOrder } = await supabase
        .from("service_orders")
        .select("id, order_number, title, status")
        .eq("order_id", data.id)
        .limit(1)
        .maybeSingle();
      if (soByOrder) return soByOrder;

      if (data.notes && data.notes.includes("service_order:")) {
        const match = data.notes.match(/service_order:([0-9a-f-]{36}):order/i);
        if (match?.[1]) {
          const { data: soByNote } = await supabase
            .from("service_orders")
            .select("id, order_number, title, status")
            .eq("id", match[1])
            .maybeSingle();
          if (soByNote) return soByNote;
        }
      }
      return null;
    };

    const resolveSourceQuote = async () => {
      if ((data as any).source_quote_id) {
        const { data: quote } = await supabase
          .from("quotes")
          .select("id, quote_number, status")
          .eq("id", (data as any).source_quote_id)
          .eq("partner_id", data.partner_id)
          .maybeSingle();
        if (quote) return quote;
      }
      const { data: quoteByOrder } = await supabase
        .from("quotes")
        .select("id, quote_number, status")
        .eq("converted_order_id", data.id)
        .eq("partner_id", data.partner_id)
        .limit(1)
        .maybeSingle();
      if (quoteByOrder) return quoteByOrder;

      if (data.notes && data.notes.includes("orçamento")) {
        const match = data.notes.match(/orçamento\s+(ORC-?[\w-]+)/i);
        if (match?.[1]) {
          const { data: quoteByNum } = await supabase
            .from("quotes")
            .select("id, quote_number, status")
            .eq("quote_number", match[1])
            .eq("partner_id", data.partner_id)
            .maybeSingle();
          if (quoteByNum) return quoteByNum;
        }
      }
      return null;
    };

    const [
      customers,
      sellerName,
      { platformDriverId, platformDriver },
      sourceServiceOrder,
      sourceQuote,
    ] = await getCachedErpPage(
      ["erp-order-detail-enrichment", partnerId, String(data.id)],
      [TAGS.orders(partnerId), `order-${data.id}`],
      () =>
        Promise.all([
          resolveCustomer(),
          resolveSellerName(),
          resolvePlatformDriver(),
          resolveSourceServiceOrder(),
          resolveSourceQuote(),
        ]),
      15,
    );

    const subtotalValue = Number(
      (data.order_items || []).reduce((acc: number, item: any) => {
        return (
          acc +
          Number(
            item?.subtotal ??
            Number(item?.quantity || 0) * Number(item?.product_price || 0),
          )
        );
      }, 0),
    );
    const manualDiscount = Math.max(
      0,
      Number((data as any).discount_value || 0),
    );
    const couponDiscount = Math.max(
      0,
      Number((data as any).discount_amount || 0),
    );
    const shippingCost = Math.max(
      0,
      Number((data as any).delivery_fee || (data as any).shipping_cost || 0),
    );
    const additionalCosts = Math.max(
      0,
      Number((data as any).additional_costs || 0),
    );
    const baseBeforePaymentMethod = Math.max(
      0,
      subtotalValue -
      manualDiscount -
      couponDiscount +
      shippingCost +
      additionalCosts,
    );
    const finalTotal = Math.max(0, Number((data as any).total_amount || 0));
    const paymentMethodDiscountAmount =
      (data as any).payment_method_discount_amount != null
        ? Number((data as any).payment_method_discount_amount)
        : Math.max(
          0,
          Math.round((baseBeforePaymentMethod - finalTotal) * 100) / 100,
        );
    const paymentMethodExtraAmount =
      (data as any).payment_method_extra_amount != null
        ? Number((data as any).payment_method_extra_amount)
        : Math.max(
          0,
          Math.round((finalTotal - baseBeforePaymentMethod) * 100) / 100,
        );

    const isRefunded =
      Array.isArray(data.return_requests) &&
      data.return_requests.some((req: any) => {
        const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(
          req.status,
        );
        const isRefundResolution =
          req.approved_resolution === "refund" ||
          (!req.approved_resolution && req.desired_resolution === "refund");
        const hasRefundValue = Number(req.refund_amount || 0) > 0;
        return isApprovedOrResolved && (isRefundResolution || hasRefundValue);
      });
    const refundedAmount = Array.isArray(data.return_requests)
      ? data.return_requests.reduce((sum: number, req: any) => {
        const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(
          req.status,
        );
        const isRefundResolution =
          req.approved_resolution === "refund" ||
          (!req.approved_resolution && req.desired_resolution === "refund");
        const hasRefundValue = Number(req.refund_amount || 0) > 0;
        if (isApprovedOrResolved && (isRefundResolution || hasRefundValue)) {
          return sum + Number(req.refund_amount || 0);
        }
        return sum;
      }, 0)
      : 0;

    return {
      success: true,
      data: {
        ...data,
        order_source:
          data.order_source === "admin_service_order"
            ? "Ordem de Serviço"
            : data.order_source,
        customers,
        seller_name: sellerName,
        subtotal_value: subtotalValue,
        coupon_discount_amount: couponDiscount,
        payment_method_discount_amount: paymentMethodDiscountAmount,
        payment_method_extra_amount: paymentMethodExtraAmount,
        is_refunded: isRefunded,
        refunded_amount: refundedAmount,
        platform_driver_id: platformDriverId,
        platform_driver: platformDriver,
        source_service_order: sourceServiceOrder,
        source_quote: sourceQuote,
      },
    };
  }

  const saleQuery = supabase
    .from("sales")
    .select("*, sale_items(*)")
    .eq("partner_id", partnerId);

  if (isUuid) {
    saleQuery.eq("id", orderId);
  } else {
    saleQuery.eq("sale_number", orderId);
  }

  const { data: sale, error: saleError } = await saleQuery.maybeSingle();

  if (saleError || !sale) return { error: "Pedido não encontrado" };

  // P3: cliente, vendedor e pre_sale são independentes - resolve em paralelo.
  const [customers, saleSellerName, saleDraft, saleSourceServiceOrder] =
    await Promise.all([
      sale.customer_id
        ? supabase
          .from("customers")
          .select("id, name, email, phone, image_url, addresses(*)")
          .eq("id", sale.customer_id)
          .eq("partner_id", partnerId)
          .single()
          .then((res: any) => res.data)
        : Promise.resolve(null),
      (sale as any).finalized_by_user_id
        ? supabase
          .from("user_profiles")
          .select("full_name")
          .eq("user_id", (sale as any).finalized_by_user_id)
          .single()
          .then((res: any) => res.data?.full_name || null)
        : Promise.resolve(null),
      supabase
        .from("pre_sales")
        .select(
          "shipping_fee, other_costs, discount_amount, coupon_discount_amount",
        )
        .eq("id", sale.pre_sale_id)
        .eq("partner_id", partnerId)
        .limit(1)
        .maybeSingle()
        .then((res: any) => res.data),
      sale.origin_type === "service_order" && sale.origin_id
        ? supabase
          .from("service_orders")
          .select("id, order_number, title, status")
          .eq("id", sale.origin_id)
          .maybeSingle()
          .then((res: any) => res.data)
        : Promise.resolve(null),
    ]);

  const shippingCost = Number(saleDraft?.shipping_fee || 0);
  const otherCosts = Number((saleDraft as any)?.other_costs || 0);
  const draftDiscount = Number((saleDraft as any)?.discount_amount || sale.discount_amount || 0);
  const couponDiscount = Number((saleDraft as any)?.coupon_discount_amount || 0);
  // manualDiscount = total discount from draft minus coupon (avoids double-count when draft stores combined)
  const manualDiscount = Math.max(0, draftDiscount - couponDiscount);
  const subtotalValue = Number(
    (sale.sale_items || []).reduce((acc: number, it: any) => {
      return (
        acc +
        Number(
          it?.subtotal ??
          Number(it?.quantity || 0) * Number(it?.unit_price || 0),
        )
      );
    }, 0),
  );
  const baseBeforePaymentMethod = Math.max(
    0,
    subtotalValue -
    Math.max(0, manualDiscount) -
    Math.max(0, couponDiscount) +
    Math.max(0, shippingCost) +
    Math.max(0, otherCosts),
  );
  const finalTotal = Math.max(0, Number(sale.final_amount || 0));
  const paymentMethodDiscountAmount =
    sale.payment_method_discount_amount != null
      ? Number(sale.payment_method_discount_amount)
      : Math.max(
        0,
        Math.round((baseBeforePaymentMethod - finalTotal) * 100) / 100,
      );
  const paymentMethodExtraAmount =
    sale.payment_method_extra_amount != null
      ? Number(sale.payment_method_extra_amount)
      : Math.max(
        0,
        Math.round((finalTotal - baseBeforePaymentMethod) * 100) / 100,
      );
  const ref =
    (sale.sale_number && String(sale.sale_number).trim()) ||
    String(sale.id || "")
      .replace(/-/g, "")
      .slice(0, 8)
      .toUpperCase();
  const situation =
    sale.status === "paid" || sale.payment_status === "paid"
      ? "paid"
      : sale.payment_status === "partially_paid"
        ? "partially_paid"
        : "pending";

  const orderLike = {
    id: sale.id,
    order_number: ref,
    order_source:
      sale.origin_type === "service_order" ? "Ordem de Serviço" : "Presencial",
    situation,
    delivery_status:
      (sale as any).delivery_status ||
      (shippingCost > 0 ? "preparing" : "delivered"),
    delivery_type: shippingCost > 0 ? "delivery" : "pickup",
    total_amount: Number(sale.final_amount || 0),
    paid_amount: Number(sale.paid_amount || 0),
    discount_value: Math.max(0, manualDiscount),
    coupon_discount_amount: Math.max(0, couponDiscount),
    delivery_fee: shippingCost,
    additional_costs: otherCosts,
    subtotal_value: subtotalValue,
    payment_method_discount_amount: paymentMethodDiscountAmount,
    payment_method_extra_amount: paymentMethodExtraAmount,
    notes: sanitizeNotes(sale.notes),
    created_at: sale.created_at,
    order_date: sale.created_at,
    // Breakdown imutável para DRE / lucro líquido por pedido (POS)
    manual_discount_amount: manualDiscount,
    item_discount_amount: (sale.sale_items || []).reduce(
      (acc: number, it: any) => acc + Number(it.discount_amount || 0),
      0,
    ),
    campaign_discount_amount: 0,
    order_items: (sale.sale_items || []).map((it: any) => ({
      id: it.id,
      product_name: it.product_name,
      product_price: Number(it.unit_price || 0),
      quantity: Number(it.quantity || 0),
      subtotal: Number(
        it.subtotal ?? Number(it.quantity) * Number(it.unit_price),
      ),
      sku: "-",
      image: null,
      product_id: it.product_id,
      variant_id: it.variant_id,
      // Campos para DRE/CMV: preço nominal, flag de brinde, custo unitário
      original_price:
        it.original_price != null ? Number(it.original_price) : null,
      is_gift: Boolean(it.is_gift),
      unit_cost: it.unit_cost != null ? Number(it.unit_cost) : null,
    })),
    buyer_id: sale.customer_id,
    customer_name: customers?.name || "Consumidor final",
    customers,
    seller_name: saleSellerName,
    is_pos_sale: true,
    payment_method: null,
    payment_breakdown: [],
    mp_payment_id: null,
    source_service_order: saleSourceServiceOrder,
    source_quote: null,
  };

  return { success: true, data: orderLike };
}

export async function getFreshOrderPaymentDataAction(orderId: string, partnerId: string) {
  try {
    const user = await requireUser();
    if (!user) return { success: false, error: "Não autenticado" };
    await requirePermission(partnerId, "orders", "view", user);
    const supabase = createAdminClient();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
    let query = supabase
      .from("orders")
      .select("id, order_number, updated_at, situation, paid_amount, total_amount, payment_breakdown, payment_method, payment_provider, mp_payment_id, checkout_fulfillment")
      .eq("partner_id", partnerId);

    if (isUuid) {
      query = query.eq("id", orderId);
    } else {
      query = query.eq("order_number", orderId);
    }

    const { data, error } = await query.maybeSingle();

    if (error || !data) {
      return { success: false, error: error?.message || "Pedido não encontrado" };
    }
    return { success: true, order: data };
  } catch (err: any) {
    return { success: false, error: err?.message || "Erro ao buscar dados do pedido" };
  }
}

export async function getOrderHistoryAction(
  orderId: string,
  partnerId: string,
  adminContext = false
) {
  const user = await requireUser();
  if (!user) return { error: "Não autenticado" };

  let isAdmin = false;
  if (adminContext) {
    try {
      await requireAdminScope("moderation");
      isAdmin = true;
    } catch {
      isAdmin = false;
    }
  }

  if (!isAdmin) {
    await requirePermission(partnerId, "orders", "view");
  }

  const supabase = createAdminClient();
  const { data: saleRow } = await supabase
    .from("sales")
    .select("id, store_id")
    .eq("id", orderId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (saleRow?.id) {
    if (!isAdmin && saleRow.store_id) await requireStorePermission(saleRow.store_id, partnerId, "orders", "view");
    return { success: true, data: [] as any[] };
  }

  const { data: order } = await supabase
    .from("orders")
    .select("store_id, buyer_id, customer_id, customer_name, stores(name)")
    .eq("id", orderId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (!isAdmin && order?.store_id) await requireStorePermission(order.store_id, partnerId, "orders", "view");

  const rawEntries = await getOrderHistoryEntries(orderId, partnerId);
  const viewer = isAdmin ? "admin" : "seller";
  const storeName = (order?.stores as any)?.name || null;

  const entries = rawEntries
    .map((e) => {
      const isErpAction = e.source === "erp" || (e.metadata as any)?.source === "erp";
      const isDuditAction = !isErpAction && Boolean(
        e.source === "admin" ||
        (e.metadata as any)?.is_admin_action ||
        (e.metadata?.dudit_action && (e.source === "admin" || !e.actor_user_id)) ||
        (e.actor_name === "Equipe Dudit" && e.source === "admin")
      );

      const actorName = resolveTimelineActorName({
        entry: e,
        viewer,
        orderCustomerName: order?.customer_name,
        storeName,
        buyerId: order?.buyer_id,
      });

      const sanitizedMetadata = { ...e.metadata };
      if (!isAdmin) {
        delete sanitizedMetadata.admin_actor_name;
        delete sanitizedMetadata.admin_actor_id;
      }

      let changeLines = (e.change_lines || []).map((l) => humanizeTimelineChangeLine(l)).filter(Boolean);

      // Filter false refund/credit lines on rejected returns
      const isRejected =
        e.metadata?.to_status === "REJECTED" ||
        e.entry_type === "return_rejected" ||
        changeLines.some((l) => l.toLowerCase().includes("recusad") || l.toLowerCase().includes("rejeitad"));

      if (isRejected) {
        changeLines = changeLines.filter(
          (l) =>
            !l.startsWith("Valor do reembolso:") &&
            !l.startsWith("Status do reembolso:") &&
            !l.startsWith("Saldo da troca enviado para:") &&
            !l.startsWith("Vale-compra gerado:") &&
            !l.startsWith("Pedido de troca criado:")
        );
      }

      return {
        ...e,
        actor_name: actorName,
        change_lines: changeLines,
        highlight: isDuditAction,
        metadata: sanitizedMetadata,
      };
    })
    .filter((e) => e.change_lines.length > 0);

  return { success: true, data: entries };
}

export async function updateERPOrderAction(
  orderId: string,
  data: ERPOrderPayload,
  opts?: { adminBypass?: boolean; actionCtx?: AdminActionContext | null },
) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL);

  const user = await requireUser();
  if (!user) return { error: "Não autenticado" };

  const adminBypass = Boolean(opts?.adminBypass);
  let adminActorId: string | null = null;
  if (adminBypass) {
    const admin = await requireAdminScope("moderation");
    adminActorId = admin.userId;
  }

  const orderAccess = adminBypass
    ? null
    : await requirePermission(data.partnerId, "orders", "edit");

  // Normalize empty finance account to null (avoids `invalid input syntax for type uuid: ""`)
  data.financeAccountId = data.financeAccountId?.trim()
    ? data.financeAccountId.trim()
    : null;

  // Validate discount permission if a discount is being applied
  if (!adminBypass && (data.discountValue > 0 || data.couponCode)) {
    await requirePermission(data.partnerId, "orders", "can_apply_discount");
  }

  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper");
  const csrfValidation = await requireCSRF(data.csrf_token);
  if (!csrfValidation.valid)
    return { error: csrfValidation.error || "Token CSRF inválido" };

  const supabase = createAdminClient();
  const capabilitiesPromise = getPartnerCapabilities(data.partnerId, {
    storeId: data.storeId,
  });

  const sanitizedItemsResult = sanitizeERPItems(data.items);
  if ("error" in sanitizedItemsResult)
    return { error: sanitizedItemsResult.error };
  const sanitizedItems = sanitizedItemsResult.items;

  const customerIdPromise = resolvePartnerCustomerId(
    supabase,
    data.partnerId,
    data.customerId,
  )
    .then((id) => ({ id, error: null }))
    .catch((err) => ({
      id: null,
      error: err?.message || "Cliente inválido para este parceiro.",
    }));

  const currentOrderPromise = supabase
    .from("orders")
    .select(
      `
            id,
            order_number,
            partner_id,
            customer_name,
            buyer_id,
            order_source,
            delivery_type,
            situation,
            delivery_status,
            total_amount,
            paid_amount,
            discount_value,
            delivery_fee,
            additional_costs,
            notes,
            payment_method,
            payment_breakdown,
            payment_provider,
            mp_payment_id,
            finance_account_id,
            store_id,
            delivery_address,
            inventory_deducted,
            exchange_return_request_id,
            checkout_fulfillment,
            order_items(id, product_id, variant_id, product_name, quantity, product_price, service_id, sort_order)
        `,
    )
    .eq("id", orderId)
    .eq("partner_id", data.partnerId)
    .single();

  const partnerRowPromise = supabase
    .from("partners")
    .select("business_info")
    .eq("id", data.partnerId)
    .single();

  const financeAccountPromise = data.financeAccountId
    ? supabase
      .from("finance_accounts")
      .select("id, store_id")
      .eq("id", data.financeAccountId)
      .eq("partner_id", data.partnerId)
      .limit(1)
      .maybeSingle()
    : Promise.resolve({ data: null });

  const preparationEstimatePromise = resolveOrderPreparationEstimate({
    supabase,
    partnerId: data.partnerId,
    items: sanitizedItems,
    deliveryMethod: data.deliveryMethod,
  });

  const promotionsPromise = (async () => {
    const caps = await capabilitiesPromise;
    if (!caps.hasCampaigns)
      return { rawPromotions: [] as any[], filteredPromotions: [] as any[] };
    const {
      listActivePromotionsForMarketplaceAction,
      filterRawPromotionsByGiftStock,
    } = await import("@/app/actions/shared/promotions");
    const resolvedCust = await customerIdPromise;
    const raw = await listActivePromotionsForMarketplaceAction(
      data.partnerId,
      resolvedCust.id,
    );
    const filtered =
      raw && raw.length > 0
        ? await filterRawPromotionsByGiftStock(raw, supabase)
        : [];
    return { rawPromotions: raw, filteredPromotions: filtered };
  })();

  const couponPromise = (async () => {
    const caps = await capabilitiesPromise;
    if (!caps.hasCoupons)
      return {
        couponIdToSave: null,
        couponDiscountAmount: 0,
        couponPricingData: null as
          import("@/lib/services/pricing-engine").PricingCoupon | null,
      };
    const resolvedCust = await customerIdPromise;
    if (data.couponCode?.trim()) {
      const couponValidation = await validateCoupon({
        partnerId: data.partnerId,
        code: data.couponCode,
        customerId: resolvedCust.id,
        subtotal: Number(data.subtotal || 0),
        shippingCost: Number(data.shippingCost || 0),
        items: sanitizedItems.map((item) => ({
          productId: item.productId || null,
        })),
      });
      if (couponValidation.valid) {
        return {
          couponIdToSave: couponValidation.couponId || null,
          couponDiscountAmount: Number(couponValidation.discountAmount || 0),
          couponPricingData: couponValidation.pricingCoupon || null,
        };
      }
    } else if (data.couponId) {
      const couponValidation = await validateCouponById(data.couponId, {
        partnerId: data.partnerId,
        customerId: resolvedCust.id,
        subtotal: Number(data.subtotal || 0),
        shippingCost: Number(data.shippingCost || 0),
        items: sanitizedItems.map((item) => ({
          productId: item.productId || null,
        })),
      });
      if (couponValidation.valid) {
        return {
          couponIdToSave: data.couponId,
          couponDiscountAmount: Number(couponValidation.discountAmount || 0),
          couponPricingData: couponValidation.pricingCoupon || null,
        };
      }
    }
    return {
      couponIdToSave: null,
      couponDiscountAmount: 0,
      couponPricingData: null,
    };
  })();

  const [
    capabilities,
    customerResolved,
    { data: currentOrder, error: currentOrderError },
    { data: partnerRow },
    { data: financeAccount },
    preparationEstimate,
    { filteredPromotions },
    couponResult,
  ] = await Promise.all([
    capabilitiesPromise,
    customerIdPromise,
    currentOrderPromise,
    partnerRowPromise,
    financeAccountPromise,
    preparationEstimatePromise,
    promotionsPromise,
    couponPromise,
  ]);

  if (customerResolved.error) return { error: customerResolved.error };
  const customerId = customerResolved.id;

  if (currentOrderError || !currentOrder)
    return { error: currentOrderError?.message || "Pedido não encontrado" };

  if (!adminBypass && currentOrder.store_id) {
    await requireStorePermission(currentOrder.store_id, data.partnerId, "orders", "edit");
  }
  if (!adminBypass && data.storeId && data.storeId !== currentOrder.store_id) {
    await requireStorePermission(data.storeId, data.partnerId, "orders", "edit");
  }
  if (!adminBypass && (data.discountValue > 0 || data.couponCode)) {
    if (currentOrder.store_id) {
      await requireStorePermission(
        currentOrder.store_id,
        data.partnerId,
        "orders",
        "can_apply_discount",
      );
    }
    if (data.storeId && data.storeId !== currentOrder.store_id) {
      await requireStorePermission(
        data.storeId,
        data.partnerId,
        "orders",
        "can_apply_discount",
      );
    }
  }
  const itemReferenceError = await validateERPItemReferences({
    supabase,
    partnerId: data.partnerId,
    storeId: data.storeId || currentOrder.store_id,
    items: sanitizedItems,
  });
  if (itemReferenceError) return { error: itemReferenceError };

  const requestedPaymentSituation = normalizePaymentSituation(data.paymentStatus);
  const hasPaymentStateChange =
    requestedPaymentSituation !== currentOrder.situation ||
    (data.paidAmount !== undefined &&
      Math.abs(Number(data.paidAmount || 0) - Number(currentOrder.paid_amount || 0)) > 0.009) ||
    (data.financeAccountId || null) !== (currentOrder.finance_account_id || null);
  if (!adminBypass && hasPaymentStateChange) {
    await requirePermission(data.partnerId, "financial", "edit", user);
    if (currentOrder.store_id) {
      await requireStorePermission(currentOrder.store_id, data.partnerId, "financial", "edit");
    }
    if (data.storeId && data.storeId !== currentOrder.store_id) {
      await requireStorePermission(data.storeId, data.partnerId, "financial", "edit");
    }
  }

  if (currentOrder.situation === "cancelled" && !adminBypass) {
    return { error: "Pedidos cancelados não podem ser editados." };
  }

  const partnerInfo = normalizeBusinessInfo(partnerRow?.business_info);
  const salesSettings: SalesSettings = {
    ...DEFAULT_SALES_SETTINGS,
    ...((partnerInfo as any)?.salesSettings || {}),
  };

  if (
    salesSettings.requireSeller &&
    !data.sellerPartnerUserId &&
    !(currentOrder as any).seller_partner_user_id
  ) {
    return { error: "É obrigatório selecionar um vendedor para o pedido." };
  }

  if (
    currentOrder.exchange_return_request_id &&
    Number(data.totalAmount || 0) <
    Number(currentOrder.paid_amount || 0) - 0.009
  ) {
    return {
      error: `O total do pedido (R$ ${Number(data.totalAmount || 0).toFixed(2)}) não pode ser menor que o crédito de troca aplicado (R$ ${Number(currentOrder.paid_amount || 0).toFixed(2)}).`,
    };
  }

  // Enforce role-based and status-based editing locks
  const isOrderFullyPaid =
    currentOrder.situation === "paid" ||
    (Number(currentOrder.paid_amount || 0) >=
      Number(currentOrder.total_amount || 0) - 0.009 &&
      Number(currentOrder.total_amount || 0) > 0);
  const isOrderPartiallyPaid =
    currentOrder.situation === "partially_paid" && !isOrderFullyPaid;
  const isDeliveredOrder = currentOrder.delivery_status === "delivered";

  if (!adminBypass && !can(orderAccess as RbacUserLike, "orders.edit")) {
    return { error: "Sem permissão para editar pedidos." };
  }

  // Check if items changed
  const currentItems = currentOrder.order_items || [];
  const hasItemsChanged =
    currentItems.length !== sanitizedItems.length ||
    sanitizedItems.some((itemA: any, idx: number) => {
      const itemB = currentItems[idx];
      if (!itemB) return true;
      return (
        itemA.productId !== itemB.product_id ||
        itemA.variantId !== itemB.variant_id ||
        itemA.quantity !== itemB.quantity ||
        Math.abs((itemA.unitPrice || 0) - (itemB.product_price || 0)) > 0.009
      );
    });

  // Check if address changed
  let deliveryAddressStr = "";
  if (
    data.deliveryMethod === "delivery" &&
    data.address?.street &&
    data.address.number
  ) {
    const { street, number, neighborhood, city, state, zipCode, complement } =
      data.address;
    deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ""}, ${neighborhood}, ${city} - ${state}, ${zipCode}`;
  }
  const hasAddressChanged =
    deliveryAddressStr !== (currentOrder.delivery_address || "");

  // Check if financial / general settings changed
  const hasFinancialChanged =
    Math.abs(
      Number(currentOrder.total_amount || 0) - Number(data.totalAmount || 0),
    ) > 0.009 ||
    Math.abs(
      Number(currentOrder.discount_value || 0) -
      Number(data.discountValue || 0),
    ) > 0.009 ||
    Math.abs(
      Number(currentOrder.delivery_fee || 0) - (data.deliveryMethod === "pickup" ? 0 : Number(data.shippingCost || 0)),
    ) > 0.009 ||
    Math.abs(
      Number(currentOrder.additional_costs || 0) -
      Number(data.additionalCosts || 0),
    ) > 0.009 ||
    data.financeAccountId !== currentOrder.finance_account_id ||
    data.salesChannel !== currentOrder.order_source ||
    data.deliveryMethod !== currentOrder.delivery_type ||
    data.customerName !== currentOrder.customer_name ||
    data.paymentStatus !== currentOrder.situation ||
    (data.paidAmount !== undefined &&
      Math.abs(
        Number(currentOrder.paid_amount || 0) - Number(data.paidAmount || 0),
      ) > 0.009);

  const hasGeneralChanged =
    hasItemsChanged || hasAddressChanged || hasFinancialChanged;

  // Status-based editing locks (admin bypass = edição livre em qualquer status)
  if (!adminBypass && isOrderFullyPaid) {
    if (
      data.paidAmount !== undefined &&
      Number(data.paidAmount) > Number(currentOrder.paid_amount || 0) + 0.009
    ) {
      return {
        error:
          "Este pedido já está totalmente pago e não permite novos pagamentos.",
      };
    }
    if (hasGeneralChanged) {
      if (isDeliveredOrder) {
        return {
          error: "Não é permitido alterar dados após a entrega do pedido pago.",
        };
      } else {
        return {
          error:
            "Não é permitido alterar itens, valores, cliente ou dados de pagamento de um pedido já pago.",
        };
      }
    }
  } else if (!adminBypass && isOrderPartiallyPaid) {
    if (
      hasItemsChanged ||
      hasAddressChanged ||
      data.customerName !== currentOrder.customer_name
    ) {
      return {
        error:
          "Não é permitido alterar itens, endereço ou cliente de um pedido com pagamento parcial.",
      };
    }
    const hasPricingChanged =
      Math.abs(
        Number(currentOrder.total_amount || 0) - Number(data.totalAmount || 0),
      ) > 0.009 ||
      Math.abs(
        Number(currentOrder.discount_value || 0) -
        Number(data.discountValue || 0),
      ) > 0.009 ||
      Math.abs(
        Number(currentOrder.delivery_fee || 0) - (data.deliveryMethod === "pickup" ? 0 : Number(data.shippingCost || 0)),
      ) > 0.009 ||
      Math.abs(
        Number(currentOrder.additional_costs || 0) -
        Number(data.additionalCosts || 0),
      ) > 0.009;
    if (hasPricingChanged) {
      return {
        error:
          "Não é permitido alterar valores de um pedido com pagamento parcial.",
      };
    }
    if (
      data.paidAmount !== undefined &&
      Number(data.paidAmount) > Number(currentOrder.total_amount || 0) + 0.009
    ) {
      return {
        error: "O valor pago não pode exceder o valor total do pedido.",
      };
    }
  }

  let couponIdToSave: string | null = couponResult.couponIdToSave;
  let couponDiscountAmount = couponResult.couponDiscountAmount;
  let couponPricingData:
    import("@/lib/services/pricing-engine").PricingCoupon | null =
    couponResult.couponPricingData;
  const { buildGiftOrderItems } =
    await import("@/app/actions/shared/promotions");

  const updatePricingResult = calculateOrderPricing({
    items: sanitizedItems.map((item) => ({
      productId: item.productId || null,
      serviceId: item.serviceId || null,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      basePrice: item.basePrice ?? item.unitPrice,
    })),
    shippingCost: data.deliveryMethod === "pickup" ? 0 : Number(data.shippingCost || 0),
    additionalCosts: Number(data.additionalCosts || 0),
    manualDiscount:
      data.discountValue > 0 && data.discountType !== "coupon"
        ? {
          type: data.discountType as "fixed" | "percentage",
          value: data.discountValue,
        }
        : null,
    coupon: couponPricingData,
    promotions: filteredPromotions,
  });

  const giftIds = updatePricingResult.appliedGiftProductIds || [];
  const giftItems =
    capabilities.hasCampaigns && giftIds.length > 0
      ? await buildGiftOrderItems(supabase, giftIds, filteredPromotions)
      : [];

  if (
    salesSettings.maxDiscountPercent !== null &&
    salesSettings.maxDiscountPercent < 100
  ) {
    const subtotal = Math.max(0, Number(data.subtotal || 0));
    const totalDiscount =
      Math.max(0, Number(data.discountValue || 0)) + couponDiscountAmount;
    const effectiveDiscountPercent =
      subtotal > 0 ? (totalDiscount / subtotal) * 100 : 0;
    if (effectiveDiscountPercent > salesSettings.maxDiscountPercent + 0.05) {
      const { logPolicyLimitExceeded } = await import("@/lib/auth/auth-logger");
      logPolicyLimitExceeded({
        userId: user?.id,
        partnerId: data.partnerId,
        policy: "maxDiscountPercent",
        attemptedValue: `${effectiveDiscountPercent.toFixed(1)}%`,
        allowedLimit: `${salesSettings.maxDiscountPercent}%`,
        details: {
          subtotal,
          discountValue: data.discountValue,
          couponDiscountAmount,
          totalDiscount,
        },
      });
      return {
        error: `O desconto de ${effectiveDiscountPercent.toFixed(1)}% ultrapassa o limite máximo permitido (${salesSettings.maxDiscountPercent}%) configurado para as vendas.`,
      };
    }
  }

  const nextItemsForDelta = [
    ...sanitizedItems,
    ...giftItems.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id,
      customName: item.product_name,
      quantity: item.quantity,
    })),
  ];

  const delta = buildInventoryMovementDelta(
    currentOrder.order_items || [],
    nextItemsForDelta,
  );
  // Estoque que este pedido já reserva/deduz. Validamos os itens completos
  // somando essas quantidades ao disponível, para que um pedido com reserva
  // ativa não bloqueie a própria edição/pagamento.
  const baselineQuantities = new Map<string, number>();
  for (const item of currentOrder.order_items || []) {
    if (!item?.product_id) continue;
    const baselineKey = item.variant_id
      ? `variant:${item.variant_id}`
      : `product:${item.product_id}`;
    baselineQuantities.set(
      baselineKey,
      (baselineQuantities.get(baselineKey) || 0) + Number(item.quantity || 0),
    );
  }
  const stockValidationError = capabilities.hasStockMovements
    ? await validateERPItemsStock({
      supabase,
      partnerId: data.partnerId,
      items: nextItemsForDelta,
      salesSettings,
      baselineQuantities,
    })
    : null;
  if (stockValidationError) return { error: stockValidationError };
  if (
    capabilities.hasFinancial &&
    data.financeAccountId &&
    !financeAccount?.id
  ) {
    return { error: "Conta de recebimento inválida para esta venda." };
  }
  if (capabilities.hasFinancial && data.financeAccountId && financeAccount?.store_id) {
    const targetStoreId = data.storeId || currentOrder.store_id;
    if (targetStoreId && financeAccount.store_id !== targetStoreId) {
      return { error: "A conta financeira pertence a outra loja." };
    }
    if (!adminBypass) await requireStorePermission(financeAccount.store_id, data.partnerId, "financial", "edit");
  }

  if (Number(data.totalAmount || 0) <= 0) {
    return { error: "A venda não pode ser salva com valor total zerado." };
  }

  // Reuse the already declared deliveryAddressStr variable
  if (
    data.deliveryMethod === "delivery" &&
    data.address?.street &&
    data.address.number
  ) {
    const { street, number, neighborhood, city, state, zipCode, complement } =
      data.address;
    deliveryAddressStr = `${street}, ${number}${complement ? ` (${complement})` : ""}, ${neighborhood}, ${city} - ${state}, ${zipCode}`;
  }

  const changeLines = buildOrderChangeLines(currentOrder, {
    ...data,
    items: sanitizedItems,
  });
  if (changeLines.length === 0) {
    return { success: true, noChanges: true };
  }

  couponDiscountAmount = updatePricingResult.couponDiscountAmount;
  let updateServerTotal = updatePricingResult.finalTotal;
  const sanitizedPaymentBreakdown = sanitizePaymentBreakdown(
    data.paymentBreakdown,
  );
  let adjustedPaymentBreakdown = sanitizedPaymentBreakdown;

  const isUnpaidOrder =
    currentOrder.situation !== "paid" &&
    currentOrder.situation !== "partially_paid";
  const payloadPaidAmount = Math.max(0, Number(data.paidAmount || 0));
  const hasReceivedMoney =
    payloadPaidAmount > 0.009 ||
    adjustedPaymentBreakdown.some((e) => Number(e.amountReceived || 0) > 0.009);

  // Only rescale breakdown to the order total when nothing was actually received yet.
  // Partial payments must keep their real amounts (e.g. R$5 sinal + R$5 resto).
  if (
    isUnpaidOrder &&
    adjustedPaymentBreakdown.length > 0 &&
    !hasReceivedMoney
  ) {
    if (adjustedPaymentBreakdown.length === 1) {
      adjustedPaymentBreakdown = [
        {
          ...adjustedPaymentBreakdown[0],
          amount: updateServerTotal,
          effectiveAmount: updateServerTotal,
          amountReceived: 0,
        },
      ];
    } else {
      const oldSum = adjustedPaymentBreakdown.reduce((s, e) => s + e.amount, 0);
      if (oldSum > 0 && Math.abs(oldSum - updateServerTotal) > 0.009) {
        const ratio = updateServerTotal / oldSum;
        adjustedPaymentBreakdown = adjustedPaymentBreakdown.map((e) => {
          const newAmount = Math.round(e.amount * ratio * 100) / 100;
          return {
            ...e,
            amount: newAmount,
            effectiveAmount:
              Math.round((e.effectiveAmount ?? e.amount) * ratio * 100) / 100,
            amountReceived: 0,
          };
        });
      }
    }
  }

  const hasUpdateBreakdown = adjustedPaymentBreakdown.length > 0;
  let updatePaymentMethodInterestAmount = 0;
  let updatePaymentMethodFeeAmount = 0;
  let updatePaymentMethodFixedFeeAmount = 0;
  let updateBreakdownPaymentMethodDiscountAmount = 0;
  let updateCustomerExtraFees = 0;

  for (const entry of adjustedPaymentBreakdown) {
    const bearer = String(entry.feeBearer || "merchant")
      .toLowerCase()
      .trim();
    const isCustomerBearer = bearer === "customer" || bearer === "buyer";
    const adjType = String(entry.adjustmentType || "")
      .toLowerCase()
      .trim();
    const pmDisc = Math.max(
      0,
      Number(
        entry.paymentMethodDiscountAmount ||
        (adjType === "discount" ? entry.adjustmentAmount : 0) ||
        0,
      ),
    );

    const entryInterest = Number(entry.interestAmount || 0);
    const entryInstallmentCost = Number(entry.installmentCostAmount || 0);
    const entryFixedInterest = Math.max(
      0,
      entryInterest - entryInstallmentCost,
    );
    const installmentFeeBearer = String(
      entry.installmentFeeBearer || "merchant",
    )
      .toLowerCase()
      .trim();
    const isCustomerInstallmentBearer =
      installmentFeeBearer === "customer" || installmentFeeBearer === "buyer";

    // Desconto de meio de pagamento sempre abata o total, independente de quem paga taxas
    updateBreakdownPaymentMethodDiscountAmount = Math.max(
      0,
      updateBreakdownPaymentMethodDiscountAmount + pmDisc,
    );

    if (!isCustomerBearer) {
      updatePaymentMethodInterestAmount = Math.max(
        0,
        updatePaymentMethodInterestAmount + entryFixedInterest,
      );
      if (!isCustomerInstallmentBearer) {
        updatePaymentMethodInterestAmount = Math.max(
          0,
          updatePaymentMethodInterestAmount + entryInstallmentCost,
        );
      }
      updatePaymentMethodFeeAmount = Math.max(
        0,
        updatePaymentMethodFeeAmount + Number(entry.feeAmount || 0),
      );
      updatePaymentMethodFixedFeeAmount = Math.max(
        0,
        updatePaymentMethodFixedFeeAmount + Number(entry.fixedFeeAmount || 0),
      );
      if (isCustomerInstallmentBearer) {
        updateCustomerExtraFees = Math.max(
          0,
          updateCustomerExtraFees + entryInstallmentCost,
        );
      }
    } else {
      updateCustomerExtraFees = Math.max(
        0,
        updateCustomerExtraFees + entryFixedInterest,
      );
      if (isCustomerInstallmentBearer) {
        updateCustomerExtraFees = Math.max(
          0,
          updateCustomerExtraFees + entryInstallmentCost,
        );
      }
      updateCustomerExtraFees = Math.max(
        0,
        updateCustomerExtraFees +
        Number(entry.feeAmount || 0) +
        Number(entry.fixedFeeAmount || 0),
      );
    }
  }

  const updatePaymentMethodDiscountAmount =
    updateBreakdownPaymentMethodDiscountAmount;
  const updatePaymentMethodExtraAmount = updateCustomerExtraFees;
  updateServerTotal = Math.max(
    0,
    updateServerTotal -
    updatePaymentMethodDiscountAmount +
    updatePaymentMethodExtraAmount,
  );
  const paymentMethodSummary = buildPaymentMethodSummary(
    adjustedPaymentBreakdown,
    data.paymentMethod,
  );
  const paymentState = resolvePaymentState({
    requestedStatus: data.paymentStatus,
    totalAmount: updateServerTotal,
    paidAmount: data.paidAmount,
    fallbackPaidAmount: Number(currentOrder.paid_amount || 0),
  });
  const updateServerShipping = updatePricingResult.shipping;
  const updateEffectiveDeliveryPayer =
    (data.deliveryBreakdown?.deliveryPayer as "seller" | "customer") ||
    (currentOrder as any).delivery_payer ||
    "customer";

  const orderUpdatePayload: Record<string, unknown> = {
    customer_id: customerId,
    buyer_id: currentOrder.buyer_id || customerId,
    customer_name: data.customerName || null,
    order_source: buildOrderSource(data.salesChannel, data.deliveryMethod),
    delivery_type: data.deliveryMethod,
    situation: isOrderFullyPaid ? "paid" : paymentState.situation,
    delivery_status: data.deliveryStatus,
    total_amount: isOrderFullyPaid
      ? Number(currentOrder.total_amount || updateServerTotal)
      : updateServerTotal,
    paid_amount: isOrderFullyPaid
      ? Number(currentOrder.paid_amount || 0)
      : paymentState.paidAmount,
    discount_value: data.discountValue,
    discount_type: data.discountType,
    coupon_id: couponIdToSave,
    discount_amount: couponDiscountAmount,
    item_discount_amount: updatePricingResult.itemDiscountAmount,
    campaign_discount_amount: updatePricingResult.campaignDiscountAmount,
    manual_discount_amount: updatePricingResult.manualDiscountAmount,
    payment_method_discount_amount: updatePaymentMethodDiscountAmount,
    payment_method_extra_amount: updatePaymentMethodExtraAmount,
    payment_method_interest_amount: updatePaymentMethodInterestAmount,
    payment_method_fee_amount: updatePaymentMethodFeeAmount,
    payment_method_fixed_fee_amount: updatePaymentMethodFixedFeeAmount,
    delivery_fee: data.deliveryMethod === "pickup" ? 0 : updateServerShipping,
    delivery_breakdown: data.deliveryMethod === "pickup"
      ? null
      : (data.deliveryBreakdown !== undefined
        ? ((data.deliveryBreakdown as Record<string, unknown>) || null)
        : (currentOrder as any).delivery_breakdown || null),
    delivery_payer: updateEffectiveDeliveryPayer,
    additional_costs: data.additionalCosts,
    notes: sanitizeNotes(data.notes),
    payment_method: isOrderFullyPaid
      ? currentOrder.payment_method || paymentMethodSummary
      : paymentMethodSummary,
    payment_breakdown: isOrderFullyPaid
      ? currentOrder.payment_breakdown || adjustedPaymentBreakdown
      : adjustedPaymentBreakdown,
    finance_account_id: data.financeAccountId,
    payment_provider:
      data.paymentProvider !== undefined
        ? data.paymentProvider
        : (currentOrder as any).payment_provider || null,
    mp_payment_id:
      data.mpPaymentId !== undefined
        ? data.mpPaymentId
        : (currentOrder as any).mp_payment_id || null,
    checkout_fulfillment:
      data.checkoutFulfillment !== undefined
        ? mergeCheckoutFulfillment(
            (currentOrder as any).checkout_fulfillment || null,
            data.checkoutFulfillment as Record<string, unknown> | null,
          )
        : (currentOrder as any).checkout_fulfillment || null,
    ...(deliveryAddressStr ? { delivery_address: deliveryAddressStr } : {}),
    ...(preparationEstimate || {}),
    ...(data.sellerPartnerUserId !== undefined
      ? { seller_partner_user_id: data.sellerPartnerUserId || null }
      : {}),
  };

  let orderUpdateResult = await supabase
    .from("orders")
    .update(orderUpdatePayload)
    .eq("id", orderId)
    .eq("partner_id", data.partnerId);

  if (
    orderUpdateResult.error &&
    isMissingOrdersPaymentMethodDeltaColumnsError(orderUpdateResult.error)
  ) {
    const fallbackUpdatePayload = { ...orderUpdatePayload };
    delete (fallbackUpdatePayload as any).payment_method_discount_amount;
    delete (fallbackUpdatePayload as any).payment_method_extra_amount;
    delete (fallbackUpdatePayload as any).payment_method_interest_amount;
    delete (fallbackUpdatePayload as any).payment_method_fee_amount;
    delete (fallbackUpdatePayload as any).payment_method_fixed_fee_amount;
    delete (fallbackUpdatePayload as any).item_discount_amount;
    delete (fallbackUpdatePayload as any).campaign_discount_amount;
    delete (fallbackUpdatePayload as any).manual_discount_amount;
    orderUpdateResult = await supabase
      .from("orders")
      .update(fallbackUpdatePayload)
      .eq("id", orderId)
      .eq("partner_id", data.partnerId);
  }

  const orderError = orderUpdateResult.error;
  if (orderError) return { error: orderError.message };

  if (
    !isOrderFullyPaid &&
    paymentState.paidAmount > (currentOrder.paid_amount || 0) + 0.009
  ) {
    const finalBreakdown =
      adjustedPaymentBreakdown && adjustedPaymentBreakdown.length > 0
        ? adjustedPaymentBreakdown
        : [
          {
            method:
              data.paymentMethod &&
                data.paymentMethod !== "Método não definido"
                ? data.paymentMethod
                : currentOrder.payment_method || "Dinheiro",
            amount: paymentState.paidAmount,
            amountReceived: paymentState.paidAmount,
            effectiveAmount: paymentState.paidAmount,
          },
        ];

    await createFinancialTransactionsForReceivedAmount(supabase, {
      orderId: orderId,
      orderNumber: currentOrder.order_number || orderId,
      partnerId: data.partnerId,
      storeId: (currentOrder as any).store_id || data.storeId || null,
      totalAmount: Number(updateServerTotal || 0),
      newBreakdown: finalBreakdown,
      oldBreakdown: currentOrder.payment_breakdown || [],
      customerId,
      customerName: data.customerName || null,
      financeAccountId: data.financeAccountId,
      orderSource: currentOrder.order_source || "manual",
      paymentMethod:
        paymentMethodSummary ||
        data.paymentMethod ||
        currentOrder.payment_method ||
        "Método não definido",
    });
  }

  const { syncReceivableForOrder } =
    await import("@/lib/services/transaction.service");
  await syncReceivableForOrder(supabase, {
    order_number: currentOrder.order_number || orderId,
    partner_id: data.partnerId,
    store_id: (currentOrder as any).store_id || data.storeId || null,
    total_amount: Number(updateServerTotal || 0),
    paid_amount: Number(paymentState.paidAmount || 0),
    situation: paymentState.situation,
    payment_method:
      paymentMethodSummary || data.paymentMethod || currentOrder.payment_method,
    customer_id: customerId || currentOrder.buyer_id || null,
    customer_name: data.customerName || currentOrder.customer_name,
    finance_account_id:
      data.financeAccountId || currentOrder.finance_account_id,
    order_source: currentOrder.order_source || "manual",
  });

  if (currentOrder.situation !== "paid" && paymentState.situation === "paid") {
    await fulfillMarketplaceOrderIfNeeded(supabase, orderId);
    await createSellerCommissionForPaidOrder({
      supabase,
      partnerId: data.partnerId,
      orderId,
      sellerUserId: currentOrder.created_by || null,
      saleAmount: Number(updateServerTotal || 0),
      accountId: data.financeAccountId,
      createdByUserId: user.id,
      storeId: (currentOrder as any).store_id || data.storeId || null,
    });

    // Export order to Tiny ERP if configured (non-blocking)
    try {
      import("@/lib/services/integrations/erp-sync").then(({ exportOrderToConnectedErps }) => {
        exportOrderToConnectedErps(orderId).catch((err) => {
          console.error("[saveOrderAction] ERP export failed:", err)
        })
      }).catch((erpErr) => {
        console.error("[saveOrderAction] Error loading ERP sync:", erpErr)
      })
    } catch {}
  }

  // Sync payment status to linked appointments
  if (
    paymentState.situation === "paid" ||
    paymentState.situation === "partially_paid" ||
    paymentState.situation === "pending"
  ) {
    await supabase
      .from("appointments")
      .update({ payment_status: paymentState.situation })
      .eq("marketplace_order_id", orderId)
      .eq("partner_id", data.partnerId);

    await supabase
      .from("service_orders")
      .update({ payment_status: paymentState.situation })
      .eq("order_id", orderId)
      .eq("partner_id", data.partnerId);
  }

  // Preserve appointment↔item links across the delete/re-insert below.
  // Old item IDs die on delete (FK SET NULL); we remap by sort_order/service identity.
  const oldItemsForRemap = ((currentOrder as any).order_items || []).map(
    (it: any, idx: number) => ({
      oldId: it.id,
      serviceId: it.service_id || null,
      productName: it.product_name || "",
      sortKey: it.sort_order ?? idx,
    }),
  );
  const { data: appointmentsToRemap } = await supabase
    .from("appointments")
    .select("id, order_item_id, service_id, service_name")
    .eq("marketplace_order_id", orderId);

  // Snapshot de custo: re-inserir itens sem `unit_cost` zeraria o CMV do DRE.
  const productIdsForCost = Array.from(
    new Set(
      sanitizedItems
        .filter((item) => item.productId && !item.serviceId)
        .map((item) => item.productId as string),
    ),
  );
  const serviceIdsForCost = Array.from(
    new Set(
      sanitizedItems
        .filter((item) => item.serviceId)
        .map((item) => item.serviceId as string),
    ),
  );
  const [{ data: updateProductsCost }, { data: updateServicesCost }] =
    await Promise.all([
      productIdsForCost.length > 0
        ? supabase
          .from("products")
          .select("id, cost_price")
          .in("id", productIdsForCost)
        : Promise.resolve({ data: [] as Array<{ id: string; cost_price: number | null }> }),
      serviceIdsForCost.length > 0
        ? supabase
          .from("services")
          .select("id, cost_price")
          .in("id", serviceIdsForCost)
        : Promise.resolve({ data: [] as Array<{ id: string; cost_price: number | null }> }),
    ]);
  const updateProductCostMap = new Map<string, number>(
    (updateProductsCost || []).map((p: { id: string; cost_price: number | null }) => [
      p.id,
      Number(p.cost_price || 0),
    ]),
  );
  const updateServiceCostMap = new Map<string, number>(
    (updateServicesCost || []).map((s: { id: string; cost_price: number | null }) => [
      s.id,
      Number(s.cost_price || 0),
    ]),
  );

  await supabase.from("order_items").delete().eq("order_id", orderId);

  const giftItemsToInsert = giftItems.map((item, idx) => ({
    order_id: orderId,
    product_id: item.product_id,
    service_id: item.service_id ?? null,
    variant_id: null,
    product_name: item.product_name,
    product_price: 0,
    quantity: 1,
    subtotal: 0,
    sort_order: sanitizedItems.length + idx + 1,
    is_gift: true,
    original_price: item.original_price,
    discount_amount: 0,
    is_promotional: true,
    promotion_id: item.promotion_id,
    // Brinde: receita 0, custo real no CMV.
    unit_cost: Number(
      item.unit_cost ??
      (item.service_id
        ? updateServiceCostMap.get(item.service_id)
        : updateProductCostMap.get(item.product_id)) ??
      0,
    ),
  }));
  const itemsToInsert = [
    ...sanitizedItems.map((item) => ({
      order_id: orderId,
      product_id: item.productId,
      variant_id: item.variantId || null,
      product_name: item.customName || "Item manual",
      product_price: item.unitPrice,
      quantity: item.quantity,
      subtotal: item.unitPrice * item.quantity,
      sort_order: item.sortOrder,
      is_gift: false,
      original_price:
        item.basePrice != null && item.basePrice > 0 ? item.basePrice : null,
      discount_amount: Math.max(
        0,
        Math.round(
          ((item.basePrice ?? item.unitPrice) - item.unitPrice) *
            item.quantity *
            100,
        ) / 100,
      ),
      is_promotional: false,
      promotion_id: null,
      service_id: (item as any).serviceId || null,
      line_type: (item as any).lineType || "product",
      fulfillment_mode: (item as any).fulfillmentMode || null,
      unit_cost: (item as any).serviceId
        ? updateServiceCostMap.get((item as any).serviceId) || 0
        : item.productId
          ? updateProductCostMap.get(item.productId) || 0
          : 0,
    })),
    ...giftItemsToInsert,
  ];

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(itemsToInsert);
  if (itemsError) return { error: itemsError.message };

  // Restore appointment↔item links: old IDs were nulled by the delete; remap via sort_order/service identity.
  if (
    appointmentsToRemap &&
    appointmentsToRemap.length > 0 &&
    oldItemsForRemap.length > 0
  ) {
    try {
      const { data: newItems } = await supabase
        .from("order_items")
        .select("id, product_name, service_id, sort_order")
        .eq("order_id", orderId);
      if (newItems && newItems.length > 0) {
        const oldIdToKey = new Map<
          string,
          { serviceId: string | null; productName: string; sortKey: number }
        >();
        for (const it of oldItemsForRemap) {
          oldIdToKey.set(it.oldId, {
            serviceId: it.serviceId,
            productName: it.productName,
            sortKey: it.sortKey,
          });
        }
        const findNewItemId = (oldItemId: string | null): string | null => {
          if (!oldItemId) return null;
          const key = oldIdToKey.get(oldItemId);
          if (!key) return null;
          let match = newItems.find((ni: any) => ni.sort_order === key.sortKey);
          if (!match && key.serviceId) {
            match = newItems.find((ni: any) => ni.service_id === key.serviceId);
          }
          if (!match && key.productName) {
            match = newItems.find(
              (ni: any) =>
                (ni.product_name || "").toLowerCase() ===
                key.productName.toLowerCase(),
            );
          }
          return match?.id || null;
        };
        for (const appt of appointmentsToRemap) {
          const newId = findNewItemId(appt.order_item_id);
          if (newId && newId !== appt.order_item_id) {
            await supabase
              .from("appointments")
              .update({ order_item_id: newId })
              .eq("id", appt.id);
          }
        }
      }
    } catch {
      // Best-effort remap; display falls back to service_name matching.
    }
  }

  const stockItems = [
    ...sanitizedItems
      .filter((item) => item.productId)
      .map((item) => ({
        product_id: item.productId,
        variant_id: item.variantId || null,
        quantity: item.quantity,
        allow_sell_without_stock: Boolean(item.allowSellWithoutStock),
      })),
    ...giftItems
      .filter((item) => item.product_id)
      .map((item) => ({
        product_id: item.product_id,
        variant_id: null,
        quantity: 1,
      })),
  ];

  if (capabilities.hasStockMovements && currentOrder.inventory_deducted) {
    if (delta.incoming.length > 0) {
      const movementResult = await createOrderStockMovement({
        supabase,
        partnerId: data.partnerId,
        orderId,
        createdBy: user.id,
        type: "in",
        reason: "Edicao de pedido",
        notes: sanitizeNotes(data.notes) || undefined,
        items: delta.incoming,
        storeId: data.storeId,
      });

      if ("error" in movementResult) return { error: movementResult.error };
    }

    if (delta.outgoing.length > 0) {
      const movementResult = await createOrderStockMovement({
        supabase,
        partnerId: data.partnerId,
        orderId,
        createdBy: user.id,
        type: "out",
        reason: "Edicao de pedido",
        notes: sanitizeNotes(data.notes) || undefined,
        items: delta.outgoing,
        storeId: data.storeId,
      });

      if ("error" in movementResult) return { error: movementResult.error };
    }
  } else if (capabilities.hasStockMovements) {
    if (delta.incoming.length > 0) {
      const releaseResult = await releaseOrderInventory({
        client: supabase,
        partnerId: data.partnerId,
        orderId,
        items: delta.incoming,
        storeId: data.storeId,
      });

      if ("error" in releaseResult) return { error: releaseResult.error };
    }

    if (delta.outgoing.length > 0) {
      const reserveResult = await reserveOrderInventory({
        client: supabase,
        partnerId: data.partnerId,
        orderId,
        items: delta.outgoing,
        storeId: data.storeId,
      });

      if ("error" in reserveResult) return { error: reserveResult.error };
    }

    if (
      delta.incoming.length === 0 &&
      delta.outgoing.length === 0 &&
      stockItems.length > 0
    ) {
      // Sem delta de estoque: o pedido normalmente já está com a reserva feita.
      // Só reserva o que realmente faltar para não duplicar a baixa.
      const shortfallItems = await buildStockShortfallItems(
        supabase,
        data.partnerId,
        stockItems,
      );
      if (shortfallItems.length > 0) {
        const reserveResult = await reserveOrderInventory({
          client: supabase,
          partnerId: data.partnerId,
          orderId,
          items: shortfallItems,
          storeId: data.storeId,
        });

        if ("error" in reserveResult) return { error: reserveResult.error };
      }
    }

    // Baixa física ocorre somente quando o status de entrega entra em sent/delivered.
    if (!currentOrder.inventory_deducted && shouldDeductInventory(data.deliveryStatus)) {
      const finalizeResult = await finalizeOrderInventory({
        client: supabase,
        partnerId: data.partnerId,
        orderId,
        createdBy: user.id,
        reason: "Venda de Produtos",
        notes: sanitizeNotes(data.notes) || undefined,
        items: stockItems,
        storeId: data.storeId,
      });

      if ("error" in finalizeResult) return { error: finalizeResult.error };

      await supabase
        .from("orders")
        .update({ inventory_deducted: true })
        .eq("id", orderId)
        .eq("partner_id", data.partnerId);
    }
  }

  await logAuditEvent({
    partnerId: data.partnerId,
    actorUserId: user.id,
    entityType: "order",
    entityId: orderId,
    actionType: "updated",
    changeLines: changeLines,
    metadata: {
      ...(currentOrder.situation !== paymentState.situation
        ? {
          oldStatus: getPaymentStatusLabel(currentOrder.situation),
          newStatus: getPaymentStatusLabel(paymentState.situation),
          statusScope: "payment",
        }
        : currentOrder.delivery_status !== data.deliveryStatus
          ? {
            oldStatus: getDeliveryStatusLabel(currentOrder.delivery_status),
            newStatus: getDeliveryStatusLabel(data.deliveryStatus),
            statusScope: "delivery",
          }
          : {}),
    },
    source: adminBypass ? "admin" : "erp",
  });

  const skippedGifts = filteredPromotions.filter(
    (p) =>
      p.giftUnavailable &&
      updatePricingResult.appliedPromotionIds.includes(p.id),
  );
  for (const promo of skippedGifts) {
    await logAuditEvent({
      partnerId: data.partnerId,
      actorUserId: user.id,
      entityType: "order",
      entityId: orderId,
      actionType: "updated",
      changeLines: [
        `Brinde da campanha "${promo.name}" temporariamente indisponível (sem estoque).`,
      ],
      source: adminBypass ? "admin" : "erp",
    });
  }

  if (data.deliveryStatus) {
    await syncOrderDeliveryStatusToDeliveries(
      supabase,
      data.partnerId,
      [orderId],
      data.deliveryStatus,
    );
  }

  await invalidateInventoryItems(data.partnerId, stockItems);
  await revalidateOrders(data.partnerId);

  const notifyOrder = {
    ...currentOrder,
    partner_id: data.partnerId,
    id: orderId,
  };
  const notifySituation =
    paymentState.situation !== currentOrder.situation
      ? paymentState.situation
      : undefined;
  const notifyDelivery =
    data.deliveryStatus !== currentOrder.delivery_status
      ? data.deliveryStatus
      : undefined;

  import("@/lib/services/notification-automation.service")
    .then(({ onOrderStatusChanged }) =>
      onOrderStatusChanged(
        notifyOrder,
        notifySituation,
        notifyDelivery,
        "manual",
      ),
    )
    .catch(console.error);

  if (adminBypass && adminActorId) {
    const actionCtx = opts?.actionCtx || null;
    const effectiveStoreId = (currentOrder as any).store_id || data.storeId || null;
    const adminActorEmail = await import("@/lib/supabase/admin")
      .then((m) => m.getAdminClient().auth.admin.getUserById(adminActorId))
      .then((r) => r.data?.user?.email)
      .catch(() => null);
    const changeLinesForAudit: string[] = [];

    if (changeLines.length > 0) {
      changeLinesForAudit.push(...changeLines.map((line: string) => `Equipe Dudit alterou: ${line}.`));
    }
    if (actionCtx?.reason?.trim()) {
      changeLinesForAudit.push(`Motivo: "${actionCtx.reason.trim()}"`);
    }
    if (changeLinesForAudit.length === 0) {
      changeLinesForAudit.push("Equipe Dudit atualizou o pedido.");
    }

    try {
      await logAuditEvent({
        partnerId: data.partnerId,
        actorUserId: adminActorId,
        actorName: "Equipe Dudit",
        entityType: "order",
        entityId: orderId,
        actionType: "updated",
        changeLines: changeLinesForAudit,
        metadata: {
          dudit_action: true,
          is_admin_action: true,
          admin_actor_name: adminActorEmail || adminActorId,
          admin_actor_id: adminActorId,
          from_status: currentOrder.situation,
          to_status: currentOrder.situation, // status might change within changeLines
          changed_fields: actionCtx?.changedFields || [],
          reason: actionCtx?.reason?.trim() || null,
          ...(typeof actionCtx?.riskScore === "number" ? { risk_score: actionCtx.riskScore } : {}),
        },
        source: "admin",
        storeId: effectiveStoreId,
      });
    } catch (e) {
      console.error("[ADMIN_ORDER] timeline audit log failed:", e);
    }

    try {
      await adminAuditLog({
        adminUserId: adminActorId,
        actionType: AdminActionType.ORDER_UPDATE,
        targetType: "partner",
        targetId: data.partnerId,
        metadata: {
          orderId,
          orderNumber: currentOrder.order_number || null,
          partnerId: data.partnerId,
          fields: changeLines,
          ...(actionCtx?.reason?.trim() ? { reason: actionCtx.reason.trim() } : {}),
        },
      });
    } catch (e) {
      console.error("[ADMIN_ORDER] admin audit log failed:", e);
    }
    await applyAdminActionContext({
      adminUserId: adminActorId,
      partnerId: data.partnerId,
      storeId: effectiveStoreId,
      targetType: "order",
      targetId: orderId,
      actionTitle: `Pedido #${currentOrder.order_number || orderId} alterado pela administração`,
      entityLabel: "pedido",
      entityName: `#${currentOrder.order_number || orderId}`,
      sellerUrl: `/erp/pedidos?view=${orderId}`,
      ctx: actionCtx,
    });

    if (actionCtx?.notifySeller && actionCtx?.reason?.trim() && currentOrder.buyer_id) {
      try {
        const { createNotification } = await import("@/lib/services/notification.service");
        await createNotification({
          userId: currentOrder.buyer_id,
          type: "admin_announcement",
          title: `Pedido #${currentOrder.order_number || orderId} atualizado`,
          message: actionCtx.reason.trim(),
          entityType: "order",
          entityId: orderId,
          data: {
            order_id: orderId,
            audience: "buyer",
            url: `/pedidos`,
          },
          idempotencyKey: `admin_action:order_buyer:${orderId}:${Date.now()}`,
          origin: "system",
        });
      } catch (err) {
        console.error("[ADMIN_ORDER] buyer notification failed:", err);
      }
    }
  }

  return { success: true, orderNumber: currentOrder.order_number };
}

export async function deleteOrdersInBatchAction(
  orderIds: string[],
  partnerId: string,
) {
  const user = await requireUser();
  if (!user) return { error: "Não autenticado" };

  if (!Array.isArray(orderIds) || orderIds.length === 0 || orderIds.length > 100) {
    return { error: "Informe de 1 a 100 pedidos para excluir." };
  }
  if (new Set(orderIds).size !== orderIds.length || orderIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { error: "A lista contém IDs inválidos ou repetidos." };
  }

  await requirePermission(partnerId, "orders", "delete");
  const supabase = createAdminClient();

  const { data: orders, error: lookupError } = await supabase
    .from("orders")
    .select("id, store_id")
    .in("id", orderIds)
    .eq("partner_id", partnerId);
  if (lookupError) return { error: lookupError.message };
  if (!orders || orders.length !== orderIds.length) return { error: "Um ou mais pedidos não foram encontrados neste parceiro." };
  await Promise.all(orders.filter((order: any) => order.store_id).map((order: any) =>
    requireStorePermission(order.store_id, partnerId, "orders", "delete"),
  ));
  const { data: attachments, error: attachmentLookupError } = await supabase
    .from("order_attachments")
    .select("id")
    .in("order_id", orders.map((order: any) => order.id))
    .limit(1);
  if (attachmentLookupError) return { error: attachmentLookupError.message };
  if (attachments?.length) return { error: "Remova os anexos dos pedidos antes de excluí-los." };

  // order_items uses ON DELETE CASCADE. Delete only parent rows so a RESTRICT
  // relation (for example a return request) cannot fail after child rows were
  // already removed in a separate statement.
  const { error } = await supabase
    .from("orders")
    .delete()
    .in("id", orders.map((order: any) => order.id))
    .eq("partner_id", partnerId);

  if (error) return { error: error.message };

  await revalidateOrders(partnerId);
  return { success: true };
}

export async function updateOrderNotesAction(input: {
  orderId: string;
  partnerId: string;
  notes: string;
}) {
  const user = await requireUser();
  if (!user) return { success: false as const, error: "Não autenticado" };

  let isAdmin = false;
  let adminEmail: string | null = null;
  try {
    const admin = await requireAdminScope("moderation");
    isAdmin = true;
    adminEmail = admin.email || admin.userId;
  } catch {
    await requirePermission(input.partnerId, "orders", "edit", user);
  }
  const supabase = createAdminClient();

  const { data: currentOrder, error: currentOrderError } = await supabase
    .from("orders")
    .select("id, notes, store_id")
    .eq("id", input.orderId)
    .eq("partner_id", input.partnerId)
    .maybeSingle();

  if (currentOrderError || !currentOrder?.id) {
    return {
      success: false as const,
      error: currentOrderError?.message || "Pedido não encontrado.",
    };
  }
  if (!isAdmin && currentOrder.store_id) {
    await requireStorePermission(currentOrder.store_id, input.partnerId, "orders", "edit");
  }

  const cleanNotes = sanitizeNotes(input.notes) || "";
  const cancelNote = (
    String(currentOrder.notes || "").match(
      /Pedido cancelado por:[\s\S]*$/,
    )?.[0] || ""
  ).trim();
  const nextNotes =
    [cleanNotes, cancelNote].filter(Boolean).join("\n").trim() || null;

  const { error: updateError } = await supabase
    .from("orders")
    .update({ notes: nextNotes })
    .eq("id", input.orderId)
    .eq("partner_id", input.partnerId);

  if (updateError) {
    console.error("[orders_notes] failed_to_update_order_notes", {
      orderId: input.orderId,
      partnerId: input.partnerId,
      error: updateError,
    });
    return { success: false as const, error: updateError.message };
  }

  const { data: userProfile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const effectiveUserName =
    userProfile?.full_name?.trim() ||
    (user as any).user_metadata?.name ||
    (user as any).user_metadata?.full_name ||
    user.email ||
    "Usuário";

  try {
    await logAuditEvent({
      partnerId: input.partnerId,
      actorUserId: user.id,
      actorName: effectiveUserName,
      entityType: "order",
      entityId: input.orderId,
      actionType: "updated",
      changeLines: ["alterou as observações do pedido."],
      source: "erp",
    });
  } catch (historyError) {
    console.error("[orders_notes] audit_log_failed", historyError);
  }

  await revalidateOrders(input.partnerId);
  return { success: true as const };
}

async function syncOrderDeliveryStatusToDeliveries(
  supabase: any,
  partnerId: string,
  orderIds: string[],
  nextStatus: string,
) {
  if (!orderIds || orderIds.length === 0 || !nextStatus) return;
  const nowIso = new Date().toISOString();

  try {
    const { data: links } = await supabase
      .from("delivery_orders")
      .select("delivery_id, order_id")
      .in("order_id", orderIds);

    if (!links || links.length === 0) return;

    const linkPatch: Record<string, unknown> = {
      status: nextStatus === "cancelled" ? "cancelled" : nextStatus,
    };
    if (nextStatus === "delivered") {
      linkPatch.delivered_at = nowIso;
    }

    await supabase
      .from("delivery_orders")
      .update(linkPatch)
      .in("order_id", orderIds);

    const deliveryIds = Array.from(
      new Set(links.map((l: any) => l.delivery_id).filter(Boolean)),
    );
    for (const deliveryId of deliveryIds) {
      const { data: deliveryLinks } = await supabase
        .from("delivery_orders")
        .select("status")
        .eq("delivery_id", deliveryId);

      if (deliveryLinks && deliveryLinks.length > 0) {
        const statuses = new Set(deliveryLinks.map((l: any) => l.status));
        let targetDeliveryStatus = nextStatus;
        if (statuses.size === 1) {
          targetDeliveryStatus = Array.from(statuses)[0] as string;
        }

        const deliveryPatch: Record<string, unknown> = {
          status: targetDeliveryStatus,
        };
        if (targetDeliveryStatus === "sent") {
          deliveryPatch.started_at = nowIso;
          deliveryPatch.departure_time = nowIso;
        }
        if (targetDeliveryStatus === "delivered") {
          deliveryPatch.delivered_at = nowIso;
          deliveryPatch.completed_at = nowIso;
        }

        await supabase
          .from("deliveries")
          .update(deliveryPatch)
          .eq("id", deliveryId)
          .eq("partner_id", partnerId);
      }
    }
  } catch (err) {
    console.warn("[syncOrderDeliveryStatusToDeliveries] error:", err);
  }
}

import { areTimestampsEquivalent } from "@/lib/orders/order-utils";
export { areTimestampsEquivalent };

export async function getOrderCancelRefundContextAction(payload: {
  partnerId: string;
  orderIds: string[];
}) {
  const user = await requireUser();
  if (!user) return { success: false as const, error: "Não autenticado" };

  if (
    !Array.isArray(payload.orderIds) ||
    payload.orderIds.length === 0 ||
    payload.orderIds.length > 100
  ) {
    return { success: false as const, error: "Informe de 1 a 100 pedidos." };
  }
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (
    new Set(payload.orderIds).size !== payload.orderIds.length ||
    payload.orderIds.some((id) => !uuidRegex.test(id))
  ) {
    return {
      success: false as const,
      error: "A lista contém IDs inválidos ou repetidos.",
    };
  }

  let isAdmin = false;
  try {
    await requireAdminScope("moderation");
    isAdmin = true;
  } catch {
    await requirePermission(payload.partnerId, "orders", "cancel", user);
  }

  const supabase = createAdminClient();
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select(
      "id, order_number, store_id, finance_account_id, payment_method, payment_provider, payment_breakdown",
    )
    .in("id", payload.orderIds)
    .eq("partner_id", payload.partnerId);

  if (ordersError || !orders || orders.length === 0) {
    return {
      success: false as const,
      error: "Não foi possível carregar os pedidos selecionados.",
    };
  }

  if (!isAdmin) {
    for (const order of orders as any[]) {
      if (order.store_id) {
        await requireStorePermission(
          order.store_id,
          payload.partnerId,
          "orders",
          "cancel",
        );
      }
    }
  }

  // Determine the finance_accounts store scope that is valid for every selected order
  const orderStoreIds = new Set(
    (orders as any[]).map((o) => (o.store_id ? String(o.store_id) : null)),
  );
  const singleStoreId =
    orderStoreIds.size === 1
      ? Array.from(orderStoreIds)[0]
      : null;

  let accountsQuery = supabase
    .from("finance_accounts")
    .select("id, name, type, is_default, is_active, store_id")
    .eq("partner_id", payload.partnerId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  accountsQuery = singleStoreId
    ? accountsQuery.or(`store_id.is.null,store_id.eq.${singleStoreId}`)
    : accountsQuery.is("store_id", null);

  const [{ data: accountsData, error: accountsError }, resolutions] =
    await Promise.all([
      accountsQuery,
      Promise.all(
        (orders as any[]).map((order) =>
          resolveOrderRefundFinanceAccount(supabase, {
            partnerId: payload.partnerId,
            storeId: order.store_id || null,
            orderId: order.id,
            orderNumber: order.order_number || null,
            financeAccountId: order.finance_account_id || null,
            paymentMethod: order.payment_method || null,
            paymentProvider: order.payment_provider || null,
            paymentBreakdown: Array.isArray(order.payment_breakdown)
              ? order.payment_breakdown
              : null,
          }),
        ),
      ),
    ]);

  if (accountsError) {
    return {
      success: false as const,
      error: "Não foi possível carregar as contas bancárias.",
    };
  }

  const accounts: Array<{
    id: string;
    name: string;
    type: string;
    is_default: boolean;
  }> = (accountsData || []).map((acc: any) => ({
    id: String(acc.id),
    name: String(acc.name || "Conta sem nome"),
    type: String(acc.type || "bank"),
    is_default: Boolean(acc.is_default),
  }));
  const validAccountIds = new Set<string>(accounts.map((a) => a.id));
  const summary = summarizeRefundAccountResolution(resolutions, validAccountIds);

  return {
    success: true as const,
    accounts,
    defaultAccountId: summary.defaultAccountId,
    status: summary.status,
    source: summary.source,
  };
}

export async function updateOrdersStatusInBatchAction(payload: {
  orderIds: string[];
  partnerId: string;
  actionType: "payment_status" | "delivery_status" | "cancel";
  statusValue?: string;
  cancelReason?: string;
  restoreStock?: boolean;
  generateAutomaticRefund?: boolean;
  refundAccountId?: string | null;
  userName?: string;
  changeReason?: string;
  paidAmount?: number;
  paymentBreakdown?: any[];
  manualBalanceOverride?: boolean;
  expectedUpdatedAt?: string;
  expectedPaidAmount?: number;
  expectedTotalAmount?: number;
  deliveryOtp?: string;
  bypassOtp?: boolean;
  bypassReason?: string;
}) {
  const user = await requireUser();
  if (!user) return { error: "Não autenticado" };

  const runtimeActionType = String(
    (payload as { actionType?: string }).actionType || "",
  );
  if (
    !["payment_status", "delivery_status", "cancel"].includes(runtimeActionType)
  ) {
    return { error: "Ação inválida para pedidos." };
  }
  if (
    payload.generateAutomaticRefund !== undefined &&
    typeof payload.generateAutomaticRefund !== "boolean"
  ) {
    return { error: "Opção de reembolso inválida." };
  }
  if (
    payload.refundAccountId !== undefined &&
    payload.refundAccountId !== null &&
    payload.refundAccountId !== "" &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(payload.refundAccountId),
    )
  ) {
    return { error: "Conta bancária de reembolso inválida." };
  }
  if (!Array.isArray(payload.orderIds) || payload.orderIds.length === 0 || payload.orderIds.length > 100) {
    return { error: "Informe de 1 a 100 pedidos para atualizar." };
  }
  if (new Set(payload.orderIds).size !== payload.orderIds.length || payload.orderIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
    return { error: "A lista contém IDs inválidos ou repetidos." };
  }
  if (
    payload.actionType === "payment_status" &&
    payload.paidAmount !== undefined &&
    (!Number.isFinite(payload.paidAmount) || payload.paidAmount < 0)
  ) {
    return { error: "Valor recebido inválido." };
  }
  if (
    payload.actionType === "payment_status" &&
    payload.paymentBreakdown !== undefined &&
    (!Array.isArray(payload.paymentBreakdown) ||
      payload.paymentBreakdown.length > 20 ||
      payload.paymentBreakdown.some((leg: any) =>
        !leg ||
        !String(leg.method || "").trim() ||
        String(leg.method).length > 120 ||
        ["amount", "amountReceived", "effectiveAmount", "netAmount", "adjustmentAmount", "adjustmentPercent", "paymentMethodDiscountAmount", "interestAmount", "feeAmount", "fixedFeeAmount", "installmentCostAmount", "installmentAmount"]
          .some((key) => leg[key] != null && (!Number.isFinite(leg[key]) || leg[key] < 0)) ||
        (Boolean(leg.paymentMethodId) &&
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(leg.paymentMethodId))) ||
        (leg.mpPaymentId != null && String(leg.mpPaymentId).length > 100)
      ))
  ) {
    return { error: "Detalhamento de pagamento inválido." };
  }

  let isAdmin = false;
  let adminEmail: string | null = null;
  let access: any = null;
  try {
    const admin = await requireAdminScope("moderation");
    isAdmin = true;
    adminEmail = admin.email || admin.userId;
  } catch {
    access = await requirePermission(
      payload.partnerId,
      "orders",
      payload.actionType === "cancel" ? "cancel" : "edit",
      user,
    );
    if (payload.actionType === "payment_status") {
      await requirePermission(payload.partnerId, "financial", "edit", user);
    }
    if (payload.actionType === "cancel" && payload.generateAutomaticRefund === true) {
      await requirePermission(payload.partnerId, "orders", "can_refund", user);
    }
  }
  const supabase = createAdminClient();
  const capabilities = await getPartnerCapabilities(payload.partnerId);

  const { data: userProfile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const effectiveUserName =
    userProfile?.full_name?.trim() ||
    (user as any).user_metadata?.name ||
    (user as any).user_metadata?.full_name ||
    user.email ||
    "Usuário";

  const { data: currentOrders } = await supabase
    .from("orders")
    .select(
      "id, order_number, situation, delivery_status, notes, total_amount, paid_amount, payment_method, payment_provider, payment_breakdown, checkout_fulfillment, payment_expires_at, payment_method_discount_amount, payment_method_extra_amount, finance_account_id, buyer_id, customer_name, customer_id, previous_situation_before_cancel, stock_restored_on_cancel, inventory_deducted, created_by, store_id, order_source, exchange_return_request_id, updated_at, order_items(product_id, variant_id, quantity)",
    )
    .in("id", payload.orderIds)
    .eq("partner_id", payload.partnerId);
  const overallWarnings: string[] = [];
  if (!currentOrders || currentOrders.length !== payload.orderIds.length) {
    return { error: "Nenhum pedido válido foi encontrado para processar." };
  }
  if (
    payload.actionType === "payment_status" &&
    (payload.paidAmount !== undefined || payload.paymentBreakdown !== undefined)
  ) {
    if (payload.orderIds.length !== 1) {
      return {
        error:
          "A alteração de pagamento com detalhamento só pode ser feita em um pedido por vez.",
      };
    }
    const order = currentOrders[0] as any;
    const timestampsMatch = areTimestampsEquivalent(
      payload.expectedUpdatedAt,
      order.updated_at,
    );

    if (payload.expectedUpdatedAt && !timestampsMatch) {
      const isAlreadyPaid =
        order.situation === "paid" && payload.statusValue !== "paid";
      const isCancelled = order.situation === "cancelled";
      const paidAmountConflict =
        payload.expectedPaidAmount !== undefined &&
        Math.abs(Number(order.paid_amount || 0) - Number(payload.expectedPaidAmount)) > 0.009;
      const totalAmountConflict =
        payload.expectedTotalAmount !== undefined &&
        Math.abs(Number(order.total_amount || 0) - Number(payload.expectedTotalAmount)) > 0.009;

      if (isAlreadyPaid || isCancelled || paidAmountConflict || totalAmountConflict) {
        return {
          error:
            "O pedido mudou desde que o pagamento foi aberto. Atualize o pedido e tente novamente.",
        };
      }
    }
  }

  if (payload.actionType === "payment_status" && Array.isArray(payload.paymentBreakdown)) {
    const paymentMethodIds = Array.from(new Set(
      payload.paymentBreakdown
        .map((leg: any) => leg.paymentMethodId)
        .filter((id: unknown): id is string => typeof id === "string" && Boolean(id)),
    ));
    if (paymentMethodIds.length > 0) {
      const { data: methods, error: methodsError } = await supabase
        .from("payment_methods")
        .select("id, store_id")
        .eq("partner_id", payload.partnerId)
        .in("id", paymentMethodIds);
      const orderStoreId = (currentOrders[0] as any)?.store_id || null;
      if (
        methodsError ||
        (methods || []).length !== paymentMethodIds.length ||
        (methods || []).some((method: any) => method.store_id && method.store_id !== orderStoreId)
      ) {
        return { error: "Um método de pagamento não pertence ao parceiro/loja do pedido." };
      }
    }

    const order = currentOrders[0] as any;
    const existingMpIds = new Set(
      (Array.isArray(order.payment_breakdown) ? order.payment_breakdown : [])
        .map((leg: any) => String(leg?.mpPaymentId || ""))
        .filter(Boolean),
    );
    if (payload.paymentBreakdown.some((leg: any) =>
      leg?.mpPaymentId && !existingMpIds.has(String(leg.mpPaymentId))
    )) {
      return { error: "Não é permitido vincular um novo ID do Mercado Pago por esta ação." };
    }

    const discountRequested = payload.paymentBreakdown.some((leg: any) =>
      String(leg?.adjustmentType || "").toLowerCase() === "discount" &&
      Number(leg?.paymentMethodDiscountAmount || leg?.adjustmentAmount || 0) > 0.009
    );
    if (discountRequested) {
      if (!isAdmin) {
        await requirePermission(payload.partnerId, "orders", "can_apply_discount", user);
      }
      const totalDiscount = payload.paymentBreakdown.reduce((sum: number, leg: any) =>
        sum + Number(leg?.paymentMethodDiscountAmount || leg?.adjustmentAmount || 0), 0);
      if (totalDiscount > Number((currentOrders[0] as any).total_amount || 0) + 0.009) {
        return { error: "O desconto informado excede o valor do pedido." };
      }
    }
  }

  if (!isAdmin) {
    const storeAction = payload.actionType === "cancel" ? "cancel" : "edit";
    for (const order of currentOrders as any[]) {
      if (order.store_id) {
        await requireStorePermission(order.store_id, payload.partnerId, "orders", storeAction);
        if (payload.actionType === "payment_status") {
          await requireStorePermission(order.store_id, payload.partnerId, "financial", "edit");
        }
        if (payload.actionType === "cancel" && payload.generateAutomaticRefund === true) {
          await requireStorePermission(order.store_id, payload.partnerId, "orders", "can_refund");
        }
      }
    }
  }

  if (payload.actionType === "cancel") {
    const cancelReason = payload.cancelReason?.trim() || "";
    if (!cancelReason) {
      return { error: "Informe o motivo do cancelamento do pedido." };
    }
    const ordersToCancel = (currentOrders || []).filter(
      (o: any) => o.situation !== "cancelled",
    );
    if (ordersToCancel.length === 0) {
      return { error: "Nenhum pedido válido foi encontrado para cancelar." };
    }

    if (
      capabilities.hasFinancial &&
      payload.generateAutomaticRefund &&
      payload.refundAccountId
    ) {
      const { data: selectedRefundAccount, error: refundAccountError } =
        await supabase
          .from("finance_accounts")
          .select("id, store_id, is_active")
          .eq("id", payload.refundAccountId)
          .eq("partner_id", payload.partnerId)
          .maybeSingle();

      if (refundAccountError || !selectedRefundAccount || !selectedRefundAccount.is_active) {
        return {
          error:
            "A conta bancária selecionada para o reembolso não foi encontrada ou está inativa.",
        };
      }
      if (
        selectedRefundAccount.store_id &&
        ordersToCancel.some(
          (o: any) => o.store_id !== selectedRefundAccount.store_id,
        )
      ) {
        return {
          error:
            "A conta bancária selecionada não pertence à loja de todos os pedidos selecionados.",
        };
      }
    }

    const carrierShipmentsByOrderId = new Map<string, any>();
    try {
      const { data: carrierShipments } = await supabase
        .from("order_shipments")
        .select("id, order_id, status, external_label_id, tracking_number, kind")
        .in(
          "order_id",
          ordersToCancel.map((o: any) => o.id),
        )
        .eq("partner_id", payload.partnerId)
        .neq("kind", "return");
      for (const shipment of carrierShipments || []) {
        if (!shipment?.order_id) continue;
        if (!carrierShipmentsByOrderId.has(String(shipment.order_id))) {
          carrierShipmentsByOrderId.set(String(shipment.order_id), shipment);
        }
      }
    } catch (shipmentError) {
      console.error(
        "[orders_cancel_carrier_shipments] error:",
        shipmentError,
      );
    }

    const creatorUserIds = Array.from(
      new Set(
        ordersToCancel
          .map((o: any) => o.created_by)
          .filter((id: any): id is string => Boolean(id)),
      ),
    );

    const partnerUsersRes =
      capabilities.hasProductivity && creatorUserIds.length > 0
        ? await supabase
          .from("partner_users")
          .select("id, user_id")
          .eq("partner_id", payload.partnerId)
          .in("user_id", creatorUserIds)
        : { data: null };
    const sellerPartnerUserIdMap = new Map<string, string>();
    for (const row of partnerUsersRes.data || []) {
      if (row.user_id && row.id) {
        sellerPartnerUserIdMap.set(String(row.user_id), String(row.id));
      }
    }

    const processCancelSingleOrder = async (order: any) => {
      const nextNotes = buildCancelledOrderNotes({
        currentNotes: order.notes,
        userName: effectiveUserName,
        timestamp: formatDateTime(new Date()),
        reason: payload.cancelReason?.trim(),
      });

      const shouldRestoreStockWithMovement = Boolean(
        capabilities.hasStockMovements &&
        payload.restoreStock &&
        (order.inventory_deducted ||
          shouldDeductInventory(order.delivery_status || null)),
      );
      const stockWasRestoredOnCancel = shouldRestoreStockWithMovement;

      let cancelOrderQuery = supabase
        .from("orders")
        .update({
          situation: "cancelled",
          previous_situation_before_cancel: order.situation || "pending",
          stock_restored_on_cancel: stockWasRestoredOnCancel,
          notes: nextNotes || null,
        })
        .eq("id", order.id)
        .eq("partner_id", payload.partnerId);
      cancelOrderQuery = order.updated_at
        ? cancelOrderQuery.eq("updated_at", order.updated_at)
        : cancelOrderQuery.eq("situation", order.situation);
      const { data: cancelledOrder, error: updateOrderErr } = await cancelOrderQuery
        .select("id")
        .maybeSingle();

      if (updateOrderErr || !cancelledOrder) {
        return {
          success: false,
          order,
          stockWasRestoredOnCancel,
          warning: `Pedido ${order.order_number || order.id}: falha ao cancelar (${updateOrderErr?.message || "o pedido mudou durante a operação"})`,
        };
      }

      const orderWarnings: string[] = [];
      const orderLabel = order.order_number || order.id;

      const carrierShipment = carrierShipmentsByOrderId.get(String(order.id)) || null;
      let labelCancelled = false;

      const carrierLabelPromise = (async () => {
        if (!carrierShipment?.external_label_id) return;
        try {
          const result = await cancelCarrierLabelForOrder({
            partnerId: payload.partnerId,
            orderId: order.id,
            labelId: String(carrierShipment.external_label_id),
            reason: payload.cancelReason?.trim() || "Cancelamento de pedido",
            currentStatus: carrierShipment.status,
            actorUserId: user.id,
          });
          if (result.success) {
            labelCancelled = true;
            return;
          }
          orderWarnings.push(
            `Pedido ${orderLabel}: cancelado, mas a etiqueta da transportadora não foi cancelada (${result.error})`,
          );
        } catch (err) {
          console.error("[orders_cancel_carrier_label] error:", err);
          orderWarnings.push(
            `Pedido ${orderLabel}: cancelado, mas não foi possível cancelar a etiqueta da transportadora`,
          );
        }
      })();

      const ownDeliveryAlreadyDispatched = !carrierShipment
        && ["sent", "delivered", "delivery_failed"].includes(
          String(order.delivery_status || "").toLowerCase(),
        );
      if (ownDeliveryAlreadyDispatched) {
        orderWarnings.push(
          `Pedido ${orderLabel}: a entrega própria já estava em andamento. Para troca ou devolução, abra o pedido e solicite o retorno.`,
        );
      }

      const appointmentsSyncPromise =
        syncCancelledOrderAppointmentsAndTransactions(supabase, order.id, {
          orderData: {
            ...order,
            partner_id: payload.partnerId,
          },
        }).catch((err) => {
          console.error("[orders_cancel_appointments] error:", err);
        });

      const financialSyncPromise = (async () => {
        if (!capabilities.hasFinancial) return;
        await Promise.all([
          syncReceivableForOrder(supabase, {
            order_number: order.order_number || order.id,
            partner_id: payload.partnerId,
            total_amount: 0,
            paid_amount: 0,
            situation: "cancelled",
          }),
          cancelPendingSettlementsForOrder({
            supabase,
            partnerId: payload.partnerId,
            orderId: order.id,
            orderNumber: order.order_number || order.id,
            reason: payload.cancelReason?.trim() || "Cancelamento de pedido",
            reconcileKey: `order-cancel:${order.id}`,
            actorUserId: user.id,
          }),
        ]);
      })().catch((err) => {
        console.error("[orders_cancel_financial] error:", err);
      });

      const stockPromise = (async () => {
        if (!capabilities.hasStockMovements) return;
        if (stockWasRestoredOnCancel) {
          const restoreResult = await createOrderStockMovement({
            supabase,
            partnerId: payload.partnerId,
            orderId: order.id,
            orderNumber: order.order_number,
            createdBy: user.id,
            type: "in",
            reason: "Cancelamento de pedido",
            notes: nextNotes || undefined,
            items: order.order_items || [],
            storeId: order.store_id,
          });

          if ("error" in restoreResult) {
            console.error(
              "[orders_cancel_stock] failed_to_restore_stock_movement",
              {
                orderId: order.id,
                orderNumber: order.order_number,
                partnerId: payload.partnerId,
                restoreStock: payload.restoreStock,
                inventoryDeducted: order.inventory_deducted,
                deliveryStatus: order.delivery_status,
                error: restoreResult.error,
              },
            );
            orderWarnings.push(
              `Pedido ${order.order_number || order.id}: cancelado, mas não foi possível restaurar estoque (${restoreResult.error})`,
            );
          }
        } else if (!order.inventory_deducted) {
          const releaseResult = await releaseOrderInventory({
            client: supabase,
            partnerId: payload.partnerId,
            orderId: order.id,
            items: order.order_items || [],
            storeId: order.store_id,
          });

          if ("error" in releaseResult) {
            console.error(
              "[orders_cancel_stock] failed_to_release_stock_reservation",
              {
                orderId: order.id,
                orderNumber: order.order_number,
                partnerId: payload.partnerId,
                error: releaseResult.error,
              },
            );
            orderWarnings.push(
              `Pedido ${order.order_number || order.id}: cancelado, mas não foi possível liberar reserva de estoque (${releaseResult.error})`,
            );
          }
        }
      })().catch((err) => {
        console.error("[orders_cancel_stock] error:", err);
      });

      const refundPromise = (async () => {
        if (!capabilities.hasFinancial || !payload.generateAutomaticRefund)
          return;
        const refundAmount = Math.max(0, Number(order.paid_amount || 0));
        if (refundAmount > 0.009) {
          const refundResult =
            await createRefundTransactionForCancelledOrderSafe({
              supabase,
              partnerId: payload.partnerId,
              orderNumber: order.order_number || order.id,
              orderId: order.id,
              customerId: order.customer_id || order.buyer_id || null,
              customerName: order.customer_name || null,
              paidAmount: refundAmount,
              financeAccountId: order.finance_account_id || null,
              explicitRefundAccountId: payload.refundAccountId || null,
              createdByUserId: user.id,
              storeId: order.store_id || null,
              paymentBreakdown: Array.isArray(order.payment_breakdown)
                ? order.payment_breakdown
                : null,
              paymentMethod: order.payment_method || null,
              paymentProvider: order.payment_provider || null,
            });

          if ("error" in refundResult) {
            console.error(
              "[orders_cancel_refund] failed_to_generate_automatic_refund",
              {
                orderId: order.id,
                orderNumber: order.order_number,
                partnerId: payload.partnerId,
                refundAmount,
                financeAccountId: order.finance_account_id || null,
                error: refundResult.error,
              },
            );
            orderWarnings.push(
              `Pedido ${order.order_number || order.id}: cancelado, mas não foi possível gerar reembolso (${refundResult.error})`,
            );
          }
        }
      })().catch((err) => {
        console.error("[orders_cancel_refund] error:", err);
      });

      const sellerPartnerUserId = order.created_by
        ? (sellerPartnerUserIdMap.get(String(order.created_by)) ?? null)
        : null;

      const commissionsGoalsPromise = (async () => {
        const tasks: Promise<any>[] = [];
        if (capabilities.hasProductivity && sellerPartnerUserId) {
          tasks.push(
            reverseCommissionForEntity({
              supabase,
              partnerId: payload.partnerId,
              storeId: order.store_id || null,
              entityType: "sale",
              entityId: order.id,
              partnerUserId: sellerPartnerUserId,
              accountId: order.finance_account_id || null,
              createdByUserId: user.id,
            }),
          );
        }
        if (capabilities.hasGoals && order.created_by) {
          tasks.push(
            reverseSaleFromGoals({
              supabase,
              partnerId: payload.partnerId,
              sellerUserId: String(order.created_by),
              saleAmount: Number(order.total_amount || 0),
              createdByUserId: user.id,
              accountId: order.finance_account_id || null,
            }),
          );
        }
        await Promise.all(tasks);
      })().catch((err) => {
        console.error("[orders_cancel_commissions_goals] error:", err);
      });

      const tinyCancelPromise = (async () => {
        try {
          const { updateOrderStatusOnConnectedErps } = await import("@/lib/services/integrations/erp-sync")
          await updateOrderStatusOnConnectedErps({ orderId: order.id, situacao: "cancelado" })
        } catch (tinyErr) {
          console.error("[orders_cancel_tiny] error:", tinyErr)
        }
      })()

      await Promise.all([
        appointmentsSyncPromise,
        financialSyncPromise,
        stockPromise,
        refundPromise,
        commissionsGoalsPromise,
        carrierLabelPromise,
        tinyCancelPromise,
      ]);

      return {
        success: true,
        order,
        stockWasRestoredOnCancel,
        labelCancelled,
        warning: orderWarnings.join(" | "),
      };
    };

    // Execução paralela com concorrência controlada para máxima performance sem sobrecarga no banco
    const CONCURRENCY = 6;
    const cancelResults: Awaited<
      ReturnType<typeof processCancelSingleOrder>
    >[] = [];
    let currentQueueIndex = 0;

    const workers = new Array(Math.min(CONCURRENCY, ordersToCancel.length))
      .fill(0)
      .map(async () => {
        while (currentQueueIndex < ordersToCancel.length) {
          const idx = currentQueueIndex++;
          const res = await processCancelSingleOrder(ordersToCancel[idx]);
          cancelResults.push(res);
        }
      });
    await Promise.all(workers);

    const successfulOrders = cancelResults.filter((r) => r.success);
    const processedCount = successfulOrders.length;
    const processingWarnings = cancelResults
      .map((r) => r.warning)
      .filter(Boolean);

    if (processedCount > 0) {
      // Log de auditoria consolidado (1 evento por pedido)
      try {
        await Promise.allSettled(
          successfulOrders.map(({ order, stockWasRestoredOnCancel, labelCancelled }) => {
            const lines: string[] = ["cancelou o pedido"];
            if (payload.cancelReason?.trim()) {
              lines.push(
                `informou motivo do cancelamento: ${payload.cancelReason.trim()}`,
              );
            }
            if (labelCancelled) {
              lines.push("cancelou a etiqueta da transportadora");
            }
            if (payload.restoreStock && order.inventory_deducted) {
              lines.push("restaurou o estoque dos itens do pedido");
            } else if (!stockWasRestoredOnCancel) {
              lines.push("liberou a reserva de estoque dos itens do pedido");
            }
            if (
              payload.generateAutomaticRefund &&
              Number((order as any).paid_amount || 0) > 0.009
            ) {
              lines.push("gerou reembolso automático no financeiro");
            }

            const auditMetadata = {
              oldStatus: getPaymentStatusLabel(order.situation),
              newStatus: "Cancelado",
              statusScope: "payment",
            };

            return logAuditEvent({
              partnerId: payload.partnerId,
              actorUserId: user.id,
              actorName: effectiveUserName,
              entityType: "order",
              entityId: order.id,
              actionType: "cancelled",
              changeLines: lines,
              metadata: auditMetadata,
              source: "erp",
              storeId: order.store_id,
            });
          }),
        );
      } catch (historyError) {
        console.error(
          "[orders_history] updateOrdersStatusInBatchAction:",
          historyError,
        );
      }

      // Disparo de notificação Dudit & Push (FCM) apenas para pedidos vinculados ao Marketplace
      const marketplaceOrders = successfulOrders
        .map((r) => r.order)
        .filter((o: any) => Boolean(o.buyer_id));

      if (marketplaceOrders.length > 0) {
        // Agrupa pedidos por comprador (buyer_id) para que, se um mesmo cliente
        // tiver mais de um pedido cancelado no lote, receba apenas 1 notificação consolidada!
        const ordersByBuyer = new Map<string, any[]>();
        for (const order of marketplaceOrders) {
          const buyerId = String(order.buyer_id);
          if (!ordersByBuyer.has(buyerId)) {
            ordersByBuyer.set(buyerId, []);
          }
          ordersByBuyer.get(buyerId)!.push(order);
        }

        import("@/lib/services/notification-automation.service")
          .then(async ({ notifyCustomerBatchOrders }) => {
            await Promise.allSettled(
              Array.from(ordersByBuyer.entries()).map(
                ([buyerId, buyerOrders]) =>
                  notifyCustomerBatchOrders({
                    userId: buyerId,
                    partnerId: payload.partnerId,
                    type: "order_cancelled",
                    orders: buyerOrders.map((o: any) => ({
                      id: o.id,
                      orderNumber: o.order_number,
                    })),
                    customerName: buyerOrders[0]?.customer_name,
                    origin: "manual",
                    cancellationReason: payload.cancelReason?.trim(),
                  }),
              ),
            );
          })
          .catch((notifError) => {
            console.error(
              "[orders_cancel_marketplace_notification] error:",
              notifError,
            );
          });
      }

      await Promise.all([
        invalidateInventoryItems(
          payload.partnerId,
          successfulOrders.flatMap((r) => r.order.order_items || []),
        ),
        revalidateOrders(payload.partnerId),
      ]);
    }

    if (processedCount === 0) {
      return { error: "Nenhum pedido foi cancelado." };
    }
    if (processingWarnings.length > 0) {
      return { success: true, warning: processingWarnings.join(" | ") };
    }
    return {
      success: true,
      orderNumber: successfulOrders[0]?.order?.order_number,
    };
  }

  const paymentStatusMap: Record<string, ERPOrderPayload["paymentStatus"]> = {
    pending: "unpaid",
    unpaid: "unpaid",
    paid: "paid",
    partially_paid: "partially_paid",
  };

  const overrideOrderIds = new Set<string>();
  const successfullyUpdatedOrderIds = new Set<string>();
  const paymentConcurrencyConflicts: string[] = [];

  if (payload.actionType === "payment_status") {
    const requestedStatus = paymentStatusMap[payload.statusValue || ""];
    if (!requestedStatus) {
      return {
        error: "Status de pagamento invalido para atualizacao em massa.",
      };
    }

    const hasIncomingBreakdown =
      Array.isArray(payload.paymentBreakdown) &&
      payload.paymentBreakdown.length > 0;
    const overrideRequested = Boolean(payload.manualBalanceOverride);
    const roleKey = String(
      access?.roleId || (isAdmin ? "admin" : ""),
    ).toLowerCase();
    const canOverrideManualBalance =
      isAdmin || ["owner", "admin", "manager"].includes(roleKey);
    if (overrideRequested && !canOverrideManualBalance) {
      return {
        error:
          "Apenas proprietários, administradores e gerentes podem autorizar o recebimento presencial do saldo.",
      };
    }

    let manualBalanceEnabled = false;
    if (hasIncomingBreakdown) {
      const { data: policyRow, error: policyError } = await supabase
        .from("partners")
        .select("deposit_balance_manual_enabled")
        .eq("id", payload.partnerId)
        .maybeSingle();
      if (policyError) {
        return {
          error:
            "Não foi possível validar a configuração de recebimento presencial do saldo.",
        };
      }
      manualBalanceEnabled = Boolean(
        (policyRow as any)?.deposit_balance_manual_enabled,
      );
    }

    if (hasIncomingBreakdown) {
      const incomingPaid = sumReceivedAmount(payload.paymentBreakdown as any);
      const incomingPaidAmount =
        payload.paidAmount !== undefined
          ? Number(payload.paidAmount)
          : incomingPaid;

      for (const order of currentOrders || []) {
        if (order.situation === "cancelled") continue;
        const summary = getOrderDepositSummary(order as any);
        if (!summary.usesDeposit) continue;

        const increment = Math.max(
          0,
          incomingPaidAmount - Number(order.paid_amount || 0),
        );
        if (increment <= 0.009) continue;

        if (!summary.sinalPaid) {
          return {
            error: `Pedido ${order.order_number || order.id}: o sinal deve ser pago online pelo checkout.`,
          };
        }

        if (summary.remainingBalance <= 0.009) continue;

        if (!manualBalanceEnabled) {
          if (!overrideRequested) {
            return {
              error: `Pedido ${order.order_number || order.id}: o pagamento presencial do saldo está desativado. Ative a configuração ou use o override autorizado.`,
            };
          }
          overrideOrderIds.add(String(order.id));
        }
      }
    }

    let paymentProcessedCount = 0;
    for (const order of currentOrders || []) {
      if (order.situation === "cancelled") {
        continue;
      }
      if (order.situation === "paid") {
        continue;
      }

      let updateTotalAmount = Number(order.total_amount || 0);
      let pmDiscountAmount = Number(
        (order as any).payment_method_discount_amount || 0,
      );
      let pmExtraAmount = Number(
        (order as any).payment_method_extra_amount || 0,
      );

      if (
        payload.paymentBreakdown &&
        Array.isArray(payload.paymentBreakdown) &&
        payload.paymentBreakdown.length > 0
      ) {
        let calcDiscount = 0;
        let calcExtra = 0;
        for (const leg of payload.paymentBreakdown) {
          if (
            leg.adjustmentType === "discount" &&
            Number(leg.adjustmentAmount || 0) > 0
          ) {
            calcDiscount += Number(leg.adjustmentAmount);
          } else if (
            leg.adjustmentType === "surcharge" &&
            Number(leg.adjustmentAmount || 0) > 0
          ) {
            calcExtra += Number(leg.adjustmentAmount);
          }
        }
        if (calcDiscount > 0 || calcExtra > 0) {
          pmDiscountAmount = calcDiscount;
          pmExtraAmount = calcExtra;
          const itemsBase =
            Number(order.total_amount || 0) +
            Number((order as any).payment_method_discount_amount || 0) -
            Number((order as any).payment_method_extra_amount || 0);
          updateTotalAmount = Math.max(
            0,
            Math.round((itemsBase - calcDiscount + calcExtra) * 100) / 100,
          );
        }
      }

      const paymentState = resolvePaymentState({
        requestedStatus,
        totalAmount: updateTotalAmount,
        paidAmount:
          payload.paidAmount !== undefined ? payload.paidAmount : undefined,
        fallbackPaidAmount:
          requestedStatus === "paid"
            ? updateTotalAmount
            : requestedStatus === "partially_paid"
              ? Number(order.paid_amount || 0)
              : 0,
      });

      const depositSummaryForOrder = getOrderDepositSummary(order as any);
      const sanitizedBreakdown = payload.paymentBreakdown
        ? normalizeOrderPaymentBreakdown(
          sanitizePaymentBreakdown(payload.paymentBreakdown),
          paymentState.paidAmount,
        )
        : null;
      const nextPaymentMethod = sanitizedBreakdown
        ? buildPaymentMethodSummary(
          sanitizedBreakdown as PaymentBreakdownEntry[],
          order.payment_method,
          {
            usesDeposit: depositSummaryForOrder.usesDeposit,
            paidAmount: paymentState.paidAmount,
            totalAmount: updateTotalAmount,
          },
        )
        : undefined;
      const nextCheckoutFulfillment = depositSummaryForOrder.usesDeposit
        ? patchDepositCheckoutOnPayment(
          order.checkout_fulfillment,
          paymentState.paidAmount,
          updateTotalAmount,
        )
        : undefined;

      const updateFields: Record<string, unknown> = {
        situation: paymentState.situation,
        paid_amount: paymentState.paidAmount,
        total_amount: updateTotalAmount,
        payment_method_discount_amount: pmDiscountAmount,
        payment_method_extra_amount: pmExtraAmount,
        ...(sanitizedBreakdown
          ? { payment_breakdown: sanitizedBreakdown }
          : {}),
        ...(nextPaymentMethod ? { payment_method: nextPaymentMethod } : {}),
        ...(nextCheckoutFulfillment
          ? { checkout_fulfillment: nextCheckoutFulfillment }
          : {}),
      };

      const updatePaymentState = () => {
        let query = supabase
          .from("orders")
          .update(updateFields)
          .eq("id", order.id)
          .eq("partner_id", payload.partnerId);
        if (order.updated_at) {
          query = query.eq("updated_at", order.updated_at);
        } else {
          query = query.eq("situation", order.situation);
          query = order.paid_amount === null
            ? query.is("paid_amount", null)
            : query.eq("paid_amount", order.paid_amount);
        }
        return query.select("id").maybeSingle();
      };

      let paymentWrite = await updatePaymentState();

      if (
        paymentWrite.error &&
        isMissingOrdersPaymentMethodDeltaColumnsError(paymentWrite.error)
      ) {
        delete updateFields.payment_method_discount_amount;
        delete updateFields.payment_method_extra_amount;
        paymentWrite = await updatePaymentState();
      }

      if (paymentWrite.error) return { error: paymentWrite.error.message };
      if (!paymentWrite.data) {
        paymentConcurrencyConflicts.push(order.order_number || order.id);
        continue;
      }

      successfullyUpdatedOrderIds.add(String(order.id));
      paymentProcessedCount += 1;

      if (
        capabilities.hasFinancial &&
        paymentState.paidAmount > (order.paid_amount || 0) + 0.009
      ) {
        const oldBreakdown = Array.isArray(order.payment_breakdown)
          ? order.payment_breakdown
          : [];
        const newBreakdown =
          sanitizedBreakdown ||
          (paymentState.situation === "paid"
            ? [
              {
                method: order.payment_method || "Dinheiro",
                amount: order.total_amount,
                amountReceived: order.total_amount,
                provider: order.payment_provider || null,
              },
            ]
            : [
              {
                method: order.payment_method || "Dinheiro",
                amount: order.total_amount,
                amountReceived: paymentState.paidAmount,
                provider: order.payment_provider || null,
              },
            ]);
        await createFinancialTransactionsForReceivedAmount(supabase, {
          orderId: order.id,
          orderNumber: order.order_number || order.id,
          partnerId: payload.partnerId,
          storeId: order.store_id || null,
          totalAmount: Number(order.total_amount || 0),
          newBreakdown,
          oldBreakdown,
          customerId: order.customer_id || order.buyer_id || null,
          customerName: order.customer_name || null,
          financeAccountId: order.finance_account_id || null,
          orderSource: order.order_source || "manual",
          paymentMethod: order.payment_method || "Método não definido",
        });
      }

      if (order.situation !== "paid" && paymentState.situation === "paid") {
        await fulfillMarketplaceOrderIfNeeded(supabase, order.id);
        if (capabilities.hasProductivity) {
          await createSellerCommissionForPaidOrder({
            supabase,
            partnerId: payload.partnerId,
            orderId: order.id,
            sellerUserId: order.created_by || null,
            saleAmount: Number(order.total_amount || 0),
            accountId: order.finance_account_id || null,
            createdByUserId: user.id,
            storeId: order.store_id || null,
          });
        }

        // Export order to Tiny ERP if configured (non-blocking)
        try {
          import("@/lib/services/integrations/erp-sync").then(({ exportOrderToConnectedErps }) => {
            exportOrderToConnectedErps(order.id).catch((err) => {
              console.error("[updateOrderStatusAction] ERP export failed:", err)
            })
          }).catch((erpErr) => {
            console.error("[updateOrderStatusAction] Error loading ERP sync:", erpErr)
          })
        } catch {}
      }

      if (capabilities.hasFinancial) {
        const { syncReceivableForOrder } =
          await import("@/lib/services/transaction.service");
        await syncReceivableForOrder(supabase, {
          order_number: order.order_number || order.id,
          partner_id: payload.partnerId,
          store_id: order.store_id || null,
          total_amount: Number(order.total_amount || 0),
          paid_amount: Number(paymentState.paidAmount || 0),
          situation: paymentState.situation,
          payment_method: nextPaymentMethod || order.payment_method,
          customer_id: order.customer_id || order.buyer_id || null,
          customer_name: order.customer_name,
          finance_account_id: order.finance_account_id,
          order_source: order.order_source || "manual",
        });
      }
    }
    if (paymentProcessedCount === 0) {
      if (paymentConcurrencyConflicts.length > 0) {
        return {
          error:
            "Os pedidos mudaram durante a atualização. Atualize a lista e tente novamente.",
        };
      }
      return { error: "Nenhum pedido elegível para alteração de pagamento." };
    }
  }

  if (payload.actionType === "delivery_status") {
    const allowedDeliveryStatuses = new Set([
      "not_sent",
      "preparing",
      "sent",
      "delivered",
      "pickup_available",
      "delivery_failed",
    ]);

    if (
      !payload.statusValue ||
      !allowedDeliveryStatuses.has(payload.statusValue)
    ) {
      return { error: "Status de envio invalido para atualizacao em massa." };
    }

    let deliveryProcessedCount = 0;

    // P4: separa os pedidos elegíveis em dois grupos para evitar N UPDATEs sequenciais:
    // - finalizeOrders: precisam finalizar o estoque antes do update (efeito colateral, loop individual)
    // - simpleOrders: apenas mudança de status idêntica -> um único UPDATE em massa via .in()
    const eligibleDeliveryOrders: any[] = [];
    for (const order of currentOrders || []) {
      if (order.situation === "cancelled") {
        continue;
      }
      eligibleDeliveryOrders.push(order);
    }

    if (payload.statusValue === "delivered") {
      const { doesOrderRequireDeliveryOtp, verifyAndConsumeDeliveryOtp, bypassDeliveryOtp } = await import("@/lib/services/delivery-otp.service");
      const otpRequiredOrders: any[] = [];
      for (const order of eligibleDeliveryOrders) {
        const req = await doesOrderRequireDeliveryOtp(order.id, { orderData: order });
        if (req.requiresOtp) {
          otpRequiredOrders.push(order);
        }
      }

      if (otpRequiredOrders.length > 0) {
        if (payload.bypassOtp) {
          if (!isAdmin) {
            return { error: "Apenas administradores e proprietários podem bypassar o código de confirmação de entrega." };
          }
          for (const order of otpRequiredOrders) {
            await bypassDeliveryOtp({
              orderId: order.id,
              bypassedByUserId: user.id,
              reason: payload.bypassReason || payload.changeReason || "Bypass autorizado pelo administrador no ERP",
            });
          }
        } else {
          if (otpRequiredOrders.length === 1) {
            if (!payload.deliveryOtp) {
              return {
                error: "Este pedido exige o código de confirmação de entrega de 6 dígitos fornecido pelo cliente.",
                requiresOtp: true,
              };
            }
            const verifyRes = await verifyAndConsumeDeliveryOtp({
              orderId: otpRequiredOrders[0].id,
              code: payload.deliveryOtp,
              confirmedByUserId: user.id,
            });
            if (!verifyRes.success) {
              return {
                error: verifyRes.error || "Código de confirmação de entrega incorreto.",
              };
            }
          } else {
            return {
              error: "Esta seleção contém múltiplos pedidos que exigem código de confirmação. Confirme cada pedido individualmente ou autorize o bypass administrativo.",
              requiresOtp: true,
            };
          }
        }
      }
    }

    const finalizeDeliveryOrders = capabilities.hasStockMovements
      ? eligibleDeliveryOrders.filter(
        (order) =>
          !order.inventory_deducted &&
          shouldDeductInventory(payload.statusValue),
      )
      : [];
    const simpleDeliveryOrders = eligibleDeliveryOrders.filter(
      (order) =>
        !(
          !order.inventory_deducted &&
          capabilities.hasStockMovements &&
          shouldDeductInventory(payload.statusValue)
        ),
    );

    // Pedidos com efeito colateral: finaliza estoque e atualiza individualmente (marca inventory_deducted).
    for (const order of finalizeDeliveryOrders) {
      const finalizeResult = await finalizeOrderInventory({
        client: supabase,
        partnerId: payload.partnerId,
        orderId: order.id,
        createdBy: user.id,
        reason: "Venda de Produtos",
        notes: normalizeOrderNotes(order.notes) || undefined,
        items: order.order_items || [],
        storeId: order.store_id,
      });

      if ("error" in finalizeResult) return { error: finalizeResult.error };

      const { error } = await supabase
        .from("orders")
        .update({
          delivery_status: payload.statusValue,
          inventory_deducted: true,
        })
        .eq("id", order.id)
        .eq("partner_id", payload.partnerId);

      if (error) return { error: error.message };
      successfullyUpdatedOrderIds.add(String(order.id));
      deliveryProcessedCount += 1;
    }

    // Pedidos simples (mesmo valor de status, sem efeito colateral): um único UPDATE em massa.
    if (simpleDeliveryOrders.length > 0) {
      const { error } = await supabase
        .from("orders")
        .update({ delivery_status: payload.statusValue })
        .in(
          "id",
          simpleDeliveryOrders.map((order) => order.id),
        )
        .eq("partner_id", payload.partnerId);

      if (error) return { error: error.message };
      simpleDeliveryOrders.forEach((order) =>
        successfullyUpdatedOrderIds.add(String(order.id)),
      );
      deliveryProcessedCount += simpleDeliveryOrders.length;
    }

    if (deliveryProcessedCount === 0) {
      return { error: "Nenhum pedido elegível para alteração de entrega." };
    }

    if (payload.statusValue) {
      const allOrderIds = (currentOrders || [])
        .map((o: any) => o.id)
        .filter(Boolean);
      await syncOrderDeliveryStatusToDeliveries(
        supabase,
        payload.partnerId,
        allOrderIds,
        payload.statusValue,
      );
    }
  }

  try {
    await Promise.all(
      (currentOrders || [])
        .filter((order: any) => successfullyUpdatedOrderIds.has(String(order.id)))
        .map((order: any) => {
        const lines: string[] = [];

        if (payload.actionType === "payment_status") {
          if (order.situation === "cancelled") return Promise.resolve();
          const requestedStatus = paymentStatusMap[payload.statusValue || ""];

          if (requestedStatus) {
            const nextPaymentState = resolvePaymentState({
              requestedStatus,
              totalAmount: Number(order.total_amount || 0),
              paidAmount:
                payload.paidAmount !== undefined
                  ? payload.paidAmount
                  : undefined,
              fallbackPaidAmount:
                requestedStatus === "paid"
                  ? Number(order.total_amount || 0)
                  : requestedStatus === "partially_paid"
                    ? Number(order.paid_amount || 0)
                    : 0,
            });

            const oldBreakdown = Array.isArray(order.payment_breakdown)
              ? order.payment_breakdown
              : [];
            const newBreakdown = payload.paymentBreakdown || [];

            const oldMap = new Map<string, number>();
            oldBreakdown.forEach((leg: any) => {
              if (leg?.method) {
                const m = String(leg.method);
                oldMap.set(
                  m,
                  (oldMap.get(m) || 0) + Number(leg.amountReceived || 0),
                );
              }
            });

            const newMap = new Map<string, number>();
            newBreakdown.forEach((leg: any) => {
              if (leg?.method) {
                const m = String(leg.method);
                newMap.set(
                  m,
                  (newMap.get(m) || 0) + Number(leg.amountReceived || 0),
                );
              }
            });

            const diffs: Array<{ method: string; amount: number }> = [];
            newMap.forEach((newVal, method) => {
              const oldVal = oldMap.get(method) || 0;
              if (newVal > oldVal + 0.009) {
                diffs.push({ method, amount: newVal - oldVal });
              }
            });

            if (diffs.length > 0) {
              const isFullyPaid = nextPaymentState.situation === "paid";
              diffs.forEach((d) => {
                const methodLabel =
                  normalizePaymentMethodLabel(d.method) ||
                  "Método não definido";
                const suffix = isFullyPaid ? ". Pedido totalmente pago." : ".";
                lines.push(
                  `Recebido ${formatCurrency(d.amount)} via ${methodLabel}${suffix}`,
                );
              });
            } else if (order.situation !== nextPaymentState.situation) {
              let line = `alterou status de pagamento: ${getPaymentStatusLabel(order.situation)} -> ${getPaymentStatusLabel(nextPaymentState.situation)}`;
              if (payload.paidAmount !== undefined) {
                line += ` (Valor pago informado: ${formatCurrency(payload.paidAmount)})`;
              }
              lines.push(line);
            }

            if (overrideOrderIds.has(String(order.id))) {
              lines.push(
                "autorizou o recebimento presencial do saldo com override (configuração desativada)",
              );
            }
          }
        }

        if (
          payload.actionType === "delivery_status" &&
          payload.statusValue &&
          order.delivery_status !== payload.statusValue
        ) {
          if (order.situation === "cancelled") return Promise.resolve();
          let line = `alterou status de entrega: ${getDeliveryStatusLabel(order.delivery_status)} -> ${getDeliveryStatusLabel(payload.statusValue)}`;
          if (payload.changeReason?.trim()) {
            line += ` (Motivo da alteração: ${payload.changeReason.trim()})`;
          }
          lines.push(line);
        }

        if (lines.length === 0) return Promise.resolve();

        const metadata =
          payload.actionType === "payment_status" && lines.length > 0
            ? (() => {
              const requestedStatus =
                paymentStatusMap[payload.statusValue || ""];
              if (!requestedStatus) return null;
              const nextPaymentState = resolvePaymentState({
                requestedStatus,
                totalAmount: Number(order.total_amount || 0),
                paidAmount:
                  payload.paidAmount !== undefined
                    ? payload.paidAmount
                    : undefined,
                fallbackPaidAmount:
                  requestedStatus === "paid"
                    ? Number(order.total_amount || 0)
                    : requestedStatus === "partially_paid"
                      ? Number(order.paid_amount || 0)
                      : 0,
              });
              return {
                oldStatus: getPaymentStatusLabel(order.situation),
                newStatus: getPaymentStatusLabel(nextPaymentState.situation),
                statusScope: "payment",
                ...(overrideOrderIds.has(String(order.id))
                  ? {
                    manualBalanceOverride: true,
                    overrideRole: access?.roleId || "admin",
                  }
                  : {}),
              };
            })()
            : payload.actionType === "delivery_status" && payload.statusValue
              ? {
                oldStatus: getDeliveryStatusLabel(order.delivery_status),
                newStatus: getDeliveryStatusLabel(payload.statusValue),
                statusScope: "delivery",
              }
              : null;

        const auditMetadata = {
          ...metadata,
        };

        return logAuditEvent({
          partnerId: payload.partnerId,
          actorUserId: user.id,
          actorName: effectiveUserName,
          entityType: "order",
          entityId: order.id,
          actionType: payload.actionType,
          changeLines: lines,
          metadata: auditMetadata,
          source: "erp",
        });
      }),
    );
  } catch (historyError) {
    console.error(
      "[orders_history] updateOrdersStatusInBatchAction:",
      historyError,
    );
  }

  await invalidateInventoryItems(
    payload.partnerId,
    (currentOrders || [])
      .filter((order: any) => successfullyUpdatedOrderIds.has(String(order.id)))
      .flatMap((order: any) => order.order_items || []),
  );
  await revalidateOrders(payload.partnerId);

  const dispatchOrderStatusSideEffects = async () => {
    const processedOrders = (currentOrders || []).filter((order: any) =>
      successfullyUpdatedOrderIds.has(String(order.id)),
    );
    const firstOrder = processedOrders[0];
    if (!firstOrder) return;
    const processedOrderIds = processedOrders
      .map((order: any) => String(order.id))
      .sort()
      .join(",");

    const { buildNotificationContent } =
      await import("@/lib/notifications/templates");
    const { data: store } = await supabase
      .from("stores")
      .select("id, name")
      .eq("partner_id", payload.partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle();
    const storeName = store?.name || "Vendedor";
    const storeId = store?.id || null;

    if (payload.actionType === "payment_status" && payload.statusValue) {
      const paymentStatusMap: Record<string, string> = {
        paid: "paid",
        pending: "pending",
        partially_paid: "partially_paid",
      };
      const situation =
        paymentStatusMap[payload.statusValue] || payload.statusValue;

      const orderCount = processedOrders.length;
      const isBatch = orderCount > 1;
      const customerNotifType = (
        situation === "paid" ? "order_paid" : "order_created"
      ) as import("@/lib/notifications/types").NotificationType;
      const customerNotif = (buildNotificationContent as any)(
        customerNotifType,
        "customer",
        {
          isBatch,
          batchCount: orderCount,
          orderNumber: firstOrder.order_number,
          storeName,
        },
      );
      const partnerNotif = (buildNotificationContent as any)(
        "order_paid",
        "seller",
        {
          isBatch,
          batchCount: orderCount,
          orderNumber: firstOrder.order_number,
          storeName,
          customerName: firstOrder.customer_name || "cliente",
        },
      )(
        // System notification consolidated via Central Resolver (In-App + External Channel)
        async () => {
          const { createNotification, getPartnerTeamUserIds } =
            await import("@/lib/services/notification.service");
          if (firstOrder.buyer_id) {
            await createNotification({
              userId: firstOrder.buyer_id as string,
              type: customerNotifType,
              title: customerNotif.title,
              message: customerNotif.message,
              entityType: "order",
              entityId: firstOrder.id,
              data: {
                audience: "customer",
                partner_id: payload.partnerId,
                store_id: storeId,
                store_name: storeName,
                storeName,
                isBatch,
                batchCount: orderCount,
                order_number: firstOrder.order_number,
                customer_id: firstOrder.customer_id || undefined,
              },
              idempotencyKey: `bulk_payment:customer:${payload.partnerId}:${processedOrderIds}`,
              origin: "manual",
            });
          }
          const { getNotificationRecipientRoles } = await import("@/lib/notifications/audience");
          const teamUserIds = await getPartnerTeamUserIds(
            payload.partnerId,
            getNotificationRecipientRoles("order_paid"),
          );
          for (const userId of teamUserIds) {
            await createNotification({
              userId,
              type: "order_paid",
              title: partnerNotif.title,
              message: partnerNotif.message,
              entityType: "order",
              entityId: firstOrder.id,
              data: {
                audience: "seller",
                partner_id: payload.partnerId,
                store_id: storeId,
                store_name: storeName,
                isBatch,
                batchCount: orderCount,
                order_number: firstOrder.order_number,
              },
              idempotencyKey: `bulk_payment:seller:${payload.partnerId}:${userId}:${processedOrderIds}`,
              origin: "manual",
            });
          }
        },
      )();
    }

    if (payload.actionType === "delivery_status" && payload.statusValue) {
      const deliveryStatus = payload.statusValue;
      const orderCount = processedOrders.length;
      const isBatch = orderCount > 1;

      const notifType = (
        deliveryStatus === "delivered"
          ? "order_delivered"
          : deliveryStatus === "sent"
            ? "order_shipped"
            : "order_created"
      ) as import("@/lib/notifications/types").NotificationType;
      const customerNotif = (buildNotificationContent as any)(
        notifType,
        "customer",
        {
          isBatch,
          batchCount: orderCount,
          orderNumber: firstOrder.order_number,
          storeName,
        },
      );
      const partnerNotif = (buildNotificationContent as any)(
        notifType,
        "seller",
        {
          isBatch,
          batchCount: orderCount,
          orderNumber: firstOrder.order_number,
          storeName,
          customerName: firstOrder.customer_name || "cliente",
        },
      )(
        // System notification consolidated via Central Resolver (In-App + External Channel)
        async () => {
          const { createNotification, getPartnerTeamUserIds } =
            await import("@/lib/services/notification.service");
          if (firstOrder.buyer_id) {
            await createNotification({
              userId: firstOrder.buyer_id as string,
              type: notifType,
              title: customerNotif.title,
              message: customerNotif.message,
              entityType: "order",
              entityId: firstOrder.id,
              data: {
                audience: "customer",
                partner_id: payload.partnerId,
                store_id: storeId,
                store_name: storeName,
                storeName,
                isBatch,
                batchCount: orderCount,
                order_number: firstOrder.order_number,
                customer_id: firstOrder.customer_id || undefined,
              },
              idempotencyKey: `bulk_delivery:customer:${payload.partnerId}:${processedOrderIds}`,
              origin: "manual",
            });
          }
          const { getNotificationRecipientRoles } = await import("@/lib/notifications/audience");
          const teamUserIds = await getPartnerTeamUserIds(
            payload.partnerId,
            getNotificationRecipientRoles(notifType),
          );
          for (const userId of teamUserIds) {
            await createNotification({
              userId,
              type: notifType,
              title: partnerNotif.title,
              message: partnerNotif.message,
              entityType: "order",
              entityId: firstOrder.id,
              data: {
                audience: "seller",
                partner_id: payload.partnerId,
                store_id: storeId,
                store_name: storeName,
                count: orderCount,
                isBatch,
                batchCount: orderCount,
                order_number: firstOrder.order_number,
              },
              idempotencyKey: `bulk_delivery:seller:${payload.partnerId}:${userId}:${processedOrderIds}`,
              origin: "manual",
            });
          }
        },
      )();
    }
  };

  dispatchOrderStatusSideEffects().catch(console.error);

  if (paymentConcurrencyConflicts.length > 0) {
    overallWarnings.push(
      `Alguns pedidos foram alterados por outra operação e foram ignorados: ${paymentConcurrencyConflicts.join(", ")}. Atualize a lista para ver o estado atual.`,
    );
  }
  if (overallWarnings.length > 0) {
    return { success: true, warning: overallWarnings.join(" | ") };
  }
  return { success: true };
}

export type ERPOrderListCursor = { createdAt: string; id: string };

function buildOrdersKeysetOrFilter(cursor: ERPOrderListCursor): string {
  const ts = cursor.createdAt;
  const id = cursor.id;
  const q = (s: string) => `"${(s || "").toString().replace(/"/g, '""')}"`;
  return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`;
}

const ERP_ORDERS_PAGE_SIZE = 100;

export async function getERPOrdersPageAction(
  partnerId: string,
  options?: {
    cursor?: ERPOrderListCursor | null;
    limit?: number;
    storeId?: string;
  },
): Promise<
  | {
    success: true;
    items: any[];
    nextCursor: ERPOrderListCursor | null;
    hasMore: boolean;
  }
  | { success: false; error: string }
> {
  try {
    const user = await requireUser();
    const context = await getCurrentPartnerContext(user);
    if (!context?.partnerId || context.partnerId !== partnerId) {
      return { success: false, error: "O parceiro informado não corresponde ao contexto ativo" };
    }
    const access = await requirePermission(partnerId, "orders", "view", user);
    if (!can(access as RbacUserLike, "orders.list")) {
      return {
        success: false,
        error: "Sem permissão para acessar a listagem de pedidos.",
      };
    }

    const storeId = options?.storeId || context.activeStoreId || undefined;
    if (storeId) await requireStorePermission(storeId, partnerId, "orders", "view");

    const cursor = options?.cursor ?? null;
    const limit = Math.max(
      1,
      Math.min(250, Math.floor(Number(options?.limit || ERP_ORDERS_PAGE_SIZE))),
    );
    const fetchLimit = limit + 1;
    const rows = await getCachedErpPage(
      [
        "erp-orders-page",
        partnerId,
        storeId || "all-stores",
        cursor ? `${cursor.createdAt}:${cursor.id}` : "first",
        String(limit),
      ],
      [TAGS.orders(partnerId)],
      async () => {
        const supabase = createAdminClient();
        const baseSelect = `
                        id, order_number, mp_payment_id, customer_name, buyer_id, customer_id,
                        total_amount, paid_amount, situation, previous_situation_before_cancel,
                        delivery_status, delivery_type, order_source, created_at, updated_at, store_id,
                        stores(name),
                        customers(id, name, email, phone),
                        order_shipments(id, status, tracking_number, tracking_url, provider_slug, kind, created_at, carrier),
                        return_requests!order_id(id, status, approved_resolution, desired_resolution, resolution_type, refund_amount, store_credit_amount, inventory_movement_id, return_items!return_items_return_request_id_fkey(order_item_id, quantity)),
                        order_items(id, quantity, product_id, variant_id, service_id, line_type, product_name, product_price, subtotal, is_gift, original_price),
                        payment_method, payment_breakdown, payment_provider,
                        delivery_breakdown,
                        checkout_fulfillment
                    `;
        const selectWithPosSale = `${baseSelect}, is_pos_sale`;
        const buildQuery = (selectClause: string) => {
          let query = supabase
            .from("orders")
            .select(selectClause)
            .eq("partner_id", partnerId);
          if (storeId) query = query.eq("store_id", storeId);
          if (cursor) query = query.or(buildOrdersKeysetOrFilter(cursor));
          return query
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit);
        };

        let queryResult = await buildQuery(
          ordersHasPosSaleColumn === false ? baseSelect : selectWithPosSale,
        );
        if (
          queryResult.error &&
          isMissingOrdersIsPosSaleColumnError(queryResult.error)
        ) {
          ordersHasPosSaleColumn = false;
          queryResult = await buildQuery(baseSelect);
        } else if (!queryResult.error && ordersHasPosSaleColumn === null) {
          ordersHasPosSaleColumn = true;
        }
        if (queryResult.error) throw queryResult.error;
        const rawData = queryResult.data || [];

        // Resolve missing customer names for marketplace / external orders
        const missingBuyerIds = Array.from(
          new Set(
            rawData
              .filter((r: any) => {
                const cust = Array.isArray(r.customers)
                  ? r.customers[0]
                  : r.customers;
                const hasName = Boolean(
                  r.customer_name &&
                  r.customer_name.trim() !== "" &&
                  r.customer_name !== "Consumidor final",
                );
                return !hasName && !cust?.name && !cust?.email && r.buyer_id;
              })
              .map((r: any) => r.buyer_id)
              .filter(Boolean),
          ),
        );

        const customerInfoByBuyerId = new Map<
          string,
          { name: string; email: string | null }
        >();

        if (missingBuyerIds.length > 0) {
          try {
            const { data: matchedCustomers } = await supabase
              .from("customers")
              .select("id, name, email, user_id, marketplace_user_id")
              .eq("partner_id", partnerId)
              .or(
                missingBuyerIds
                  .map(
                    (id) =>
                      `id.eq.${id},user_id.eq.${id},marketplace_user_id.eq.${id}`,
                  )
                  .join(","),
              );

            for (const c of matchedCustomers || []) {
              const info = { name: c.name, email: c.email || null };
              if (c.id) customerInfoByBuyerId.set(c.id, info);
              if (c.user_id) customerInfoByBuyerId.set(c.user_id, info);
              if (c.marketplace_user_id)
                customerInfoByBuyerId.set(c.marketplace_user_id, info);
            }

            const stillMissingIds = missingBuyerIds.filter(
              (id): id is string => !customerInfoByBuyerId.has(id as string),
            );
            if (stillMissingIds.length > 0) {
              const { data: profiles } = await supabase
                .from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", stillMissingIds);
              for (const p of profiles || []) {
                if (p.full_name) {
                  customerInfoByBuyerId.set(p.user_id, {
                    name: p.full_name,
                    email: null,
                  });
                }
              }
            }
          } catch (err) {
            console.error(
              "[getERPOrdersPageAction] Error resolving missing customer names:",
              err,
            );
          }
        }

        return rawData.map((row: any) => {
          const cust = Array.isArray(row?.customers)
            ? row.customers[0]
            : row.customers;
          const fallbackInfo = row?.buyer_id
            ? customerInfoByBuyerId.get(row.buyer_id)
            : null;
          const resolvedCustomerName =
            row?.customer_name && row.customer_name !== "Consumidor final"
              ? row.customer_name
              : cust?.name ||
              cust?.email ||
              fallbackInfo?.name ||
              fallbackInfo?.email ||
              row?.customer_name ||
              null;

          return {
            ...row,
            customer_name: resolvedCustomerName,
            customers:
              cust ||
              (fallbackInfo
                ? { name: fallbackInfo.name, email: fallbackInfo.email }
                : null),
            buyer_email: cust?.email || fallbackInfo?.email || null,
          };
        });
      },
      30,
    );
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map((row: any) => {
      const returnedToInventoryQtyMap = new Map<string, number>();
      const reqs = Array.isArray(row?.return_requests)
        ? row.return_requests
        : [];
      for (const req of reqs) {
        if (req.inventory_movement_id && Array.isArray(req.return_items)) {
          for (const item of req.return_items) {
            const current =
              returnedToInventoryQtyMap.get(item.order_item_id) || 0;
            returnedToInventoryQtyMap.set(
              item.order_item_id,
              current + Number(item.quantity || 0),
            );
          }
        }
      }
      const orderItems = Array.isArray(row?.order_items) ? row.order_items : [];
      const totalRemainingToRestore = orderItems
        .filter((item: any) => item.product_id)
        .reduce((sum: number, item: any) => {
          const returnedQty = returnedToInventoryQtyMap.get(item.id) || 0;
          return sum + Math.max(0, Number(item.quantity || 0) - returnedQty);
        }, 0);
      const has_items_to_restore = totalRemainingToRestore > 0;

      return {
        ...row,
        is_pos_sale: Boolean(row?.is_pos_sale),
        quantity:
          Number(row?.quantity || 0) ||
          (Array.isArray(row?.order_items)
            ? row.order_items.reduce(
              (sum: number, item: any) => sum + Number(item?.quantity || 0),
              0,
            )
            : 0),
        return_count: reqs.length,
        is_refunded: reqs.some((req: any) => {
          const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(
            req.status,
          );
          const isRefundResolution =
            req.approved_resolution === "refund" ||
            (!req.approved_resolution && req.desired_resolution === "refund");
          const hasRefundValue = Number(req.refund_amount || 0) > 0;
          return isApprovedOrResolved && (isRefundResolution || hasRefundValue);
        }),
        refunded_amount: reqs.reduce((sum: number, req: any) => {
          const isApprovedOrResolved = ["APPROVED", "RESOLVED"].includes(
            req.status,
          );
          const isRefundResolution =
            req.approved_resolution === "refund" ||
            (!req.approved_resolution && req.desired_resolution === "refund");
          const hasRefundValue = Number(req.refund_amount || 0) > 0;
          if (isApprovedOrResolved && (isRefundResolution || hasRefundValue)) {
            return sum + Number(req.refund_amount || 0);
          }
          return sum;
        }, 0),
        has_items_to_restore,
        // Backward-compatible field used by UI, with fallback when column doesn't exist in DB
        order_date: row?.order_date || row?.created_at || null,
      };
    });
    const last = items[items.length - 1];
    const nextCursor: ERPOrderListCursor | null =
      hasMore && last?.created_at && last?.id
        ? { createdAt: String(last.created_at), id: String(last.id) }
        : null;

    return { success: true, items, nextCursor, hasMore };
  } catch (e: any) {
    return { success: false, error: e?.message || "Erro ao carregar pedidos" };
  }
}

export async function confirmAppointmentOrderPaymentAction(payload: {
  orderId: string;
  partnerId: string;
  paymentStatus: "paid" | "partially_paid" | "unpaid";
  paidAmount: number;
  paymentMethod: string;
  paymentBreakdown?: Array<{
    method: string;
    amount: number;
    paymentMethodId?: string | null;
    installmentNumber?: number;
  }>;
  paymentProvider?: string | null;
  mpPaymentId?: string | null;
  checkoutFulfillment?: Record<string, unknown> | null;
  financeAccountId?: string | null;
  notes?: string;
  servicePrice?: number;
  serviceName?: string;
  serviceId?: string | null;
  categoryId?: string | null;
}) {
  try {
    const user = await requireUser();
    if (!user) return { success: false, error: "Não autenticado" };
    const submittedBreakdown = payload.paymentBreakdown as unknown;
    const invalidBreakdown =
      submittedBreakdown !== undefined &&
      (!Array.isArray(submittedBreakdown) ||
        submittedBreakdown.length > 10 ||
        submittedBreakdown.some((leg: any) =>
          !leg ||
          !String(leg.method || "").trim() ||
          !Number.isFinite(leg.amount) ||
          leg.amount < 0 ||
          (leg.paymentMethodId != null &&
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              String(leg.paymentMethodId),
            )),
        ));
    if (
      !["paid", "partially_paid", "unpaid"].includes(String(payload.paymentStatus)) ||
      !Number.isFinite(payload.paidAmount) ||
      payload.paidAmount < 0 ||
      (payload.servicePrice !== undefined &&
        (!Number.isFinite(payload.servicePrice) || payload.servicePrice < 0)) ||
      !String(payload.paymentMethod || "").trim() ||
      String(payload.paymentMethod).length > 120 ||
      String(payload.serviceName || "").length > 500 ||
      String(payload.notes || "").length > 5000 ||
      invalidBreakdown
    ) {
      return { success: false, error: "Dados de pagamento inválidos." };
    }
    await requirePermission(payload.partnerId, "orders", "edit");
    await requirePermission(payload.partnerId, "financial", "edit", user);

    const supabase = await getSupabaseServerClient();

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("*")
      .eq("id", payload.orderId)
      .eq("partner_id", payload.partnerId)
      .single();

    if (orderErr || !order) {
      throw new Error("Pedido não encontrado");
    }
    if (order.store_id) {
      await requireStorePermission(order.store_id, payload.partnerId, "orders", "edit");
      await requireStorePermission(order.store_id, payload.partnerId, "financial", "edit");
    }
    if (
      payload.servicePrice !== undefined &&
      payload.servicePrice < Number(order.total_amount || 0) - 0.009
    ) {
      await requirePermission(payload.partnerId, "orders", "can_apply_discount", user);
    }
    if (payload.serviceId) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.serviceId)) {
        return { success: false, error: "Serviço inválido para este pedido." };
      }
      let serviceQuery = supabase
        .from("services")
        .select("id, store_id")
        .eq("id", payload.serviceId)
        .eq("partner_id", payload.partnerId);
      serviceQuery = order.store_id
        ? serviceQuery.or(`store_id.is.null,store_id.eq.${order.store_id}`)
        : serviceQuery.is("store_id", null);
      const { data: service } = await serviceQuery.maybeSingle();
      if (!service) return { success: false, error: "Serviço inválido para este pedido." };
    }
    const paymentMethodIds = Array.from(new Set(
      (payload.paymentBreakdown || [])
        .map((leg) => leg.paymentMethodId)
        .filter((id): id is string => Boolean(id)),
    ));
    if (paymentMethodIds.length > 0) {
      let methodQuery = supabase
        .from("payment_methods")
        .select("id, store_id")
        .eq("partner_id", payload.partnerId)
        .in("id", paymentMethodIds);
      methodQuery = order.store_id
        ? methodQuery.or(`store_id.is.null,store_id.eq.${order.store_id}`)
        : methodQuery.is("store_id", null);
      const { data: methods, error: methodsError } = await methodQuery;
      if (methodsError || (methods || []).length !== paymentMethodIds.length) {
        return { success: false, error: "Método de pagamento inválido para este pedido." };
      }
    }
    if (payload.financeAccountId) {
      const { data: financeAccount } = await supabase
        .from("finance_accounts")
        .select("id, store_id")
        .eq("id", payload.financeAccountId)
        .eq("partner_id", payload.partnerId)
        .maybeSingle();
      if (!financeAccount) return { success: false, error: "Conta financeira inválida para este pedido." };
      if (financeAccount.store_id) {
        if (order.store_id && financeAccount.store_id !== order.store_id) {
          return { success: false, error: "A conta financeira pertence a outra loja." };
        }
        await requireStorePermission(financeAccount.store_id, payload.partnerId, "financial", "edit");
      }
    }

    let orderPrice = Number(order.total_amount || 0);
    if (payload.servicePrice !== undefined) {
      orderPrice = Number(payload.servicePrice || 0);

      // Preserve appointment links before delete/re-insert
      const { data: oldSvcItems } = await supabase
        .from("order_items")
        .select("id, product_name, service_id, sort_order")
        .eq("order_id", payload.orderId)
        .neq("is_gift", true);
      const { data: apptsBefore } = await supabase
        .from("appointments")
        .select("id, order_item_id, service_id, service_name")
        .eq("marketplace_order_id", payload.orderId)
        .eq("partner_id", payload.partnerId);

      // Delete existing non-gift service items then recreate individual items
      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", payload.orderId)
        .neq("is_gift", true);

      const svcNames = String(payload.serviceName || "Serviço")
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      const svcCount = svcNames.length;
      const svcUnitPrice =
        svcCount > 1
          ? Math.round((orderPrice / svcCount) * 100) / 100
          : orderPrice;
      const serviceItems = svcNames.map((name: string, idx: number) => ({
        order_id: payload.orderId,
        product_id: null,
        variant_id: null,
        product_name: name,
        product_price: svcUnitPrice,
        quantity: 1,
        subtotal: svcUnitPrice,
        line_type: "service_booking",
        service_id: payload.serviceId || null,
        sort_order: idx + 1,
        is_gift: false,
        original_price: null,
        is_promotional: false,
        promotion_id: null,
      }));
      await supabase.from("order_items").insert(serviceItems);

      // Remap appointment order_item_id to the new items
      if (
        apptsBefore &&
        apptsBefore.length > 0 &&
        oldSvcItems &&
        oldSvcItems.length > 0
      ) {
        try {
          const { data: newSvcItems } = await supabase
            .from("order_items")
            .select("id, product_name, service_id, sort_order")
            .eq("order_id", payload.orderId)
            .neq("is_gift", true);
          if (newSvcItems && newSvcItems.length > 0) {
            for (const appt of apptsBefore) {
              if (!appt.order_item_id) continue;
              const oldItem = oldSvcItems.find(
                (oi: any) => oi.id === appt.order_item_id,
              );
              if (!oldItem) continue;
              let match = newSvcItems.find(
                (ni: any) => ni.sort_order === oldItem.sort_order,
              );
              if (!match && oldItem.service_id) {
                match = newSvcItems.find(
                  (ni: any) => ni.service_id === oldItem.service_id,
                );
              }
              if (!match) {
                match = newSvcItems.find(
                  (ni: any) =>
                    (ni.product_name || "").toLowerCase() ===
                    (oldItem.product_name || "").toLowerCase(),
                );
              }
              if (match && match.id !== appt.order_item_id) {
                await supabase
                  .from("appointments")
                  .update({ order_item_id: match.id })
                  .eq("id", appt.id)
                  .eq("partner_id", payload.partnerId);
              }
            }
          }
        } catch {
          // Best-effort remap
        }
      }
    }

    const breakdownTotal = (payload.paymentBreakdown || []).reduce(
      (s, e) => s + Number(e.amount || 0),
      0,
    );
    const hasBreakdown = (payload.paymentBreakdown || []).length > 0;
    let breakdownDiscount = 0;
    for (const entry of payload.paymentBreakdown || []) {
      if ((entry as any).adjustmentType === "discount") {
        const discountAmount = Number((entry as any).paymentMethodDiscountAmount || 0);
        if (!Number.isFinite(discountAmount) || discountAmount < 0) {
          return { success: false, error: "Desconto de pagamento inválido." };
        }
        breakdownDiscount += Number(
          (entry as any).paymentMethodDiscountAmount || 0,
        );
      }
    }
    if (breakdownDiscount > Number(order.total_amount || 0) + 0.009) {
      return { success: false, error: "O desconto informado excede o valor do pedido." };
    }
    if (breakdownDiscount > 0.009) {
      await requirePermission(payload.partnerId, "orders", "can_apply_discount", user);
    }
    const paymentMethodDiscountAmount = breakdownDiscount;
    const paymentMethodExtraAmount = 0;
    const totalAmountToSave = Math.max(
      0,
      orderPrice - paymentMethodDiscountAmount,
    );

    const paymentState = resolvePaymentState({
      requestedStatus: payload.paymentStatus,
      totalAmount: totalAmountToSave,
      paidAmount:
        hasBreakdown && breakdownTotal > 0
          ? breakdownTotal
          : payload.paidAmount,
      fallbackPaidAmount: Number(order.paid_amount || 0),
    });

    const nextSituation = paymentState.situation;
    const nextPaidAmount = paymentState.paidAmount;

    const updatePayload: any = {
      situation: nextSituation,
      paid_amount: nextPaidAmount,
      payment_method: payload.paymentMethod,
      payment_breakdown: payload.paymentBreakdown || null,
      payment_provider: payload.paymentProvider || null,
      mp_payment_id: payload.mpPaymentId || null,
      checkout_fulfillment: mergeCheckoutFulfillment(
        order.checkout_fulfillment as Record<string, unknown> | null,
        (payload as any).checkoutFulfillment || null,
      ),
      finance_account_id: payload.financeAccountId || null,
      total_amount: totalAmountToSave,
      payment_method_discount_amount: paymentMethodDiscountAmount,
      payment_method_extra_amount: paymentMethodExtraAmount,
    };

    if (payload.notes !== undefined) {
      updatePayload.notes = sanitizeNotes(payload.notes);
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update(updatePayload)
      .eq("id", payload.orderId)
      .eq("partner_id", payload.partnerId);

    if (updateError) throw updateError;

    const changeLines = [
      `confirmou pagamento via checkout: status ${getPaymentStatusLabel(order.situation)} -> ${getPaymentStatusLabel(nextSituation)}`,
      `valor pago: ${formatCurrency(order.paid_amount || 0)} -> ${formatCurrency(nextPaidAmount)}`,
    ];
    await logAuditEvent({
      partnerId: payload.partnerId,
      actorUserId: user.id,
      entityType: "order",
      entityId: payload.orderId,
      actionType: "updated",
      changeLines,
      metadata: {
        oldSituation: order.situation,
        newSituation: nextSituation,
        paidAmount: nextPaidAmount,
      },
      source: "erp",
    });

    if (nextSituation === "paid") {
      await createFinancialTransactionsForPaidOrder(supabase, {
        orderId: payload.orderId,
        orderNumber: order.order_number,
        partnerId: payload.partnerId,
        storeId: order.store_id || null,
        totalAmount: totalAmountToSave,
        paymentMethod: payload.paymentMethod,
        paymentProvider: payload.paymentProvider,
        paymentBreakdown: payload.paymentBreakdown,
        customerId: order.customer_id || order.buyer_id || null,
        customerName: order.customer_name,
        paymentDate: new Date().toISOString(),
        financeAccountId: payload.financeAccountId,
        orderSource: order.order_source || "manual",
        mpPaymentId: payload.mpPaymentId || null,
      });

      await fulfillMarketplaceOrderIfNeeded(supabase, payload.orderId);

      await createSellerCommissionForPaidOrder({
        supabase,
        partnerId: payload.partnerId,
        orderId: payload.orderId,
        sellerUserId: order.created_by || user.id,
        saleAmount: totalAmountToSave,
        accountId: payload.financeAccountId,
        createdByUserId: user.id,
        storeId: order.store_id || null,
      });
    }

    const { data: linkedAppointment } = await supabase
      .from("appointments")
      .select("id, status, store_id, price")
      .eq("marketplace_order_id", payload.orderId)
      .eq("partner_id", payload.partnerId)
      .maybeSingle();

    if (linkedAppointment) {
      await supabase
        .from("appointments")
        .update({
          payment_status: nextSituation === "paid" ? "paid" : "partially_paid",
          paid_amount: nextPaidAmount,
        })
        .eq("id", linkedAppointment.id)
        .eq("partner_id", payload.partnerId);

      try {
        const { handleAppointmentItemsStockMovement } =
          await import("@/app/actions/erp/appointment-items");
        await handleAppointmentItemsStockMovement({
          appointmentId: linkedAppointment.id,
          partnerId: payload.partnerId,
          oldStatus: linkedAppointment.status,
          newStatus: linkedAppointment.status,
          userId: user.id,
          storeId: linkedAppointment.store_id || null,
          paymentStatus: nextSituation === "paid" ? "paid" : "partially_paid",
          paidAmount: nextPaidAmount,
          price: Number(linkedAppointment.price || 0),
        });
      } catch (stockErr) {
        console.error(
          "[confirmAppointmentOrderPaymentAction] stock movement error:",
          stockErr,
        );
      }
    }

    await revalidateOrders(payload.partnerId);

    if (order.situation !== nextSituation) {
      const notifyOrder = { ...order, partner_id: payload.partnerId };
      import("@/lib/services/notification-automation.service")
        .then(({ onOrderStatusChanged }) =>
          onOrderStatusChanged(notifyOrder, nextSituation, undefined, "manual"),
        )
        .catch(console.error);
    }

    return { success: true, orderNumber: order.order_number };
  } catch (e: any) {
    return {
      success: false,
      error: e?.message || "Erro ao processar pagamento",
    };
  }
}

export async function getAppointmentOrderNumberAction(
  orderId: string,
  partnerId: string,
) {
  try {
    const user = await requireUser();
    if (!user) return null;
    await requirePermission(partnerId, "orders", "view");
    const supabase = await getSupabaseServerClient();
    const { data } = await supabase
      .from("orders")
      .select("order_number, store_id")
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (data?.store_id) await requireStorePermission(data.store_id, partnerId, "orders", "view");
    return data?.order_number || null;
  } catch {
    return null;
  }
}

export async function getOrderPresignedUploadUrlAction(
  partnerId: string,
  orderId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<
  | { success: true; uploadUrl: string; publicUrl: string | null; key: string }
  | { success: false; error: string }
> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL);
    await requirePermission(partnerId, "orders", "edit");
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, store_id")
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (!order) return { success: false, error: "Pedido não encontrado." };
    if (order.store_id) await requireStorePermission(order.store_id, partnerId, "orders", "edit");

    const { getUploadKindFromMimeType, getUploadValidationRules } =
      await import("@/lib/r2/config");
    const kind = getUploadKindFromMimeType(fileType);
    if (!kind || kind === "video") {
      return { success: false, error: "Este tipo de arquivo não é permitido em anexos de pedidos." };
    }
    if (!Number.isSafeInteger(fileSize) || fileSize < 1) {
      return { success: false, error: "Tamanho de arquivo inválido." };
    }
    const { validateUploadRequest } = await import("@/lib/security/file-validator");
    const uploadValidation = validateUploadRequest(fileName, fileType, fileSize);
    if (!uploadValidation.success) return { success: false, error: uploadValidation.error || "Arquivo inválido." };

    const { getPartnerPlan } = await import("@/lib/services/subscription.service");
    const { getPlanImageAttachmentLimit } = await import("@/lib/subscription/plan-tier");
    const plan = await getPartnerPlan(partnerId);
    const attachmentLimit = kind === "image"
      ? getPlanImageAttachmentLimit(plan.slug)
      : plan.slug === "crescer" ? 5 : plan.slug === "escalar" ? 15 : 0;
    if (attachmentLimit === 0) {
      return {
        success: false,
        error: "Upload de anexos não permitido no seu plano. Faça upgrade para Crescer ou Escalar.",
      };
    }

    const { getAdminClient } = await import("@/lib/supabase/admin");
    const { data: existingAttachments, error: attachmentCountError } = await getAdminClient()
      .from("order_attachments")
      .select("file_type")
      .eq("order_id", orderId);
    if (attachmentCountError) throw attachmentCountError;
    const sameKindCount = (existingAttachments || []).filter(
      (attachment: any) => getUploadKindFromMimeType(String(attachment.file_type || "")) === kind,
    ).length;
    if (sameKindCount >= attachmentLimit) {
      return {
        success: false,
        error: `Limite de anexos excedido para o seu plano (${attachmentLimit} arquivo(s)). Faça upgrade para enviar mais.`,
      };
    }

    const rules = getUploadValidationRules(kind);
    if (fileSize > rules.maxSize) {
      const maxMB = (rules.maxSize / (1024 * 1024)).toFixed(0);
      return {
        success: false,
        error: `Arquivo muito grande. Máximo: ${maxMB}MB.`,
      };
    }

    const { R2_PREFIXES } = await import("@/lib/r2/config");
    const { generateSignedUploadUrl } = await import("@/lib/r2/server");

    const result = await generateSignedUploadUrl({
      fileName,
      fileType,
      contentLength: fileSize,
      userId: user.id,
      prefix: R2_PREFIXES.orderAttachments,
      kind,
    });

    return {
      success: true,
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key: result.key,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Erro ao gerar URL de upload",
    };
  }
}

export async function saveOrderAttachmentAction(
  partnerId: string,
  orderId: string,
  fileKey: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  fileHash?: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL);
    await requirePermission(partnerId, "orders", "edit");
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, store_id")
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (!order) return { success: false, error: "Pedido não encontrado." };
    if (order.store_id) await requireStorePermission(order.store_id, partnerId, "orders", "edit");

    const { R2_PREFIXES, getUploadKindFromMimeType } = await import("@/lib/r2/config");
    const { validateKeyOwnership } = await import("@/lib/r2/server");
    const expectedPrefix = `users/${user.id}/${R2_PREFIXES.orderAttachments}`;
    if (
      typeof fileKey !== "string" ||
      !validateKeyOwnership(fileKey, user.id) ||
      !fileKey.startsWith(expectedPrefix) ||
      fileKey.includes("..") ||
      fileKey.startsWith("/")
    ) {
      return { success: false, error: "Chave de arquivo inválida para este usuário." };
    }
    if (!Number.isSafeInteger(fileSize) || fileSize < 1) {
      return { success: false, error: "Tamanho de arquivo inválido." };
    }
    const uploadKind = getUploadKindFromMimeType(fileType);
    if (!uploadKind || uploadKind === "video") {
      return { success: false, error: "Este tipo de arquivo não é permitido em anexos de pedidos." };
    }
    const { validateUploadRequest } = await import("@/lib/security/file-validator");
    const validation = validateUploadRequest(fileName, fileType, fileSize);
    if (!validation.success) return { success: false, error: validation.error || "Arquivo inválido." };
    const { getAdminClient } = await import("@/lib/supabase/admin");
    const admin = getAdminClient();

    const { getPartnerPlan } = await import("@/lib/services/subscription.service");
    const { getPlanImageAttachmentLimit } = await import("@/lib/subscription/plan-tier");
    const plan = await getPartnerPlan(partnerId);
    const limit = uploadKind === "image"
      ? getPlanImageAttachmentLimit(plan.slug)
      : plan.slug === "crescer" ? 5 : plan.slug === "escalar" ? 15 : 0;
    if (limit === 0) {
      return { success: false, error: "Upload de anexos não permitido no seu plano." };
    }

    const { verifyUploadedObject } = await import("@/lib/r2/server");
    const verified = await verifyUploadedObject(fileKey, fileSize, fileType, fileHash);
    const actualFileSize = verified.contentLength;
    const finalHash = verified.sha256;
    const actualValidation = validateUploadRequest(fileName, fileType, actualFileSize);
    if (!actualValidation.success) return { success: false, error: actualValidation.error || "Arquivo excede os limites permitidos." };

    // 2. Resolve safe Content-Type based on extension (ignore browser Content-Type)
    const { ALL_MIME_TO_EXT } = await import("@/lib/r2/config");
    const extension = fileKey.substring(fileKey.lastIndexOf(".")).toLowerCase();
    const canonicalMime = Object.entries(ALL_MIME_TO_EXT).find(
      ([_, ext]) => `.${ext}` === extension,
    )?.[0];
    const validatedFileType = canonicalMime || "application/octet-stream";

    // 3. Save to database
    const { data: insertedRows, error } = await admin.rpc("register_order_attachment_atomic", {
      p_partner_id: partnerId,
      p_order_id: orderId,
      p_uploaded_by: user.id,
      p_file_key: fileKey,
      p_file_name: fileName,
      p_file_type: validatedFileType,
      p_file_size: actualFileSize,
      p_file_hash: finalHash,
      p_attachment_limit: limit,
    });

    if (error) throw error;
    const data = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows;
    if (!data) throw new Error("Não foi possível registrar o anexo.");

    // 4. Audit Log
    const { auditLog } = await import("@/lib/security/audit-logger");
    await auditLog({
      action: "document.uploaded",
      actorUserId: user.id,
      partnerId,
      metadata: {
        documentType: "Anexo de Pedido",
        fileName,
        fileSize,
        orderId,
        fileKey,
        fileHash: finalHash,
        fileType: validatedFileType,
      },
    });

    // 5. Timeline Audit Log (Order History)
    const { logAuditEvent } = await import("@/lib/services/timeline.service");
    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "order",
      entityId: orderId,
      actionType: "attachment_created",
      source: "erp",
      changeLines: [`Anexo adicionado: ${fileName}`],
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/erp/pedidos");
    return { success: true, data };
  } catch (err: any) {
    console.error("[saveOrderAttachmentAction] Erro:", err);
    return { success: false, error: err.message || "Erro ao salvar anexo" };
  }
}

export async function getOrderAttachmentUrlAction(
  orderId: string,
  fileKey: string,
  partnerId?: string,
): Promise<
  { success: true; downloadUrl: string } | { success: false; error: string }
> {
  try {
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();
    const { data: order } = await supabase
      .from("orders")
      .select("id, buyer_id, partner_id, store_id")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) {
      return { success: false, error: "Pedido não encontrado." };
    }

    // Do not sign arbitrary keys supplied by the caller. First prove the key
    // is registered as an attachment of this exact order.
    const { data: attachment } = await supabase
      .from("order_attachments")
      .select("id")
      .eq("order_id", orderId)
      .eq("file_key", fileKey)
      .maybeSingle();

    if (!attachment) {
      return { success: false, error: "Anexo não encontrado neste pedido." };
    }

    if (partnerId) {
      if (order.partner_id !== partnerId) {
        return { success: false, error: "Acesso negado ao anexo." };
      }
      if (order.store_id) {
        await requireStorePermission(order.store_id, partnerId, "orders", "view");
      } else {
        await requirePermission(partnerId, "orders", "view");
      }
    } else if (order.buyer_id !== user.id) {
      return {
        success: false,
        error:
          "Acesso negado. Sem permissão para visualizar o anexo deste pedido.",
      };
    }

    if (fileKey.startsWith("http://") || fileKey.startsWith("https://")) {
      return { success: true, downloadUrl: fileKey };
    }

    const { generateSignedDownloadUrl } = await import("@/lib/r2/server");
    const downloadUrl = await generateSignedDownloadUrl(fileKey);
    return { success: true, downloadUrl };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Erro ao obter URL de download",
    };
  }
}

export async function deleteOrderAttachmentAction(
  partnerId: string,
  attachmentId: string,
  orderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL);
    await requirePermission(partnerId, "orders", "edit");
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, partner_id, store_id")
      .eq("id", orderId)
      .eq("partner_id", partnerId)
      .maybeSingle();
    if (!order) return { success: false, error: "Pedido não encontrado." };
    if (order.store_id) {
      await requireStorePermission(order.store_id, partnerId, "orders", "edit");
    }

    const { data: attachment } = await supabase
      .from("order_attachments")
      .select("id, file_key, file_name")
      .eq("id", attachmentId)
      .eq("order_id", orderId)
      .maybeSingle();

    if (!attachment) {
      return { success: false, error: "Anexo não encontrado" };
    }

    const { deleteFileFromR2 } = await import("@/lib/r2/server");
    await deleteFileFromR2(attachment.file_key);

    const { getAdminClient } = await import("@/lib/supabase/admin");
    const admin = getAdminClient();
    const { error: deleteError } = await admin
      .from("order_attachments")
      .delete()
      .eq("id", attachmentId)
      .eq("order_id", orderId);
    if (deleteError) throw deleteError;

    // Audit Log
    const { auditLog } = await import("@/lib/security/audit-logger");
    await auditLog({
      action: "document.deleted",
      actorUserId: user.id,
      partnerId,
      metadata: {
        documentType: "Anexo de Pedido",
        attachmentId,
        orderId,
        fileKey: attachment.file_key,
      },
    });

    // Timeline Audit Log (Order History)
    const { logAuditEvent } = await import("@/lib/services/timeline.service");
    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "order",
      entityId: orderId,
      actionType: "attachment_deleted",
      source: "erp",
      changeLines: [`Anexo removido: ${attachment.file_name || "Documento"}`],
    });

    const { revalidatePath } = await import("next/cache");
    revalidatePath("/erp/pedidos");
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao deletar anexo" };
  }
}

export async function getOrderAttachmentsAction(
  orderId: string,
  partnerId?: string,
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  try {
    const user = await requireUser();
    const supabase = await getSupabaseServerClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, buyer_id, partner_id, store_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order || (partnerId && order.partner_id !== partnerId)) {
      return { success: false, error: "Pedido não encontrado." };
    }
    if (partnerId) {
      if (order.store_id) await requireStorePermission(order.store_id, partnerId, "orders", "view");
      else await requirePermission(partnerId, "orders", "view");
    } else if (order.buyer_id !== user.id) {
      return { success: false, error: "Acesso negado aos anexos deste pedido." };
    }

    const { data, error } = await supabase
      .from("order_attachments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao listar anexos" };
  }
}

// ============================================================================
// SUGESTÕES & OPORTUNIDADES - ALERTAS INFORMATIVOS DE PEDIDOS
// ============================================================================

const PENDING_RETURN_INSIGHT_STATUSES = [
  "PENDING_REVIEW",
  "UNDER_ANALYSIS",
  "ESCALATED",
  "WAITING_ITEM_RETURN",
];

export async function getOrdersInsightsAction(
  partnerId: string,
  periodDays: number = 30,
  storeId?: string
): Promise<{ error: string } | OrdersInsightsResult> {
  try {
    const user = await requireUser();
    const context = await getCurrentPartnerContext(user);
    if (!context?.partnerId || context.partnerId !== partnerId) {
      return { error: "O parceiro informado não corresponde ao contexto ativo" };
    }
    await requirePermission(partnerId, "orders", "view", user);
    const effectiveStoreId = storeId || context.activeStoreId || undefined;
    if (effectiveStoreId) {
      await requireStorePermission(effectiveStoreId, partnerId, "orders", "view");
    }
    const admin = createAdminClient();

    const days = Math.max(1, Math.min(365, Number(periodDays) || 30));
    const now = new Date();
    const staleCutoffIso = new Date(now.getTime() - days * 86400000).toISOString();

    const ORDER_COLUMNS =
      "id, order_number, customer_name, total_amount, paid_amount, situation, delivery_status, delivery_type, payment_expires_at, created_at, updated_at, store_id";

    let recentQuery = admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("partner_id", partnerId)
      .neq("situation", "cancelled");

    let staleQuery = admin
      .from("orders")
      .select(ORDER_COLUMNS)
      .eq("partner_id", partnerId)
      .lt("updated_at", staleCutoffIso)
      .neq("situation", "cancelled")
      .neq("situation", "refunded")
      .or("situation.neq.paid,delivery_status.neq.delivered");

    let returnsQuery = admin
      .from("return_requests")
      .select(
        "id, order_id, status, order_number_snapshot, customer_name_snapshot, order_total_snapshot, refund_amount, reason, created_at, updated_at, sla_due_at, store_id"
      )
      .eq("partner_id", partnerId)
      .is("deleted_at", null)
      .in("status", PENDING_RETURN_INSIGHT_STATUSES);

    if (effectiveStoreId) {
      recentQuery = recentQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`);
      staleQuery = staleQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`);
      returnsQuery = returnsQuery.or(`store_id.eq.${effectiveStoreId},store_id.is.null`);
    }

    const [
      { data: recent, error },
      { data: stale, error: staleError },
      { data: returnRequests, error: returnsError },
    ] = await Promise.all([
      recentQuery.order("created_at", { ascending: false }).limit(300),
      staleQuery.order("updated_at", { ascending: true }).limit(200),
      returnsQuery.order("created_at", { ascending: true }).limit(100),
    ]);

    if (error) return { error: error.message };
    if (staleError) return { error: staleError.message };
    if (returnsError) {
      // A aba de devoluções é complementar: degrada para vazio em vez de
      // quebrar o painel inteiro se a tabela/columna não existir.
      console.error("[getOrdersInsightsAction] returns query error:", returnsError.message);
    }

    const ordersById = new Map<string, any>();
    for (const row of [...(recent || []), ...(stale || [])]) {
      if (row?.id) ordersById.set(String(row.id), row);
    }

    const allOrders = Array.from(ordersById.values());

    const staleIds = new Set((stale || []).map((row: any) => String(row.id)));
    const staleOrders = allOrders.filter((row) => staleIds.has(String(row.id)));

    return {
      payments: evaluatePaymentAlerts(allOrders, { now }),
      deliveries: evaluateDeliveryAlerts(allOrders, { now }),
      stagnant: evaluateStagnantOrders(staleOrders, { periodDays: days, now }),
      returns: evaluateReturnAlerts(returnRequests || [], { now }),
    };
  } catch (error: any) {
    return { error: error.message };
  }
}

export interface ChangeOrderPaymentMethodInput {
  orderId: string;
  partnerId: string;
  newPaymentMethod: string;
  newPaymentMethodId?: string | null;
  reason: string;
}

export async function changeOrderPaymentMethodAction(input: ChangeOrderPaymentMethodInput) {
  const user = await requireUser();
  if (!user) return { error: "Não autenticado" };

  const { orderId, partnerId, newPaymentMethod, newPaymentMethodId, reason } = input;
  if (!orderId || !partnerId) {
    return { error: "Parâmetros obrigatórios ausentes." };
  }

  // 1. Validar permissão e papel: apenas OWNER, ADMIN e MANAGER podem alterar
  const access = await requirePermission(partnerId, "orders", "edit");
  const normalizedRole = String(access.roleId || "").toLowerCase();
  const allowedRoles = ["owner", "admin", "manager"];
  if (!allowedRoles.includes(normalizedRole)) {
    return {
      error: "Apenas proprietários, administradores e gerentes podem alterar o método de pagamento.",
    };
  }

  // 2. Validar motivo obrigatório
  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    return {
      error: "O motivo da alteração é obrigatório (mínimo de 5 caracteres).",
    };
  }

  // 3. Validar novo método
  const trimmedNewMethod = String(newPaymentMethod || "").trim();
  if (!trimmedNewMethod) {
    return { error: "Informe o novo método de pagamento." };
  }

  const supabase = createAdminClient();

  // 4. Buscar pedido
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, partner_id, store_id, order_number, payment_method, payment_breakdown, paid_amount, total_amount, situation, order_source, customer_name, buyer_id")
    .eq("id", orderId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  if (orderError || !order) {
    return { error: "Pedido não encontrado." };
  }

  if (order.situation === "paid") {
    return { error: "Este pedido já foi totalmente pago e não pode ter o método alterado." };
  }

  const oldMethod = order.payment_method || "Não informado";
  const formattedNewMethod = formatPaymentMethodLabel(trimmedNewMethod, null);

  if (oldMethod.trim().toLowerCase() === formattedNewMethod.trim().toLowerCase()) {
    return { error: "O novo método de pagamento deve ser diferente do método atual." };
  }

  // 5. Atualizar payment_breakdown
  let updatedBreakdown = Array.isArray(order.payment_breakdown) ? [...order.payment_breakdown] : [];
  if (updatedBreakdown.length > 0) {
    updatedBreakdown = updatedBreakdown.map((leg: any) => {
      if (Number(leg.amountReceived || 0) <= 0.009) {
        return {
          ...leg,
          method: formattedNewMethod,
          paymentMethodId: newPaymentMethodId || leg.paymentMethodId || null,
        };
      }
      return leg;
    });
  } else {
    const total = Number(order.total_amount || 0);
    const paid = Number(order.paid_amount || 0);
    const remaining = Math.max(0, total - paid);
    updatedBreakdown = [
      {
        method: formattedNewMethod,
        paymentMethodId: newPaymentMethodId || null,
        amount: remaining || total,
        effectiveAmount: remaining || total,
        amountReceived: 0,
        installmentNumber: 1,
      },
    ];
  }

  // 6. Atualizar tabela orders
  const nowIso = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      payment_method: formattedNewMethod,
      payment_method_id: newPaymentMethodId || null,
      payment_breakdown: updatedBreakdown,
      updated_at: nowIso,
    })
    .eq("id", orderId)
    .eq("partner_id", partnerId);

  if (updateError) {
    return { error: `Erro ao atualizar pedido: ${updateError.message}` };
  }

  // 7. Buscar perfil do usuário para registro do ator
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("full_name")
    .eq("user_id", user.id)
    .maybeSingle();

  const rawActorName = profile?.full_name?.trim() || user.email?.split("@")[0] || "Usuário";
  const roleLabel =
    normalizedRole === "owner" ? "Proprietário" : normalizedRole === "admin" ? "Administrador" : "Gerente";
  const actorDisplayName = `${rawActorName} (${roleLabel})`;

  // 8. Gravar em audit_logs
  const changeLines = [
    `Método de pagamento alterado de "${oldMethod}" para "${formattedNewMethod}".`,
    `Motivo: ${trimmedReason}`,
  ];

  await supabase.from("audit_logs").insert({
    table_name: "orders",
    action: "PAYMENT_METHOD_CHANGED",
    user_id: user.id,
    actor_user_id: user.id,
    actor_name: actorDisplayName,
    partner_id: partnerId,
    entity_type: "order",
    entity_id: orderId,
    action_type: "payment_method_changed",
    change_lines: changeLines,
    metadata: {
      old_payment_method: oldMethod,
      new_payment_method: formattedNewMethod,
      reason: trimmedReason,
      changed_by_role: normalizedRole,
      changed_by_name: rawActorName,
      source: "erp",
    },
    source: "erp",
  });

  // 9. Revalidar tags e cache
  try {
    await revalidateOrderHistory(orderId);
    await revalidateOrders(partnerId);
  } catch (revalErr) {
    console.error("[changeOrderPaymentMethodAction] Revalidation error:", revalErr);
  }

  return {
    success: true,
    oldMethod,
    newMethod: formattedNewMethod,
    paymentBreakdown: updatedBreakdown,
    actorName: actorDisplayName,
    updatedAt: nowIso,
  };
}
