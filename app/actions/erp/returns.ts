"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser, requireMinimumPlan, requireOrderAccess } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { revalidateOrders, revalidateOrderHistory, revalidateStockMovements, revalidateTransactions, revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { syncCancelledOrderAppointmentsAndTransactions } from "@/lib/services/sync-cancellation"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import type { ReturnRequestListItem } from "@/lib/returns/types"
import {
    canRequestOrderCancellation,
    canRequestPostFulfillmentResolution,
    extractMercadoPagoPaidAmount,
    getLineSubtotal,
    getOrderAmountPaid,
    getOrderSubtotalOriginal,
} from "@/lib/returns/calculations"

// ─── Segurança: Constantes de Reembolso ────────────────────────────────────

const REFUND_PASSWORD_THRESHOLD = 300
const REFUND_COOLDOWN_THRESHOLD = 1000
const REFUND_COOLDOWN_SECONDS = 5
const REFUND_CRITICAL_THRESHOLD = 2000

const RETURN_STATUS_SET = new Set([
    "PENDING_REVIEW",
    "UNDER_ANALYSIS",
    "APPROVED",
    "REJECTED",
    "WAITING_CUSTOMER",
    "WAITING_ITEM_RETURN",
    "PROCESSING",
    "RESOLVED",
    "EXPIRED",
    "ESCALATED",
])

const MANAGE_ROLES = new Set(["owner", "admin", "manager"])
const VIEW_ROLES = new Set(["owner", "admin", "manager", "operator"])

const evidenceSchema = z.object({
    file_url: z.string().url(),
    file_key: z.string().max(500).nullable().optional(),
    file_name: z.string().max(255).nullable().optional(),
    file_type: z.string().max(120).nullable().optional(),
    file_size: z.number().int().nonnegative().max(10 * 1024 * 1024).nullable().optional(),
    thumbnail_url: z.string().url().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

const itemSchema = z.object({
    order_item_id: z.string().uuid(),
    quantity: z.number().int().positive().max(999),
    reason: z.string().max(120).nullable().optional(),
    condition: z.enum(["sealed", "opened", "damaged"]).nullable().optional(),
    sku: z.string().max(120).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

const createReturnSchema = z.object({
    partnerId: z.string().uuid(),
    orderId: z.string().uuid(),
    resolution: z.enum(["exchange", "refund", "store_credit", "none", "rejected"]),
    reason: z.string().trim().min(2).max(120),
    message: z.string().trim().max(2000).optional().nullable(),
    items: z.array(itemSchema).min(1).max(100),
    evidence: z.array(evidenceSchema).max(5).default([]),
    idempotencyKey: z.string().trim().max(160).optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    status: z.enum([
        "PENDING_REVIEW",
        "UNDER_ANALYSIS",
        "APPROVED",
        "REJECTED",
        "WAITING_CUSTOMER",
        "WAITING_ITEM_RETURN",
        "PROCESSING",
        "RESOLVED",
        "EXPIRED",
        "ESCALATED",
    ]).optional().nullable(),
    refundValue: z.number().nonnegative().optional().nullable(),
    storeCreditValue: z.number().nonnegative().optional().nullable(),
    exchangeItems: z.array(z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().nullable().optional(),
        quantity: z.number().int().positive().max(999),
        unit_price: z.number().nonnegative().max(99999999),
    })).max(100).optional().nullable(),
    exchangeBalanceResolution: z.enum(["refund", "store_credit"]).nullable().optional(),
    returnToInventory: z.boolean().optional().nullable(),
})

const createCancellationSchema = z.object({
    orderId: z.string().uuid(),
    reason: z.enum(["purchased_by_mistake", "better_price", "delivery_delay", "changed_mind", "payment_issue", "other"]),
    details: z.string().trim().max(2000).optional().nullable(),
    idempotencyKey: z.string().trim().max(160).optional().nullable(),
})

const processReturnSchema = z.object({
    partnerId: z.string().uuid(),
    requestId: z.string().uuid(),
    action: z.string().trim().min(2).max(80),
    nextStatus: z.string().trim().optional().nullable(),
    refundAmount: z.number().nonnegative().max(99999999).default(0),
    refundStatus: z.enum(["PENDING", "PROCESSING", "APPROVED", "FAILED", "MANUAL"]).default("PENDING"),
    refundPaymentMethod: z.string().max(120).optional().nullable(),
    returnToInventory: z.boolean().default(false),
    returnToInventoryItems: z.array(z.string().uuid()).optional().nullable(),
    customerId: z.string().uuid().optional().nullable(),
    storeCreditAmount: z.number().nonnegative().max(99999999).default(0),
    exchangeItems: z.array(z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().nullable().optional(),
        quantity: z.number().int().positive().max(999),
        unit_price: z.number().nonnegative().max(99999999),
    })).max(100).default([]),
    exchangeBalanceResolution: z.enum(["refund", "store_credit"]).nullable().optional(),
    notes: z.string().max(2000).optional().nullable(),
    idempotencyKey: z.string().trim().max(160).optional().nullable(),
    skipMpPaymentCheck: z.boolean().optional().default(false),
})

const executeMpRefundSchema = z.object({
    partnerId: z.string().uuid(),
    requestId: z.string().uuid(),
    refundId: z.string().uuid(),
    refundConfirmation: z.string().refine((v) => v === "REEMBOLSAR", {
        message: "Digite exatamente REEMBOLSAR para confirmar",
    }),
    refundPassword: z.string().optional().nullable(),
    refundCooldownTimestamp: z.number().optional().nullable(),
    idempotencyKey: z.string().trim().max(160).optional().nullable(),
})

function assertRole(roleId: string, allowed: Set<string>) {
    const normalized = String(roleId || "").toLowerCase()
    if (!allowed.has(normalized)) {
        throw new Error("Sem permissao para esta acao")
    }
}

function toNumber(value: unknown) {
    const n = Number(value || 0)
    return Number.isFinite(n) ? n : 0
}

async function getClientIP(): Promise<string> {
    try {
        const h = await headers()
        return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown"
    } catch {
        return "unknown"
    }
}

async function getClientUserAgent(): Promise<string> {
    try {
        const h = await headers()
        return h.get("user-agent") || "unknown"
    } catch {
        return "unknown"
    }
}

