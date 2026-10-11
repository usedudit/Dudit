import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  grantSubscriptionCredits,
  consumeSubscriptionCredits,
  refundSubscriptionCredits,
} from "./credit.service"
import type { SupabaseClient } from "@supabase/supabase-js"

function createSupabaseMock() {
  const tableResponses: Record<string, any[]> = {}
  let rpcResponse: any = { data: true, error: null }

  const client = {
    from: vi.fn().mockImplementation((tableName: string) => {
      const chain: Record<string, any> = {}
      
      chain.select = vi.fn().mockReturnValue(chain)
      chain.eq = vi.fn().mockReturnValue(chain)
      chain.in = vi.fn().mockReturnValue(chain)
      chain.insert = vi.fn().mockReturnValue(chain)
      chain.update = vi.fn().mockReturnValue(chain)
      
      const getNextResponse = () => {
        const list = tableResponses[tableName] || []
        if (list.length > 0) {
          const resp = list.shift()
          return resp
        }
        return { data: null, error: null }
      }
      
      chain.single = vi.fn().mockImplementation(async () => getNextResponse())
      chain.maybeSingle = vi.fn().mockImplementation(async () => getNextResponse())
      
      chain.then = vi.fn().mockImplementation((onFulfilled) => {
        return Promise.resolve(getNextResponse()).then(onFulfilled)
      })
      
      return chain
    }),
    rpc: vi.fn().mockImplementation(async () => rpcResponse),
  }

  return {
    client: client as unknown as SupabaseClient,
    setTableResponses: (table: string, responses: any[]) => {
      tableResponses[table] = responses
    },
    setRpcResponse: (response: any) => {
      rpcResponse = response
    }
  }
}

