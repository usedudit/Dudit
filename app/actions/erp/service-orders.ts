"use server"

import {
  SERVICE_ORDER_STATUS_META,
  isServiceOrderStatus,
  isValidServiceOrderTransition,
  getServiceOrderEditPolicy,
  type ServiceOrderStatus,
} from "@/lib/types/service-order"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requireStoreAccess, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission, checkPermission } from "@/lib/permissions/access"
import { getAdminClient } from "@/lib/supabase/admin"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes, sanitizeInput } from "@/lib/input-validator"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { generateSignedUploadUrl } from "@/lib/r2/server"
import {
  R2_PREFIXES,
  MAX_FILE_SIZE,
  getUploadKindFromMimeType,
  getUploadValidationRules,
  ALL_MIME_TO_EXT,
} from "@/lib/r2/config"
import { createNotification } from "@/lib/services/notification.service"
import { revalidatePath } from "next/cache"
import { checkLimit, increment_usage_counter } from "@/lib/services/subscription.service"
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { generateShortId, isUuid } from "@/lib/utils/short-id"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { maskPersonName } from "@/lib/utils/formatters"
import { formatCurrency } from "@/lib/utils"

export type ServiceOrderListCursor = { createdAt: string; id: string } | null

function buildKeysetOrFilter(cursor: { createdAt: string; id: string }): string {
  const ts = cursor.createdAt
  const id = cursor.id
  const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
  return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const PAGE_SIZE = 100

/**
 * Guard não-bloqueante de estoque: registra um evento de timeline quando itens
 * de produto são adicionados sem estoque suficiente. NÃO impede a operação -
 * a baixa de estoque acontece apenas no pagamento do pedido vinculado.
 */
async function logStockShortagesForServiceOrder(
  partnerId: string,
  serviceOrderId: string,
  items: { product_id?: string | null; variant_id?: string | null; quantity?: number; product_name?: string }[],
): Promise<void> {
  try {
    const productIds = items.map((i) => i.product_id).filter((id): id is string => !!id)
    if (productIds.length === 0) return

    const admin = getAdminClient()
    const { data: productRows } = await admin
      .from("products")
      .select("id, name, stock_available, allow_sell_without_stock")
      .in("id", productIds)
    const productMap = new Map<string, any>((productRows || []).map((r: any) => [r.id, r]))

    const variantIds = items.map((i) => i.variant_id).filter((id): id is string => !!id)
    let variantMap = new Map<string, any>()
    if (variantIds.length > 0) {
      const { data: variantRows } = await admin
        .from("product_variants")
        .select("id, stock_available")
        .in("id", variantIds)
      variantMap = new Map((variantRows || []).map((r: any) => [r.id, r]))
    }

    const shortages: string[] = []
    for (const item of items) {
      if (!item.product_id) continue
      const product = productMap.get(item.product_id)
      if (!product || product.allow_sell_without_stock) continue
      const qty = Number(item.quantity || 1)
      const available = item.variant_id
        ? Number(variantMap.get(item.variant_id)?.stock_available ?? 0)
        : Number(product.stock_available ?? 0)
      if (qty > available) {
        shortages.push(`${item.product_name || product.name || "Produto"}: solicitado ${qty}, disponível ${available}`)
      }
    }

    if (shortages.length > 0) {
      await logAuditEvent({
        partnerId,
        actorUserId: null,
        entityType: "service_order",
        entityId: serviceOrderId,
        actionType: "stock_shortage_warning",
        changeLines: shortages,
        source: "system",
      })
    }
  } catch (err) {
    console.error("[service_order_stock_warning] failed:", err)
  }
}

/**
 * Resolve a autorização de quem interage com o portal público da OS
 * (aprovação/assinatura). Retorna `authorized: true` para membros do ERP
 * (lojista/responsável/criador) ou quando o e-mail do usuário logado coincide
 * com o do cliente da OS. Nesses casos o código de 4 dígitos não é exigido.
 */
async function resolvePortalActor(
  admin: any,
  partnerId: string,
  assignedUserId: string | null,
  createdBy: string | null,
  customerEmail: string | null,
  customerName: string | null,
): Promise<{ authorized: boolean; method: "erp_portal" | "auth"; displayName: string; loggedUserId: string | null }> {
  let loggedUser: any = null
  try {
    const { getCurrentUser } = await import("@/lib/auth/server-user")
    loggedUser = await getCurrentUser()
  } catch {
    // Usuário não autenticado
  }

  if (!loggedUser) {
    return { authorized: false, method: "auth", displayName: "", loggedUserId: null }
  }

  const { data: partnerUser } = await admin
    .from("partner_users")
    .select("role")
    .eq("partner_id", partnerId)
    .eq("user_id", loggedUser.id)
    .maybeSingle()

  const { data: partnerOwner } = await admin
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .eq("user_id", loggedUser.id)
    .maybeSingle()

  const isErpMember = Boolean(
    partnerOwner ||
    partnerUser ||
    (assignedUserId && assignedUserId === loggedUser.id) ||
    (createdBy && createdBy === loggedUser.id)
  )

  if (isErpMember) {
    const { data: profile } = await admin
      .from("user_profiles")
      .select("full_name")
      .eq("user_id", loggedUser.id)
      .maybeSingle()
    return {
      authorized: true,
      method: "erp_portal",
      displayName: profile?.full_name?.trim() || loggedUser.email?.split("@")[0] || "Lojista",
      loggedUserId: loggedUser.id,
    }
  }

  if (customerEmail && loggedUser.email && loggedUser.email.toLowerCase() === customerEmail.toLowerCase()) {
    return {
      authorized: true,
      method: "auth",
      displayName: customerName || loggedUser.email?.split("@")[0] || "Cliente",
      loggedUserId: loggedUser.id,
    }
  }

  return { authorized: false, method: "auth", displayName: "", loggedUserId: loggedUser.id }
}

export async function getERPServiceOrdersPageAction(
  partnerId: string,
  options?: { cursor?: ServiceOrderListCursor; limit?: number; status?: string; statuses?: string[]; search?: string; storeId?: string | null },
): Promise<
  | { success: true; items: any[]; nextCursor: ServiceOrderListCursor; hasMore: boolean }
  | { success: false; error: string }
> {
  try {
    await requirePermission(partnerId, "service_orders", "view")
    const context = await getCurrentPartnerContext()
    if (!context || context.partnerId !== partnerId || !context.activeStoreId) {
      throw new Error("Loja ativa inválida para carregar as ordens de serviço.")
    }
    const storeId = context.activeStoreId
    if (options?.storeId && options.storeId !== storeId) {
      throw new Error("A loja solicitada não corresponde à loja ativa.")
    }
    await requireStorePermission(storeId, partnerId, "service_orders", "view")

    const cursor = options?.cursor ?? null
    const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || PAGE_SIZE))))
    const fetchLimit = limit + 1
    const statuses = (options?.statuses || []).filter((s): s is string => !!s)
    const search = (options?.search || "").replace(/[%*(),]/g, "").trim().slice(0, 80)
    const rows = await getCachedErpPage(
      [
        "erp-service-orders-page",
        partnerId,
        storeId,
        statuses.length > 0 ? statuses.join("+") : (options?.status || "all"),
        search || "no-search",
        cursor ? `${cursor.createdAt}:${cursor.id}` : "first",
        String(limit),
      ],
      [TAGS.serviceOrders(partnerId)],
      async () => {
        const supabase = getAdminClient()
        let q = supabase
          .from("service_orders")
          .select("id, order_number, title, status, customer_id, customer_snapshot, assigned_user_id, expected_completion_date, total_amount, store_id, created_at, updated_at, created_by, completed_at, signature_image_key, signed_at, diagnosis, description, specifications")
          .eq("partner_id", partnerId)
        if (statuses.length > 0) q = q.in("status", statuses)
        else if (options?.status && options.status !== "all") q = q.eq("status", options.status)
        if (search) {
          q = q.or(
            [
              `order_number.ilike.%${search}%`,
              `title.ilike.%${search}%`,
              `customer_snapshot->>name.ilike.%${search}%`,
              `customer_snapshot->>phone.ilike.%${search}%`,
              `customer_snapshot->>email.ilike.%${search}%`,
              `diagnosis.ilike.%${search}%`,
              `description.ilike.%${search}%`,
            ].join(",")
          )
        }
        q = q.eq("store_id", storeId)
        if (cursor) q = q.or(buildKeysetOrFilter(cursor))
        const { data, error } = await q
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(fetchLimit)
        if (error) throw error

        const list = data || []
        const assignedIds = Array.from(
          new Set(list.map((r: any) => r.assigned_user_id).filter(Boolean)),
        ) as string[]
        let nameMap = new Map<string, string>()
        if (assignedIds.length > 0) {
          const { data: profiles } = await supabase
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", assignedIds)
          nameMap = new Map(
            (profiles || []).map((p: any) => [String(p.user_id), String(p.full_name || "")]),
          )
        }

        return list.map((r: any) => ({
          ...r,
          assigned_user_name: r.assigned_user_id ? (nameMap.get(String(r.assigned_user_id)) || null) : null,
        }))
      },
      30,
    )
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    // Public tokens are bearer credentials; keep them out of the general
    // read DTO. Authorized editors obtain them through ensurePublicTokenAction.
    const safeItems = items.map(({ public_token: _publicToken, ...item }: any) => item)
    const last = safeItems[safeItems.length - 1]
    const nextCursor = hasMore && last?.created_at && last?.id
      ? { createdAt: String(last.created_at), id: String(last.id) }
      : null

    return { success: true, items: safeItems, nextCursor, hasMore }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao carregar ordens de serviço" }
  }
}

export async function getServiceOrderDetailsAction(
  serviceOrderId: string,
  partnerId: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requirePermission(partnerId, "service_orders", "view")
    const admin = getAdminClient()
    const { data: scope, error: scopeError } = await admin
      .from("service_orders")
      .select("store_id")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (scopeError || !scope) throw new Error("Ordem de serviço não encontrada.")
    if (scope.store_id) {
      await requireStorePermission(scope.store_id, partnerId, "service_orders", "view")
    }

    const detail = await getCachedErpPage(
      ["erp-service-order-detail", partnerId, serviceOrderId],
      [
        TAGS.serviceOrders(partnerId),
        TAGS.orders(partnerId),
        TAGS.entityTimeline("service_order", serviceOrderId),
      ],
      async () => {
        // Authorization is performed above. The cached loader is tenant-scoped
        // and read-only, so it can use the admin client safely.
        const { data: order, error } = await admin
          .from("service_orders")
          .select("*")
          .eq("id", serviceOrderId)
          .eq("partner_id", partnerId)
          .single()

        if (error) throw error
        if (!order) throw new Error("Ordem de serviço não encontrada")

        const [servicesRes, productsRes, attachmentsRes, historyRes, saleRes, assignedProfileRes, linkedOrderRes] = await Promise.all([
          admin.from("service_order_services").select("*, services(name, price)").eq("service_order_id", serviceOrderId).order("sort_order"),
          admin.from("service_order_products").select("*, products(name, price)").eq("service_order_id", serviceOrderId).order("sort_order"),
          admin.from("service_order_attachments").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }),
          fetchTimelineForEntity("service_order", serviceOrderId, partnerId),
          order.sale_id ? admin.from("sales").select("*").eq("id", order.sale_id).single() : Promise.resolve({ data: null }),
          order.assigned_user_id
            ? admin.from("user_profiles").select("full_name").eq("user_id", order.assigned_user_id).maybeSingle()
            : Promise.resolve({ data: null } as any),
          order.order_id ? admin.from("orders").select("order_number").eq("id", order.order_id).maybeSingle() : Promise.resolve({ data: null }),
        ])

        return {
          order: {
            ...order,
            assigned_user_name: assignedProfileRes?.data?.full_name || null,
          },
          services: servicesRes.data || [],
          products: productsRes.data || [],
          attachments: attachmentsRes.data || [],
          history: historyRes,
          sale: saleRes?.data || null,
          linked_order_number: linkedOrderRes?.data?.order_number || null,
        }
      },
      15,
    )

    const { order } = detail

    // ── Custo / margem (somente quando o usuário pode ver preço de custo) ──
    // A permissão é verificada por usuário (fora do cache); apenas os preços de
    // custo (por parceiro/OS) são cacheados para evitar queries repetidas.
    let costs: { canView: boolean; totalCost?: number; margin?: number; marginPercent?: number } = { canView: false }
    try {
      const { allowed: canViewCost } = await checkPermission(partnerId, "products", "view_cost_price")
      if (canViewCost) {
        const costData = await getCachedErpPage(
          ["erp-service-order-costs", partnerId, serviceOrderId],
          [TAGS.serviceOrders(partnerId)],
          async () => {
            const admin = getAdminClient()
            const svcIds = (detail.services || []).map((s: any) => s.service_id).filter(Boolean)
            const prodIds = (detail.products || []).map((p: any) => p.product_id).filter(Boolean)
            const [svcCostRes, prodCostRes] = await Promise.all([
              svcIds.length
                ? admin.from("services").select("id, cost_price").in("id", svcIds)
                : Promise.resolve({ data: [] as any[] }),
              prodIds.length
                ? admin.from("products").select("id, cost_price").in("id", prodIds)
                : Promise.resolve({ data: [] as any[] }),
            ])
            return {
              svcCost: (svcCostRes.data || []) as { id: string; cost_price: number | null }[],
              prodCost: (prodCostRes.data || []) as { id: string; cost_price: number | null }[],
            }
          },
          15,
        )
        const svcCost = new Map<string, number>((costData.svcCost || []).map((r: any) => [r.id, Number(r.cost_price || 0)]))
        const prodCost = new Map<string, number>((costData.prodCost || []).map((r: any) => [r.id, Number(r.cost_price || 0)]))
        const totalCost =
          (detail.services || []).reduce((sum: number, s: any) => sum + (s.service_id ? (svcCost.get(s.service_id) || 0) : 0) * Number(s.quantity || 1), 0) +
          (detail.products || []).reduce((sum: number, p: any) => sum + (p.product_id ? (prodCost.get(p.product_id) || 0) : 0) * Number(p.quantity || 1), 0)
        const totalAmount = Number(order.total_amount || 0)
        const margin = totalAmount - totalCost
        costs = {
          canView: true,
          totalCost: Math.round(totalCost * 100) / 100,
          margin: Math.round(margin * 100) / 100,
          marginPercent: totalAmount > 0 ? (margin / totalAmount) * 100 : 0,
        }
      }
    } catch {
      costs = { canView: false }
    }

    let specifications = order.specifications
    if (typeof specifications === "string") {
      try {
        specifications = JSON.parse(specifications)
      } catch {
        specifications = []
      }
    }

    // Public tokens are bearer credentials, so only the explicit share action
    // may return them after checking edit and store permissions.
    const { public_token: _publicToken, ...safeOrder } = order

    return {
      success: true,
      data: {
        ...safeOrder,
        specifications,
        services: detail.services,
        products: detail.products,
        attachments: detail.attachments,
        history: detail.history,
        sale: detail.sale,
        costs,
        linked_order_number: detail.linked_order_number,
      },
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao carregar detalhes da OS" }
  }
}