function normalizeReturnRow(row: any): ReturnRequestListItem & { returnEvents?: any[] } {
    const items = (row.return_items || []).map((item: any) => {
        const productImages = item.products?.images
        const image = Array.isArray(productImages) && productImages[0] ? productImages[0] : item.products?.video_thumbnail || productImages || null
        return {
            id: item.id,
            orderItemId: item.order_item_id,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name_snapshot,
            sku: item.sku_snapshot,
            image,
            price: toNumber(item.unit_price_snapshot),
            netItemValue: toNumber(item.net_item_value_snapshot),
            quantity: Number(item.quantity || 0),
            orderedQuantity: Number(item.ordered_quantity || 0),
            reason: item.reason,
            condition: item.condition,
        }
    })

    return {
        id: row.id,
        partnerId: row.partner_id,
        orderId: row.order_id,
        orderNumber: row.order_number_snapshot || row.orders?.order_number || String(row.order_id).slice(0, 8),
        customerId: row.customer_id || row.customer_user_id || "",
        customerName: row.customer_name_snapshot || row.orders?.customer_name || "Cliente",
        customerEmail: row.customer_email_snapshot || row.orders?.buyer?.email || undefined,
        customerPhone: row.orders?.buyer?.phone || undefined,
        customerAddress: row.orders?.delivery_address || undefined,
        orderStatus: row.orders?.situation || undefined,
        deliveryStatus: row.orders?.delivery_status || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        source: row.source || "erp",
        requestType: row.request_type || undefined,
        desiredResolution: row.desired_resolution,
        approvedResolution: row.approved_resolution,
        reason: row.reason,
        status: row.status,
        refundValue: toNumber(row.refund_amount),
        storeCreditValue: toNumber(row.store_credit_amount),
        evidenceImages: (row.return_evidence || []).map((e: any) => e.file_url).filter(Boolean),
        observations: row.customer_details || row.customer_message || row.seller_notes || row.internal_notes || "",
        customerMessage: row.customer_message || row.customer_details || "",
        sellerNotes: row.seller_notes || "",
        expiresAt: row.expires_at,
        eligibilityStatus: row.eligibility_status || null,
        eligibilityDetails: row.eligibility_details || null,
        policySnapshot: row.policy_snapshot || null,
        slaDueAt: row.sla_due_at || null,
        slaStatus: row.sla_status || null,
        slaExpiredAt: row.sla_expired_at || null,
        reportedToDuditAt: row.reported_to_dudit_at || null,
        duditReportId: row.dudit_report_id || null,
        paymentProvider: row.orders?.payment_provider || undefined,
        mpPaymentId: row.orders?.mp_payment_id || undefined,
        refundPaymentMethod: (row.return_refunds && row.return_refunds[0]) ? row.return_refunds[0].payment_method : undefined,
        items,
        returnEvents: row.return_events || undefined,
    }
}

async function revalidateReturns(partnerId: string, orderId?: string, requestId?: string) {
    revalidatePath("/erp/returns")
    revalidatePath("/pedidos")
    await revalidateOrders(partnerId)
    if (orderId) await revalidateOrderHistory(orderId)
    if (requestId) await revalidateEntityTimeline("return_request", requestId)
}

export async function getReturnRequestsPageAction(
    partnerId: string,
    options?: { cursor?: { createdAt: string; id: string } | null; limit?: number; status?: string | null; search?: string | null },
) {
    try {
        const access = await requirePermission(partnerId, "orders", "view")
        assertRole(access.roleId, VIEW_ROLES)
        const supabase = createAdminClient()
        const limit = Math.max(1, Math.min(100, Number(options?.limit || 50)))
        const fetchLimit = limit + 1

        let query = supabase
            .from("return_requests")
            .select(`
        id, partner_id, order_id, customer_id, customer_user_id, source, request_type, desired_resolution, approved_resolution,
        reason, customer_reason, customer_message, customer_details, seller_notes, internal_notes, status, refund_amount, store_credit_amount,
        order_number_snapshot, order_total_snapshot, customer_name_snapshot, customer_email_snapshot, expires_at, created_at, updated_at,
        eligibility_status, eligibility_details, policy_snapshot, sla_due_at, sla_status, sla_expired_at, reported_to_dudit_at, dudit_report_id,
        orders!order_id(order_number, customer_name, situation, delivery_status, delivery_address, buyer_id, payment_provider, mp_payment_id),
        return_items!return_items_return_request_id_fkey(
          id, order_item_id, product_id, variant_id, product_name_snapshot, sku_snapshot,
          unit_price_snapshot, net_item_value_snapshot, ordered_quantity, quantity, condition, reason, desired_resolution,
          products!product_id(images, video_thumbnail)
        ),
        return_evidence(id, file_url, file_type, thumbnail_url),
        return_refunds(payment_method)
      `)
            .eq("partner_id", partnerId)
            .is("deleted_at", null)

        if (options?.status && RETURN_STATUS_SET.has(options.status)) {
            query = query.eq("status", options.status)
        }

        const search = String(options?.search || "").trim()
        if (search) {
            query = query.or(`order_number_snapshot.ilike.%${search}%,customer_name_snapshot.ilike.%${search}%,id.eq.${search}`)
        }

        const cursor = options?.cursor
        if (cursor?.createdAt && cursor?.id) {
            query = query.or(`created_at.lt."${cursor.createdAt}",and(created_at.eq."${cursor.createdAt}",id.lt."${cursor.id}")`)
        }

        const { data, error } = await query
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(fetchLimit)

        if (error) throw error

        const rows = data || []
        const hasMore = rows.length > limit
        const pageRows = hasMore ? rows.slice(0, limit) : rows
        const last = pageRows[pageRows.length - 1]

        return {
            success: true as const,
            items: pageRows.map(normalizeReturnRow),
            nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
            hasMore,
        }
    } catch (e: any) {
        return { success: false as const, error: e?.message || "Erro ao carregar devolucoes" }
    }
}