describe("credit.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("grantSubscriptionCredits", () => {
    it("returns early if subscription has no service items", async () => {
      const { client, setTableResponses } = createSupabaseMock()
      
      setTableResponses("recurring_subscriptions", [
        {
          data: {
            id: "sub-123",
            next_execution_at: "2026-08-11T12:00:00Z",
            recurring_plans: { billing_mode: "prepaid", credit_expiration_policy: "end_of_cycle" },
            recurring_subscription_items: [],
          },
          error: null,
        }
      ])

      const result = await grantSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        subscriptionId: "sub-123",
        executionId: "exec-1",
      })

      expect(result.success).toBe(true)
      expect(result.grantedCount).toBe(0)
    })

    it("grants credits and inserts to ledger if service items exist", async () => {
      const { client, setTableResponses } = createSupabaseMock()

      setTableResponses("recurring_subscriptions", [
        {
          data: {
            id: "sub-123",
            next_execution_at: "2026-08-11T12:00:00Z",
            recurring_plans: { billing_mode: "prepaid", credit_expiration_policy: "end_of_cycle" },
            recurring_subscription_items: [
              { id: "item-1", item_type: "service", service_id: "svc-1", quantity: 2 },
            ],
          },
          error: null,
        }
      ])

      setTableResponses("subscription_item_credit_ledger", [
        { data: null, error: null }, // idempotency check
        { data: null, error: null }, // insert ledger entry
      ])

      setTableResponses("subscription_item_credits", [
        { data: { id: "credit-uuid-1" }, error: null } // insert credit entry
      ])

      const result = await grantSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        subscriptionId: "sub-123",
        executionId: "exec-1",
      })

      expect(result.success).toBe(true)
      expect(result.grantedCount).toBe(2)
      expect(client.from).toHaveBeenCalledWith("subscription_item_credits")
      expect(client.from).toHaveBeenCalledWith("subscription_item_credit_ledger")
    })

    it("grants credits for product items with product_id set", async () => {
      const { client, setTableResponses } = createSupabaseMock()

      setTableResponses("recurring_subscriptions", [
        {
          data: {
            id: "sub-123",
            next_execution_at: "2026-08-11T12:00:00Z",
            recurring_plans: { billing_mode: "prepaid", credit_expiration_policy: "end_of_cycle" },
            recurring_subscription_items: [
              { id: "item-p1", item_type: "product", product_id: "prod-1", quantity: 3 },
            ],
          },
          error: null,
        }
      ])

      setTableResponses("subscription_item_credit_ledger", [
        { data: null, error: null }, // idempotency check
        { data: null, error: null }, // insert ledger entry
      ])

      setTableResponses("subscription_item_credits", [
        { data: { id: "credit-product-1" }, error: null }
      ])

      const result = await grantSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        subscriptionId: "sub-123",
        executionId: "exec-1",
      })

      expect(result.success).toBe(true)
      expect(result.grantedCount).toBe(3)
    })

    it("respects idempotency and skips granting if already granted", async () => {
      const { client, setTableResponses } = createSupabaseMock()

      setTableResponses("recurring_subscriptions", [
        {
          data: {
            id: "sub-123",
            next_execution_at: "2026-08-11T12:00:00Z",
            recurring_plans: { billing_mode: "prepaid", credit_expiration_policy: "end_of_cycle" },
            recurring_subscription_items: [
              { id: "item-1", item_type: "service", service_id: "svc-1", quantity: 2 },
            ],
          },
          error: null,
        }
      ])

      setTableResponses("subscription_item_credit_ledger", [
        { data: { id: "ledger-1" }, error: null } // idempotency check matches existing
      ])

      const result = await grantSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        subscriptionId: "sub-123",
        executionId: "exec-1",
      })

      expect(result.success).toBe(true)
      expect(result.grantedCount).toBe(0)
    })
  })

  describe("consumeSubscriptionCredits", () => {
    it("invokes consume_credits_fifo RPC and returns success if RPC returns true", async () => {
      const { client, setRpcResponse } = createSupabaseMock()
      setRpcResponse({
        data: true,
        error: null,
      })

      const result = await consumeSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        serviceId: "svc-1",
        quantity: 1,
        idempotencyKey: "idem-key-1",
      })

      expect(result.success).toBe(true)
      expect(client.rpc).toHaveBeenCalledWith("consume_credits_fifo", {
        p_partner_id: "partner-1",
        p_customer_id: "customer-1",
        p_service_id: "svc-1",
        p_product_id: null,
        p_quantity: 1,
        p_appointment_id: null,
        p_order_id: null,
        p_idempotency_key: "idem-key-1",
      })
    })

    it("passes productId and null serviceId when consuming product credits", async () => {
      const { client, setRpcResponse } = createSupabaseMock()
      setRpcResponse({
        data: true,
        error: null,
      })

      const result = await consumeSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        productId: "prod-1",
        quantity: 2,
        orderId: "order-789",
        idempotencyKey: "delivery-key-1",
      })

      expect(result.success).toBe(true)
      expect(client.rpc).toHaveBeenCalledWith("consume_credits_fifo", {
        p_partner_id: "partner-1",
        p_customer_id: "customer-1",
        p_service_id: null,
        p_product_id: "prod-1",
        p_quantity: 2,
        p_appointment_id: null,
        p_order_id: "order-789",
        p_idempotency_key: "delivery-key-1",
      })
    })

    it("fails fast when neither serviceId nor productId is provided", async () => {
      const { client, setRpcResponse } = createSupabaseMock()
      setRpcResponse({ data: true, error: null })

      const result = await consumeSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        quantity: 1,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("Informe serviceId ou productId.")
      expect(client.rpc).not.toHaveBeenCalled()
    })

    it("returns error if RPC returns false", async () => {
      const { client, setRpcResponse } = createSupabaseMock()
      setRpcResponse({
        data: false,
        error: null,
      })

      const result = await consumeSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        serviceId: "svc-1",
        quantity: 1,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe("Créditos insuficientes para agendamento.")
    })
  })

  describe("refundSubscriptionCredits", () => {
    it("returns early if no consume transactions are found", async () => {
      const { client, setTableResponses } = createSupabaseMock()
      
      setTableResponses("subscription_item_credit_ledger", [
        { data: [], error: null } // fetch consumes returns empty list
      ])

      const result = await refundSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        orderId: "order-123",
      })

      expect(result.success).toBe(true)
      expect(result.refundedCount).toBe(0)
    })

    it("refunds consumed credits successfully", async () => {
      const { client, setTableResponses, setRpcResponse } = createSupabaseMock()

      setTableResponses("subscription_item_credit_ledger", [
        {
          data: [
            { id: "ledger-consume-1", credit_id: "credit-1", service_id: "svc-1", quantity: -1 },
          ],
          error: null,
        }, // fetch consumes
        { data: null, error: null }, // idempotency check
        { data: null, error: null }, // insert ledger entry
      ])

      setRpcResponse({
        data: true,
        error: null,
      })

      const result = await refundSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        orderId: "order-123",
      })

      expect(result.success).toBe(true)
      expect(result.refundedCount).toBe(1)
      expect(client.rpc).toHaveBeenCalledWith("refund_credit_row", {
        p_credit_id: "credit-1",
        p_qty: 1,
      })
    })

    it("respects idempotency and skips if refund was already executed", async () => {
      const { client, setTableResponses } = createSupabaseMock()

      setTableResponses("subscription_item_credit_ledger", [
        {
          data: [
            { id: "ledger-consume-1", credit_id: "credit-1", service_id: "svc-1", quantity: -1 },
          ],
          error: null,
        }, // fetch consumes
        { data: { id: "ledger-refund-1" }, error: null } // idempotency check matches existing refund
      ])

      const result = await refundSubscriptionCredits(client, {
        partnerId: "partner-1",
        customerId: "customer-1",
        orderId: "order-123",
      })

      expect(result.success).toBe(true)
      expect(result.refundedCount).toBe(0)
    })
  })
})