async function fetchTimelineForEntity(entityType: string, entityId: string, partnerId: string) {
  const admin = getAdminClient()
  const { data } = await admin
    .from("audit_logs")
    .select("id, actor_user_id, action_type, change_lines, created_at, metadata")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(50)

  const logs = data || []
  if (logs.length === 0) return []

  const actorIds = Array.from(
    new Set(
      logs
        .map((entry: any) => entry.actor_user_id)
        .filter((value: any): value is string => Boolean(value)),
    ),
  )

  let namesByUserId = new Map<string, string>()

  if (actorIds.length > 0) {
    const { data: profiles, error: profileError } = await admin
      .from("user_profiles")
      .select("user_id, full_name")
      .in("user_id", actorIds)

    if (profileError) {
      console.error("[service_order_history] profile fetch error:", profileError)
    } else {
      namesByUserId = new Map(
        (profiles || []).map((profile: { user_id: string; full_name: string | null }) => [
          profile.user_id,
          profile.full_name?.trim() || "Usuário",
        ]),
      )
    }
  }

  return logs.map((entry: any) => ({
    ...entry,
    actor_name: entry.actor_user_id ? (namesByUserId.get(entry.actor_user_id) || "Usuário") : "Sistema",
  }))
}

export async function createServiceOrderAction(
  partnerId: string,
  input: {
    store_id?: string
    order_number?: string
    title: string
    description?: string
    diagnosis?: string
    internal_notes?: string
    customer_id?: string | null
    expected_completion_date?: string | null
    assigned_user_id?: string | null
    status?: string
    priority?: string
    estimated_hours?: number | null
    expected_completion_time?: string | null
    discount_value?: number
    discount_type?: string
    coupon_id?: string | null
    coupon_code?: string | null
    coupon_discount_amount?: number
    other_costs?: number
    payment_status?: string
    paid_amount?: number
    payment_method?: string | null
    payment_breakdown?: any
    created_at?: string | null
    specifications?: { name: string; value: string }[]
    metadata?: Record<string, any>
    services?: Array<{ service_id: string | null; service_name?: string; service_price?: number; quantity?: number }>
    products?: Array<{ product_id: string | null; variant_id?: string | null; product_name?: string; unit_price?: number; quantity?: number }>
  },
): Promise<{ success: true; data: any; orderNumber: string } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const [user] = await Promise.all([
      requireUser(),
      requirePermission(partnerId, "service_orders", "create"),
    ])
    const admin = getAdminClient()

    const storeId = input.store_id
    if (!storeId) {
      return { success: false, error: "store_id é obrigatório. Selecione uma loja antes de criar a OS." }
    }

    const capabilities = await getPartnerCapabilities(partnerId, { storeId })
    if (!capabilities.hasServiceOrders) {
      return { success: false, error: "O módulo de Ordens de Serviço requer o plano Crescer ou superior e deve estar ativo nas configurações." }
    }

    // Run store access, plan limit, and customer snapshot validation in parallel
    const [_, limitCheck, customerSnapshot] = await Promise.all([
      requireStoreAccess(storeId, partnerId),
      checkLimit(partnerId, "monthly_service_orders"),
      input.customer_id ? getCustomerSnapshot(admin, input.customer_id, partnerId) : Promise.resolve(null),
    ])

    if (input.customer_id && !customerSnapshot) {
      return { success: false, error: "Cliente inválido para este parceiro." }
    }

    if (!limitCheck.allowed) {
      return { success: false, error: limitCheck.message || "Limite mensal de ordens de serviço atingido." }
    }

    const status = input.status || "aberta"

    // Compute item totals in-memory
    const servicesList = input.services || []
    const productsList = input.products || []

    let totalServiceAmount = 0
    const serviceRows = servicesList.map((s, idx) => {
      const price = Number(s.service_price !== undefined ? s.service_price : 0)
      const qty = Number(s.quantity || 1)
      const total = price * qty
      totalServiceAmount += total
      return {
        service_id: s.service_id || null,
        service_name: s.service_name || "Serviço avulso",
        service_price: price,
        quantity: qty,
        total_price: total,
        sort_order: idx,
      }
    })

    let totalProductAmount = 0
    const productRows = productsList.map((p, idx) => {
      const price = Number(p.unit_price !== undefined ? p.unit_price : 0)
      const qty = Number(p.quantity || 1)
      const total = price * qty
      totalProductAmount += total
      return {
        product_id: p.product_id || null,
        variant_id: p.variant_id || null,
        product_name: p.product_name || "Produto avulso",
        unit_price: price,
        quantity: qty,
        total_price: total,
        sort_order: idx,
      }
    })

    const subtotal = totalServiceAmount + totalProductAmount
    const discVal = Number(input.discount_value || 0)
    const discType = input.discount_type || 'fixed'
    const couponDisc = Number(input.coupon_discount_amount || 0)
    const otherCosts = Number(input.other_costs || 0)

    let discountAmount = 0
    if (discType === 'percentage') {
      discountAmount = (subtotal * discVal) / 100
    } else if (discType === 'fixed') {
      discountAmount = discVal
    } else if (discType === 'coupon') {
      discountAmount = couponDisc
    }

    const finalTotal = Math.max(0, subtotal - discountAmount + otherCosts)
    const publicToken = generateShortId(6)

    // Generate 4-digit approval code & salt
    const crypto = await import("crypto")
    const plainCode = crypto.randomInt(1000, 10000).toString()
    const salt = crypto.randomBytes(16).toString("hex")
    let approvalHash: string | null = null

    try {
      const { data: hashData } = await admin.rpc("compute_approval_hash", {
        salt,
        code: plainCode,
      })
      approvalHash = (hashData as string) || null
    } catch (e) {
      console.warn("[createServiceOrderAction] failed to compute approval hash:", e)
    }

    const orderMetadata = {
      ...(input.metadata || {}),
      plain_code: plainCode,
    }

    // 1. Insert service order with final totals
    const { data, error } = await admin
      .from("service_orders")
      .insert({
        partner_id: partnerId,
        store_id: storeId,
        order_number: input.order_number || undefined,
        public_token: publicToken,
        title: sanitizeInput(input.title, 150),
        description: sanitizeNotes(input.description),
        diagnosis: sanitizeNotes(input.diagnosis),
        internal_notes: sanitizeNotes(input.internal_notes),
        customer_id: input.customer_id || null,
        customer_snapshot: customerSnapshot,
        expected_completion_date: input.expected_completion_date || null,
        assigned_user_id: input.assigned_user_id || null,
        status,
        created_by: user.id,
        priority: input.priority || 'baixa',
        estimated_hours: input.estimated_hours || null,
        expected_completion_time: input.expected_completion_time || null,
        discount_value: discVal,
        discount_type: discType,
        coupon_id: input.coupon_id || null,
        coupon_code: input.coupon_code || null,
        coupon_discount_amount: couponDisc,
        other_costs: otherCosts,
        total_service_amount: totalServiceAmount,
        total_product_amount: totalProductAmount,
        total_amount: finalTotal,
        payment_status: input.payment_status || 'unpaid',
        paid_amount: input.paid_amount || 0,
        payment_method: input.payment_method || null,
        payment_breakdown: input.payment_breakdown ? JSON.stringify(input.payment_breakdown) : null,
        created_at: input.created_at || undefined,
        specifications: input.specifications && input.specifications.length > 0 ? input.specifications : undefined,
        approval_code_salt: salt,
        approval_code_hash: approvalHash,
        metadata: orderMetadata,
      })
      .select("*")
      .single()

    if (error) throw error

    // 2. Insert linked order in orders table
    const userNotes = sanitizeNotes(input.internal_notes || input.description) || null
    const buildLinkedOrderPayload = (includeSourceId: boolean = true) => {
      const payload: any = {
        partner_id: partnerId,
        store_id: storeId,
        buyer_id: input.customer_id || null,
        customer_id: input.customer_id || null,
        customer_name: (customerSnapshot as any)?.name || null,
        total_amount: finalTotal,
        discount_value: discVal,
        discount_type: discType,
        discount_amount: discountAmount,
        additional_costs: otherCosts,
        paid_amount: input.paid_amount || 0,
        situation: "pending",
        delivery_status: "not_sent",
        delivery_type: "pickup",
        order_source: "Ordem de Serviço",
        payment_method: input.payment_method || "Método não definido",
        notes: userNotes,
        created_at: new Date().toISOString(),
        created_by: user.id,
      }
      if (includeSourceId) {
        payload.source_service_order_id = data.id
      }
      return payload
    }

    let linkedOrderResult: any = await admin
      .from("orders")
      .insert(buildLinkedOrderPayload(true))
      .select("id")
      .single()

    if (linkedOrderResult?.error && /source_service_order_id|column/i.test(String(linkedOrderResult.error.message || ""))) {
      linkedOrderResult = await admin
        .from("orders")
        .insert(buildLinkedOrderPayload(false))
        .select("id")
        .single()
    }

    const linkedOrder = linkedOrderResult?.data || null
    const linkedOrderErr = linkedOrderResult?.error || null

    if (linkedOrderErr || !linkedOrder?.id) {
      console.error("[createServiceOrderAction] Falha ao criar pedido vinculado à OS:", linkedOrderErr)
      throw new Error(`Falha ao criar pedido vinculado à OS: ${linkedOrderErr?.message || "erro desconhecido"}`)
    }

    // 3. Prepare parallel inserts for order items, service rows, product rows and update order_id on OS
    const orderItems = [
      ...serviceRows.map((s: any) => ({
        order_id: linkedOrder.id,
        product_id: s.service_id || null,
        variant_id: null,
        product_name: s.service_name || "Mão de Obra",
        product_price: s.service_price,
        quantity: s.quantity,
        subtotal: s.total_price,
        line_type: "service_booking" as const,
        fulfillment_mode: "on_site",
        service_id: s.service_id || null,
        is_gift: false,
        original_price: null,
        is_promotional: false,
        promotion_id: null,
      })),
      ...productRows.map((p: any) => ({
        order_id: linkedOrder.id,
        product_id: p.product_id || null,
        variant_id: p.variant_id || null,
        product_name: p.product_name || "Produto",
        product_price: p.unit_price,
        quantity: p.quantity,
        subtotal: p.total_price,
        line_type: "product" as const,
        fulfillment_mode: "delivery",
        service_id: null,
        is_gift: false,
        original_price: null,
        is_promotional: false,
        promotion_id: null,
      })),
    ]

    const insertPromises: Promise<any>[] = [
      admin.from("service_orders").update({ order_id: linkedOrder.id }).eq("id", data.id),
    ]

    if (serviceRows.length > 0) {
      const formattedServices = serviceRows.map(s => ({ ...s, service_order_id: data.id }))
      insertPromises.push(admin.from("service_order_services").insert(formattedServices))
    }

    if (productRows.length > 0) {
      const formattedProducts = productRows.map(p => ({ ...p, service_order_id: data.id }))
      insertPromises.push(admin.from("service_order_products").insert(formattedProducts))
    }

    if (orderItems.length > 0) {
      insertPromises.push(admin.from("order_items").insert(orderItems))
    }

    await Promise.all(insertPromises)

    void logStockShortagesForServiceOrder(partnerId, data.id, productsList)

    const orderNumber = data.order_number

    // 4. Background tasks (audits, notifications, usage counter)
    void (async () => {
      try {
        await logAuditEvent({
          partnerId,
          actorUserId: user.id,
          entityType: "service_order",
          entityId: data.id,
          actionType: "created",
          source: "manual",
          changeLines: [`OS #${orderNumber} criada por ${user.email || "usuário"}`],
          metadata: { storeId, partnerId, userId: user.id, serviceOrderId: data.id },
        })
      } catch (e) {
        console.error("[createServiceOrderAction] Audit log error:", e)
      }

      try {
        await increment_usage_counter(partnerId, "service_orders_month_count")
      } catch { }

      if (input.assigned_user_id && input.assigned_user_id !== user.id) {
        try {
          await createNotification({
            userId: input.assigned_user_id,
            type: "service_order_assigned" as any,
            title: "Nova OS atribuída",
            message: `OS #${orderNumber}: ${input.title}`,
            entityType: "service_order" as any,
            entityId: data.id,
            data: { partnerId, orderNumber },
            idempotencyKey: `os-assigned-${data.id}-${input.assigned_user_id}`,
          })
        } catch { }
      }
    })()

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data: { ...data, order_id: linkedOrder.id }, orderNumber }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao criar ordem de serviço" }
  }
}

