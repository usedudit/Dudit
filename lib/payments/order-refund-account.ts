import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export type OrderRefundAccountSource =
  | "income_transaction"
  | "payment_method"
  | "mercado_pago"
  | "order_account"
  | "multiple"
  | "none";

export interface OrderRefundAccountResolution {
  accountId: string | null;
  source: OrderRefundAccountSource;
  candidateAccountIds: string[];
}

export interface ResolveOrderRefundAccountParams {
  partnerId: string;
  storeId?: string | null;
  orderId: string;
  orderNumber?: string | null;
  financeAccountId?: string | null;
  paymentMethod?: string | null;
  paymentProvider?: string | null;
  paymentBreakdown?: Array<{
    method?: string | null;
    amount?: number;
    amountReceived?: number;
    paymentMethodId?: string | null;
    provider?: string | null;
  }> | null;
}

function normalizeMethodName(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isMercadoPagoOrder(params: ResolveOrderRefundAccountParams): boolean {
  if (normalizeMethodName(params.paymentProvider).includes("mercado pago")) {
    return true;
  }
  if (normalizeMethodName(params.paymentMethod).includes("mercado pago")) {
    return true;
  }
  if (Array.isArray(params.paymentBreakdown)) {
    return params.paymentBreakdown.some(
      (leg) =>
        normalizeMethodName(leg?.provider).includes("mercado pago") ||
        normalizeMethodName(leg?.method).includes("mercado pago"),
    );
  }
  return false;
}

/**
 * Resolves the real finance account that received payment for an order.
 *
 * Priority:
 * 1. Actual paid/partially_paid income transactions recorded for this order
 *    (`sale-tx:<order_number>:%` or `reference_note = <order_id>`).
 * 2. `payment_methods.default_finance_account_id` linked to the payment method(s)
 *    used on the order (via `payment_breakdown[].paymentMethodId` or method name).
 * 3. Mercado Pago gateway account if the order was paid via Mercado Pago.
 * 4. `order.finance_account_id` as a final order-level fallback.
 *
 * If multiple distinct accounts received payments for the same order, returns
 * `{ accountId: null, source: "multiple", candidateAccountIds }` so the caller
 * does not silently refund from the wrong account.
 */
export async function resolveOrderRefundFinanceAccount(
  supabase: SupabaseClient,
  params: ResolveOrderRefundAccountParams,
): Promise<OrderRefundAccountResolution> {
  // 1. Actual income transactions recorded for this order
  const txQueries: Array<Promise<{ data: any[] | null; error: any }>> = [
    Promise.resolve(
      supabase
        .from("transactions")
        .select("account_id, kind, status, created_at")
        .eq("partner_id", params.partnerId)
        .eq("transaction_type", "income")
        .eq("reference_note", params.orderId)
        .in("status", ["paid", "partially_paid"])
        .not("account_id", "is", null),
    ),
  ];

  const orderNumber = String(params.orderNumber || "").trim();
  if (orderNumber) {
    txQueries.push(
      Promise.resolve(
        supabase
          .from("transactions")
          .select("account_id, kind, status, created_at")
          .eq("partner_id", params.partnerId)
          .eq("transaction_type", "income")
          .like("reference_note", `sale-tx:${orderNumber}:%`)
          .in("status", ["paid", "partially_paid"])
          .not("account_id", "is", null),
      ),
    );
  }

  const txResults = await Promise.all(txQueries);
  const incomeRows = txResults.flatMap((res) =>
    Array.isArray(res.data) ? res.data : [],
  );

  // Prefer settlement rows when present, otherwise any non-cancelled paid income row
  const settlementRows = incomeRows.filter(
    (row) => String(row?.kind || "").toLowerCase() === "settlement",
  );
  const effectiveIncomeRows =
    settlementRows.length > 0 ? settlementRows : incomeRows;

  const txAccountIds = Array.from(
    new Set(
      effectiveIncomeRows
        .map((row) => row?.account_id)
        .filter((id): id is string => isUuid(id)),
    ),
  );

  if (txAccountIds.length === 1) {
    return {
      accountId: txAccountIds[0],
      source: "income_transaction",
      candidateAccountIds: txAccountIds,
    };
  }
  if (txAccountIds.length > 1) {
    return {
      accountId: null,
      source: "multiple",
      candidateAccountIds: txAccountIds,
    };
  }

  // 2. Payment methods linked to the order (payment_breakdown or payment_method)
  const breakdown = Array.isArray(params.paymentBreakdown)
    ? params.paymentBreakdown
    : [];
  const activeBreakdown = breakdown.filter(
    (leg) =>
      Number(leg?.amountReceived ?? leg?.amount ?? 0) > 0.009 ||
      Boolean(leg?.paymentMethodId) ||
      Boolean(String(leg?.method || "").trim()),
  );

  const methodIds = Array.from(
    new Set(
      activeBreakdown
        .map((leg) => leg?.paymentMethodId)
        .filter((id): id is string => isUuid(id)),
    ),
  );

  const methodNamesWithoutId = Array.from(
    new Set(
      (activeBreakdown.length > 0
        ? activeBreakdown
            .filter((leg) => !isUuid(leg?.paymentMethodId))
            .map((leg) => normalizeMethodName(leg?.method))
        : [normalizeMethodName(params.paymentMethod)]
      ).filter(Boolean),
    ),
  );

  const matchedMethodAccountIds = new Set<string>();

  if (methodIds.length > 0) {
    const { data: methodsById } = await supabase
      .from("payment_methods")
      .select("id, default_finance_account_id, store_id")
      .eq("partner_id", params.partnerId)
      .in("id", methodIds);

    for (const pm of methodsById || []) {
      if (pm?.store_id && params.storeId && pm.store_id !== params.storeId) {
        continue;
      }
      if (isUuid(pm?.default_finance_account_id)) {
        matchedMethodAccountIds.add(pm.default_finance_account_id);
      }
    }
  }

  if (methodNamesWithoutId.length > 0) {
    let methodsByNameQuery = supabase
      .from("payment_methods")
      .select("id, name, default_finance_account_id, store_id")
      .eq("partner_id", params.partnerId);

    methodsByNameQuery = params.storeId
      ? methodsByNameQuery.or(`store_id.is.null,store_id.eq.${params.storeId}`)
      : methodsByNameQuery.is("store_id", null);

    const { data: partnerMethods } = await methodsByNameQuery;
    const nameSet = new Set(methodNamesWithoutId);
    for (const pm of partnerMethods || []) {
      if (
        nameSet.has(normalizeMethodName(pm?.name)) &&
        isUuid(pm?.default_finance_account_id)
      ) {
        matchedMethodAccountIds.add(pm.default_finance_account_id);
      }
    }
  }

  const methodAccountIds = Array.from(matchedMethodAccountIds);
  if (methodAccountIds.length === 1) {
    return {
      accountId: methodAccountIds[0],
      source: "payment_method",
      candidateAccountIds: methodAccountIds,
    };
  }
  if (methodAccountIds.length > 1) {
    return {
      accountId: null,
      source: "multiple",
      candidateAccountIds: methodAccountIds,
    };
  }

  // 3. Mercado Pago gateway account if order was paid via Mercado Pago
  if (isMercadoPagoOrder(params)) {
    const mpAccountId = await resolveMarketplaceOrderFinanceAccountId(
      supabase,
      params.partnerId,
      true,
    );
    if (isUuid(mpAccountId)) {
      return {
        accountId: mpAccountId,
        source: "mercado_pago",
        candidateAccountIds: [mpAccountId],
      };
    }
  }

  // 4. Order-level finance_account_id fallback
  if (isUuid(params.financeAccountId)) {
    return {
      accountId: params.financeAccountId,
      source: "order_account",
      candidateAccountIds: [params.financeAccountId],
    };
  }

  return {
    accountId: null,
    source: "none",
    candidateAccountIds: [],
  };
}

export interface RefundAccountSummary {
  defaultAccountId: string | null;
  status: "resolved" | "multiple" | "none";
  source: OrderRefundAccountSource | null;
  candidateAccountIds: string[];
}

/**
 * Summarizes refund account resolutions across 1 or more orders being cancelled
 * together, optionally filtering against the list of currently active/valid account IDs.
 */
export function summarizeRefundAccountResolution(
  resolutions: OrderRefundAccountResolution[],
  validAccountIds?: Set<string>,
): RefundAccountSummary {
  if (resolutions.length === 0) {
    return {
      defaultAccountId: null,
      status: "none",
      source: null,
      candidateAccountIds: [],
    };
  }

  const filterValid = (id: string) =>
    !validAccountIds || validAccountIds.has(id);

  const allCandidates = Array.from(
    new Set(
      resolutions
        .flatMap((r) => r.candidateAccountIds)
        .filter((id) => isUuid(id) && filterValid(id)),
    ),
  );

  const hasAnyMultiple = resolutions.some((r) => r.source === "multiple");
  if (hasAnyMultiple || allCandidates.length > 1) {
    return {
      defaultAccountId: null,
      status: "multiple",
      source: "multiple",
      candidateAccountIds: allCandidates,
    };
  }

  const resolvedIds = resolutions
    .map((r) => (r.accountId && filterValid(r.accountId) ? r.accountId : null))
    .filter((id): id is string => Boolean(id));

  if (resolvedIds.length === 0) {
    return {
      defaultAccountId: null,
      status: "none",
      source: "none",
      candidateAccountIds: [],
    };
  }

  const uniqueResolved = Array.from(new Set(resolvedIds));
  if (uniqueResolved.length === 1 && resolvedIds.length === resolutions.length) {
    return {
      defaultAccountId: uniqueResolved[0],
      status: "resolved",
      source: resolutions[0].source,
      candidateAccountIds: uniqueResolved,
    };
  }

  // Some orders had a resolved account and some had none -> let user choose manually
  return {
    defaultAccountId: null,
    status: "multiple",
    source: "multiple",
    candidateAccountIds: uniqueResolved,
  };
}
