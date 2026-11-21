import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveOrderRefundFinanceAccount,
  summarizeRefundAccountResolution,
} from "./order-refund-account";

const mockResolveMpAccount = vi.fn();

vi.mock("@/app/actions/erp/finance-accounts", () => ({
  resolveMarketplaceOrderFinanceAccountId: (...args: any[]) =>
    mockResolveMpAccount(...args),
}));

const PARTNER_ID = "11111111-1111-1111-1111-111111111111";
const ORDER_ID = "22222222-2222-2222-2222-222222222222";
const ACC_NUBANK = "33333333-3333-3333-3333-333333333333";
const ACC_CAIXA = "44444444-4444-4444-4444-444444444444";
const ACC_MP = "55555555-5555-5555-5555-555555555555";
const PM_PIX = "66666666-6666-6666-6666-666666666666";
const PM_CARD = "77777777-7777-7777-7777-777777777777";

function createMockSupabase(options: {
  txByOrderId?: any[];
  txByOrderNumber?: any[];
  paymentMethodsById?: any[];
  paymentMethodsByName?: any[];
}) {
  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      const filters: Record<string, any> = {};
      const chain: Record<string, any> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockImplementation((col: string, val: any) => {
        filters[`eq:${col}`] = val;
        return chain;
      });
      chain.like = vi.fn().mockImplementation((col: string, val: any) => {
        filters[`like:${col}`] = val;
        return chain;
      });
      chain.in = vi.fn().mockImplementation((col: string, val: any) => {
        filters[`in:${col}`] = val;
        return chain;
      });
      chain.not = vi.fn().mockReturnValue(chain);
      chain.or = vi.fn().mockReturnValue(chain);
      chain.is = vi.fn().mockReturnValue(chain);
      chain.then = vi.fn().mockImplementation((onFulfilled) => {
        if (table === "transactions") {
          const data = filters["like:reference_note"]
            ? options.txByOrderNumber || []
            : options.txByOrderId || [];
          return Promise.resolve({ data, error: null }).then(onFulfilled);
        }
        if (table === "payment_methods") {
          const data = filters["in:id"]
            ? options.paymentMethodsById || []
            : options.paymentMethodsByName || [];
          return Promise.resolve({ data, error: null }).then(onFulfilled);
        }
        return Promise.resolve({ data: [], error: null }).then(onFulfilled);
      });
      return chain;
    }),
  } as unknown as SupabaseClient;

  return supabase;
}

describe("resolveOrderRefundFinanceAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveMpAccount.mockResolvedValue(null);
  });

  it("prioritizes the actual income transaction account over a stale order.finance_account_id", async () => {
    const supabase = createMockSupabase({
      txByOrderNumber: [
        { account_id: ACC_NUBANK, kind: "settlement", status: "paid" },
      ],
    });

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      orderNumber: "1042",
      financeAccountId: ACC_CAIXA,
      paymentMethod: "Pix",
    });

    expect(result).toEqual({
      accountId: ACC_NUBANK,
      source: "income_transaction",
      candidateAccountIds: [ACC_NUBANK],
    });
  });

  it("returns source 'multiple' when income transactions went into different bank accounts", async () => {
    const supabase = createMockSupabase({
      txByOrderNumber: [
        { account_id: ACC_NUBANK, kind: "settlement", status: "paid" },
        { account_id: ACC_CAIXA, kind: "settlement", status: "paid" },
      ],
    });

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      orderNumber: "1043",
      financeAccountId: ACC_CAIXA,
    });

    expect(result.accountId).toBeNull();
    expect(result.source).toBe("multiple");
    expect(result.candidateAccountIds).toEqual([ACC_NUBANK, ACC_CAIXA]);
  });

  it("falls back to payment_methods.default_finance_account_id when no income transaction exists", async () => {
    const supabase = createMockSupabase({
      paymentMethodsById: [
        { id: PM_PIX, default_finance_account_id: ACC_NUBANK, store_id: null },
      ],
    });

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      orderNumber: "1044",
      financeAccountId: ACC_CAIXA,
      paymentBreakdown: [
        { method: "Pix", amount: 150, paymentMethodId: PM_PIX },
      ],
    });

    expect(result).toEqual({
      accountId: ACC_NUBANK,
      source: "payment_method",
      candidateAccountIds: [ACC_NUBANK],
    });
  });

  it("resolves single account when multiple payment methods share the same default bank account", async () => {
    const supabase = createMockSupabase({
      paymentMethodsById: [
        { id: PM_PIX, default_finance_account_id: ACC_NUBANK, store_id: null },
        { id: PM_CARD, default_finance_account_id: ACC_NUBANK, store_id: null },
      ],
    });

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      paymentBreakdown: [
        { method: "Pix", amount: 50, paymentMethodId: PM_PIX },
        { method: "Cartão", amount: 100, paymentMethodId: PM_CARD },
      ],
    });

    expect(result).toEqual({
      accountId: ACC_NUBANK,
      source: "payment_method",
      candidateAccountIds: [ACC_NUBANK],
    });
  });

  it("returns source 'multiple' when multiple payment methods point to different bank accounts", async () => {
    const supabase = createMockSupabase({
      paymentMethodsById: [
        { id: PM_PIX, default_finance_account_id: ACC_NUBANK, store_id: null },
        { id: PM_CARD, default_finance_account_id: ACC_CAIXA, store_id: null },
      ],
    });

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      paymentBreakdown: [
        { method: "Pix", amount: 50, paymentMethodId: PM_PIX },
        { method: "Dinheiro", amount: 100, paymentMethodId: PM_CARD },
      ],
    });

    expect(result.accountId).toBeNull();
    expect(result.source).toBe("multiple");
    expect(result.candidateAccountIds).toEqual([ACC_NUBANK, ACC_CAIXA]);
  });

  it("matches payment method by name when paymentMethodId is absent", async () => {
    const supabase = createMockSupabase({
      paymentMethodsByName: [
        {
          id: PM_PIX,
          name: "Pix Loja",
          default_finance_account_id: ACC_NUBANK,
          store_id: null,
        },
      ],
    });

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      paymentMethod: "pix loja",
    });

    expect(result).toEqual({
      accountId: ACC_NUBANK,
      source: "payment_method",
      candidateAccountIds: [ACC_NUBANK],
    });
  });

  it("resolves Mercado Pago gateway account for Mercado Pago orders without tx/method account", async () => {
    mockResolveMpAccount.mockResolvedValue(ACC_MP);
    const supabase = createMockSupabase({});

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      paymentProvider: "Mercado Pago",
      financeAccountId: ACC_CAIXA,
    });

    expect(result).toEqual({
      accountId: ACC_MP,
      source: "mercado_pago",
      candidateAccountIds: [ACC_MP],
    });
  });

  it("falls back to order.finance_account_id when no tx, method, or MP account is found", async () => {
    const supabase = createMockSupabase({});

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
      financeAccountId: ACC_CAIXA,
    });

    expect(result).toEqual({
      accountId: ACC_CAIXA,
      source: "order_account",
      candidateAccountIds: [ACC_CAIXA],
    });
  });

  it("returns 'none' when no account is linked anywhere", async () => {
    const supabase = createMockSupabase({});

    const result = await resolveOrderRefundFinanceAccount(supabase, {
      partnerId: PARTNER_ID,
      orderId: ORDER_ID,
    });

    expect(result).toEqual({
      accountId: null,
      source: "none",
      candidateAccountIds: [],
    });
  });
});

describe("summarizeRefundAccountResolution", () => {
  it("returns resolved when all orders agree on one active account", () => {
    const summary = summarizeRefundAccountResolution(
      [
        {
          accountId: ACC_NUBANK,
          source: "income_transaction",
          candidateAccountIds: [ACC_NUBANK],
        },
        {
          accountId: ACC_NUBANK,
          source: "payment_method",
          candidateAccountIds: [ACC_NUBANK],
        },
      ],
      new Set([ACC_NUBANK, ACC_CAIXA]),
    );

    expect(summary).toEqual({
      defaultAccountId: ACC_NUBANK,
      status: "resolved",
      source: "income_transaction",
      candidateAccountIds: [ACC_NUBANK],
    });
  });

  it("returns none when the resolved account is no longer active/valid", () => {
    const summary = summarizeRefundAccountResolution(
      [
        {
          accountId: ACC_NUBANK,
          source: "income_transaction",
          candidateAccountIds: [ACC_NUBANK],
        },
      ],
      new Set([ACC_CAIXA]),
    );

    expect(summary).toEqual({
      defaultAccountId: null,
      status: "none",
      source: "none",
      candidateAccountIds: [],
    });
  });

  it("returns multiple when orders in a batch have different receiving accounts", () => {
    const summary = summarizeRefundAccountResolution(
      [
        {
          accountId: ACC_NUBANK,
          source: "income_transaction",
          candidateAccountIds: [ACC_NUBANK],
        },
        {
          accountId: ACC_CAIXA,
          source: "income_transaction",
          candidateAccountIds: [ACC_CAIXA],
        },
      ],
      new Set([ACC_NUBANK, ACC_CAIXA]),
    );

    expect(summary.defaultAccountId).toBeNull();
    expect(summary.status).toBe("multiple");
    expect(summary.candidateAccountIds).toEqual([ACC_NUBANK, ACC_CAIXA]);
  });
});