async function getCustomerSnapshot(admin: any, customerId: string, partnerId?: string) {
  let customerQuery = admin
    .from("customers")
    .select("id, name, email, phone, image_url")
    .eq("id", customerId)

  if (partnerId) {
    customerQuery = customerQuery.eq("partner_id", partnerId)
  }

  const [{ data: customer }, { data: addresses }] = await Promise.all([
    customerQuery.maybeSingle(),
    admin
      .from("addresses")
      .select("zip_code, street, number, complement, neighborhood, city, state, address_type, is_default")
      .eq("customer_id", customerId)
      .limit(10),
  ])

  if (!customer) return null

  const primary = (addresses || []).find((a: any) => a.address_type === "primary" || a.is_default) || addresses?.[0] || null
  const billing = (addresses || []).find((a: any) => a.address_type === "billing") || null

  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    image_url: customer.image_url || null,
    city: primary?.city || null,
    state: primary?.state || null,
    zip_code: primary?.zip_code || null,
    street: primary?.street || null,
    number: primary?.number || null,
    complement: primary?.complement || null,
    neighborhood: primary?.neighborhood || null,
    addresses: [primary, billing]
      .filter(Boolean)
      .map((a: any) => ({
        address_type: a.address_type || "primary",
        is_default: !!a.is_default,
        zip_code: a.zip_code || null,
        street: a.street || null,
        number: a.number || null,
        complement: a.complement || null,
        neighborhood: a.neighborhood || null,
        city: a.city || null,
        state: a.state || null,
      })),
  }
}

export async function addServicesToOrderAction(
  partnerId: string,
  serviceOrderId: string,
  services: { service_id: string | null; service_name?: string; service_price?: number; quantity?: number }[],
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status, status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }
    if (!getServiceOrderEditPolicy((current?.status || "aberta") as ServiceOrderStatus).canEditItems) {
      throw new Error("Não é possível alterar os itens desta ordem de serviço neste status.")
    }

    const validServiceIds = services.map(s => s.service_id).filter((id): id is string => !!id)
    let svcRows: any[] = []
    if (validServiceIds.length > 0) {
      const { data, error: svcErr } = await admin
        .from("services")
        .select("id, name, price, cost_price")
        .in("id", validServiceIds)
      if (svcErr) throw svcErr
      svcRows = data || []
    }

    const items = services.map((s, idx) => {
      const svc = s.service_id ? svcRows.find((r: any) => r.id === s.service_id) : null
      const qty = s.quantity || 1
      const name = s.service_name || svc?.name || "Serviço avulso"
      const price = s.service_price !== undefined ? s.service_price : (svc?.price || 0)
      return {
        service_order_id: serviceOrderId,
        service_id: s.service_id || null,
        service_name: name,
        service_price: price,
        quantity: qty,
        total_price: price * qty,
        sort_order: idx,
      }
    })

    const { data, error } = await admin.from("service_order_services").insert(items).select("*")
    if (error) throw error

    await recalcTotals(admin, serviceOrderId)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "services_added", source: "manual",
      changeLines: [`${items.length} serviço(s) adicionado(s)`],
    })

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao adicionar serviços" }
  }
}

export async function addProductsToOrderAction(
  partnerId: string,
  serviceOrderId: string,
  products: { product_id: string | null; variant_id?: string | null; product_name?: string; unit_price?: number; quantity?: number }[],
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status, status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }
    if (!getServiceOrderEditPolicy((current?.status || "aberta") as ServiceOrderStatus).canEditItems) {
      throw new Error("Não é possível alterar os itens desta ordem de serviço neste status.")
    }

    const validProductIds = products.map(p => p.product_id).filter((id): id is string => !!id)
    let prodRows: any[] = []
    if (validProductIds.length > 0) {
      const { data, error: prodErr } = await admin
        .from("products")
        .select("id, name, price, cost_price")
        .in("id", validProductIds)
      if (prodErr) throw prodErr
      prodRows = data || []
    }

    const items = products.map((p, idx) => {
      const prod = p.product_id ? prodRows.find((r: any) => r.id === p.product_id) : null
      const qty = p.quantity || 1
      const name = p.product_name || prod?.name || "Produto avulso"
      const price = p.unit_price !== undefined ? p.unit_price : (prod?.price || 0)
      return {
        service_order_id: serviceOrderId,
        product_id: p.product_id || null,
        variant_id: p.variant_id || null,
        product_name: name,
        unit_price: price,
        quantity: qty,
        total_price: price * qty,
        sort_order: idx,
      }
    })

    const { data, error } = await admin.from("service_order_products").insert(items).select("*")
    if (error) throw error

    void logStockShortagesForServiceOrder(partnerId, serviceOrderId, products)

    await recalcTotals(admin, serviceOrderId)

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "products_added", source: "manual",
      changeLines: [`${items.length} produto(s) adicionado(s)`],
    })

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao adicionar produtos" }
  }
}

export async function updateServiceOrderStatusAction(
  partnerId: string,
  serviceOrderId: string,
  status: string,
  changeReason?: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    if (!isServiceOrderStatus(status)) {
      throw new Error("Status inválido para ordem de serviço.")
    }

    const { data: current } = await admin
      .from("service_orders")
      .select("status, order_number, title, completed_at, assigned_user_id, created_by, store_id")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .single()

    if (!current) throw new Error("OS não encontrada")

    const currentStatus = current.status as ServiceOrderStatus

    if (status === currentStatus) {
      throw new Error("A ordem de serviço já está neste status.")
    }

    if (!isValidServiceOrderTransition(currentStatus, status)) {
      const fromLabel = SERVICE_ORDER_STATUS_META[currentStatus]?.label || currentStatus
      const toLabel = SERVICE_ORDER_STATUS_META[status]?.label || status
      const isTerminal = ["entregue", "cancelada"].includes(currentStatus)
      throw new Error(
        isTerminal
          ? `Não é possível alterar o status de uma OS ${fromLabel.toLowerCase()}.`
          : `Transição inválida: ${fromLabel} → ${toLabel}.`,
      )
    }

    const updateData: any = { status }
    const isCompletedStatus = status === "concluida" || status === "entregue"
    if (isCompletedStatus && !current.completed_at) {
      updateData.completed_at = new Date().toISOString()
    }
    // Ao retroceder de um status terminal (concluída/entregue), limpa o marco de conclusão.
    if ((currentStatus === "concluida" || currentStatus === "entregue") && !isCompletedStatus) {
      updateData.completed_at = null
    }

    const { data, error } = await admin
      .from("service_orders")
      .update(updateData)
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "status_changed", source: "manual",
      changeLines: [
        `Status alterado: ${currentStatus} → ${status}`,
        ...(changeReason?.trim() ? [`Motivo: ${changeReason.trim()}`] : []),
      ],
    })

    if (data.assigned_user_id && data.assigned_user_id !== user.id) {
      try {
        const { createNotification } = await import("@/lib/services/notification.service")
        await createNotification({
          userId: data.assigned_user_id,
          type: "service_order_status_changed" as any,
          title: "OS atualizada",
          message: `OS #${data.order_number}: ${SERVICE_ORDER_STATUS_META[status].label}`,
          entityType: "service_order" as any,
          entityId: serviceOrderId,
          data: { partnerId, orderNumber: data.order_number, status },
          idempotencyKey: `os-status-${serviceOrderId}-${status}-${Date.now()}`,
        })
      } catch { }
    }

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar status" }
  }
}

export async function assignServiceOrderAction(
  partnerId: string,
  serviceOrderId: string,
  assignedUserId: string | null,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data, error } = await admin
      .from("service_orders")
      .update({ assigned_user_id: assignedUserId })
      .eq("id", serviceOrderId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "assigned", source: "manual",
      changeLines: [assignedUserId ? `OS atribuída a novo responsável` : `Responsável removido`],
    })

    if (assignedUserId && assignedUserId !== user.id) {
      try {
        await createNotification({
          userId: assignedUserId,
          type: "service_order_assigned" as any,
          title: "OS atribuída a você",
          message: `OS #${data.order_number}: ${data.title}`,
          entityType: "service_order" as any,
          entityId: serviceOrderId,
          data: { partnerId, orderNumber: data.order_number },
          idempotencyKey: `os-assigned-${serviceOrderId}-${assignedUserId}`,
        })
      } catch { }
    }

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atribuir OS" }
  }
}

export async function saveSignatureAction(
  partnerId: string,
  serviceOrderId: string,
  signatureImageKey: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    // A assinatura interna exige que a OS já tenha sido aprovada.
    const { data: current, error: currentErr } = await admin
      .from("service_orders")
      .select("id, status, signature_image_key")
      .eq("id", serviceOrderId)
      .maybeSingle()

    if (currentErr || !current) {
      return { success: false, error: "Ordem de serviço não encontrada" }
    }
    if (current.status === "aberta" || current.status === "aguardando_aprovacao") {
      return { success: false, error: "A OS precisa ser aprovada antes de ser assinada." }
    }
    if (current.status === "cancelada") {
      return { success: false, error: "Não é possível assinar uma OS cancelada." }
    }
    if (current.signature_image_key) {
      return { success: false, error: "Esta ordem de serviço já possui assinatura registrada." }
    }

    const { data, error } = await admin
      .from("service_orders")
      .update({
        signature_image_key: signatureImageKey,
        signed_at: new Date().toISOString(),
      })
      .eq("id", serviceOrderId)
      .select("*")
      .single()

    if (error) throw error

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "signed", source: "manual",
      changeLines: ["OS assinada pelo cliente"],
    })

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar assinatura" }
  }
}

export async function getPresignedUploadUrlAction(
  partnerId: string,
  prefix: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<
  | { success: true; uploadUrl: string; publicUrl: string | null; key: string }
  | { success: false; error: string }
> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()

    const normalizedPrefix = (prefix === "service-orders" || prefix === "serviceOrderAttachments")
      ? R2_PREFIXES.serviceOrderAttachments
      : prefix

    const allowedPrefixes = new Set<string>([
      R2_PREFIXES.serviceOrderAttachments,
      R2_PREFIXES.serviceOrderSignatures,
    ])
    if (!allowedPrefixes.has(normalizedPrefix)) {
      console.error("[getPresignedUploadUrlAction] Destino de upload inválido:", prefix)
      return { success: false, error: "Destino de upload inválido." }
    }
    const kind = getUploadKindFromMimeType(fileType)
    if (!kind || kind === "video") {
      return { success: false, error: "Este tipo de arquivo não é permitido em anexos de OS." }
    }
    if (!Number.isSafeInteger(fileSize) || fileSize < 1) {
      return { success: false, error: "Tamanho de arquivo inválido." }
    }
    const rules = getUploadValidationRules(kind)
    if (fileSize > rules.maxSize) {
      const maxMB = (rules.maxSize / (1024 * 1024)).toFixed(0)
      return { success: false, error: `Arquivo muito grande. Máximo: ${maxMB}MB.` }
    }
    const { validateUploadRequest } = await import("@/lib/security/file-validator")
    const validation = validateUploadRequest(fileName, fileType, fileSize)
    if (!validation.success) return { success: false, error: validation.error || "Arquivo inválido." }

    const result = await generateSignedUploadUrl({
      fileName,
      fileType,
      contentLength: fileSize,
      userId: user.id,
      prefix: normalizedPrefix,
      kind,
    })

    return {
      success: true,
      uploadUrl: result.uploadUrl,
      publicUrl: result.publicUrl,
      key: result.key,
    }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao gerar URL de upload" }
  }
}

