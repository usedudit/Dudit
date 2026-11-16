import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  doesOrderRequireDeliveryOtp,
  getOrGenerateDeliveryOtp,
  verifyAndConsumeDeliveryOtp,
  getCustomerDeliveryOtp,
  invalidateDeliveryOtp,
  getOrderDeliveryOtpStatus,
} from "./delivery-otp.service"

// Mock cryptoService so we don't need real environment variables in unit tests
vi.mock("@/lib/cryptoService", () => ({
  encrypt: vi.fn(async (text: string) => `encrypted_${text}`),
  decrypt: vi.fn(async (ciphertext: string) => ciphertext.replace(/^encrypted_/, "")),
}))

describe("Delivery Confirmation OTP (Delivery OTP) Service", () => {
  let mockStore: {
    orders: Record<string, any>
    delivery_assignments: any[]
    delivery_orders: any[]
    deliveries: Record<string, any>
    delivery_settings: Record<string, any>
    order_shipments: any[]
    order_delivery_otps: any[]
  }

  let mockAdminClient: any

  beforeEach(() => {
    mockStore = {
      orders: {},
      delivery_assignments: [],
      delivery_orders: [],
      deliveries: {},
      delivery_settings: {},
      order_shipments: [],
      order_delivery_otps: [],
    }

    mockAdminClient = {
      from: (table: string) => {
        return {
          select: (fields?: string) => ({
            eq: (col: string, val: any) => ({
              neq: (neqCol: string, neqVal: any) => ({
                order: () => ({
                  limit: () => ({
                    data: (mockStore as any)[table]?.filter((r: any) => r[col] === val && r[neqCol] !== neqVal) || [],
                    maybeSingle: () => {
                      const match = (mockStore as any)[table]?.find((r: any) => r[col] === val && r[neqCol] !== neqVal)
                      return { data: match || null }
                    },
                  }),
                }),
              }),
              is: (isCol: string, isVal: any) => {
                const makeIsBuilder = (filters: Array<{ col: string; val: any }>) => ({
                  is: (nextCol: string, nextVal: any) => makeIsBuilder([...filters, { col: nextCol, val: nextVal }]),
                  order: () => ({
                    limit: () => {
                      const filtered = (mockStore as any)[table]?.filter((r: any) =>
                        r[col] === val && filters.every(f => f.val === null ? r[f.col] == null : r[f.col] === f.val)
                      ) || []
                      return {
                        data: filtered,
                        maybeSingle: () => ({ data: filtered[0] || null }),
                      }
                    },
                    maybeSingle: () => {
                      const match = (mockStore as any)[table]?.find((r: any) =>
                        r[col] === val && filters.every(f => f.val === null ? r[f.col] == null : r[f.col] === f.val)
                      )
                      return { data: match || null }
                    },
                  }),
                  maybeSingle: () => {
                    const match = (mockStore as any)[table]?.find((r: any) =>
                      r[col] === val && filters.every(f => f.val === null ? r[f.col] == null : r[f.col] === f.val)
                    )
                    return { data: match || null }
                  },
                })
                return makeIsBuilder([{ col: isCol, val: isVal }])
              },
              not: (notCol: string, op: string, notVal: any) => ({
                limit: () => ({
                  maybeSingle: () => {
                    const match = (mockStore as any)[table]?.find((r: any) => r[col] === val && r[notCol] != null)
                    return { data: match || null }
                  },
                }),
              }),
              order: () => ({
                limit: () => ({
                  data: (mockStore as any)[table]?.filter((r: any) => r[col] === val) || [],
                }),
              }),
              limit: () => ({
                data: (mockStore as any)[table]?.filter((r: any) => r[col] === val) || [],
              }),
              maybeSingle: () => {
                if (table === "orders") {
                  return { data: mockStore.orders[val] || null }
                }
                if (table === "deliveries") {
                  return { data: mockStore.deliveries[val] || null }
                }
                if (table === "delivery_settings") {
                  return { data: mockStore.delivery_settings[val] || null }
                }
                const match = (mockStore as any)[table]?.find((r: any) => r[col] === val)
                return { data: match || null }
              },
            }),
          }),
          insert: async (data: any) => {
            const row = { id: `otp_${Date.now()}_${Math.random()}`, ...data, created_at: new Date().toISOString() }
            mockStore.order_delivery_otps.push(row)
            return { error: null }
          },
          update: (updates: any) => ({
            eq: (col: string, val: any) => {
              const rows = (mockStore as any)[table]
              if (Array.isArray(rows)) {
                for (const r of rows) {
                  if (r[col] === val) {
                    Object.assign(r, updates)
                  }
                }
              }
              return { is: () => ({ is: () => ({ eq: () => ({}) }) }) }
            },
          }),
        }
      },
      rpc: vi.fn(),
    }
  })

  // 1. TEST CASES: MODALITY & THRESHOLD RULES
  describe("Rule A: Entrega pela Rede Dudit sempre exige código", () => {
    it("deve exigir código para entrega Dudit com valor baixo (R$ 25)", async () => {
      mockStore.orders["ord_1"] = { id: "ord_1", total_amount: 25.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_1", driver_id: "driver_dudit_1", status: "assigned" })

      const req = await doesOrderRequireDeliveryOtp("ord_1", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(true)
      expect(req.modality).toBe("dudit_platform")
    })

    it("deve exigir código para entrega Dudit com valor alto (R$ 2.500)", async () => {
      mockStore.orders["ord_2"] = { id: "ord_2", total_amount: 2500.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_2", driver_id: "driver_dudit_2", status: "accepted" })

      const req = await doesOrderRequireDeliveryOtp("ord_2", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(true)
      expect(req.modality).toBe("dudit_platform")
    })
  })

  describe("Rule B: Entrega própria da loja (Threshold R$ 500)", () => {
    beforeEach(() => {
      mockStore.deliveries["del_internal"] = {
        id: "del_internal",
        delivery_person_id: "partner_user_driver_1",
        partner_id: "partner_1",
      }
    })

    it("1. Entrega própria ACIMA de R$ 500 (R$ 500.01) EXIGE código", async () => {
      mockStore.orders["ord_above_500"] = { id: "ord_above_500", total_amount: 500.01, delivery_type: "delivery", partner_id: "partner_1" }
      mockStore.delivery_orders.push({ order_id: "ord_above_500", delivery_id: "del_internal" })

      const req = await doesOrderRequireDeliveryOtp("ord_above_500", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(true)
      expect(req.modality).toBe("store_internal")
    })

    it("2. Entrega própria de EXATAMENTE R$ 500 (R$ 500.00) NÃO exige código", async () => {
      mockStore.orders["ord_exact_500"] = { id: "ord_exact_500", total_amount: 500.0, delivery_type: "delivery", partner_id: "partner_1" }
      mockStore.delivery_orders.push({ order_id: "ord_exact_500", delivery_id: "del_internal" })

      const req = await doesOrderRequireDeliveryOtp("ord_exact_500", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(false)
      expect(req.modality).toBe("store_internal")
    })

    it("3. Entrega própria ABAIXO de R$ 500 (R$ 499.99) NÃO exige código", async () => {
      mockStore.orders["ord_below_500"] = { id: "ord_below_500", total_amount: 499.99, delivery_type: "delivery", partner_id: "partner_1" }
      mockStore.delivery_orders.push({ order_id: "ord_below_500", delivery_id: "del_internal" })

      const req = await doesOrderRequireDeliveryOtp("ord_below_500", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(false)
      expect(req.modality).toBe("store_internal")
    })

    it("4. Limite configurável pela loja respeita valor customizado da delivery_settings", async () => {
      mockStore.delivery_settings["partner_1"] = { partner_id: "partner_1", otp_min_order_amount: 300.0 }
      mockStore.orders["ord_custom"] = { id: "ord_custom", total_amount: 350.0, delivery_type: "delivery", partner_id: "partner_1" }
      mockStore.delivery_orders.push({ order_id: "ord_custom", delivery_id: "del_internal" })

      const req = await doesOrderRequireDeliveryOtp("ord_custom", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(true)
      expect(req.thresholdAmount).toBe(300.0)
    })
  })

  describe("Rule C: Transportadora NÃO exige código", () => {
    it("não exige código para SuperFrete mesmo com valor alto (R$ 2.000)", async () => {
      mockStore.orders["ord_carrier"] = {
        id: "ord_carrier",
        total_amount: 2000.0,
        delivery_type: "delivery",
        delivery_breakdown: { source: "superfrete", carrier: "correios_sedex" },
      }

      const req = await doesOrderRequireDeliveryOtp("ord_carrier", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(false)
      expect(req.modality).toBe("carrier")
    })

    it("não exige código se houver etiquetas geradas em order_shipments", async () => {
      mockStore.orders["ord_shipment"] = { id: "ord_shipment", total_amount: 1500.0, delivery_type: "delivery" }
      mockStore.order_shipments.push({ id: "shipment_1", order_id: "ord_shipment" })

      const req = await doesOrderRequireDeliveryOtp("ord_shipment", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(false)
      expect(req.modality).toBe("carrier")
    })
  })

  describe("Rule D: Outras modalidades", () => {
    it("não exige código para retirada no estabelecimento (pickup)", async () => {
      mockStore.orders["ord_pickup"] = { id: "ord_pickup", total_amount: 1000.0, delivery_type: "pickup" }

      const req = await doesOrderRequireDeliveryOtp("ord_pickup", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(false)
      expect(req.modality).toBe("pickup")
    })

    it("não presume entrega própria quando não há entregador designado", async () => {
      mockStore.orders["ord_unassigned"] = { id: "ord_unassigned", total_amount: 800.0, delivery_type: "delivery" }

      const req = await doesOrderRequireDeliveryOtp("ord_unassigned", { adminClient: mockAdminClient })
      expect(req.requiresOtp).toBe(false)
      expect(req.modality).toBe("other")
    })
  })

  // 2. TEST CASES: GERAÇÃO, VISUALIZAÇÃO E SEGURANÇA
  describe("Geração e visualização segura pelo cliente", () => {
    it("gera código de 6 dígitos numéricos aleatório", async () => {
      mockStore.orders["ord_dudit"] = { id: "ord_dudit", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_dudit", driver_id: "driver_1", status: "assigned" })

      const res = await getOrGenerateDeliveryOtp("ord_dudit", { adminClient: mockAdminClient })
      expect(res.requiresOtp).toBe(true)
      expect(res.code).toMatch(/^\d{6}$/)
      expect(res.status).toBe("pending")
    })

    it("cliente autorizado consegue visualizar o código", async () => {
      mockStore.orders["ord_client"] = {
        id: "ord_client",
        buyer_id: "user_buyer_123",
        total_amount: 100.0,
        delivery_type: "delivery",
      }
      mockStore.delivery_assignments.push({ order_id: "ord_client", driver_id: "driver_1", status: "assigned" })

      const res = await getCustomerDeliveryOtp({
        orderId: "ord_client",
        userId: "user_buyer_123",
        adminClient: mockAdminClient,
      })

      expect(res.success).toBe(true)
      expect(res.data?.code).toBeDefined()
      expect(res.data?.code).toMatch(/^\d{6}$/)
    })

    it("outro cliente NÃO consegue visualizar o código (proteção de tenant/usuário)", async () => {
      mockStore.orders["ord_client_2"] = {
        id: "ord_client_2",
        buyer_id: "user_buyer_123",
        total_amount: 100.0,
        delivery_type: "delivery",
      }
      mockStore.delivery_assignments.push({ order_id: "ord_client_2", driver_id: "driver_1", status: "assigned" })

      const res = await getCustomerDeliveryOtp({
        orderId: "ord_client_2",
        userId: "user_impostor_999",
        adminClient: mockAdminClient,
      })

      expect(res.success).toBe(false)
      expect(res.error).toContain("não tem permissão")
    })

    it("status público / entregador NÃO expõe o código correto", async () => {
      mockStore.orders["ord_status"] = { id: "ord_status", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_status", driver_id: "driver_1", status: "assigned" })

      await getOrGenerateDeliveryOtp("ord_status", { adminClient: mockAdminClient })
      const status = await getOrderDeliveryOtpStatus("ord_status", { adminClient: mockAdminClient })

      expect(status.requiresOtp).toBe(true)
      expect((status as any).code).toBeUndefined()
      expect((status as any).encrypted_code).toBeUndefined()
    })
  })

  // 3. TEST CASES: VALIDAÇÃO PELO ENTREGADOR, BRUTE FORCE E ANTI-FRAUDE
  describe("Validação pelo entregador e proteção contra fraudes", () => {
    it("entregador confirma com o código correto", async () => {
      mockStore.orders["ord_verify"] = { id: "ord_verify", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_verify", driver_id: "driver_1", status: "assigned" })

      const gen = await getOrGenerateDeliveryOtp("ord_verify", { adminClient: mockAdminClient })
      const correctCode = gen.code!

      const verifyRes = await verifyAndConsumeDeliveryOtp({
        orderId: "ord_verify",
        code: correctCode,
        confirmedByUserId: "driver_1",
        adminClient: mockAdminClient,
      })

      expect(verifyRes.success).toBe(true)
      expect(verifyRes.alreadyConfirmed).toBe(false)
    })

    it("código incorreto não confirma a entrega e contabiliza tentativas restantes", async () => {
      mockStore.orders["ord_wrong"] = { id: "ord_wrong", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_wrong", driver_id: "driver_1", status: "assigned" })

      await getOrGenerateDeliveryOtp("ord_wrong", { adminClient: mockAdminClient })

      const verifyRes = await verifyAndConsumeDeliveryOtp({
        orderId: "ord_wrong",
        code: "000000",
        confirmedByUserId: "driver_1",
        adminClient: mockAdminClient,
      })

      expect(verifyRes.success).toBe(false)
      expect(verifyRes.error).toContain("Código de confirmação incorreto")
      expect(verifyRes.remainingAttempts).toBe(4)
    })

    it("bloqueia após tentativas excessivas (anti-brute force)", async () => {
      mockStore.orders["ord_lockout"] = { id: "ord_lockout", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_lockout", driver_id: "driver_1", status: "assigned" })

      await getOrGenerateDeliveryOtp("ord_lockout", { adminClient: mockAdminClient })

      // Realiza 5 tentativas incorretas
      for (let i = 0; i < 4; i++) {
        await verifyAndConsumeDeliveryOtp({
          orderId: "ord_lockout",
          code: `00000${i}`,
          confirmedByUserId: "driver_1",
          adminClient: mockAdminClient,
        })
      }

      const fifthAttempt = await verifyAndConsumeDeliveryOtp({
        orderId: "ord_lockout",
        code: "999999",
        confirmedByUserId: "driver_1",
        adminClient: mockAdminClient,
      })

      expect(fifthAttempt.success).toBe(false)
      expect(fifthAttempt.error).toContain("Limite de tentativas excedido")
      expect(fifthAttempt.remainingAttempts).toBe(0)
    })

    it("código de outro pedido não funciona", async () => {
      mockStore.orders["ord_A"] = { id: "ord_A", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.orders["ord_B"] = { id: "ord_B", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_A", driver_id: "driver_1", status: "assigned" })
      mockStore.delivery_assignments.push({ order_id: "ord_B", driver_id: "driver_1", status: "assigned" })

      const genA = await getOrGenerateDeliveryOtp("ord_A", { adminClient: mockAdminClient })
      const codeA = genA.code!

      // Tentar usar o código do pedido A no pedido B
      const verifyRes = await verifyAndConsumeDeliveryOtp({
        orderId: "ord_B",
        code: codeA,
        confirmedByUserId: "driver_1",
        adminClient: mockAdminClient,
      })

      expect(verifyRes.success).toBe(false)
    })

    it("idempotência: código já confirmado retorna sucesso sem erro", async () => {
      mockStore.orders["ord_idempotent"] = { id: "ord_idempotent", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_idempotent", driver_id: "driver_1", status: "assigned" })

      const gen = await getOrGenerateDeliveryOtp("ord_idempotent", { adminClient: mockAdminClient })
      const code = gen.code!

      // Primeira confirmação
      const first = await verifyAndConsumeDeliveryOtp({
        orderId: "ord_idempotent",
        code,
        confirmedByUserId: "driver_1",
        adminClient: mockAdminClient,
      })
      expect(first.success).toBe(true)

      // Segunda confirmação repetida
      const second = await verifyAndConsumeDeliveryOtp({
        orderId: "ord_idempotent",
        code,
        confirmedByUserId: "driver_1",
        adminClient: mockAdminClient,
      })
      expect(second.success).toBe(true)
      expect(second.alreadyConfirmed).toBe(true)
    })

    it("reatribuição ou cancelamento invalida o código atomicamente", async () => {
      mockStore.orders["ord_reassign"] = { id: "ord_reassign", total_amount: 100.0, delivery_type: "delivery" }
      mockStore.delivery_assignments.push({ order_id: "ord_reassign", driver_id: "driver_1", status: "assigned" })

      await getOrGenerateDeliveryOtp("ord_reassign", { adminClient: mockAdminClient })
      expect(mockStore.order_delivery_otps.length).toBe(1)

      // Invalida por cancelamento ou reatribuição
      await invalidateDeliveryOtp("ord_reassign", "driver_reassigned", { adminClient: mockAdminClient })
      expect(mockStore.order_delivery_otps[0].invalidated_at).toBeDefined()
      expect(mockStore.order_delivery_otps[0].invalidation_reason).toBe("driver_reassigned")
    })
  })
})
