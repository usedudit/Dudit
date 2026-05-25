"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { requireUser, requirePartnerAccessWithPermission, requireOrderAccess } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { revalidateOrders, revalidateOrderHistory, revalidateStockMovements, revalidateTransactions, revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import type { ReturnRequestListItem } from "@/lib/returns/types"
import {
    canRequestOrderCancellation,
    canRequestPostFulfillmentResolution,
    getLineSubtotal,
    getOrderAmountPaid,
    getOrderSubtotalOriginal,
} from "@/lib/returns/calculations"

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

function normalizeReturnRow(row: any): ReturnRequestListItem {
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
        expiresAt: row.expires_at,
        items,
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
        const access = await requirePartnerAccessWithPermission(partnerId, "orders", "view")
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
        orders!order_id(order_number, customer_name, situation, delivery_status, delivery_address, buyer:buyer_id(name, email, phone)),
        return_items(
          id, order_item_id, product_id, variant_id, product_name_snapshot, sku_snapshot,
          unit_price_snapshot, net_item_value_snapshot, ordered_quantity, quantity, condition, reason, desired_resolution,
          products!product_id(images, video_thumbnail)
        ),
        return_evidence(id, file_url, file_type, thumbnail_url)
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
        const access = await requirePartnerAccessWithPermission(partnerId, "orders", "view")
        assertRole(access.roleId, VIEW_ROLES)
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from("return_requests")
            .select(`
        *,
        orders!order_id(order_number, customer_name, total_amount, payment_method, payment_provider, mp_payment_id, situation, delivery_status, delivery_address, buyer:buyer_id(name, email, phone)),
        return_items(*, products!product_id(images, video_thumbnail)),
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
        return successResponse(normalizeReturnRow(data))
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao carregar devolucao")
    }
}

export async function createReturnRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    try {
        const user = await requireUser()
        const data = createReturnSchema.parse(input)
        const access = await requirePartnerAccessWithPermission(data.partnerId, "orders", "edit")
        assertRole(access.roleId, MANAGE_ROLES)
        const supabase = createAdminClient()

        // Validate that the order has situation = 'paid'
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, situation")
            .eq("id", data.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido não encontrado")
        if (order.situation !== "paid") {
            throw new Error("Não é permitido criar devolução para pedidos não pagos.")
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
            changeLines: ["criou solicitacao de troca/devolucao."],
            metadata: { orderId: data.orderId, resolution: data.resolution },
            source: "manual",
        })

        // If status is provided and is not PENDING_REVIEW, process the state change internally
        if (data.status && data.status !== "PENDING_REVIEW") {
            const processRes = await processReturnRequestAction({
                partnerId: data.partnerId,
                requestId,
                action: "updated",
                nextStatus: data.status,
                refundAmount: data.refundValue || 0,
                refundStatus: (data.refundValue || 0) > 0 ? "APPROVED" : "PENDING",
                refundPaymentMethod: data.resolution === "refund" ? "MANUAL" : null,
                returnToInventory: data.returnToInventory || false,
                storeCreditAmount: data.storeCreditValue || 0,
                exchangeItems: data.exchangeItems || [],
                exchangeBalanceResolution: data.exchangeBalanceResolution || null,
                notes: data.message || "",
                idempotencyKey: `erp-init-process:${requestId}:${Date.now()}`,
            })
            if (!processRes.success) {
                throw new Error(`Criou devolução, mas falhou ao processar status: ${processRes.error}`)
            }
        }

        await revalidateReturns(data.partnerId, data.orderId, requestId)
        return successResponse({ id: requestId })
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao criar devolucao")
    }
}

export async function createMarketplaceReturnRequestAction(input: Omit<z.infer<typeof createReturnSchema>, "partnerId">) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)
    try {
        const user = await requireUser()
        const base = createReturnSchema.omit({ partnerId: true }).parse(input)
        await requireOrderAccess(base.orderId)
        const supabase = createAdminClient()

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, partner_id, buyer_id, situation, delivery_status")
            .eq("id", base.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido nao encontrado")
        if (order.buyer_id !== user.id) throw new Error("Sem permissao")
        if (String(order.situation || "").toLowerCase() === "cancelled") throw new Error("Pedido cancelado nao aceita devolucao")
        if (!canRequestPostFulfillmentResolution(order)) {
            throw new Error("Este pedido ainda nao saiu para entrega. Solicite o cancelamento enquanto a entrega nao iniciou.")
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
        await revalidateReturns(order.partner_id, base.orderId, requestId)
        return successResponse({ id: requestId })
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao enviar solicitacao")
    }
}

export async function createMarketplaceCancellationRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ORDER_CREATE)
    try {
        const user = await requireUser()
        const data = createCancellationSchema.parse(input)
        await requireOrderAccess(data.orderId)
        const supabase = createAdminClient()

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, partner_id, buyer_id, situation, delivery_status")
            .eq("id", data.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido nao encontrado")
        if (order.buyer_id !== user.id) throw new Error("Sem permissao")
        if (!canRequestOrderCancellation(order)) {
            throw new Error("Este pedido ja esta em entrega. Para continuar, solicite devolucao, troca ou reembolso.")
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
        await revalidateReturns(order.partner_id, data.orderId, requestId)
        return successResponse({ id: requestId })
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao solicitar cancelamento")
    }
}

async function maybeRefundMercadoPago(params: {
    partnerId: string
    requestId: string
    refundId?: string | null
    amount: number
    order: any
}) {
    if (!params.refundId || !params.order?.mp_payment_id || params.amount <= 0) return
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
                "X-Idempotency-Key": `return-${params.requestId}-${params.refundId}`,
            },
            body: JSON.stringify(body),
        })

        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
            await supabase
                .from("return_refunds")
                .update({ status: "FAILED", error_message: result?.message || "Mercado Pago refund failed", updated_at: new Date().toISOString() })
                .eq("id", params.refundId)
            return
        }

        await supabase
            .from("return_refunds")
            .update({
                status: "APPROVED",
                payment_provider: "Mercado Pago",
                mp_payment_id: params.order.mp_payment_id,
                mp_refund_id: result?.id ? String(result.id) : null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", params.refundId)
    } catch (error: any) {
        await supabase
            .from("return_refunds")
            .update({ status: "FAILED", error_message: error?.message || "Mercado Pago refund failed", updated_at: new Date().toISOString() })
            .eq("id", params.refundId)
    }
}

export async function processReturnRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    try {
        const user = await requireUser()
        const data = processReturnSchema.parse(input)
        if (data.nextStatus && !RETURN_STATUS_SET.has(data.nextStatus)) throw new Error("Status invalido")

        const access = await requirePartnerAccessWithPermission(data.partnerId, "orders", "edit")
        assertRole(access.roleId, MANAGE_ROLES)
        const supabase = createAdminClient()

        const { data: request, error: requestError } = await supabase
            .from("return_requests")
            .select(`
                id, partner_id, order_id, status, request_type, order_total_snapshot,
                orders!order_id(total_amount, amount_paid, payment_provider, mp_payment_id),
                return_items(net_item_value_snapshot)
            `)
            .eq("id", data.requestId)
            .eq("partner_id", data.partnerId)
            .is("deleted_at", null)
            .single()

        if (requestError || !request) throw new Error("Solicitacao nao encontrada")
        if (["RESOLVED", "REJECTED", "EXPIRED"].includes(request.status)) throw new Error("Solicitacao bloqueada")
        const maxActionAmount = (request as any).request_type === "cancellation"
            ? getOrderAmountPaid((request as any).orders || {})
            : toNumber(((request as any).return_items || []).reduce((sum: number, item: any) => sum + toNumber(item.net_item_value_snapshot), 0))
        if (data.refundAmount > maxActionAmount + 0.009) throw new Error("Valor de reembolso excede o valor pago proporcional dos itens")
        if (data.storeCreditAmount > maxActionAmount + 0.009) throw new Error("Valor de credito excede o valor pago proporcional dos itens")
        if (data.refundAmount + data.storeCreditAmount > maxActionAmount + 0.009) throw new Error("A soma de reembolso e credito excede o valor pago proporcional dos itens")

        const paymentProvider = String((request as any).orders?.payment_provider || "").toLowerCase()
        const hasMercadoPago = Boolean((request as any).orders?.mp_payment_id) || paymentProvider.includes("mercado")
        const refundStatus = data.refundAmount > 0
            ? (hasMercadoPago ? "PROCESSING" : data.refundStatus)
            : data.refundStatus

        const { data: processed, error } = await supabase.rpc("process_return_request", {
            p_request_id: data.requestId,
            p_actor_user_id: user.id,
            p_action: data.action,
            p_next_status: data.nextStatus || null,
            p_refund_amount: data.refundAmount,
            p_refund_status: refundStatus,
            p_refund_payment_method: data.refundPaymentMethod || null,
            p_return_to_inventory: data.returnToInventory,
            p_store_credit_amount: data.storeCreditAmount,
            p_exchange_items: data.exchangeItems,
            p_exchange_balance_resolution: data.exchangeBalanceResolution || null,
            p_notes: data.notes || null,
            p_idempotency_key: data.idempotencyKey || crypto.randomUUID(),
        })

        if (error) throw error

        const result = processed as any
        const mercadoPagoRefundAmount = data.refundAmount > 0
            ? data.refundAmount
            : data.exchangeBalanceResolution === "refund"
                ? toNumber(result?.exchange_surplus_amount)
                : 0
        if (hasMercadoPago && mercadoPagoRefundAmount > 0) {
            await maybeRefundMercadoPago({
                partnerId: data.partnerId,
                requestId: data.requestId,
                refundId: result?.refund_id,
                amount: mercadoPagoRefundAmount,
                order: (request as any).orders,
            })
        }

        await logAuditEvent({
            partnerId: data.partnerId,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: data.requestId,
            actionType: data.action,
            changeLines: data.nextStatus ? [`alterou status para ${data.nextStatus}.`] : ["atualizou a solicitacao."],
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
        if (data.returnToInventory) await revalidateStockMovements(data.partnerId)
        if (data.refundAmount > 0 || data.storeCreditAmount > 0 || toNumber(result?.exchange_shortfall_amount) > 0 || toNumber(result?.exchange_surplus_amount) > 0) await revalidateTransactions(data.partnerId)

        return successResponse(result)
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao processar devolucao")
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
        notes: reason || "Escalado para moderacao Dudit",
        idempotencyKey: `escalate:${requestId}:${Date.now()}`,
    })
}

export async function fetchReturnOrderBucketAction(partnerId: string) {
    try {
        const access = await requirePartnerAccessWithPermission(partnerId, "orders", "view")
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
                // customers join is optional — snapshot fields cover the essential data
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