export async function saveAttachmentAction(
  partnerId: string,
  serviceOrderId: string,
  fileKey: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  category?: "normal" | "antes" | "depois",
  fileHash?: string,
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()
    const supabase = await getSupabaseServerClient()
    const { data: serviceOrder } = await supabase
      .from("service_orders")
      .select("id, partner_id, store_id")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!serviceOrder) return { success: false, error: "Ordem de serviço não encontrada." }
    if (serviceOrder.store_id) {
      await requireStorePermission(serviceOrder.store_id, partnerId, "service_orders", "edit")
    }

    const { validateKeyOwnership } = await import("@/lib/r2/server")
    if (
      typeof fileKey !== "string" ||
      !validateKeyOwnership(fileKey, user.id) ||
      !new RegExp(`^users/${user.id}/service-orders/attachments/[^/]+$`).test(fileKey) ||
      fileKey.includes("..") ||
      fileKey.startsWith("/")
    ) {
      return { success: false, error: "Chave de arquivo inválida para este usuário." }
    }
    if (!Number.isSafeInteger(fileSize) || fileSize < 1) {
      return { success: false, error: "Tamanho de arquivo inválido." }
    }
    if (category !== undefined && !["normal", "antes", "depois"].includes(category)) {
      return { success: false, error: "Categoria de anexo inválida." }
    }
    const uploadKind = getUploadKindFromMimeType(fileType)
    if (!uploadKind || uploadKind === "video") {
      return { success: false, error: "Este tipo de arquivo não é permitido em anexos de OS." }
    }
    const { validateUploadRequest } = await import("@/lib/security/file-validator")
    const uploadValidation = validateUploadRequest(fileName, fileType, fileSize)
    if (!uploadValidation.success) {
      return { success: false, error: uploadValidation.error || "Arquivo inválido." }
    }

    // Enforce plan-based attachment count limits: Crescer (5 images, 5 docs), Escalar (15 images, 15 docs)
    const { getPartnerPlan } = await import("@/lib/services/subscription.service")
    const { getPlanImageAttachmentLimit } = await import("@/lib/subscription/plan-tier")
    const plan = await getPartnerPlan(partnerId)
    const limit = uploadKind === "image"
      ? getPlanImageAttachmentLimit(plan.slug)
      : plan.slug === "crescer" ? 5 : plan.slug === "escalar" ? 15 : 0
    if (limit === 0) {
      console.error("[saveAttachmentAction] Plano não permite anexos:", plan.slug)
      return { success: false, error: "Upload de anexos não permitido no seu plano. Faça upgrade para Crescer ou Escalar." }
    }

    const { verifyUploadedObject } = await import("@/lib/r2/server")
    const verified = await verifyUploadedObject(fileKey, fileSize, fileType, fileHash)
    const actualFileSize = verified.contentLength
    const finalHash = verified.sha256
    const actualValidation = validateUploadRequest(fileName, fileType, actualFileSize)
    if (!actualValidation.success) {
      return { success: false, error: actualValidation.error || "Arquivo excede os limites permitidos." }
    }

    // 2. Resolve safe Content-Type based on extension (ignore browser Content-Type)
    const extension = fileKey.substring(fileKey.lastIndexOf(".")).toLowerCase()
    const canonicalMime = Object.entries(ALL_MIME_TO_EXT).find(([_, ext]) => `.${ext}` === extension)?.[0]
    const validatedFileType = canonicalMime || "application/octet-stream"

    // 3. Save to database
    const { data: insertedRows, error } = await admin.rpc("register_service_order_attachment_atomic", {
      p_partner_id: partnerId,
      p_service_order_id: serviceOrderId,
      p_uploaded_by: user.id,
      p_file_key: fileKey,
      p_file_name: fileName,
      p_file_type: validatedFileType,
      p_file_size: actualFileSize,
      p_file_hash: finalHash,
      p_category: category || "normal",
      p_attachment_limit: limit,
    })

    if (error) throw error
    const data = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows
    if (!data) throw new Error("Não foi possível registrar o anexo.")

    // 4. Audit Log
    const { auditLog } = await import("@/lib/security/audit-logger")
    await auditLog({
      action: "document.uploaded",
      actorUserId: user.id,
      partnerId,
      metadata: {
        documentType: "Anexo de OS",
        fileName,
        fileSize,
        serviceOrderId,
        fileKey,
        fileHash: finalHash,
        fileType: validatedFileType,
      },
    })

    // 5. Timeline Audit Log (Service Order History)
    const { logAuditEvent } = await import("@/lib/services/timeline.service")
    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "service_order",
      entityId: serviceOrderId,
      actionType: "attachment_created",
      source: "manual",
      changeLines: [`Anexo adicionado: ${fileName}`],
    })

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data }
  } catch (err: any) {
    console.error("[saveAttachmentAction] Erro ao salvar anexo:", err)
    return { success: false, error: err.message || "Erro ao salvar anexo" }
  }
}

export async function getServiceOrderAttachmentUrlAction(
  partnerId: string,
  serviceOrderId: string,
  fileKey: string
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()
    const { data: serviceOrder } = await supabase
      .from("service_orders")
      .select("id, partner_id, store_id")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!serviceOrder) return { success: false, error: "Ordem de serviço não encontrada." }

    const { data: attachment } = await supabase
      .from("service_order_attachments")
      .select("id")
      .eq("service_order_id", serviceOrderId)
      .eq("file_key", fileKey)
      .maybeSingle()
    if (!attachment) return { success: false, error: "Anexo não encontrado nesta ordem de serviço." }

    if (serviceOrder.store_id) {
      await requireStorePermission(serviceOrder.store_id, partnerId, "service_orders", "view")
    } else {
      await requirePermission(partnerId, "service_orders", "view")
    }

    const { generateSignedDownloadUrl } = await import("@/lib/r2/server")
    const downloadUrl = await generateSignedDownloadUrl(fileKey)
    return { success: true, downloadUrl }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao obter URL de download" }
  }
}

export async function deleteAttachmentAction(
  partnerId: string,
  attachmentId: string,
  serviceOrderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: serviceOrder } = await supabase
      .from("service_orders")
      .select("id, partner_id, store_id")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!serviceOrder) return { success: false, error: "Ordem de serviço não encontrada." }
    if (serviceOrder.store_id) {
      await requireStorePermission(serviceOrder.store_id, partnerId, "service_orders", "edit")
    }

    const { data: attachment } = await supabase
      .from("service_order_attachments")
      .select("id, file_key, file_name")
      .eq("id", attachmentId)
      .eq("service_order_id", serviceOrderId)
      .single()

    if (!attachment) {
      return { success: false, error: "Anexo não encontrado nesta ordem de serviço." }
    }

    if (attachment.file_key) {
      const { deleteFileFromR2 } = await import("@/lib/r2/server")
      // Keep the database reference if storage deletion fails so the operation
      // can be retried and does not silently orphan the object.
      await deleteFileFromR2(attachment.file_key)
    }

    const admin = getAdminClient()
    const { error: deleteError } = await admin.from("service_order_attachments").delete().eq("id", attachmentId).eq("service_order_id", serviceOrderId)
    if (deleteError) throw deleteError

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "attachment_deleted", source: "manual",
      changeLines: [`Anexo removido: ${attachment.file_name || "Documento"}`],
    })

    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao remover anexo" }
  }
}

export async function deleteServiceOrderAction(
  partnerId: string,
  serviceOrderId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "delete")
    const user = await requireUser()
    const admin = getAdminClient()

    const { data: serviceOrder, error: serviceOrderError } = await admin
      .from("service_orders")
      .select("id, store_id, signature_image_key")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (serviceOrderError || !serviceOrder) {
      return { success: false, error: serviceOrderError?.message || "Ordem de serviço não encontrada." }
    }
    if (serviceOrder.store_id) {
      await requireStorePermission(serviceOrder.store_id, partnerId, "service_orders", "delete")
    }

    const { data: attachments, error: attachmentsError } = await admin
      .from("service_order_attachments")
      .select("file_key")
      .eq("service_order_id", serviceOrderId)
    if (attachmentsError) throw attachmentsError

    const fileKeys = Array.from(new Set([
      serviceOrder.signature_image_key,
      ...(attachments || []).map((attachment: any) => attachment.file_key),
    ].filter((key): key is string => typeof key === "string" && key.length > 0)))
    if (fileKeys.length) {
      const { deleteFileFromR2 } = await import("@/lib/r2/server")
      // Delete objects before cascading the attachment rows. On failure the OS
      // remains in the database so the cleanup can be retried.
      for (const key of fileKeys) await deleteFileFromR2(key)
    }

    const { error: deleteError } = await admin
      .from("service_orders")
      .delete()
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
    if (deleteError) throw deleteError

    await logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: "deleted", source: "manual",
      changeLines: ["OS deletada"],
    })

    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao deletar OS" }
  }
}

export async function bulkUpdateServiceOrderStatusAction(
  partnerId: string,
  serviceOrderIds: string[],
  status: string,
  changeReason?: string,
): Promise<
  | { success: true; updated: number; skipped: number; failed: { id: string; error: string }[] }
  | { success: false; error: string }
> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const admin = getAdminClient()

    const ids = Array.from(new Set((serviceOrderIds || []).filter(Boolean)))
    if (ids.length === 0) return { success: true, updated: 0, skipped: 0, failed: [] }
    if (!isServiceOrderStatus(status)) {
      throw new Error("Status inválido para ordem de serviço.")
    }

    const { data: rows, error } = await admin
      .from("service_orders")
      .select("id, status, completed_at")
      .eq("partner_id", partnerId)
      .in("id", ids)
    if (error) throw error

    const rowsById = new Map<string, any>((rows || []).map((r: any) => [r.id, r]))
    const failed: { id: string; error: string }[] = []
    let skipped = 0
    const toComplete: string[] = []
    const toClearCompletedAt: string[] = []
    const plain: string[] = []

    for (const id of ids) {
      const current = rowsById.get(id)
      if (!current) {
        failed.push({ id, error: "OS não encontrada" })
        continue
      }
      const currentStatus = current.status as ServiceOrderStatus
      if (status === currentStatus || !isValidServiceOrderTransition(currentStatus, status)) {
        skipped++
        continue
      }
      if ((status === "concluida" || status === "entregue") && !current.completed_at) toComplete.push(id)
      else if ((currentStatus === "concluida" || currentStatus === "entregue") && (status !== "concluida" && status !== "entregue")) toClearCompletedAt.push(id)
      else plain.push(id)
    }

    const applyUpdate = async (targetIds: string[], extra: Record<string, any>) => {
      if (targetIds.length === 0) return
      const { error: uErr } = await admin
        .from("service_orders")
        .update({ status, ...extra })
        .eq("partner_id", partnerId)
        .in("id", targetIds)
      if (uErr) targetIds.forEach((id) => failed.push({ id, error: uErr.message }))
    }

    await Promise.all([
      applyUpdate(plain, {}),
      applyUpdate(toComplete, { completed_at: new Date().toISOString() }),
      applyUpdate(toClearCompletedAt, { completed_at: null }),
    ])

    const updatedIds = [...plain, ...toComplete, ...toClearCompletedAt]
    const updated = updatedIds.length

    if (updated > 0) {
      void logAuditEvent({
        partnerId, actorUserId: user.id,
        entityType: "service_order", entityId: updatedIds[0],
        actionType: "status_changed", source: "manual",
        changeLines: [
          `Status em lote → ${SERVICE_ORDER_STATUS_META[status as ServiceOrderStatus]?.label || status} (${updated} OS)`,
          ...(changeReason?.trim() ? [`Motivo: ${changeReason.trim()}`] : []),
        ],
      }).catch(() => { })
    }

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, updated, skipped, failed }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar status em lote" }
  }
}

export async function bulkDeleteServiceOrderAction(
  partnerId: string,
  serviceOrderIds: string[],
): Promise<{ success: true; deleted: number } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "delete")
    const user = await requireUser()
    const admin = getAdminClient()

    const ids = Array.from(new Set((serviceOrderIds || []).filter(Boolean)))
    if (ids.length === 0) return { success: true, deleted: 0 }

    const { data, error } = await admin
      .from("service_orders")
      .delete()
      .eq("partner_id", partnerId)
      .in("id", ids)
      .select("id")
    if (error) throw error

    const deleted = data?.length || 0
    if (deleted > 0) {
      void logAuditEvent({
        partnerId, actorUserId: user.id,
        entityType: "service_order", entityId: (data as any[])[0].id,
        actionType: "deleted", source: "manual",
        changeLines: [`${deleted} OS deletada(s) em lote`],
      }).catch(() => { })
    }

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, deleted }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao deletar OS em lote" }
  }
}

async function recalcTotals(admin: any, serviceOrderId: string) {
  // Recalcula totais da OS (e ressincroniza order_items/orders) em um único
  // round-trip set-based no banco. Ver migration 20261017_service_orders_perf.sql.
  const { error } = await admin.rpc("recalc_service_order_totals", {
    p_service_order_id: serviceOrderId,
  })
  if (error) {
    console.error("[recalcTotals] rpc error:", error)
  }

  // Garante que a situação do pedido vinculado permaneça alinhada com o novo total
  try {
    const { data: so } = await admin
      .from("service_orders")
      .select("id, order_id, total_amount, paid_amount, payment_status")
      .eq("id", serviceOrderId)
      .single()

    if (so?.order_id) {
      const { data: order } = await admin
        .from("orders")
        .select("id, paid_amount, total_amount, situation")
        .eq("id", so.order_id)
        .single()

      if (order) {
        const paid = Number(order.paid_amount || 0)
        const total = Number(order.total_amount || 0)
        let nextSituation = order.situation
        if (paid >= total - 0.005 && total > 0) {
          nextSituation = "paid"
        } else if (paid > 0.005) {
          nextSituation = "partially_paid"
        } else if (order.situation === "paid" || order.situation === "partially_paid") {
          nextSituation = "pending"
        }

        if (nextSituation !== order.situation) {
          await admin
            .from("orders")
            .update({ situation: nextSituation })
            .eq("id", order.id)
        }
      }
    }
  } catch (syncErr) {
    console.error("[recalcTotals] error syncing order situation:", syncErr)
  }
}