export async function getReturnRequestDetailsAction(partnerId: string, requestId: string) {
    try {
        const access = await requirePermission(partnerId, "orders", "view")
        assertRole(access.roleId, VIEW_ROLES)
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from("return_requests")
            .select(`
        *,
        orders!order_id(order_number, customer_name, total_amount, payment_method, payment_provider, mp_payment_id, situation, delivery_status, delivery_address, buyer_id),
        return_items!return_items_return_request_id_fkey(*, products!product_id(images, video_thumbnail)),
        return_evidence(*),
        return_events(*),
        return_refunds(*),
        store_credits(*)
      `)
            .eq("id", requestId)
            .eq("partner_id", partnerId)
            .is("deleted_at", null)
            .single()

        if (error) throw error

        // Fetch buyer/customer details separately if buyer_id is present
        let buyerDetails = null
        if (data?.orders?.buyer_id) {
            const { data: customerData } = await supabase
                .from("customers")
                .select("email, phone")
                .eq("id", data.orders.buyer_id)
                .maybeSingle()
            buyerDetails = customerData

            // If not found in customers, check if there's a user profile (marketplace user)
            if (!buyerDetails) {
                const { data: profileData } = await supabase
                    .from("profiles")
                    .select("email")
                    .eq("id", data.orders.buyer_id)
                    .maybeSingle()
                buyerDetails = profileData ? { email: profileData.email, phone: null } : null
            }
        }

        // Resolve actor names for return_events
        const events = (data as any)?.return_events || []
        let eventsWithActorNames = events
        if (events.length > 0) {
            const actorIds = Array.from(new Set(events.map((e: any) => e.changed_by).filter(Boolean))) as string[]
            if (actorIds.length > 0) {
                const { data: profiles } = await supabase
                    .from("user_profiles")
                    .select("user_id, full_name")
                    .in("user_id", actorIds)
                const nameMap = new Map((profiles || []).map((p: any) => [p.user_id, p.full_name?.trim() || "Usuário"]))
                eventsWithActorNames = events.map((e: any) => ({
                    ...e,
                    actor_name: e.changed_by ? nameMap.get(e.changed_by) || "Usuário" : "Sistema",
                }))
            }
        }

        const normalized = normalizeReturnRow({ ...data, return_events: eventsWithActorNames })
        if (buyerDetails) {
            normalized.customerEmail = normalized.customerEmail || buyerDetails.email || undefined
            normalized.customerPhone = normalized.customerPhone || buyerDetails.phone || undefined
        }

        return successResponse(normalized)
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao carregar devolução")
    }
}

export async function createReturnRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    try {
        const user = await requireUser()
        const data = createReturnSchema.parse(input)
        await requireMinimumPlan(data.partnerId, "crescer")
        const access = await requirePermission(data.partnerId, "orders", "edit")
        assertRole(access.roleId, MANAGE_ROLES)
        const supabase = createAdminClient()

        // Validate that the order has situation = 'paid' or 'partially_paid'
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, situation, delivery_status")
            .eq("id", data.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido não encontrado")
        if (order.situation !== "paid" && order.situation !== "partially_paid") {
            throw new Error("Não é permitido criar devolução para pedidos não pagos.")
        }

        // Fetch order items to validate item types for exchange
        const { data: orderItems, error: itemsError } = await supabase
            .from("order_items")
            .select("id, product_id, service_id, line_type")
            .eq("order_id", data.orderId)

        if (itemsError || !orderItems) throw new Error("Erro ao buscar itens do pedido")

        const returnedItemIds = new Set(data.items.map((item: any) => item.order_item_id))
        const returnedServices = orderItems.filter((item: any) => returnedItemIds.has(item.id) && (item.service_id || item.line_type === "service_booking"))

        if (data.resolution === "exchange") {
            if (order.delivery_status !== "delivered") {
                throw new Error("A troca só é permitida para pedidos concluídos (entregues/executados).")
            }
            if (returnedServices.length > 0) {
                throw new Error("Não é permitido realizar troca de itens de serviço.")
            }
        }

        const { data: created, error } = await supabase.rpc("create_return_request", {
            p_partner_id: data.partnerId,
            p_order_id: data.orderId,
            p_created_by: user.id,
            p_source: "erp",
            p_resolution: data.resolution,
            p_reason: data.reason,
            p_message: data.message || null,
            p_items: data.items,
            p_evidence: data.evidence,
            p_idempotency_key: data.idempotencyKey || crypto.randomUUID(),
            p_expires_at: data.expiresAt || null,
            p_request_type: data.resolution === "none" ? "return" : null,
        })

        if (error) throw error
        const requestId = String((created as any)?.id || "")

        await logAuditEvent({
            partnerId: data.partnerId,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: requestId,
            actionType: "created",
            changeLines: ["criou solicitação de troca/devolução."],
            metadata: { orderId: data.orderId, resolution: data.resolution },
            source: "manual",
        })

        await revalidateReturns(data.partnerId, data.orderId, requestId)
        return successResponse({ id: requestId })
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao criar devolução")
    }
}

export async function createMarketplaceReturnRequestAction(input: Omit<z.infer<typeof createReturnSchema>, "partnerId">) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)
    try {
        const user = await requireUser()
        const base = createReturnSchema.omit({ partnerId: true }).parse(input)
        await requireOrderAccess(base.orderId)
        const supabase = createAdminClient()

        const { data: existingRequest } = await supabase
            .from("return_requests")
            .select("id")
            .eq("order_id", base.orderId)
            .is("deleted_at", null)
            .maybeSingle()

        if (existingRequest) {
            throw new Error("Já existe uma solicitação de devolução/cancelamento ativa para este pedido.")
        }

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, partner_id, buyer_id, situation, delivery_status, order_number")
            .eq("id", base.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido nao encontrado")
        if (order.buyer_id !== user.id) throw new Error("Sem permissao")
        if (order.situation !== "paid" && order.situation !== "partially_paid") {
            throw new Error("Não é permitido criar solicitação para pedidos não pagos.")
        }

        // Fetch order items to validate item types for exchange
        const { data: orderItems, error: itemsError } = await supabase
            .from("order_items")
            .select("id, product_id, service_id, line_type")
            .eq("order_id", base.orderId)

        if (itemsError || !orderItems) throw new Error("Erro ao buscar itens do pedido")

        const returnedItemIds = new Set(base.items.map((item: any) => item.order_item_id))
        const returnedServices = orderItems.filter((item: any) => returnedItemIds.has(item.id) && (item.service_id || item.line_type === "service_booking"))

        if (base.resolution === "exchange") {
            if (order.delivery_status !== "delivered") {
                throw new Error("A troca só é permitida para pedidos concluídos (entregues/executados).")
            }
            if (returnedServices.length > 0) {
                throw new Error("Não é permitido realizar troca de itens de serviço.")
            }
        }

        const { data: created, error } = await supabase.rpc("create_return_request", {
            p_partner_id: order.partner_id,
            p_order_id: base.orderId,
            p_created_by: user.id,
            p_source: "marketplace",
            p_resolution: base.resolution,
            p_reason: base.reason,
            p_message: base.message || null,
            p_items: base.items,
            p_evidence: base.evidence,
            p_idempotency_key: base.idempotencyKey || crypto.randomUUID(),
            p_expires_at: base.expiresAt || null,
            p_request_type: null,
        })

        if (error) throw error
        const requestId = String((created as any)?.id || "")

        await logAuditEvent({
            partnerId: order.partner_id,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: requestId,
            actionType: "created",
            changeLines: ["criou solicitação de troca/devolução pelo marketplace."],
            metadata: { orderId: base.orderId, resolution: base.resolution, source: "marketplace" },
            source: "marketplace",
        })

        await revalidateReturns(order.partner_id, base.orderId, requestId)

        // Notify partner team
        try {
            const { createNotificationsForUsers, getPartnerTeamUserIds } = await import("@/lib/services/notification.service")
            const teamUserIds = await getPartnerTeamUserIds(order.partner_id)
            if (teamUserIds.length > 0) {
                const orderNum = order.order_number || order.id.slice(0, 8).toUpperCase()
                await createNotificationsForUsers(teamUserIds, (userId) => ({
                    userId,
                    type: "order_refunded",
                    title: "Nova solicitação de devolução",
                    message: `O cliente solicitou devolução/troca para o pedido #${orderNum}.`,
                    entityType: "order",
                    entityId: order.id,
                    data: {
                        audience: "seller",
                        return_request_id: requestId,
                    },
                    idempotencyKey: `return-request-partner-notify:${requestId}:${userId}`,
                }))
            }
        } catch (notifyErr) {
            console.error("[createMarketplaceReturnRequestAction] Failed to notify partner:", notifyErr)
        }

        return successResponse({ id: requestId })
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao enviar solicitação")
    }
}