export async function ensurePublicTokenAction(partnerId: string, serviceOrderId: string): Promise<string | null> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    if (!rl.success) return null

    const user = await requireUser()
    await requirePermission(partnerId, "service_orders", "edit", user)
    const { getPartnerPlan } = await import("@/lib/services/subscription.service")
    const plan = await getPartnerPlan(partnerId)
    if (!hasMinimumPlan(plan?.slug || "free", "crescer")) return null

    const admin = getAdminClient()
    const { data, error } = await admin
      .from("service_orders")
      .select("public_token, store_id")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (error || !data) return null
    if (data.store_id) {
      await requireStorePermission(data.store_id, partnerId, "service_orders", "edit")
    }
    if (data?.public_token) return data.public_token

    const newToken = generateShortId()
    const { data: updated, error: updateError } = await admin
      .from("service_orders")
      .update({ public_token: newToken })
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .is("public_token", null)
      .select("public_token")
      .maybeSingle()
    if (updateError) return null
    if (updated?.public_token) return updated.public_token

    // Concurrent requests can both observe a missing token. Return the token
    // that won the conditional update instead of publishing an unused value.
    const { data: raced } = await admin
      .from("service_orders")
      .select("public_token")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    return raced?.public_token || null
  } catch {
    return null
  }
}

export async function getServiceOrderByTokenAction(
  token: string,
): Promise<{ success: true; data: { serviceOrder: any; services: any[]; products: any[]; attachments: any[]; history: any[]; sale: any } } | { success: false; error: string }> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.SERVICE_ORDER_PUBLIC)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Tente novamente em breve." }
    }
    const cleanToken = String(token || "").trim()
    if (!cleanToken || cleanToken.length < 6) {
      return { success: false, error: "Token inválido ou ordem de serviço não encontrada" }
    }

    const admin = getAdminClient()

    let { data: row, error } = await admin
      .from("service_orders")
      .select(`
        id, store_id, customer_id, order_number, status, title, description, diagnosis, expected_completion_date, completed_at,
        total_service_amount, total_product_amount, total_amount, signature_image_key, signed_at,
        customer_snapshot, created_at, created_by, sale_id, specifications, metadata, lockout_until, partner_id, assigned_user_id,
        public_token, payment_status, paid_amount, payment_method, priority, estimated_hours, expected_completion_time,
        stores!left (
          id, name, logo_url, phone
        )
      `)
      .eq("public_token", cleanToken)
      .maybeSingle()

    if (!row) {
      // 1. Tenta buscar por prefixo de versão mais recente (ex: token original sendo acessado após virar _v2)
      const cleanBase = cleanToken.replace(/_v\d+$/i, "")
      const { data: byPrefix } = await admin
        .from("service_orders")
        .select(`
          id, store_id, customer_id, order_number, status, title, description, diagnosis, expected_completion_date, completed_at,
          total_service_amount, total_product_amount, total_amount, signature_image_key, signed_at,
          customer_snapshot, created_at, created_by, sale_id, specifications, metadata, lockout_until, partner_id, assigned_user_id,
          public_token, payment_status, paid_amount, payment_method, priority, estimated_hours, expected_completion_time,
          stores!left (
            id, name, logo_url, phone
          )
        `)
        .ilike("public_token", `${cleanBase}_v%`)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (byPrefix) {
        row = byPrefix
      } else {
        // 2. Tenta buscar por histórico no array metadata->previous_tokens
        const { data: byHistory } = await admin
          .from("service_orders")
          .select(`
            id, store_id, customer_id, order_number, status, title, description, diagnosis, expected_completion_date, completed_at,
            total_service_amount, total_product_amount, total_amount, signature_image_key, signed_at,
            customer_snapshot, created_at, created_by, sale_id, specifications, metadata, lockout_until, partner_id, assigned_user_id,
            public_token, payment_status, paid_amount, payment_method, priority, estimated_hours, expected_completion_time,
            stores!left (
              id, name, logo_url, phone
            )
          `)
          .contains("metadata", { previous_tokens: [cleanToken] })
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()

        if (byHistory) {
          row = byHistory
        }
      }
    }

    if (!row) {
      return { success: false, error: "Ordem de serviço não encontrada" }
    }

    const fetchAddress = async () => {
      if (row.store_id) {
        const { data } = await admin.from("addresses").select("street, number, complement, neighborhood, city, state, zip_code, is_default").eq("store_id", row.store_id)
        if (data && data.length > 0) return { data }
      }
      if (row.partner_id) {
        const { data } = await admin.from("addresses").select("street, number, complement, neighborhood, city, state, zip_code, is_default").eq("partner_id", row.partner_id).order("is_default", { ascending: false })
        if (data && data.length > 0) return { data }
      }
      if (row.partner_id) {
        const { data: stores } = await admin.from("stores").select("id").eq("partner_id", row.partner_id)
        const sIds = (stores || []).map((s: any) => s.id)
        if (sIds.length > 0) {
          const { data } = await admin.from("addresses").select("street, number, complement, neighborhood, city, state, zip_code, is_default").in("store_id", sIds)
          if (data && data.length > 0) return { data }
        }
      }
      return { data: [] }
    }

    const [services, products, attachments, historyRes, saleRes, addressRes] = await Promise.all([
      admin.from("service_order_services").select("*").eq("service_order_id", row.id).order("sort_order"),
      admin.from("service_order_products").select("*").eq("service_order_id", row.id).order("sort_order"),
      admin.from("service_order_attachments").select("file_name, file_key, file_type, file_size, category, created_at").eq("service_order_id", row.id).order("created_at", { ascending: false }),
      admin.from("audit_logs").select("id, action_type, change_lines, created_at").eq("entity_type", "service_order").eq("entity_id", row.id).order("created_at", { ascending: false }).limit(50),
      row.sale_id ? admin.from("sales").select("id, sale_number, total_amount, discount_amount, final_amount, paid_amount, payment_status, status, created_at").eq("id", row.sale_id).single() : Promise.resolve({ data: null }),
      fetchAddress(),
    ])

    let resolvedCustomer = row.customer_snapshot
    if (typeof resolvedCustomer === "string") {
      try {
        resolvedCustomer = JSON.parse(resolvedCustomer)
      } catch {
        resolvedCustomer = null
      }
    }

    // Consultas independentes resolvidas em paralelo (latência pública)
    const snapshotHasData = !!(resolvedCustomer && (resolvedCustomer as any).name)
    const snapshotHasAddresses = Array.isArray((resolvedCustomer as any)?.addresses) && (resolvedCustomer as any).addresses.length > 0
    const needsCustomerLookup = (!snapshotHasData || !snapshotHasAddresses) && !!row.customer_id
    const storeObjFromJoin = row.stores ? (Array.isArray(row.stores) ? row.stores[0] : row.stores) : null
    const [{ getPartnerPlan }, dbCustomerRes, assignedProfileRes, storeFallbackRes] = await Promise.all([
      import("@/lib/services/subscription.service"),
      needsCustomerLookup
        ? admin.from("customers").select("id, name, email, phone, document, image_url, avatar_url, addresses(*)").eq("id", row.customer_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      row.assigned_user_id
        ? admin.from("user_profiles").select("full_name").eq("user_id", row.assigned_user_id).maybeSingle()
        : Promise.resolve({ data: null } as any),
      !storeObjFromJoin && row.partner_id
        ? admin.from("stores").select("id, name, logo_url, phone").eq("partner_id", row.partner_id).order("is_headquarters", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ])

    if (dbCustomerRes?.data) {
      resolvedCustomer = dbCustomerRes.data
    }

    const customerName = resolvedCustomer?.name || (row.customer_snapshot as any)?.name || null

    let specifications = row.specifications
    if (typeof specifications === "string") {
      try {
        specifications = JSON.parse(specifications)
      } catch {
        specifications = []
      }
    }

    const plan = await getPartnerPlan(row.partner_id)
    const planTier = plan?.slug || "free"

    const assignedUserName = assignedProfileRes?.data?.full_name || null

    const storeObj = storeObjFromJoin || storeFallbackRes?.data || null

    const addressesList = addressRes.data || []
    const addressRow = addressesList.find((a: any) => a.is_default) || addressesList[0]
    let partnerAddress = "Endereço não cadastrado"
    if (addressRow) {
      const streetNumber = [addressRow.street, addressRow.number].filter(Boolean).join(", ")
      const neighborhoodCityState = [addressRow.neighborhood, [addressRow.city, addressRow.state].filter(Boolean).join("/")].filter(Boolean).join(" - ")
      partnerAddress = [streetNumber, neighborhoodCityState].filter(Boolean).join("\n")
    }

    const resolvedPartnerName = storeObj?.name || "Parceiro"
    const resolvedPartnerLogo = storeObj?.logo_url || null
    const resolvedPartnerPhone = storeObj?.phone || ""

    // Portal público: cliente com dados COMPLETOS (endereço, contato, telefone
    // e documento sem máscara). O aprovador é exibido mascarado.
    const customerForPortal = resolvedCustomer || null

    let canDirectSign = false
    try {
      const { getCurrentUser } = await import("@/lib/auth/server-user")
      const loggedUser = await getCurrentUser()
      if (loggedUser) {
        const { data: partnerUser } = await admin
          .from("partner_users")
          .select("role")
          .eq("partner_id", row.partner_id)
          .eq("user_id", loggedUser.id)
          .maybeSingle()

        const { data: partnerOwner } = await admin
          .from("partners")
          .select("id")
          .eq("id", row.partner_id)
          .eq("user_id", loggedUser.id)
          .maybeSingle()

        const isErpMember = Boolean(
          partnerOwner ||
          partnerUser ||
          (row.assigned_user_id && row.assigned_user_id === loggedUser.id) ||
          (row.created_by && row.created_by === loggedUser.id)
        )

        const rawCustomerEmail = (resolvedCustomer as any)?.email || null
        if (isErpMember) {
          canDirectSign = true
        } else if (rawCustomerEmail && loggedUser.email && loggedUser.email.toLowerCase() === rawCustomerEmail.toLowerCase()) {
          canDirectSign = true
        }
      }
    } catch {
      // User not authenticated or session error
    }

    const safeMetadata = { ...(row.metadata || {}) }
    delete safeMetadata.plain_code

    const approverName = typeof safeMetadata.approver_name === "string" ? safeMetadata.approver_name : null
    const approvedAt = typeof safeMetadata.approved_at === "string" ? safeMetadata.approved_at : null

    const serviceOrder = {
      id: row.id,
      partner_id: row.partner_id,
      customer_id: row.customer_id || null,
      order_number: row.order_number,
      status: row.status,
      title: row.title,
      description: row.description,
      diagnosis: row.diagnosis,
      expected_completion_date: row.expected_completion_date,
      completed_at: row.completed_at,
      created_at: row.created_at,
      total_service_amount: row.total_service_amount,
      total_product_amount: row.total_product_amount,
      total_amount: row.total_amount,
      signature_image_key: row.signature_image_key,
      signed_at: row.signed_at,
      customer_name: customerName,
      customer_snapshot: customerForPortal,
      sale_id: row.sale_id,
      specifications,
      metadata: safeMetadata,
      lockout_until: row.lockout_until,
      assigned_user_name: assignedUserName,
      public_token: row.public_token,
      payment_status: row.payment_status,
      paid_amount: row.paid_amount,
      payment_method: row.payment_method,
      priority: row.priority,
      estimated_hours: row.estimated_hours,
      expected_completion_time: row.expected_completion_time,
      can_direct_sign: canDirectSign,
      approver_name: maskPersonName(approverName),
      approved_at: approvedAt,
      partners: {
        name: resolvedPartnerName,
        logo_url: resolvedPartnerLogo,
        phone: resolvedPartnerPhone,
        address: partnerAddress,
        plan_tier: planTier,
      },
    }

    return {
      success: true,
      data: {
        serviceOrder,
        services: services.data || [],
        products: products.data || [],
        attachments: attachments.data || [],
        history: historyRes.data || [],
        sale: saleRes?.data || null,
      },
    }
  } catch (err: any) {
    console.error("Error in getServiceOrderByTokenAction:", err)
    return { success: false, error: err.message || "Ordem de serviço não encontrada" }
  }
}

function buildServiceOrderItemDiff(
  oldServices: any[],
  newServices: any[] | undefined,
  oldProducts: any[],
  newProducts: any[] | undefined,
): string[] {
  const lines: string[] = []

  if (newServices !== undefined) {
    const oldSvcMap = new Map<string, { name: string; price: number; qty: number }>()
    for (const s of oldServices) {
      const key = s.service_id ? `id:${s.service_id}` : `name:${(s.service_name || "").toLowerCase().trim()}`
      oldSvcMap.set(key, {
        name: s.service_name || "Serviço",
        price: Number(s.service_price || 0),
        qty: Number(s.quantity || 1),
      })
    }

    const newSvcMap = new Map<string, { name: string; price: number; qty: number }>()
    for (const s of newServices) {
      const name = s.service_name || "Serviço avulso"
      const key = s.service_id ? `id:${s.service_id}` : `name:${name.toLowerCase().trim()}`
      const price = Number(s.service_price !== undefined ? s.service_price : 0)
      const qty = Number(s.quantity || 1)
      newSvcMap.set(key, { name, price, qty })

      const oldS = oldSvcMap.get(key)
      if (!oldS) {
        lines.push(`Adicionou serviço: ${name} (${qty}x ${formatCurrency(price)})`)
      } else {
        if (oldS.qty !== qty) {
          lines.push(`Alterou quantidade do serviço ${name}: ${oldS.qty} -> ${qty}`)
        }
        if (Math.abs(oldS.price - price) > 0.009) {
          lines.push(`Alterou valor do serviço ${name}: ${formatCurrency(oldS.price)} -> ${formatCurrency(price)}`)
        }
      }
    }

    for (const [key, oldS] of oldSvcMap.entries()) {
      if (!newSvcMap.has(key)) {
        lines.push(`Removeu serviço: ${oldS.name} (${oldS.qty}x)`)
      }
    }
  }

  if (newProducts !== undefined) {
    const oldProdMap = new Map<string, { name: string; price: number; qty: number }>()
    for (const p of oldProducts) {
      const key = p.product_id
        ? (p.variant_id ? `v:${p.variant_id}` : `p:${p.product_id}`)
        : `name:${(p.product_name || "").toLowerCase().trim()}`
      oldProdMap.set(key, {
        name: p.product_name || "Produto",
        price: Number(p.unit_price || 0),
        qty: Number(p.quantity || 1),
      })
    }

    const newProdMap = new Map<string, { name: string; price: number; qty: number }>()
    for (const p of newProducts) {
      const name = p.product_name || "Produto avulso"
      const key = p.product_id
        ? (p.variant_id ? `v:${p.variant_id}` : `p:${p.product_id}`)
        : `name:${name.toLowerCase().trim()}`
      const price = Number(p.unit_price !== undefined ? p.unit_price : 0)
      const qty = Number(p.quantity || 1)
      newProdMap.set(key, { name, price, qty })

      const oldP = oldProdMap.get(key)
      if (!oldP) {
        lines.push(`Adicionou produto: ${name} (${qty}x ${formatCurrency(price)})`)
      } else {
        if (oldP.qty !== qty) {
          lines.push(`Alterou quantidade do produto ${name}: ${oldP.qty} -> ${qty}`)
        }
        if (Math.abs(oldP.price - price) > 0.009) {
          lines.push(`Alterou valor do produto ${name}: ${formatCurrency(oldP.price)} -> ${formatCurrency(price)}`)
        }
      }
    }

    for (const [key, oldP] of oldProdMap.entries()) {
      if (!newProdMap.has(key)) {
        lines.push(`Removeu produto: ${oldP.name} (${oldP.qty}x)`)
      }
    }
  }

  return lines
}

export async function updateServiceOrderAction(
  partnerId: string,
  serviceOrderId: string,
  input: {
    store_id?: string
    title?: string
    description?: string
    diagnosis?: string
    internal_notes?: string
    customer_id?: string | null
    expected_completion_date?: string | null
    assigned_user_id?: string | null
    status?: string
    priority?: string
    estimated_hours?: number | null
    expected_completion_time?: string | null
    discount_value?: number
    discount_type?: string
    coupon_id?: string | null
    coupon_code?: string | null
    coupon_discount_amount?: number
    other_costs?: number
    payment_status?: string
    paid_amount?: number
    payment_method?: string | null
    payment_breakdown?: any
    created_at?: string | null
    specifications?: { name: string; value: string }[]
    services?: Array<{ service_id: string | null; service_name?: string; service_price?: number; quantity?: number }>
    products?: Array<{ product_id: string | null; variant_id?: string | null; product_name?: string; unit_price?: number; quantity?: number }>
    generate_store_credit?: boolean
  },
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    const [user] = await Promise.all([
      requireUser(),
      requirePermission(partnerId, "service_orders", "edit"),
    ])
    const admin = getAdminClient()

    const { data: current, error: getErr } = await admin
      .from("service_orders")
      .select(`
        id, store_id, title, description, diagnosis, status, payment_status,
        paid_amount, total_amount, completed_at, order_number, public_token,
        metadata, order_id, customer_id, discount_value, discount_type,
        coupon_id, coupon_code, coupon_discount_amount, other_costs, specifications
      `)
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .single()

    if (getErr || !current) throw new Error("Ordem de serviço não encontrada")

    const [existingServicesRes, existingProductsRes] = await Promise.all([
      admin.from("service_order_services").select("*").eq("service_order_id", serviceOrderId).order("sort_order"),
      admin.from("service_order_products").select("*").eq("service_order_id", serviceOrderId).order("sort_order"),
    ])
    const existingServices = existingServicesRes.data || []
    const existingProducts = existingProductsRes.data || []

    const policy = getServiceOrderEditPolicy(current.status as ServiceOrderStatus)

    const assignmentProvided =
      input.expected_completion_date !== undefined ||
      input.assigned_user_id !== undefined ||
      input.priority !== undefined ||
      input.estimated_hours !== undefined ||
      input.expected_completion_time !== undefined

    if (!policy.canChangeStatus && input.status !== undefined && input.status !== current.status) {
      throw new Error("Não é possível alterar o status desta ordem de serviço.")
    }
    if (!policy.canEditAssignment && assignmentProvided) {
      throw new Error("Esta ordem de serviço não permite alterar responsável, previsão ou prioridade neste status.")
    }
    if (!policy.canEditAll && (
      input.store_id !== undefined ||
      input.customer_id !== undefined ||
      input.created_at !== undefined
    )) {
      throw new Error("Esta ordem de serviço não permite alterar cliente ou loja neste status.")
    }
    if (!policy.canEditItems && (input.services !== undefined || input.products !== undefined)) {
      throw new Error("Não é possível alterar os itens desta ordem de serviço neste status.")
    }
    if (!policy.canEditSpecs && input.specifications !== undefined) {
      throw new Error("Não é possível alterar as especificações desta ordem de serviço neste status.")
    }
    if (!policy.canEditNotes && input.internal_notes !== undefined) {
      throw new Error("Não é possível alterar as observações desta ordem de serviço neste status.")
    }
    if (!policy.canEditDiagnosis && input.diagnosis !== undefined) {
      throw new Error("Não é possível alterar o diagnóstico desta ordem de serviço neste status.")
    }
    if (!policy.canEditFinancial && (
      input.discount_value !== undefined ||
      input.discount_type !== undefined ||
      input.coupon_id !== undefined ||
      input.coupon_code !== undefined ||
      input.coupon_discount_amount !== undefined ||
      input.other_costs !== undefined
    )) {
      throw new Error("Não é possível alterar valores ou descontos desta ordem de serviço neste status.")
    }

    const itemDiffLines = buildServiceOrderItemDiff(
      existingServices,
      input.services,
      existingProducts,
      input.products,
    )

    const diagnosisChanged = input.diagnosis !== undefined && input.diagnosis.trim() !== (current.diagnosis || "").trim()
    const specsChanged = input.specifications !== undefined && JSON.stringify(input.specifications) !== JSON.stringify(current.specifications || [])
    const discountChanged =
      (input.discount_value !== undefined && Number(input.discount_value) !== Number(current.discount_value || 0)) ||
      (input.discount_type !== undefined && input.discount_type !== current.discount_type) ||
      (input.coupon_id !== undefined && input.coupon_id !== current.coupon_id) ||
      (input.other_costs !== undefined && Number(input.other_costs) !== Number(current.other_costs || 0)) ||
      (input.coupon_discount_amount !== undefined && Number(input.coupon_discount_amount) !== Number(current.coupon_discount_amount || 0))

    const scopeOrItemsChanged = itemDiffLines.length > 0 || diagnosisChanged || specsChanged || discountChanged

    const wasApproved = current.status === "aprovada"
    const explicitStatusChange = input.status !== undefined && input.status !== current.status
    const shouldTriggerReapproval = wasApproved && scopeOrItemsChanged && !explicitStatusChange

    const updateData: any = {}
    if (input.store_id !== undefined) {
      if (input.store_id !== current.store_id) {
        await requireStoreAccess(input.store_id, partnerId)
      }
      updateData.store_id = input.store_id
    }
    if (input.title !== undefined) updateData.title = sanitizeInput(input.title, 150)
    if (input.description !== undefined) updateData.description = sanitizeNotes(input.description)
    if (input.diagnosis !== undefined) updateData.diagnosis = sanitizeNotes(input.diagnosis)
    if (input.internal_notes !== undefined) updateData.internal_notes = sanitizeNotes(input.internal_notes)
    if (input.customer_id !== undefined) {
      const customerId = input.customer_id || null
      updateData.customer_id = customerId
      updateData.customer_snapshot = customerId ? await getCustomerSnapshot(admin, customerId, partnerId) : null
    }
    if (input.expected_completion_date !== undefined) updateData.expected_completion_date = input.expected_completion_date
    if (input.assigned_user_id !== undefined) updateData.assigned_user_id = input.assigned_user_id

    // Status handling
    if (shouldTriggerReapproval) {
      updateData.status = "aguardando_aprovacao"
      updateData.completed_at = null

      // Versioning
      const currentVersion = Number((current.metadata as any)?.version || 1)
      const nextVersion = currentVersion + 1

      const baseToken = current.public_token || generateShortId()
      const cleanBase = baseToken.replace(/_v\d+$/i, "")
      const newToken = `${cleanBase}_v${nextVersion}`
      updateData.public_token = newToken

      const prevTokens = Array.isArray((current.metadata as any)?.previous_tokens)
        ? [...(current.metadata as any).previous_tokens]
        : []
      if (current.public_token && !prevTokens.includes(current.public_token)) {
        prevTokens.push(current.public_token)
      }

      // Generate new approval code
      const crypto = await import("crypto")
      const plainCode = crypto.randomInt(1000, 10000).toString()
      const salt = crypto.randomBytes(16).toString("hex")
      const hash = crypto.createHash("sha256").update(salt + plainCode).digest("hex")

      updateData.approval_code_salt = salt
      updateData.approval_code_hash = hash
      updateData.failed_attempts = 0
      updateData.lockout_until = null
      updateData.lockout_count = 0

      const approvalHistory = Array.isArray((current.metadata as any)?.approval_history)
        ? [...(current.metadata as any).approval_history]
        : []
      if ((current.metadata as any)?.approved_at) {
        approvalHistory.push({
          version: currentVersion,
          approved_at: (current.metadata as any).approved_at,
          approver_name: (current.metadata as any).approver_name || "Cliente",
        })
      }

      const nextMetadata = {
        ...((current.metadata as any) || {}),
        version: nextVersion,
        plain_code: plainCode,
        previous_tokens: prevTokens,
        approval_history: approvalHistory,
      }
      delete nextMetadata.approved_at
      delete nextMetadata.approver_name
      updateData.metadata = nextMetadata
    } else if (input.status !== undefined) {
      if (!isServiceOrderStatus(input.status)) {
        throw new Error("Status inválido para ordem de serviço.")
      }
      if (input.status !== current.status) {
        if (!isValidServiceOrderTransition(current.status as ServiceOrderStatus, input.status)) {
          const fromLabel = SERVICE_ORDER_STATUS_META[current.status as ServiceOrderStatus]?.label || current.status
          const toLabel = SERVICE_ORDER_STATUS_META[input.status]?.label || input.status
          throw new Error(`Transição de status inválida: ${fromLabel} → ${toLabel}.`)
        }
        updateData.status = input.status
        const isInputCompleted = input.status === "concluida" || input.status === "entregue"
        if (isInputCompleted && !current.completed_at) {
          updateData.completed_at = new Date().toISOString()
        }
        if ((current.status === "concluida" || current.status === "entregue") && !isInputCompleted) {
          updateData.completed_at = null
        }
      }
    }

    if (input.priority !== undefined) updateData.priority = input.priority
    if (input.estimated_hours !== undefined) updateData.estimated_hours = input.estimated_hours
    if (input.expected_completion_time !== undefined) updateData.expected_completion_time = input.expected_completion_time
    if (input.discount_value !== undefined) updateData.discount_value = input.discount_value
    if (input.discount_type !== undefined) updateData.discount_type = input.discount_type
    if (input.coupon_id !== undefined) updateData.coupon_id = input.coupon_id
    if (input.coupon_code !== undefined) updateData.coupon_code = input.coupon_code
    if (input.coupon_discount_amount !== undefined) updateData.coupon_discount_amount = input.coupon_discount_amount
    if (input.other_costs !== undefined) updateData.other_costs = input.other_costs
    if (input.payment_status !== undefined) updateData.payment_status = input.payment_status
    if (input.paid_amount !== undefined) updateData.paid_amount = input.paid_amount
    if (input.payment_method !== undefined) updateData.payment_method = input.payment_method
    if (input.payment_breakdown !== undefined) {
      updateData.payment_breakdown = input.payment_breakdown ? JSON.stringify(input.payment_breakdown) : null
    }
    if (input.created_at !== undefined) updateData.created_at = input.created_at
    if (input.specifications !== undefined) updateData.specifications = input.specifications && input.specifications.length > 0 ? input.specifications : null

    // Sync services if provided
    if (input.services !== undefined) {
      await admin.from("service_order_services").delete().eq("service_order_id", serviceOrderId)
      if (input.services.length > 0) {
        const serviceItems = input.services.map((s, idx) => {
          const price = Number(s.service_price !== undefined ? s.service_price : 0)
          const qty = Number(s.quantity || 1)
          return {
            service_order_id: serviceOrderId,
            service_id: s.service_id || null,
            service_name: s.service_name || "Serviço avulso",
            service_price: price,
            quantity: qty,
            total_price: price * qty,
            sort_order: idx,
          }
        })
        await admin.from("service_order_services").insert(serviceItems)
      }
    }

    // Sync products if provided
    if (input.products !== undefined) {
      await admin.from("service_order_products").delete().eq("service_order_id", serviceOrderId)
      if (input.products.length > 0) {
        const productItems = input.products.map((p, idx) => {
          const price = Number(p.unit_price !== undefined ? p.unit_price : 0)
          const qty = Number(p.quantity || 1)
          return {
            service_order_id: serviceOrderId,
            product_id: p.product_id || null,
            variant_id: p.variant_id || null,
            product_name: p.product_name || "Produto avulso",
            unit_price: price,
            quantity: qty,
            total_price: price * qty,
            sort_order: idx,
          }
        })
        await admin.from("service_order_products").insert(productItems)
        void logStockShortagesForServiceOrder(partnerId, serviceOrderId, input.products)
      }
    }

    const { data, error } = await admin
      .from("service_orders")
      .update(updateData)
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .select("*")
      .single()

    if (error) throw error

    // Recalculate totals
    const totalsChanged =
      input.services !== undefined ||
      input.products !== undefined ||
      input.discount_value !== undefined ||
      input.discount_type !== undefined ||
      input.coupon_discount_amount !== undefined ||
      input.other_costs !== undefined

    if (totalsChanged) {
      await recalcTotals(admin, serviceOrderId)
    }

    // Build audit changes
    const changes: string[] = []
    if (input.title && input.title !== current.title) changes.push(`Título: "${current.title}" -> "${input.title}"`)
    if (diagnosisChanged) changes.push(`Diagnóstico alterado`)
    if (specsChanged) changes.push(`Especificações atualizadas`)
    if (itemDiffLines.length > 0) changes.push(...itemDiffLines)
    if (discountChanged) changes.push(`Valores/descontos atualizados`)
    if (input.store_id && input.store_id !== current.store_id) changes.push(`Loja alterada`)

    if (shouldTriggerReapproval) {
      const nextVersion = Number(updateData.metadata?.version || 2)
      changes.push(`OS revisada após aprovação prévia. Status retornado para Aguardando Aprovação (Versão ${nextVersion}). Novo código de aprovação gerado.`)
    } else if (input.status && input.status !== current.status) {
      changes.push(`Status: "${current.status}" -> "${input.status}"`)
    }

    // Handle excess payment & store credit
    try {
      const { data: updatedOS } = await admin
        .from("service_orders")
        .select("id, total_amount, paid_amount, payment_status, customer_id, order_number, order_id")
        .eq("id", serviceOrderId)
        .single()

      const newTotal = Number(updatedOS?.total_amount || 0)
      const paidAmount = Number(current.paid_amount || 0)
      const excessAmount = Number(Math.max(0, paidAmount - newTotal).toFixed(2))

      if (excessAmount > 0.009 && current.customer_id) {
        const isFullyPaid = current.payment_status === "paid"
        const shouldGenerateStoreCredit =
          input.generate_store_credit === true ||
          (isFullyPaid && input.generate_store_credit !== false)

        if (shouldGenerateStoreCredit) {
          await admin.from("store_credits").insert({
            partner_id: partnerId,
            customer_id: current.customer_id,
            amount: excessAmount,
            remaining_amount: excessAmount,
            status: "ACTIVE",
            created_by: user.id,
            metadata: {
              source: "service_order_reduction",
              service_order_id: serviceOrderId,
              order_number: current.order_number,
              description: `Crédito em loja gerado pela redução de valor na OS #${current.order_number}`,
            },
          })

          const { data: custRow } = await admin
            .from("customers")
            .select("store_credit")
            .eq("id", current.customer_id)
            .single()
          const currentCustCredit = Number(custRow?.store_credit || 0)
          await admin
            .from("customers")
            .update({ store_credit: Number((currentCustCredit + excessAmount).toFixed(2)) })
            .eq("id", current.customer_id)

          if (current.order_id) {
            await admin
              .from("orders")
              .update({ paid_amount: newTotal, situation: "paid" })
              .eq("id", current.order_id)
          }
          await admin
            .from("service_orders")
            .update({ paid_amount: newTotal, payment_status: "paid" })
            .eq("id", serviceOrderId)

          changes.push(`Gerou Crédito em Loja de ${formatCurrency(excessAmount)} para o cliente devido à redução de valor na OS`)
        } else {
          changes.push(`Redução de valor da OS com saldo excedente de ${formatCurrency(excessAmount)} a ser acertado na finalização`)
        }
      }
    } catch (creditErr) {
      console.error("[updateServiceOrderAction] store credit error:", creditErr)
    }

    const updatedStoreId = data.store_id || current.store_id
    void logAuditEvent({
      partnerId, actorUserId: user.id,
      entityType: "service_order", entityId: serviceOrderId,
      actionType: shouldTriggerReapproval ? "revised_for_approval" : "updated",
      source: "manual",
      changeLines: changes.length > 0 ? changes : ["Dados da OS atualizados"],
      metadata: { storeId: updatedStoreId, partnerId, userId: user.id, serviceOrderId },
    }).catch(e => console.error("[updateServiceOrderAction] audit log error:", e))

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao atualizar ordem de serviço" }
  }
}