export async function createMarketplaceCancellationRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)
    try {
        const user = await requireUser()
        const data = createCancellationSchema.parse(input)
        await requireOrderAccess(data.orderId)
        const supabase = createAdminClient()

        const { data: existingRequest } = await supabase
            .from("return_requests")
            .select("id")
            .eq("order_id", data.orderId)
            .is("deleted_at", null)
            .maybeSingle()

        if (existingRequest) {
            throw new Error("Já existe uma solicitação de devolução/cancelamento ativa para este pedido.")
        }

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, partner_id, buyer_id, situation, delivery_status, order_number")
            .eq("id", data.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido nao encontrado")
        if (order.buyer_id !== user.id) throw new Error("Sem permissao")
        if (!canRequestOrderCancellation(order)) {
            throw new Error("Este pedido ja esta em entrega. Para continuar, solicite devolução, troca ou reembolso.")
        }

        const { data: created, error } = await supabase.rpc("create_return_request", {
            p_partner_id: order.partner_id,
            p_order_id: data.orderId,
            p_created_by: user.id,
            p_source: "marketplace",
            p_resolution: "none",
            p_reason: data.reason,
            p_message: data.details || null,
            p_items: [],
            p_evidence: [],
            p_idempotency_key: data.idempotencyKey || `cancel:${data.orderId}:${user.id}`,
            p_expires_at: null,
            p_request_type: "cancellation",
        })

        if (error) throw error
        const requestId = String((created as any)?.id || "")

        await logAuditEvent({
            partnerId: order.partner_id,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: requestId,
            actionType: "created",
            changeLines: ["solicitou cancelamento do pedido pelo marketplace."],
            metadata: { orderId: data.orderId, reason: data.reason, source: "marketplace" },
            source: "marketplace",
        })

        await revalidateReturns(order.partner_id, data.orderId, requestId)

        // Notify partner team
        try {
            const { createNotificationsForUsers, getPartnerTeamUserIds } = await import("@/lib/services/notification.service")
            const teamUserIds = await getPartnerTeamUserIds(order.partner_id)
            if (teamUserIds.length > 0) {
                const orderNum = order.order_number || order.id.slice(0, 8).toUpperCase()
                await createNotificationsForUsers(teamUserIds, (userId) => ({
                    userId,
                    type: "order_cancelled",
                    title: "Nova solicitação de cancelamento",
                    message: `O cliente solicitou o cancelamento do pedido #${orderNum}.`,
                    entityType: "order",
                    entityId: order.id,
                    data: {
                        audience: "seller",
                        return_request_id: requestId,
                    },
                    idempotencyKey: `cancel-request-partner-notify:${requestId}:${userId}`,
                }))
            }
        } catch (notifyErr) {
            console.error("[createMarketplaceCancellationRequestAction] Failed to notify partner:", notifyErr)
        }

        return successResponse({ id: requestId })
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao solicitar cancelamento")
    }
}


async function maybeRefundMercadoPago(params: {
    partnerId: string
    requestId: string
    refundId: string
    amount: number
    order: any
    idempotencyKey?: string
}): Promise<{ success: boolean; mpRefundId?: string; error?: string }> {
    if (!params.refundId || !params.order?.mp_payment_id || params.amount <= 0) {
        return { success: false, error: "Parâmetros inválidos para reembolso" }
    }
    const supabase = createAdminClient()

    try {
        const accessToken = await getValidMercadoPagoAccessToken(params.partnerId)
        const refundablePaidAmount = getOrderAmountPaid(params.order || {})
        const body = params.amount >= refundablePaidAmount
            ? {}
            : { amount: Number(params.amount.toFixed(2)) }

        const response = await fetch(`https://api.mercadopago.com/v1/payments/${params.order.mp_payment_id}/refunds`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": params.idempotencyKey || `return-${params.requestId}-${params.refundId}`,
            },
            body: JSON.stringify(body),
        })

        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
            const errorMsg = result?.message || "Mercado Pago refund failed"
            await supabase
                .from("return_refunds")
                .update({ status: "FAILED", error_message: errorMsg, updated_at: new Date().toISOString() })
                .eq("id", params.refundId)
            return { success: false, error: errorMsg }
        }

        const mpRefundId = result?.id ? String(result.id) : null
        await supabase
            .from("return_refunds")
            .update({
                status: "APPROVED",
                payment_provider: "Mercado Pago",
                mp_payment_id: params.order.mp_payment_id,
                mp_refund_id: mpRefundId,
                updated_at: new Date().toISOString(),
            })
            .eq("id", params.refundId)

        return { success: true, mpRefundId: mpRefundId || undefined }
    } catch (error: any) {
        const errorMsg = error?.message || "Mercado Pago refund failed"
        await supabase
            .from("return_refunds")
            .update({ status: "FAILED", error_message: errorMsg, updated_at: new Date().toISOString() })
            .eq("id", params.refundId)
        return { success: false, error: errorMsg }
    }
}