export async function syncServiceOrderServicesAction(
  partnerId: string,
  serviceOrderId: string,
  services: { service_id: string | null; service_name?: string; service_price?: number; quantity: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }

    // 1. Delete all existing services
    const { error: delErr } = await admin
      .from("service_order_services")
      .delete()
      .eq("service_order_id", serviceOrderId)
    if (delErr) throw delErr

    if (services.length > 0) {
      // 2. Fetch service names/prices
      const validServiceIds = services.map(s => s.service_id).filter((id): id is string => !!id)
      let svcRows: any[] = []
      if (validServiceIds.length > 0) {
        const { data: dataRows, error: svcErr } = await admin
          .from("services")
          .select("id, name, price")
          .in("id", validServiceIds)
        if (svcErr) throw svcErr
        svcRows = dataRows || []
      }

      const items = services.map((s, idx) => {
        const svc = s.service_id ? svcRows.find((r: any) => r.id === s.service_id) : null
        const qty = s.quantity || 1
        const name = s.service_name || svc?.name || "Serviço avulso"
        const price = s.service_price !== undefined ? s.service_price : (svc?.price || 0)
        return {
          service_order_id: serviceOrderId,
          service_id: s.service_id || null,
          service_name: name,
          service_price: price,
          quantity: qty,
          total_price: price * qty,
          sort_order: idx,
        }
      })

      const { error: insErr } = await admin.from("service_order_services").insert(items)
      if (insErr) throw insErr
    }

    await recalcTotals(admin, serviceOrderId)
    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao sincronizar serviços" }
  }
}

export async function syncServiceOrderProductsAction(
  partnerId: string,
  serviceOrderId: string,
  products: { product_id: string | null; variant_id?: string | null; product_name?: string; unit_price?: number; quantity: number }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("payment_status")
      .eq("id", serviceOrderId)
      .single()
    if (current?.payment_status === "paid" || current?.payment_status === "partially_paid") {
      throw new Error("Não é possível alterar uma ordem de serviço com pagamentos registrados.")
    }

    // 1. Delete all existing products
    const { error: delErr } = await admin
      .from("service_order_products")
      .delete()
      .eq("service_order_id", serviceOrderId)
    if (delErr) throw delErr

    if (products.length > 0) {
      // 2. Fetch product names/prices
      const validProductIds = products.map(p => p.product_id).filter((id): id is string => !!id)
      let prodRows: any[] = []
      if (validProductIds.length > 0) {
        const { data: dataRows, error: prodErr } = await admin
          .from("products")
          .select("id, name, price")
          .in("id", validProductIds)
        if (prodErr) throw prodErr
        prodRows = dataRows || []
      }

      const items = products.map((p, idx) => {
        const prod = p.product_id ? prodRows.find((r: any) => r.id === p.product_id) : null
        const qty = p.quantity || 1
        const name = p.product_name || prod?.name || "Produto avulso"
        const price = p.unit_price !== undefined ? p.unit_price : (prod?.price || 0)
        return {
          service_order_id: serviceOrderId,
          product_id: p.product_id || null,
          variant_id: p.variant_id || null,
          product_name: name,
          unit_price: price,
          quantity: qty,
          total_price: price * qty,
          sort_order: idx,
        }
      })

      const { error: insErr } = await admin.from("service_order_products").insert(items)
      if (insErr) throw insErr
    }

    await recalcTotals(admin, serviceOrderId)
    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao sincronizar produtos" }
  }
}

export async function saveServiceOrderSpecificationsAction(
  partnerId: string,
  serviceOrderId: string,
  specifications: { name: string; value: string }[],
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const admin = getAdminClient()

    const { data: current } = await admin
      .from("service_orders")
      .select("status")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!current) {
      return { success: false, error: "Ordem de serviço não encontrada" }
    }
    if (!getServiceOrderEditPolicy(current.status as ServiceOrderStatus).canEditSpecs) {
      return { success: false, error: "Não é possível alterar as especificações desta ordem de serviço neste status." }
    }

    const { error } = await admin
      .from("service_orders")
      .update({ specifications })
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)

    if (error) throw error

    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar especificações" }
  }
}

export async function regenerateServiceOrderApprovalCodeAction(
  serviceOrderId: string,
  partnerId: string,
): Promise<{ success: true; code: string } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "service_orders", "edit")
    const user = await requireUser()
    const supabase = await getSupabaseServerClient()

    // 1. Fetch OS to make sure it exists
    const { data: so, error: soErr } = await supabase
      .from("service_orders")
      .select("id, status, metadata")
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)
      .single()

    if (soErr || !so) {
      return { success: false, error: "Ordem de serviço não encontrada" }
    }

    if (so.status === "concluida" || so.status === "entregue" || so.status === "cancelada") {
      return { success: false, error: "Não é possível alterar o código de uma OS finalizada ou cancelada." }
    }

    // 2. Generate new 4-digit code and salt using cryptographically secure random
    const crypto = await import("crypto")
    const plainCode = crypto.randomInt(1000, 10000).toString() // 4 digits
    const salt = crypto.randomBytes(16).toString("hex")

    // Compute hash using RPC
    const { data: hashData, error: hashErr } = await supabase.rpc("compute_approval_hash", {
      salt: salt,
      code: plainCode
    })

    if (hashErr || !hashData) {
      console.error("[regenerateServiceOrderApprovalCodeAction] hash computation error:", hashErr)
      return { success: false, error: "Erro ao gerar hash do código de assinatura." }
    }

    const hash = hashData as string

    // Store plain_code in metadata for merchant viewing and sharing
    const cleanMetadata = { ...(so.metadata || {}), plain_code: plainCode }

    // 3. Update service order with new code
    const { error: updateErr } = await supabase
      .from("service_orders")
      .update({
        approval_code_salt: salt,
        approval_code_hash: hash,
        failed_attempts: 0,
        lockout_until: null,
        lockout_count: 0,
        metadata: cleanMetadata,
      })
      .eq("id", serviceOrderId)
      .eq("partner_id", partnerId)

    if (updateErr) {
      console.error("[regenerateServiceOrderApprovalCodeAction] update error:", updateErr)
      return { success: false, error: "Erro ao salvar novo código." }
    }

    revalidatePath("/erp/ordens-de-servico")
    return { success: true, code: plainCode }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao gerar novo código" }
  }
}

const ALLOWED_SIGNATURE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"]
const MAX_SIGNATURE_SIZE_BYTES = 2 * 1024 * 1024 // 2MB

export async function getPublicPresignedUploadUrlAction(
  token: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<
  | { success: true; uploadUrl: string; publicUrl: string | null; key: string }
  | { success: false; error: string }
> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.SERVICE_ORDER_PUBLIC_SIGN)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Tente novamente em breve." }
    }
    const cleanToken = String(token || "").trim()
    if (!cleanToken || cleanToken.length < 6) {
      return { success: false, error: "Token inválido ou ordem de serviço não encontrada" }
    }

    const admin = getAdminClient()
    const { data: order, error } = await admin
      .from("service_orders")
      .select("id, partner_id, assigned_user_id, status, signature_image_key")
      .eq("public_token", cleanToken)
      .maybeSingle()

    if (error || !order) {
      return { success: false, error: "Ordem de serviço não encontrada ou token inválido" }
    }

    if (order.status === "concluida" || order.status === "entregue" || order.status === "cancelada" || order.signature_image_key) {
      return { success: false, error: "Esta ordem de serviço já foi concluída, cancelada ou já possui assinatura registrada." }
    }

    const normalizedMime = String(fileType || "").trim().toLowerCase()
    if (!ALLOWED_SIGNATURE_MIME_TYPES.includes(normalizedMime)) {
      return { success: false, error: "Formato de arquivo não permitido para assinatura. Use PNG, JPEG ou WebP." }
    }

    if (!fileSize || fileSize <= 0 || fileSize > MAX_SIGNATURE_SIZE_BYTES) {
      return { success: false, error: "Arquivo de assinatura muito grande. O limite máximo é de 2MB." }
    }

    const uploadUserId = order.assigned_user_id || "public-guest"
    const prefix = R2_PREFIXES.serviceOrderSignatures

    // Resolve safe extension from validated MIME
    const ext = normalizedMime === "image/png" ? "png" : normalizedMime === "image/webp" ? "webp" : "jpg"
    const crypto = await import("crypto")
    const randomSuffix = crypto.randomBytes(12).toString("hex")
    const key = `users/${uploadUserId}/${prefix}${Date.now()}-${randomSuffix}.${ext}`

    const result = await generateSignedUploadUrl({
      fileName: `signature-${Date.now()}.${ext}`,
      fileType: normalizedMime,
      userId: uploadUserId,
      prefix,
      key,
    })
    return { success: true, ...result }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao gerar URL" }
  }
}

export async function signPublicServiceOrderAction(
  token: string,
  approverName: string,
  approvalCode: string,
  signatureImageKey: string,
  ip?: string,
  userAgent?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.SERVICE_ORDER_PUBLIC_SIGN)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Tente novamente em breve." }
    }
    const cleanToken = String(token || "").trim()
    if (!cleanToken || cleanToken.length < 6) {
      return { success: false, error: "Token inválido ou ordem de serviço não encontrada" }
    }

    const admin = getAdminClient()

    // 1. Fetch OS strictly by public_token
    const { data: order, error } = await admin
      .from("service_orders")
      .select("id, status, assigned_user_id, partner_id, customer_snapshot, signature_image_key, created_by, metadata")
      .eq("public_token", cleanToken)
      .maybeSingle()

    if (error || !order) {
      return { success: false, error: "Ordem de serviço não encontrada ou token inválido" }
    }

    if (order.signature_image_key) {
      return { success: false, error: "Esta ordem de serviço já possui assinatura registrada." }
    }

    // A assinatura é o aceite final: somente após a conclusão do serviço.
    if (order.status !== "concluida" && order.status !== "entregue") {
      return { success: false, error: "A assinatura está disponível apenas após a conclusão do serviço." }
    }

    // Validate signatureImageKey format and prefix
    const uploadUserId = order.assigned_user_id || "public-guest"
    const expectedPrefix = `users/${uploadUserId}/${R2_PREFIXES.serviceOrderSignatures}`
    if (!signatureImageKey || !signatureImageKey.startsWith(expectedPrefix) || !/\.(png|jpg|jpeg|webp)$/i.test(signatureImageKey)) {
      return { success: false, error: "Chave de assinatura inválida ou não autorizada para esta ordem de serviço." }
    }

    let rawCustomer = order.customer_snapshot
    if (typeof rawCustomer === "string") {
      try {
        rawCustomer = JSON.parse(rawCustomer)
      } catch {
        rawCustomer = null
      }
    }
    const customerEmail = (rawCustomer as any)?.email || null
    const customerName = (rawCustomer as any)?.name || null

    const actor = await resolvePortalActor(
      admin,
      order.partner_id,
      order.assigned_user_id,
      order.created_by,
      customerEmail,
      customerName,
    )
    const alreadyApprovedViaPortal = Boolean((order as any).metadata && (order as any).metadata.approved_at)

    let method = "code"
    let approverDisplayName = approverName?.trim() || customerName || "Cliente"
    let doDirectUpdate = false

    if (actor.authorized) {
      doDirectUpdate = true
      method = actor.method
      approverDisplayName = actor.displayName || approverDisplayName
    } else if (alreadyApprovedViaPortal) {
      // OS já aprovada pelo portal: assinatura de aceite não exige novo código.
      doDirectUpdate = true
      method = "trusted"
      approverDisplayName = customerName || approverDisplayName
    }

    if (doDirectUpdate) {
      const { error: updateErr } = await admin
        .from("service_orders")
        .update({
          signature_image_key: signatureImageKey,
          signed_at: new Date().toISOString(),
          failed_attempts: 0,
          lockout_until: null,
          lockout_count: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", order.id)

      if (updateErr) {
        return { success: false, error: updateErr.message || "Erro ao assinar ordem de serviço" }
      }

      await logAuditEvent({
        partnerId: order.partner_id,
        actorUserId: actor.loggedUserId,
        entityType: 'service_order',
        entityId: order.id,
        actionType: 'signed',
        changeLines: [
          method === "erp_portal"
            ? 'OS assinada diretamente via portal (membro da loja autenticado)'
            : 'OS assinada pelo cliente via portal público',
        ],
        source: 'system',
        metadata: {
          ipAddress: ip || null,
          userAgent: userAgent || null,
          timestamp: new Date().toISOString(),
          approver_name: approverDisplayName
        }
      })
    } else {
      if (!approvalCode || !approvalCode.trim()) {
        return { success: false, error: "Código de assinatura é obrigatório." }
      }

      // Call DB function for code signature validation
      const { data: rpcRes, error: rpcErr } = await admin.rpc("sign_public_service_order", {
        p_so_id: order.id,
        p_name: approverDisplayName,
        p_code: approvalCode.trim(),
        p_signature_key: signatureImageKey,
        p_ip: ip || null,
        p_ua: userAgent || null,
        p_method: "code"
      })

      if (rpcErr) {
        console.error("[signPublicServiceOrderAction] RPC Error:", rpcErr)
        return { success: false, error: rpcErr.message || "Erro ao assinar ordem de serviço" }
      }

      const result = rpcRes as { success: boolean; error?: string }
      if (!result.success) {
        return { success: false, error: result.error || "Erro ao processar assinatura" }
      }
    }

    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    console.error("[signPublicServiceOrderAction] Error:", err)
    return { success: false, error: err.message || "Erro interno ao assinar ordem de serviço" }
  }
}

/**
 * Aprovação da OS pelo portal (autorização pré-execução).
 * Para membros do ERP (lojista/responsável/criador) ou quando o e-mail do
 * usuário logado é o do cliente, não exige código. Caso contrário, valida o
 * código de 4 dígitos via RPC. Não assina - apenas muda o status para 'aprovada'.
 */
export async function approvePublicServiceOrderAction(
  token: string,
  approverName: string,
  approvalCode: string,
  ip?: string,
  userAgent?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.SERVICE_ORDER_PUBLIC_SIGN)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Tente novamente em breve." }
    }
    const cleanToken = String(token || "").trim()
    if (!cleanToken || cleanToken.length < 6) {
      return { success: false, error: "Token inválido ou ordem de serviço não encontrada" }
    }

    const admin = getAdminClient()

    const { data: order, error } = await admin
      .from("service_orders")
      .select("id, status, assigned_user_id, partner_id, customer_snapshot, signature_image_key, created_by, metadata")
      .eq("public_token", cleanToken)
      .maybeSingle()

    if (error || !order) {
      return { success: false, error: "Ordem de serviço não encontrada ou token inválido" }
    }

    if (order.status !== "aberta" && order.status !== "aguardando_aprovacao") {
      return { success: false, error: "Esta ordem de serviço não está mais aguardando aprovação." }
    }

    if (order.signature_image_key) {
      return { success: false, error: "Esta ordem de serviço já foi assinada." }
    }

    let rawCustomer = order.customer_snapshot
    if (typeof rawCustomer === "string") {
      try {
        rawCustomer = JSON.parse(rawCustomer)
      } catch {
        rawCustomer = null
      }
    }
    const customerEmail = (rawCustomer as any)?.email || null
    const customerName = (rawCustomer as any)?.name || null

    const actor = await resolvePortalActor(
      admin,
      order.partner_id,
      order.assigned_user_id,
      order.created_by,
      customerEmail,
      customerName,
    )

    let approverDisplayName = approverName?.trim() || customerName || "Cliente"

    if (actor.authorized) {
      approverDisplayName = actor.displayName || approverDisplayName
      const nowIso = new Date().toISOString()
      const { error: updateErr } = await admin
        .from("service_orders")
        .update({
          status: "aprovada",
          failed_attempts: 0,
          lockout_until: null,
          lockout_count: 0,
          updated_at: nowIso,
          metadata: {
            ...((order as any).metadata || {}),
            approver_name: approverDisplayName,
            approved_at: nowIso,
          },
        })
        .eq("id", order.id)

      if (updateErr) {
        return { success: false, error: updateErr.message || "Erro ao aprovar ordem de serviço" }
      }

      await logAuditEvent({
        partnerId: order.partner_id,
        actorUserId: actor.loggedUserId,
        entityType: 'service_order',
        entityId: order.id,
        actionType: 'approved',
        changeLines: [
          actor.method === "erp_portal"
            ? 'OS aprovada diretamente via portal (membro da loja autenticado)'
            : 'OS aprovada pelo cliente via portal público (autenticado por e-mail)',
          'Status alterado: ' + order.status + ' → aprovada',
        ],
        source: 'system',
        metadata: {
          ipAddress: ip || null,
          userAgent: userAgent || null,
          timestamp: nowIso,
          approver_name: approverDisplayName,
        },
      })
    } else {
      if (!approvalCode || !approvalCode.trim()) {
        return { success: false, error: "Código de aprovação é obrigatório." }
      }

      const { data: rpcRes, error: rpcErr } = await admin.rpc("approve_public_service_order", {
        p_so_id: order.id,
        p_name: approverDisplayName,
        p_code: approvalCode.trim(),
        p_ip: ip || null,
        p_ua: userAgent || null,
        p_method: "code",
      })

      if (rpcErr) {
        console.error("[approvePublicServiceOrderAction] RPC Error:", rpcErr)
        return { success: false, error: rpcErr.message || "Erro ao aprovar ordem de serviço" }
      }

      const result = rpcRes as { success: boolean; error?: string }
      if (!result.success) {
        return { success: false, error: result.error || "Erro ao processar aprovação" }
      }
    }

    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    console.error("[approvePublicServiceOrderAction] Error:", err)
    return { success: false, error: err.message || "Erro interno ao aprovar ordem de serviço" }
  }
}

export async function rejectPublicServiceOrderAction(
  token: string,
  reason?: string,
  ip?: string,
  userAgent?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const rl = await requireRateLimit(RateLimitCategory.SERVICE_ORDER_PUBLIC_SIGN)
    if (!rl.success) {
      return { success: false, error: rl.error || "Muitas tentativas. Tente novamente em breve." }
    }
    const cleanToken = String(token || "").trim()
    if (!cleanToken || cleanToken.length < 6) {
      return { success: false, error: "Token inválido ou ordem de serviço não encontrada" }
    }

    const admin = getAdminClient()
    const { data: order, error } = await admin
      .from("service_orders")
      .select("id, status, partner_id, signature_image_key")
      .eq("public_token", cleanToken)
      .maybeSingle()

    if (error || !order) {
      return { success: false, error: "Ordem de serviço não encontrada ou token inválido" }
    }

    if (order.signature_image_key) {
      return { success: false, error: "Esta ordem de serviço já foi assinada e não pode ser recusada." }
    }

    if (order.status !== "aberta" && order.status !== "aguardando_aprovacao") {
      return { success: false, error: "Esta ordem de serviço não está mais disponível para recusa." }
    }

    const cleanReason = sanitizeNotes(reason) || null

    const { error: updateErr } = await admin
      .from("service_orders")
      .update({ status: "cancelada", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .in("status", ["aberta", "aguardando_aprovacao"])

    if (updateErr) {
      return { success: false, error: updateErr.message || "Erro ao recusar ordem de serviço" }
    }

    await logAuditEvent({
      partnerId: order.partner_id,
      actorUserId: null,
      entityType: "service_order",
      entityId: order.id,
      actionType: "cancelled",
      source: "system",
      changeLines: [
        "OS recusada pelo cliente via portal público",
        ...(cleanReason ? [`Motivo: ${cleanReason}`] : []),
      ],
      metadata: { ipAddress: ip || null, userAgent: userAgent || null, reason: cleanReason },
    })

    revalidatePath("/erp/ordens-de-servico")
    return { success: true }
  } catch (err: any) {
    console.error("[rejectPublicServiceOrderAction] Error:", err)
    return { success: false, error: err.message || "Erro interno ao recusar ordem de serviço" }
  }
}

export async function getServiceOrderAttachmentsAction(
  serviceOrderId: string,
  partnerId?: string,
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: serviceOrder } = await supabase
      .from("service_orders")
      .select("id, partner_id, store_id")
      .eq("id", serviceOrderId)
      .maybeSingle()
    if (!serviceOrder || (partnerId && serviceOrder.partner_id !== partnerId)) {
      return { success: false, error: "Ordem de serviço não encontrada." }
    }
    if (serviceOrder.store_id) await requireStorePermission(serviceOrder.store_id, serviceOrder.partner_id, "service_orders", "view")
    else await requirePermission(serviceOrder.partner_id, "service_orders", "view")

    const { data, error } = await supabase
      .from("service_order_attachments")
      .select("*")
      .eq("service_order_id", serviceOrderId)
      .order("created_at", { ascending: false })

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao listar anexos" }
  }
}