export async function processReturnRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    try {
        const user = await requireUser()
        const data = processReturnSchema.parse(input)
        await requireMinimumPlan(data.partnerId, "crescer")
        if (data.nextStatus && !RETURN_STATUS_SET.has(data.nextStatus)) throw new Error("Status invalido")

        const access = await requirePermission(data.partnerId, "orders", "edit")
        assertRole(access.roleId, MANAGE_ROLES)
        const supabase = createAdminClient()

        const { data: request, error: requestError } = await supabase
            .from("return_requests")
            .select(`
                id, partner_id, order_id, status, request_type, desired_resolution, approved_resolution, order_total_snapshot, customer_id, customer_name_snapshot, customer_email_snapshot,
                orders!order_id(total_amount, amount_paid, payment_provider, mp_payment_id, payment_breakdown, buyer_id, customer_name),
                return_items!return_items_return_request_id_fkey(net_item_value_snapshot)
            `)
            .eq("id", data.requestId)
            .eq("partner_id", data.partnerId)
            .is("deleted_at", null)
            .single()

        if (requestError || !request) throw new Error("Solicitação nao encontrada")
        if (["RESOLVED", "REJECTED", "EXPIRED"].includes(request.status)) throw new Error("Solicitação bloqueada")

        // Map buyer user UUID to ERP customers table ID to avoid foreign key violations on transactions
        const buyerId = (request as any).orders?.buyer_id || (request as any).customer_id
        let erpCustomerId: string | null = data.customerId || null
        if (!erpCustomerId) {
            if (buyerId) {
                const { data: existingCustomer } = await supabase
                    .from("customers")
                    .select("id")
                    .eq("partner_id", request.partner_id)
                    .eq("marketplace_user_id", buyerId)
                    .maybeSingle()

                if (existingCustomer) {
                    erpCustomerId = existingCustomer.id
                } else {
                    const { data: directCustomer } = await supabase
                        .from("customers")
                        .select("id")
                        .eq("partner_id", request.partner_id)
                        .eq("id", buyerId)
                        .maybeSingle()

                    if (directCustomer) {
                        erpCustomerId = directCustomer.id
                    } else {
                        try {
                            const { ensureMarketplaceCustomer } = await import("@/lib/services/marketplace-customer")
                            const buyerName = (request as any).orders?.customer_name || (request as any).customer_name_snapshot || "Cliente"
                            const buyerEmail = (request as any).customer_email_snapshot || null

                            erpCustomerId = await ensureMarketplaceCustomer({
                                partnerId: request.partner_id,
                                name: buyerName,
                                email: buyerEmail,
                                userId: buyerId,
                            })
                        } catch (err) {
                            console.error("[processReturnRequest] Error mapping marketplace customer:", err)
                        }
                    }
                }
            }
        }

        // Update customer_id on return request to the resolved ERP customer (or null if none)
        await supabase
            .from("return_requests")
            .update({ customer_id: erpCustomerId })
            .eq("id", data.requestId)

        const maxActionAmount = (request as any).request_type === "cancellation"
            ? getOrderAmountPaid((request as any).orders || {})
            : toNumber(((request as any).return_items || []).reduce((sum: number, item: any) => sum + toNumber(item.net_item_value_snapshot), 0))
        if (data.refundAmount > maxActionAmount + 0.009) throw new Error("Valor de reembolso excede o valor pago proporcional dos itens")
        if (data.storeCreditAmount > maxActionAmount + 0.009) throw new Error("Valor de credito excede o valor pago proporcional dos itens")
        if (data.refundAmount + data.storeCreditAmount > maxActionAmount + 0.009) throw new Error("A soma de reembolso e credito excede o valor pago proporcional dos itens")

        const paymentProvider = String((request as any).orders?.payment_provider || "").toLowerCase()
        const hasMercadoPago = Boolean((request as any).orders?.mp_payment_id) || paymentProvider.includes("mercado")

        // Expose Mercado Pago refund trigger based on explicit selection
        const isMpRefund = hasMercadoPago && (data.refundPaymentMethod === "Mercado Pago" || data.refundPaymentMethod === "mercado_pago")

        // Antes de prosseguir, verifica se o pagamento realmente existe no Mercado Pago
        if (isMpRefund && !data.skipMpPaymentCheck) {
            try {
                const mpPaymentId = (request as any).orders?.mp_payment_id
                if (mpPaymentId) {
                    const mpAccessToken = await getValidMercadoPagoAccessToken(data.partnerId)
                    const mpCheck = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
                        headers: { Authorization: `Bearer ${mpAccessToken}` },
                    })
                    if (!mpCheck.ok) {
                        return successResponse({ mpPaymentNotFound: true })
                    }
                }
            } catch {
                return successResponse({ mpPaymentNotFound: true })
            }
        }

        const refundStatus = data.refundAmount > 0
            ? (isMpRefund ? "PENDING" : data.refundStatus)
            : data.refundStatus

        const useSelectiveReturn = data.returnToInventoryItems !== undefined && data.returnToInventoryItems !== null
        const pReturnToInventoryForRpc = useSelectiveReturn ? false : data.returnToInventory

        const approvedResolution = request.desired_resolution || request.approved_resolution
        const isExchange = approvedResolution === "exchange"
        const pRefundAmountForRpc = isExchange ? 0 : data.refundAmount

        const { data: processed, error } = await supabase.rpc("process_return_request", {
            p_request_id: data.requestId,
            p_actor_user_id: user.id,
            p_action: data.action,
            p_next_status: data.nextStatus || null,
            p_refund_amount: pRefundAmountForRpc,
            p_refund_status: refundStatus,
            p_refund_payment_method: data.refundPaymentMethod || null,
            p_return_to_inventory: pReturnToInventoryForRpc,
            p_store_credit_amount: data.storeCreditAmount,
            p_exchange_items: data.exchangeItems,
            p_exchange_balance_resolution: data.exchangeBalanceResolution || null,
            p_notes: data.notes || null,
            p_idempotency_key: data.idempotencyKey || crypto.randomUUID(),
        })

        if (error) throw error

        const result = processed as any

        // Selective inventory return handling
        let returnToStockItems: { product_id: string; variant_id: string | null; quantity: number }[] = []
        if (useSelectiveReturn && data.returnToInventoryItems && data.returnToInventoryItems.length > 0) {
            const { data: dbItems, error: dbItemsErr } = await supabase
                .from("return_items")
                .select("product_id, variant_id, quantity")
                .eq("return_request_id", data.requestId)
                .in("id", data.returnToInventoryItems)

            if (dbItemsErr) throw dbItemsErr

            returnToStockItems = (dbItems || []).map((item: any) => ({
                product_id: item.product_id,
                variant_id: item.variant_id || null,
                quantity: item.quantity,
            }))
        } else if (data.returnToInventory && !useSelectiveReturn) {
            const { data: dbItems, error: dbItemsErr } = await supabase
                .from("return_items")
                .select("product_id, variant_id, quantity")
                .eq("return_request_id", data.requestId)

            if (dbItemsErr) throw dbItemsErr

            returnToStockItems = (dbItems || []).map((item: any) => ({
                product_id: item.product_id,
                variant_id: item.variant_id || null,
                quantity: item.quantity,
            }))
        }

        if (returnToStockItems.length > 0) {
            const { data: existingMovement } = await supabase
                .from("stock_movements")
                .select("id")
                .eq("source_return_request_id", data.requestId)
                .limit(1)
                .maybeSingle()

            if (!existingMovement) {
                const { data: stockMovementRes, error: stockMovementErr } = await supabase.rpc("create_batch_stock_movement", {
                    p_partner_id: request.partner_id,
                    p_direction: "in",
                    p_reason: "RETURN_IN",
                    p_notes: "Devolução do cliente",
                    p_created_by: user.id,
                    p_items: returnToStockItems,
                })

                if (stockMovementErr) throw stockMovementErr

                const v_stock_movement_id = stockMovementRes?.id || null
                if (v_stock_movement_id) {
                    await supabase
                        .from("stock_movements")
                        .update({
                            source_return_request_id: data.requestId,
                            reason: "RETURN_IN",
                            notes: `Devolução do cliente - solicitação DVL-${data.requestId.slice(0, 6).toUpperCase()}`
                        })
                        .eq("id", v_stock_movement_id)

                    await supabase
                        .from("return_requests")
                        .update({
                            inventory_movement_id: v_stock_movement_id
                        })
                        .eq("id", data.requestId)
                }
            }
        }

        // Post-sales Phase 1 adjustment: Cancellation approved/resolved -> Cancel Order + Sync appointments/transactions
        if (request.request_type === "cancellation" && (data.nextStatus === "APPROVED" || data.nextStatus === "RESOLVED")) {
            const { error: updateOrderError } = await supabase
                .from("orders")
                .update({
                    situation: "cancelled",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", request.order_id)

            if (updateOrderError) {
                console.error("[processReturnRequest] Error updating order to cancelled:", updateOrderError)
            } else {
                await syncCancelledOrderAppointmentsAndTransactions(supabase, request.order_id)
                await logAuditEvent({
                    partnerId: request.partner_id,
                    actorUserId: user.id,
                    entityType: "order",
                    entityId: request.order_id,
                    actionType: "cancelled",
                    changeLines: ["Pedido cancelado - solicitação de cancelamento aprovada."],
                    source: "manual",
                })
            }
        }
        const requestedRefundAmount = data.refundAmount > 0
            ? data.refundAmount
            : data.exchangeBalanceResolution === "refund"
                ? toNumber(result?.exchange_surplus_amount)
                : 0
        // Refund MP não é mais executado aqui.
        // A aprovação da devolução cria o registro return_refund com status PENDING.
        // A execução real do reembolso MP ocorre em executeMercadoPagoRefundAction,
        // que possui todas as validações de segurança (confirmação, senha, cooldown, rate limit, etc.).

        await logAuditEvent({
            partnerId: data.partnerId,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: data.requestId,
            actionType: data.action,
            changeLines: data.nextStatus ? [`alterou status para ${data.nextStatus}.`] : ["atualizou a solicitação."],
            metadata: {
                refundAmount: data.refundAmount,
                storeCreditAmount: data.storeCreditAmount,
                returnToInventory: data.returnToInventory,
                exchangeItems: data.exchangeItems.length,
                exchangeBalanceResolution: data.exchangeBalanceResolution || null,
            },
            source: "manual",
        })

        await revalidateReturns(data.partnerId, request.order_id, data.requestId)
        if (data.returnToInventory || returnToStockItems.length > 0) await revalidateStockMovements(data.partnerId)
        if (data.refundAmount > 0 || data.storeCreditAmount > 0 || toNumber(result?.exchange_shortfall_amount) > 0 || toNumber(result?.exchange_surplus_amount) > 0) await revalidateTransactions(data.partnerId)

        if (buyerId && data.nextStatus) {
            try {
                const { createNotification } = await import("@/lib/services/notification.service")

                let title = "Atualização na sua solicitação de devolução"
                let message = `Sua solicitação de devolução para o pedido #${(request as any).orders?.order_number || request.order_id.slice(0, 8).toUpperCase()} foi atualizada.`

                if (data.nextStatus === "APPROVED") {
                    title = "Solicitação de devolução aprovada!"
                    message = `A solicitação de devolução/troca para o pedido #${(request as any).orders?.order_number || request.order_id.slice(0, 8).toUpperCase()} foi aprovada pelo vendedor.`
                } else if (data.nextStatus === "REJECTED") {
                    title = "Solicitação de devolução recusada"
                    message = `A solicitação de devolução/troca para o pedido #${(request as any).orders?.order_number || request.order_id.slice(0, 8).toUpperCase()} foi recusada pelo vendedor.`
                } else if (data.nextStatus === "RESOLVED") {
                    title = "Solicitação de devolução concluída"
                    message = `A solicitação de devolução/troca para o pedido #${(request as any).orders?.order_number || request.order_id.slice(0, 8).toUpperCase()} foi concluída.`
                    if (data.refundAmount > 0) {
                        message += ` Valor reembolsado: ${data.refundAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
                    }
                    if (data.storeCreditAmount > 0) {
                        message += ` Vale-compra de ${data.storeCreditAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} liberado.`
                    }
                }

                await createNotification({
                    userId: buyerId,
                    type: "order_delivered",
                    title,
                    message,
                    entityType: "order",
                    entityId: request.order_id,
                    data: {
                        return_request_id: request.id,
                        status: data.nextStatus,
                    },
                    idempotencyKey: `return-notify:${request.id}:${data.nextStatus}:${Date.now()}`
                })
            } catch (notifyErr) {
                console.error("[processReturnRequest] Failed to send notification to customer:", notifyErr)
            }
        }

        return successResponse(result)
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao processar devolução")
    }
}

export async function executeMercadoPagoRefundAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.REFUND_EXECUTE)
    const user = await requireUser()
    const data = executeMpRefundSchema.parse(input)
    const supabase = createAdminClient()
    const [ip, userAgent] = await Promise.all([getClientIP(), getClientUserAgent()])

    let processingStarted = false
    let refundOrder: any = null

    try {
        // 1. Permissão exclusiva: orders.can_refund
        const access = await requirePermission(data.partnerId, "orders", "can_refund")

        // 2. Busca refund + request + order no banco
        const { data: refundRec, error: refundErr } = await supabase
            .from("return_refunds")
            .select(`
                id, status, amount, return_request_id, order_id, partner_id,
                return_requests!inner(
                    id, partner_id, order_id, status,
                    orders!order_id(
                        id, partner_id, mp_payment_id, payment_provider,
                        amount_paid, paid_amount, total_amount, payment_breakdown,
                        order_number, customer_name
                    )
                )
            `)
            .eq("id", data.refundId)
            .eq("partner_id", data.partnerId)
            .single()

        if (refundErr || !refundRec) throw new Error("Registro de reembolso não encontrado")
        if (refundRec.status !== "PENDING") throw new Error("Reembolso já foi processado ou está bloqueado")

        const request = refundRec.return_requests as any
        const order = request.orders || {}
        const amount = Number(refundRec.amount || 0)
        if (amount <= 0) throw new Error("Valor de reembolso inválido")

        // 3. Valida pagamento MP
        const mpPaymentId = order.mp_payment_id
        if (!mpPaymentId) throw new Error("Pedido não possui pagamento Mercado Pago")

        // 4. Confirmação REEMBOLSAR (já validada pelo schema)

        // 5. Reautenticação para valores altos
        if (amount > REFUND_PASSWORD_THRESHOLD) {
            if (!data.refundPassword) throw new Error("Confirmação de senha necessária para este valor")

            const { data: userData } = await supabase.auth.admin.getUserById(user.id)
            const userEmail = userData?.user?.email
            if (!userEmail) throw new Error("Não foi possível obter email do usuário")

            const { error: signInErr } = await supabase.auth.signInWithPassword({
                email: userEmail,
                password: data.refundPassword,
            })
            if (signInErr) throw new Error("Senha incorreta")
        }

        // 6. Cooldown para valores muito altos
        if (amount > REFUND_COOLDOWN_THRESHOLD) {
            if (!data.refundCooldownTimestamp) throw new Error("Confirmação de cooldown necessária para este valor")
            const elapsed = (Date.now() - data.refundCooldownTimestamp) / 1000
            if (elapsed < REFUND_COOLDOWN_SECONDS) {
                throw new Error(`Aguarde ${Math.ceil(REFUND_COOLDOWN_SECONDS - elapsed)}s antes de confirmar`)
            }
        }

        // 7. Status guard: race condition prevention
        const { data: updatedRefund, error: updateErr } = await supabase
            .from("return_refunds")
            .update({ status: "PROCESSING", updated_at: new Date().toISOString() })
            .eq("id", data.refundId)
            .eq("status", "PENDING")
            .select("id, status")
            .maybeSingle()

        if (updateErr || !updatedRefund) {
            throw new Error("Reembolso já está sendo processado por outra solicitação")
        }
        processingStarted = true
        refundOrder = order

        // 8. Cap o reembolso ao valor pago via MP
        const mpPaidAmount = extractMercadoPagoPaidAmount(order)
        const cappedAmount = Math.min(amount, mpPaidAmount)
        if (cappedAmount <= 0) throw new Error("Nenhum valor pago via Mercado Pago para reembolsar")

        // 9. Executa reembolso na API do Mercado Pago
        const mpResult = await maybeRefundMercadoPago({
            partnerId: data.partnerId,
            requestId: data.requestId,
            refundId: data.refundId,
            amount: cappedAmount,
            order,
            idempotencyKey: data.idempotencyKey || `execute-mp-refund:${data.refundId}:${data.requestId}`,
        })

        if (!mpResult.success) {
            throw new Error(mpResult.error || "Falha ao reembolsar no Mercado Pago")
        }

        // 10. Atualiza saldo da conta financeira Mercado Pago
        const { data: mpAcc } = await supabase
            .from("finance_accounts")
            .select("id")
            .eq("partner_id", data.partnerId)
            .eq("integration_source", "mercadopago")
            .eq("is_active", true)
            .maybeSingle()

        let appliedBalanceDelta = false
        if (mpAcc?.id) {
            const { data: txRes } = await supabase
                .from("return_refunds")
                .select("financial_transaction_id")
                .eq("id", data.refundId)
                .single()

            if (txRes?.financial_transaction_id) {
                await supabase
                    .from("transactions")
                    .update({ account_id: mpAcc.id })
                    .eq("id", txRes.financial_transaction_id)

                const { error: deltaErr } = await supabase.rpc("apply_account_balance_delta", {
                    p_account_id: mpAcc.id,
                    p_partner_id: data.partnerId,
                    p_delta: -cappedAmount,
                })
                if (!deltaErr) appliedBalanceDelta = true
            }
        }

        // 11. Auditoria completa
        const auditLines = [
            `Reembolso Mercado Pago executado por ${user.email || user.id}.`,
            `Valor: R$ ${cappedAmount.toFixed(2)}.`,
            `Refund ID: ${mpResult.mpRefundId || "N/A"}.`,
            `Pagamento MP: ${mpPaymentId}.`,
        ]
        if (amount > REFUND_CRITICAL_THRESHOLD) {
            auditLines.push("--- AUDITORIA CRÍTICA: Valor acima do limite de segurança ---")
            auditLines.push(`IP: ${ip}`)
            auditLines.push(`User-Agent: ${userAgent}`)
        }

        await logAuditEvent({
            partnerId: data.partnerId,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: data.requestId,
            actionType: "mercadopago_refund_executed",
            changeLines: auditLines,
            metadata: {
                refundId: data.refundId,
                mpRefundId: mpResult.mpRefundId || null,
                mpPaymentId,
                orderId: order.id,
                returnRequestId: data.requestId,
                amount: cappedAmount,
                userId: user.id,
                roleId: access.roleId,
                ip,
                userAgent,
                appliedBalanceDelta,
            },
            source: "manual",
        })

        // 12. Registra também na timeline do pedido
        await logAuditEvent({
            partnerId: data.partnerId,
            actorUserId: user.id,
            entityType: "order",
            entityId: order.id,
            actionType: "refunded",
            changeLines: [
                `Reembolso Mercado Pago de R$ ${cappedAmount.toFixed(2)} executado.`,
                `Refund ID: ${mpResult.mpRefundId || "N/A"}.`,
            ],
            metadata: {
                refundId: data.refundId,
                mpRefundId: mpResult.mpRefundId || null,
                paymentId: mpPaymentId,
            },
            source: "manual",
        })

        await Promise.all([
            revalidateReturns(data.partnerId, order.id, data.requestId),
            revalidateTransactions(data.partnerId),
            revalidateEntityTimeline("return_request", data.requestId),
            revalidateEntityTimeline("order", order.id),
        ])

        return successResponse({
            refundId: data.refundId,
            mpRefundId: mpResult.mpRefundId,
            amount: cappedAmount,
        })
    } catch (e: any) {
        // Fallback defensivo: se o status guard já foi executado (status = PROCESSING),
        // tenta marcar como FAILED para não ficar stuck eternamente.
        if (processingStarted && data?.refundId) {
            try {
                await supabase
                    .from("return_refunds")
                    .update({
                        status: "FAILED",
                        error_message: `[FALLBACK] ${e?.message || "Erro inesperado"}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", data.refundId)

                console.error("[executeMercadoPagoRefundAction] Fallback FAILED applied:", {
                    refundId: data.refundId,
                    requestId: data.requestId,
                    error: e?.message,
                })

                await logAuditEvent({
                    partnerId: data.partnerId,
                    actorUserId: user.id,
                    entityType: "return_request",
                    entityId: data.requestId,
                    actionType: "mercadopago_refund_failed",
                    changeLines: [
                        `Reembolso MP falhou após status PROCESSING.`,
                        `Erro: ${e?.message || "Desconhecido"}.`,
                        `Fallback automático: status alterado para FAILED.`,
                    ],
                    metadata: {
                        refundId: data.refundId,
                        orderMpPaymentId: refundOrder?.mp_payment_id || null,
                        amount: refundOrder?.amount_paid || null,
                        userId: user.id,
                        errorMessage: e?.message || null,
                        ip,
                        userAgent,
                    },
                    source: "manual",
                })
            } catch (fallbackErr) {
                console.error("[executeMercadoPagoRefundAction] Fallback FAILED update also failed:", fallbackErr)
            }
        }

        return errorResponse(e?.message || "Erro ao executar reembolso Mercado Pago")
    }
}

export async function escalateReturnRequestAction(partnerId: string, requestId: string, reason?: string) {
    return processReturnRequestAction({
        partnerId,
        requestId,
        action: "escalated",
        nextStatus: "ESCALATED",
        refundAmount: 0,
        storeCreditAmount: 0,
        returnToInventory: false,
        notes: reason || "Escalado para moderação Dudit",
        idempotencyKey: `escalate:${requestId}:${Date.now()}`,
    })
}

export async function fetchReturnOrderBucketAction(partnerId: string) {
    try {
        const access = await requirePermission(partnerId, "orders", "view")
        assertRole(access.roleId, VIEW_ROLES)
        const supabase = createAdminClient()

        const { data: orders, error } = await supabase
            .from("orders")
            .select(`
        id,
        order_number,
        total_amount,
        paid_amount,
        subtotal_original,
        discount_total,
        shipping_total,
        amount_paid,
        buyer_id,
        customer_name,
        delivery_address,
        created_at,
        situation,
        delivery_status,
        order_source,
        payment_method,
        payment_provider,
        mp_payment_id,
        order_items (
          id,
          product_name,
          product_price,
          quantity,
          subtotal,
          net_item_value,
          product_id,
          variant_id,
          products (
            sku,
            images,
            video_thumbnail,
            name
          )
        )
      `)
            .eq("partner_id", partnerId)
            .eq("situation", "paid")
            .order("created_at", { ascending: false })
            .limit(200)

        if (error) throw error

        const buyerIds = Array.from(new Set((orders || []).map((o: any) => o.buyer_id).filter(Boolean)))
        const customersMap = new Map<string, any>()
        if (buyerIds.length > 0) {
            try {
                const { data: customersData } = await supabase
                    .from("customers")
                    .select("id, name, email, phone")
                    .in("id", buyerIds)
                    ; (customersData || []).forEach((c: any) => customersMap.set(c.id, c))
            } catch (_) {
                // customers join is optional - snapshot fields cover the essential data
            }
        }

        return (orders || []).map((order: any) => {
            const customer = order.buyer_id ? customersMap.get(order.buyer_id) : null
            const orderItems = order.order_items || []
            const amountPaid = getOrderAmountPaid(order)
            const subtotalOriginal = getOrderSubtotalOriginal(order, orderItems)
            return {
                id: order.id,
                displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
                order_number: order.order_number || null,
                status: order.situation || "pending",
                deliveryStatus: order.delivery_status || "not_sent",
                totalAmount: toNumber(order.total_amount),
                total_amount: toNumber(order.total_amount),
                amountPaid,
                subtotalOriginal,
                discountTotal: toNumber(order.discount_total),
                shippingTotal: toNumber(order.shipping_total),
                buyer_id: order.buyer_id,
                customer_name: order.customer_name || customer?.name || "Cliente",
                delivery_address: order.delivery_address,
                created_at: order.created_at,
                situation: order.situation,
                order_source: order.order_source,
                payment_method: order.payment_method,
                payment_provider: order.payment_provider,
                mp_payment_id: order.mp_payment_id,
                order_items: orderItems.map((item: any) => {
                    const persistedNet = toNumber(item.net_item_value)
                    const fallbackNet = subtotalOriginal > 0
                        ? (getLineSubtotal(item) / subtotalOriginal) * amountPaid
                        : getLineSubtotal(item)
                    return {
                        ...item,
                        net_item_value: persistedNet > 0 ? persistedNet : Number(fallbackNet.toFixed(2)),
                    }
                }),
                customer: customer || null,
                orderDate: order.created_at || null,
            }
        })
    } catch (e: any) {
        console.error("[fetchReturnOrderBucketAction] error:", e)
        return []
    }
}

export async function searchOrderForReturnAction(partnerId: string, orderNumber: string) {
    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId || ctx.partnerId !== partnerId) return { success: false, error: "ERP invalido" }
        const orders = await fetchReturnOrderBucketAction(partnerId)
        const cleanQuery = String(orderNumber || "").trim().toLowerCase()
        return {
            success: true,
            data: cleanQuery ? orders.filter((order: any) => String(order.order_number || order.displayId).toLowerCase().includes(cleanQuery)).slice(0, 10) : [],
        }
    } catch (e: any) {
        return { success: false, error: e?.message || "Erro ao buscar pedido" }
    }
}
