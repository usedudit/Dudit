"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { verifyUserPassword } from "@/lib/auth/verify-password"
import { requireUser, requireMinimumPlan, requireOrderAccess, requireStorePermission } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { can } from "@/lib/permissions/can"
import type { RbacUserLike } from "@/lib/permissions/rbac-types"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { revalidateOrders, revalidateOrderHistory, revalidateStockMovements, revalidateTransactions, revalidateEntityTimeline } from "@/lib/utils/revalidation"
import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { getPartnerCapabilities } from "@/lib/services/partner-capabilities"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { getTrustedClientIP } from "@/lib/security/client-ip"
import { syncCancelledOrderAppointmentsAndTransactions } from "@/lib/services/sync-cancellation"
import { getValidMercadoPagoAccessToken } from "@/lib/mercadopago/token-manager"
import type { ReturnRequestListItem } from "@/lib/returns/types"
import { getReturnableQuantities } from "@/lib/returns/returnable-quantities"
import { userOwnsBuyerOrder, resolveBuyerCustomerId } from "@/lib/orders/buyer-access"
import {
    canRequestOrderCancellation,
    extractMercadoPagoPaidAmount,
    getLineSubtotal,
    getOrderAmountPaid,
    getOrderSubtotalOriginal,
} from "@/lib/returns/calculations"
import { captureError, addMonitoringBreadcrumb } from "@/lib/monitoring/sentry"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { isSystemResourceActive } from "@/lib/system-resources"
import { sendSlaExpired, sendExchangeCreated } from "@/lib/services/discord-general-webhook.service"
import { requireAdminScope } from "@/lib/auth/admin-authorization"
import { adminAuditLog } from "@/lib/admin/audit"
import { AdminActionType } from "@/lib/admin/types"
import { applyAdminActionContext, type AdminActionContext } from "@/lib/admin/action-context"

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

function getReturnUserMessage(error: unknown, fallback: string): string {
    if (error && typeof error === "object" && "code" in error) return fallback
    return error instanceof Error && error.message ? error.message : fallback
}

const MANAGE_ROLES = new Set(["owner", "admin", "manager"])
const VIEW_ROLES = new Set(["owner", "admin", "manager", "operator"])

const evidenceSchema = z.object({
    file_url: z.string().url().nullable().optional(),
    file_key: z.string().max(500).nullable().optional(),
    file_name: z.string().max(255).nullable().optional(),
    file_type: z.string().max(120).nullable().optional(),
    file_size: z.number().int().nonnegative().max(10 * 1024 * 1024).nullable().optional(),
    thumbnail_url: z.string().url().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
})

async function verifyReturnEvidencePayload(evidence: z.infer<typeof evidenceSchema>[], ownerUserId: string) {
    if (evidence.length === 0) return []
    const [{ verifyUploadedObject }, { validateUploadRequest }] = await Promise.all([
        import("@/lib/r2/server"),
        import("@/lib/security/file-validator"),
    ])
    const expectedKeyPattern = new RegExp(`^users/${ownerUserId}/returns/[^/]+$`)
    const verifiedEvidence = []

    for (const item of evidence) {
        const key = item.file_key
        const fileName = item.file_name
        const fileType = item.file_type
        const fileSize = item.file_size
        if (
            !key || !expectedKeyPattern.test(key) || key.includes("..") ||
            !fileName || !fileType || typeof fileSize !== "number" || !Number.isSafeInteger(fileSize) || fileSize < 1
        ) {
            throw new Error("Evidência inválida ou não pertence a este usuário.")
        }
        const validation = validateUploadRequest(fileName, fileType, fileSize)
        if (!validation.success) throw new Error(validation.error || "Arquivo de evidência inválido.")
        const verified = await verifyUploadedObject(key, fileSize, fileType)
        verifiedEvidence.push({
            // Private evidence is addressed only by key; the key is authorized
            // and signed separately when an authorized participant opens it.
            file_url: null,
            file_key: key,
            file_name: fileName,
            file_type: fileType,
            file_size: verified.contentLength,
            metadata: { fileHash: verified.sha256 },
        })
    }
    return verifiedEvidence
}

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
    reasonCategory: z.enum([
        "buyer_remorse",
        "size_fit",
        "wrong_item",
        "defective",
        "damaged",
        "not_as_described",
        "missing_parts",
        "arrived_late",
        "other",
    ]).optional().nullable(),
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
        product_name: z.string().optional().nullable(),
        sku: z.string().optional().nullable(),
    })).max(100).optional().nullable(),
    exchangeBalanceResolution: z.enum(["refund", "store_credit"]).nullable().optional(),
    returnToInventory: z.boolean().optional().nullable(),
    customerId: z.string().uuid().optional().nullable(),
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
    returnToInventoryItems: z.array(z.object({
        id: z.string().uuid(),
        quantity: z.number().int().positive(),
    })).optional().nullable(),
    customerId: z.string().uuid().optional().nullable(),
    storeCreditAmount: z.number().nonnegative().max(99999999).default(0),
    exchangeItems: z.array(z.object({
        product_id: z.string().uuid(),
        variant_id: z.string().uuid().nullable().optional(),
        quantity: z.number().int().positive().max(999),
        unit_price: z.number().nonnegative().max(99999999),
    })).max(100).default([]),
    exchangeBalanceResolution: z.enum(["refund", "store_credit"]).nullable().optional(),
    notes: z.string().max(500).optional().nullable(),
    idempotencyKey: z.string().trim().max(160).optional().nullable(),
    skipMpPaymentCheck: z.boolean().optional().default(false),
    accountId: z.string().uuid().optional().nullable(),
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
})

function assertRole(roleId: string, allowed: Set<string>) {
    const normalized = String(roleId || "").toLowerCase()
    if (!allowed.has(normalized)) {
        throw new Error("Sem permissao para esta acao")
    }
}

function assertPermission(access: { roleId: string; permissions: any }, permission: string) {
    if (!can(access as RbacUserLike, permission)) {
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
        return getTrustedClientIP(h)
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
        const serviceImages = item.order_items?.services?.images
        const image = (Array.isArray(productImages) && productImages[0]
            ? productImages[0]
            : item.products?.video_thumbnail || productImages
            || (Array.isArray(serviceImages) && serviceImages[0]
                ? serviceImages[0]
                : item.order_items?.services?.video_thumbnail || serviceImages
            )
            || null)
        return {
            id: item.id,
            orderItemId: item.order_item_id,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name_snapshot,
            sku: item.sku_snapshot || item.order_items?.services?.sku || null,
            image,
            price: toNumber(item.unit_price_snapshot),
            netItemValue: toNumber(item.net_item_value_snapshot),
            quantity: Number(item.quantity || 0),
            orderedQuantity: Number(item.ordered_quantity || 0),
            reason: item.reason,
            condition: item.condition,
        }
    })

    const exchangeItems = (() => {
        if (row.exchange_items_snapshot && Array.isArray(row.exchange_items_snapshot)) {
            return row.exchange_items_snapshot.map((ei: any) => ({
                product_id: ei.product_id,
                variant_id: ei.variant_id || null,
                quantity: ei.quantity || 1,
                unit_price: Number(ei.unit_price || ei.price || 0),
                product_name: ei.product_name || ei.name || "",
                sku: ei.sku || "",
            }))
        }
        return undefined
    })()

    const refundRecord = (row.return_refunds && Array.isArray(row.return_refunds) && row.return_refunds.length > 0) ? row.return_refunds[0] : null
    const storeCreditRecord = (row.store_credits && Array.isArray(row.store_credits) && row.store_credits.length > 0) ? row.store_credits[0] : null

    const resolvedRefundVal = toNumber(row.refund_amount) > 0
        ? toNumber(row.refund_amount)
        : (refundRecord && toNumber(refundRecord.amount) > 0 ? toNumber(refundRecord.amount) : 0)

    const resolvedCreditVal = toNumber(row.store_credit_amount) > 0
        ? toNumber(row.store_credit_amount)
        : (storeCreditRecord && toNumber(storeCreditRecord.amount) > 0 ? toNumber(storeCreditRecord.amount) : 0)

    const orderPaid = toNumber(row.order_total_snapshot || row.orders?.amount_paid || row.orders?.paid_amount || row.orders?.total_amount || row.order_total_snapshot)
    const resolvedRefundType = refundRecord?.refund_type
        ? refundRecord.refund_type
        : (resolvedRefundVal > 0 && orderPaid > 0 && Math.abs(resolvedRefundVal - orderPaid) < 0.01 ? "full" : (resolvedRefundVal > 0 ? "partial" : undefined))

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
        deliveryType: row.orders?.delivery_type || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        source: row.source || "erp",
        requestType: row.request_type || undefined,
        desiredResolution: row.desired_resolution,
        approvedResolution: row.approved_resolution,
        reason: row.reason,
        status: row.status,
        refundValue: resolvedRefundVal,
        refundType: resolvedRefundType,
        storeCreditValue: resolvedCreditVal,
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
        orderTotal: toNumber(row.order_total_snapshot || row.orders?.total_amount),
        orderPaidAmount: orderPaid,
        refundPaymentMethod: row.refund_payment_method || (refundRecord ? refundRecord.payment_method : undefined),
        exchangeOrderId: row.exchange_order_id || undefined,
        exchangeSubstatus: row.exchange_substatus || undefined,
        exchangeShortfallAmount: toNumber(row.exchange_shortfall_amount),
        exchangeSurplusAmount: toNumber(row.exchange_surplus_amount),
        exchangeItemsSnapshot: exchangeItems,
        exchangeBalanceResolution: (row.exchange_balance_resolution || ((row.approved_resolution === "exchange" || row.desired_resolution === "exchange") && toNumber(row.exchange_surplus_amount) > 0
            ? (toNumber(row.store_credit_amount) > 0 ? "store_credit" : toNumber(row.refund_amount) > 0 ? "refund" : undefined)
            : undefined)) as any,
        items,
        returnEvents: (row.auditLogs || []).map((e: any) => ({
            id: e.id,
            return_request_id: e.return_request_id,
            previous_status: e.from_status || null,
            new_status: e.to_status || null,
            changed_by: e.actor_user_id || null,
            actor_name: e.actor_name || undefined,
            notes: e.message || null,
            metadata: e.metadata || {},
            event_type: e.event_type,
            created_at: e.created_at,
        })),
    }
}

async function revalidateReturns(partnerId: string, orderId?: string, requestId?: string) {
    revalidatePath("/erp/devolucoes")
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
        assertPermission(access, "orders.list")
        const supabase = createAdminClient()
        const ctx = await getCurrentPartnerContext()
        const storeId = ctx?.activeStoreId || ""
        const limit = Math.max(1, Math.min(100, Number(options?.limit || 50)))
        const fetchLimit = limit + 1

        let query = supabase
            .from("return_requests")
            .select(`
        id, partner_id, store_id, order_id, customer_id, customer_user_id, source, request_type, desired_resolution, approved_resolution,
        reason, customer_reason, customer_message, customer_details, seller_notes, internal_notes, status, refund_amount, store_credit_amount,
        order_number_snapshot, order_total_snapshot, customer_name_snapshot, customer_email_snapshot, expires_at, created_at, updated_at,
        eligibility_status, eligibility_details, policy_snapshot, sla_due_at, sla_status, sla_expired_at, reported_to_dudit_at, dudit_report_id,
        orders!order_id(order_number, customer_name, situation, delivery_status, delivery_address, buyer_id, payment_provider, mp_payment_id),
        return_items!return_items_return_request_id_fkey(
          id, order_item_id, product_id, variant_id, product_name_snapshot, sku_snapshot,
          unit_price_snapshot, net_item_value_snapshot, ordered_quantity, quantity, condition, reason, desired_resolution,
          products!product_id(images, video_thumbnail),
          order_items!order_item_id(services(id, name, sku, images, video_thumbnail))
        ),
        return_evidence(id, file_url, file_type, thumbnail_url),
        return_refunds(payment_method)
      `)
            .eq("partner_id", partnerId)
            .is("deleted_at", null)

        if (storeId) {
            query = query.eq("store_id", storeId)
        }

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

export async function getReturnRequestDetailsAction(
    partnerId: string,
    requestId: string,
    opts?: { adminBypass?: boolean },
) {
    try {
        const isAdmin = Boolean(opts?.adminBypass)
        if (isAdmin) {
            await requireAdminScope("moderation")
        } else {
            const access = await requirePermission(partnerId, "orders", "view")
            assertPermission(access, "orders.list")
        }
        const supabase = createAdminClient()
        const { data, error } = await supabase
            .from("return_requests")
            .select(`
        *,
        orders!order_id(order_number, customer_name, customer_id, total_amount, amount_paid, paid_amount, payment_method, payment_provider, mp_payment_id, situation, delivery_status, delivery_type, delivery_address, buyer_id, store_id),
        return_items!return_items_return_request_id_fkey(*, products!product_id(images, video_thumbnail)),
        return_evidence(*),
        return_refunds(*),
        store_credits(*)
      `)
            .eq("id", requestId)
            .eq("partner_id", partnerId)
            .is("deleted_at", null)
            .single()

        if (error) throw error

        const requestStoreId = data.store_id || (data as any).orders?.store_id
        if (!isAdmin && requestStoreId) {
            await requireStorePermission(requestStoreId, partnerId, "orders", "view")
        }

        // Fetch buyer/customer details separately if buyer_id/customer_id is present
        let buyerDetails = null
        const buyerId = data?.orders?.buyer_id || null
        const orderCustomerId = data?.orders?.customer_id || null
        if (buyerId || orderCustomerId) {
            // 1. Prefer the disambiguated ERP customer_id on the order
            if (orderCustomerId) {
                const { data: customerData } = await supabase
                    .from("customers")
                    .select("email, phone")
                    .eq("id", orderCustomerId)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                buyerDetails = customerData
            }

            // 2. buyer_id may be a customers.id (polymorphic)
            if (!buyerDetails && buyerId) {
                const { data: customerData } = await supabase
                    .from("customers")
                    .select("email, phone")
                    .eq("id", buyerId)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                buyerDetails = customerData
            }

            // 3. buyer_id may be a marketplace user id mapped to a customer
            if (!buyerDetails && buyerId) {
                const { data: customerData } = await supabase
                    .from("customers")
                    .select("email, phone")
                    .eq("marketplace_user_id", buyerId)
                    .eq("partner_id", partnerId)
                    .maybeSingle()
                buyerDetails = customerData
            }

            // 4. If not found in customers, check if there's a user profile (marketplace user)
            if (!buyerDetails && buyerId) {
                try {
                    const { data: authData } = await supabase.auth.admin.getUserById(buyerId)
                    if (authData?.user?.email) {
                        buyerDetails = { email: authData.user.email, phone: null }
                    }
                } catch (err) {
                    console.error("Error fetching buyer email from auth.users:", err)
                }
            }
        }

        // Fetch events from audit_logs
        const { data: auditLogsData } = await supabase
            .from("audit_logs")
            .select("*")
            .eq("entity_type", "return_request")
            .eq("entity_id", requestId)
            .order("created_at", { ascending: true })

        const actorUserIds = Array.from(new Set((auditLogsData || []).map((e: any) => e.actor_user_id).filter(Boolean)))
        let namesByUserId = new Map<string, string>()
        if (actorUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", actorUserIds)
            if (profiles) {
                namesByUserId = new Map(profiles.map((p: any) => [p.user_id, p.full_name?.trim() || "Usuário"]))
            }
        }

        const returnEvents = (auditLogsData || []).map((e: any) => {
            const meta = e.metadata || e.new_values || {}
            const isErpAction = e.source === "erp" || (meta as any)?.source === "erp"
            const isDuditAction = !isErpAction && Boolean(
                e.source === "admin" ||
                (meta as any)?.is_admin_action ||
                (meta.dudit_action && (e.source === "admin" || !e.actor_user_id)) ||
                (e.actor_name === "Equipe Dudit" && e.source === "admin")
            )
            let actorName = e.actor_name || "Sistema"
            let sanitizedMeta = { ...meta }

            if (isDuditAction) {
                if (isAdmin) {
                    const rawAdmin = meta.admin_actor_name || null
                    if (rawAdmin && String(rawAdmin).trim().toLowerCase() !== "admin" && String(rawAdmin).trim().toLowerCase() !== "equipe dudit") {
                        actorName = `Equipe Dudit (${String(rawAdmin).trim()})`
                    } else {
                        actorName = "Equipe Dudit"
                    }
                } else {
                    delete sanitizedMeta.admin_actor_name
                    delete sanitizedMeta.admin_actor_id
                    actorName = "Equipe Dudit"
                }
            } else if (e.actor_user_id) {
                actorName = namesByUserId.get(e.actor_user_id) || (e.actor_name && !String(e.actor_name).toLowerCase().includes("dudit") ? e.actor_name : "Usuário")
            } else if (e.actor_name && !String(e.actor_name).toLowerCase().includes("dudit")) {
                actorName = e.actor_name
            } else {
                actorName = "Sistema"
            }

            return {
                id: e.id,
                return_request_id: e.entity_id,
                previous_status: meta?.from_status || e.old_values?.status || null,
                new_status: meta?.to_status || e.new_values?.status || null,
                changed_by: isDuditAction && !isAdmin ? null : (e.actor_user_id || e.user_id || null),
                actor_name: actorName,
                notes: (Array.isArray(e.change_lines) && e.change_lines[0]) ? e.change_lines[0] : (meta?.notes || meta?.message || null),
                change_lines: Array.isArray(e.change_lines) ? e.change_lines : [],
                metadata: sanitizedMeta,
                event_type: e.action_type || e.action || "updated",
                source: e.source || null,
                created_at: e.created_at,
            }
        })

        const normalized = normalizeReturnRow({ ...data, auditLogs: returnEvents })
        const evidenceRows = (data.return_evidence || []) as any[]
        if (evidenceRows.length) {
            const { generateSignedDownloadUrl } = await import("@/lib/r2/server")
            const evidenceUploads = await Promise.all(evidenceRows.map(async (evidence) => {
                const key = String(evidence.file_key || "")
                const ownerId = String(evidence.uploaded_by || data.created_by || "")
                if (
                    !ownerId ||
                    !new RegExp(`^users/${ownerId}/(?:returns|orders/attachments)/[^/]+$`).test(key) ||
                    key.includes("..")
                ) return null
                const fileUrl = await generateSignedDownloadUrl(key)
                return {
                    file_url: fileUrl,
                    file_key: key,
                    file_name: evidence.file_name || key.split("/").pop() || "evidencia",
                    file_type: evidence.file_type || "application/octet-stream",
                    file_size: evidence.file_size || 0,
                }
            }))
            const validEvidence = evidenceUploads.filter(Boolean) as NonNullable<(typeof evidenceUploads)[number]>[]
            normalized.evidenceImages = validEvidence.map((evidence) => evidence.file_url)
            ;(normalized as any).evidenceUploads = validEvidence
        }
        if (buyerDetails) {
            normalized.customerEmail = normalized.customerEmail || buyerDetails.email || undefined
            normalized.customerPhone = normalized.customerPhone || buyerDetails.phone || undefined
        }

        return successResponse(normalized)
    } catch (e: any) {
        return errorResponse(e?.message || "Erro ao carregar devolução")
    }
}

export async function getReturnAuditLogsAction(
    requestId: string,
    opts?: { adminBypass?: boolean }
) {
    try {
        const user = await requireUser()
        if (!user) return { success: false as const, error: "Não autenticado" }
        const supabase = createAdminClient()
        const { data: request, error: requestError } = await supabase
            .from("return_requests")
            .select("id, partner_id, store_id, orders!order_id(store_id)")
            .eq("id", requestId)
            .is("deleted_at", null)
            .maybeSingle()
        if (requestError) throw requestError
        if (!request) return { success: false as const, error: "Solicitação de devolução não encontrada." }
        const isAdmin = Boolean(opts?.adminBypass)
        if (isAdmin) {
            await requireAdminScope("moderation")
        } else {
            const access = await requirePermission(request.partner_id, "orders", "view", user)
            assertPermission(access, "orders.list")
            const requestStoreId = request.store_id || (request as any).orders?.store_id
            if (requestStoreId) {
                await requireStorePermission(requestStoreId, request.partner_id, "orders", "view")
            }
        }
        const { data, error } = await supabase
            .from("audit_logs")
            .select("*")
            .eq("entity_type", "return_request")
            .eq("entity_id", requestId)
            .order("created_at", { ascending: true })
        if (error) throw error

        const actorUserIds = Array.from(new Set((data || []).map((e: any) => e.actor_user_id).filter(Boolean)))
        let namesByUserId = new Map<string, string>()
        if (actorUserIds.length > 0) {
            const { data: profiles } = await supabase
                .from("user_profiles")
                .select("user_id, full_name")
                .in("user_id", actorUserIds)
            if (profiles) {
                namesByUserId = new Map(profiles.map((p: any) => [p.user_id, p.full_name?.trim() || "Usuário"]))
            }
        }

        const events = (data || []).map((e: any) => {
            const meta = e.metadata || e.new_values || {}
            const isErpAction = e.source === "erp" || (meta as any)?.source === "erp"
            const isDuditAction = !isErpAction && Boolean(
                e.source === "admin" ||
                (meta as any)?.is_admin_action ||
                (meta.dudit_action && (e.source === "admin" || !e.actor_user_id)) ||
                (e.actor_name === "Equipe Dudit" && e.source === "admin")
            )
            let actorName = e.actor_name || "Sistema"
            let sanitizedMeta = { ...meta }

            if (isDuditAction) {
                if (isAdmin) {
                    const rawAdmin = meta.admin_actor_name || null
                    if (rawAdmin && String(rawAdmin).trim().toLowerCase() !== "admin" && String(rawAdmin).trim().toLowerCase() !== "equipe dudit") {
                        actorName = `Equipe Dudit (${String(rawAdmin).trim()})`
                    } else {
                        actorName = "Equipe Dudit"
                    }
                } else {
                    delete sanitizedMeta.admin_actor_name
                    delete sanitizedMeta.admin_actor_id
                    actorName = "Equipe Dudit"
                }
            } else if (e.actor_user_id) {
                actorName = namesByUserId.get(e.actor_user_id) || (e.actor_name && !String(e.actor_name).toLowerCase().includes("dudit") ? e.actor_name : "Usuário")
            } else if (e.actor_name && !String(e.actor_name).toLowerCase().includes("dudit")) {
                actorName = e.actor_name
            } else {
                actorName = "Sistema"
            }

            return {
                id: e.id,
                return_request_id: e.entity_id,
                previous_status: meta?.from_status || e.old_values?.status || null,
                new_status: meta?.to_status || e.new_values?.status || null,
                changed_by: isDuditAction && !isAdmin ? null : (e.actor_user_id || e.user_id || null),
                actor_name: actorName,
                notes: (Array.isArray(e.change_lines) && e.change_lines[0]) ? e.change_lines[0] : (meta?.notes || meta?.message || null),
                change_lines: Array.isArray(e.change_lines) ? e.change_lines : [],
                metadata: sanitizedMeta,
                event_type: e.action_type || e.action || "updated",
                source: e.source || null,
                created_at: e.created_at,
            }
        })
        return { success: true as const, data: events }
    } catch (e: any) {
        return { success: false as const, error: e?.message || "Erro ao carregar histórico da devolução" }
    }
}

export async function createReturnRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    let partnerId: string | undefined
    let orderId: string | undefined
    let userId: string | undefined
    let resolution: string | undefined
    try {
        const user = await requireUser()
        const data = createReturnSchema.parse(input)
        partnerId = data.partnerId
        orderId = data.orderId
        userId = user.id
        resolution = data.resolution
        addMonitoringBreadcrumb({ domain: "returns", message: "create.started", metadata: { entityId: orderId, partnerId, resolution } })
        await requireMinimumPlan(data.partnerId, "crescer")
        const returnCapabilities = await getPartnerCapabilities(data.partnerId)
        if (!returnCapabilities.hasReturns) {
            throw new Error("O módulo de devoluções está desativado nesta loja.")
        }
        const access = await requirePermission(data.partnerId, "orders", "edit")
        assertPermission(access, "orders.can_refund")
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

        // Validate quantities on the server-side
        const remainingQuantities = await getReturnableQuantities(data.orderId)
        for (const item of data.items) {
            const maxQty = remainingQuantities[item.order_item_id] ?? 0
            if (item.quantity > maxQty) {
                throw new Error(`A quantidade solicitada (${item.quantity}) excede a quantidade devolvível disponível (${maxQty}) para o item selecionado.`)
            }
        }

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

        const ctx = await getCurrentPartnerContext()
        const verifiedEvidence = await verifyReturnEvidencePayload(data.evidence, user.id)
        const { data: created, error } = await supabase.rpc("create_return_request", {
            p_partner_id: data.partnerId,
            p_order_id: data.orderId,
            p_created_by: user.id,
            p_source: "erp",
            p_resolution: data.resolution,
            p_reason: data.reason,
            p_message: data.message || null,
            p_items: data.items,
            p_evidence: verifiedEvidence,
            p_idempotency_key: data.idempotencyKey || crypto.randomUUID(),
            p_expires_at: data.expiresAt || null,
            p_request_type: data.resolution === "none" ? "return" : null,
            p_store_id: ctx?.activeStoreId || null,
            p_customer_id: data.customerId || null,
        })

        if (error) throw error
        const requestId = String((created as any)?.id || "")

        // Save exchange items snapshot on creation so they persist even if process is deferred
        if (data.exchangeItems && data.exchangeItems.length > 0) {
            const { error: updateErr } = await supabase
                .from("return_requests")
                .update({
                    exchange_items_snapshot: data.exchangeItems as any,
                })
                .eq("id", requestId)

            if (updateErr) {
                console.error("[createReturnRequestAction] Failed to save exchange items snapshot:", updateErr)
            }
        }


        await revalidateReturns(data.partnerId, data.orderId, requestId)
        return successResponse({ id: requestId })
    } catch (e: any) {
        captureError(e, {
            module: "returns",
            action: "create_return_request",
            userId,
            partnerId,
            entityId: orderId,
            metadata: { resolution },
        })
        return errorResponse(getReturnUserMessage(e, "Não foi possível criar a devolução. Tente novamente."))
    }
}

export async function createMarketplaceReturnRequestAction(input: Omit<z.infer<typeof createReturnSchema>, "partnerId">) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    let partnerId: string | undefined
    let orderId: string | undefined
    let userId: string | undefined
    let resolution: string | undefined
    try {
        const user = await requireUser()
        const base = createReturnSchema.omit({ partnerId: true }).parse(input)
        orderId = base.orderId
        userId = user.id
        resolution = base.resolution
        await requireOrderAccess(base.orderId)
        const supabase = createAdminClient()

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, partner_id, buyer_id, customer_id, store_id, situation, delivery_status, order_number, return_policy_snapshot")
            .eq("id", base.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido nao encontrado")
        partnerId = order.partner_id
        addMonitoringBreadcrumb({ domain: "returns", message: "marketplace_create.started", metadata: { entityId: orderId, partnerId, resolution } })
        if (!(await userOwnsBuyerOrder(order, user.id))) throw new Error("Sem permissao")
        if (order.situation !== "paid" && order.situation !== "partially_paid") {
            throw new Error("Não é permitido criar solicitação para pedidos não pagos.")
        }
        const buyerCustomerId = await resolveBuyerCustomerId(order, user.id)

        // Check partner plan and returns module capability
        const plan = await getPartnerPlan(order.partner_id)
        const [{ data: partnerRow }, { data: storeRow }] = await Promise.all([
            supabase.from("partners").select("business_info").eq("id", order.partner_id).maybeSingle(),
            supabase.from("stores").select("business_info").eq("partner_id", order.partner_id).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
        ])
        const businessInfo = normalizeBusinessInfo(storeRow?.business_info || partnerRow?.business_info)
        const hasReturnsModule = hasMinimumPlan(plan?.slug || "free", "crescer") && isSystemResourceActive(businessInfo, "returns")
        if (!hasReturnsModule) {
            throw new Error("Esta loja gerencia trocas e devoluções diretamente via WhatsApp.")
        }

        // Fetch order items to validate item types for exchange
        const { data: orderItems, error: itemsError } = await supabase
            .from("order_items")
            .select("id, product_id, service_id, line_type")
            .eq("order_id", base.orderId)

        if (itemsError || !orderItems) throw new Error("Erro ao buscar itens do pedido")
        const remainingQuantities = await getReturnableQuantities(base.orderId)
        for (const item of base.items) {
            const maxQty = remainingQuantities[item.order_item_id] ?? 0
            if (item.quantity > maxQty) {
                throw new Error(`A quantidade solicitada (${item.quantity}) excede a quantidade devolvível disponível (${maxQty}) para o item selecionado.`)
            }
        }

        const returnedItemIds = new Set(base.items.map((item: any) => item.order_item_id))
        const returnedServices = orderItems.filter((item: any) => returnedItemIds.has(item.id) && (item.service_id || item.line_type === "service_booking"))

        // Validate seller policy for resolutions (vale-compra / troca)
        let commercialPolicy = (order.return_policy_snapshot as any)?.commercial
        if (!commercialPolicy) {
            const { data: policyRow } = await supabase
                .from("partner_return_policies")
                .select("accepts_store_credit, accepts_size_exchange, accepts_color_exchange")
                .eq("partner_id", order.partner_id)
                .maybeSingle()
            if (policyRow) {
                commercialPolicy = {
                    accepts_store_credit: policyRow.accepts_store_credit,
                    accepts_size_exchange: policyRow.accepts_size_exchange,
                    accepts_color_exchange: policyRow.accepts_color_exchange,
                }
            }
        }

        if (base.resolution === "store_credit" && commercialPolicy?.accepts_store_credit === false) {
            throw new Error("Esta loja não aceita vale-compra para devoluções.")
        }

        if (base.resolution === "exchange") {
            if (order.delivery_status !== "delivered") {
                throw new Error("A troca só é permitida para pedidos concluídos (entregues/executados).")
            }
            if (returnedServices.length > 0) {
                throw new Error("Não é permitido realizar troca de itens de serviço.")
            }
            if (commercialPolicy && commercialPolicy.accepts_size_exchange === false && commercialPolicy.accepts_color_exchange === false) {
                throw new Error("Esta loja não aceita trocas para este pedido.")
            }
        }

        const verifiedEvidence = await verifyReturnEvidencePayload(base.evidence, user.id)
        const { data: created, error } = await supabase.rpc("create_return_request", {
            p_partner_id: order.partner_id,
            p_order_id: base.orderId,
            p_created_by: user.id,
            p_source: "marketplace",
            p_resolution: base.resolution,
            p_reason: base.reason,
            p_message: base.message || null,
            p_items: base.items,
            p_evidence: verifiedEvidence,
            p_idempotency_key: base.idempotencyKey || crypto.randomUUID(),
            p_expires_at: base.expiresAt || null,
            p_request_type: null,
            p_origin_request_id: null,
            p_origin_type: null,
            p_store_id: order.store_id || null,
            p_customer_id: buyerCustomerId,
        })

        if (error) throw error
        const requestId = String((created as any)?.id || "")

        // Linked ERP orders keep the customers.id in buyer_id, so the RPC stores
        // that id as customer_user_id. Normalize it to the marketplace user id so
        // the buyer keeps access to their own return request.
        if (requestId && order.buyer_id !== user.id) {
            await supabase
                .from("return_requests")
                .update({ customer_user_id: user.id })
                .eq("id", requestId)
        }

        // Persist structured buyer reason (drives marketplace fault penalty)
        if (requestId && base.reasonCategory) {
            await supabase
                .from("return_requests")
                .update({ reason_category: base.reasonCategory })
                .eq("id", requestId)
        }

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
                    title: "🔄️ Nova solicitação de devolução",
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
        captureError(e, {
            module: "returns",
            action: "create_marketplace_return_request",
            userId,
            partnerId,
            entityId: orderId,
            metadata: { resolution },
        })
        return errorResponse(getReturnUserMessage(e, "Não foi possível enviar a solicitação. Tente novamente."))
    }
}

export async function createMarketplaceCancellationRequestAction(input: unknown) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
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
            .select("id, partner_id, buyer_id, customer_id, store_id, situation, delivery_status, order_number")
            .eq("id", data.orderId)
            .single()

        if (orderError || !order) throw new Error("Pedido nao encontrado")
        if (!(await userOwnsBuyerOrder(order, user.id))) throw new Error("Sem permissao")
        if (!canRequestOrderCancellation(order)) {
            throw new Error("Este pedido ja esta em entrega. Para continuar, solicite devolução, troca ou reembolso.")
        }
        const buyerCustomerId = await resolveBuyerCustomerId(order, user.id)

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
            p_origin_request_id: null,
            p_origin_type: null,
            p_store_id: order.store_id || null,
            p_customer_id: buyerCustomerId,
        })

        if (error) throw error
        const requestId = String((created as any)?.id || "")

        // Linked ERP orders keep the customers.id in buyer_id, so the RPC stores
        // that id as customer_user_id. Normalize it to the marketplace user id so
        // the buyer keeps access to their own cancellation request.
        if (requestId && order.buyer_id !== user.id) {
            await supabase
                .from("return_requests")
                .update({ customer_user_id: user.id })
                .eq("id", requestId)
        }

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
                    title: "❌ Nova solicitação de cancelamento",
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
    refundId: string
    amount: number
    order: any
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

        const response = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(params.order.mp_payment_id))}/refunds`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": `mp-refund-${params.refundId}`,
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        })

        const result = await response.json().catch(() => ({}))
        if (!response.ok) {
            const errorMsg = result?.message || "Mercado Pago refund failed"
            const { error: statusError } = await supabase
                .from("return_refunds")
                .update({ status: "FAILED", error_message: errorMsg, updated_at: new Date().toISOString() })
                .eq("id", params.refundId)
                .eq("status", "PROCESSING")
            return { success: false, error: statusError ? `${errorMsg}; não foi possível atualizar o estado local do reembolso` : errorMsg }
        }

        const mpRefundId = result?.id ? String(result.id) : null
        const providerStatus = String(result?.status || "").toLowerCase()
        if (!mpRefundId || providerStatus !== "approved") {
            const status = providerStatus === "pending" ? "MANUAL" : "FAILED"
            const errorMsg = providerStatus === "pending"
                ? "O Mercado Pago aceitou o pedido, mas o reembolso ainda está pendente de confirmação."
                : "O Mercado Pago não confirmou o reembolso."
            const { error: statusError } = await supabase
                .from("return_refunds")
                .update({
                    status,
                    payment_provider: "Mercado Pago",
                    mp_payment_id: String(params.order.mp_payment_id),
                    mp_refund_id: mpRefundId,
                    error_message: errorMsg,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", params.refundId)
                .eq("status", "PROCESSING")
            return { success: false, error: statusError ? `${errorMsg} O estado local também não foi atualizado.` : errorMsg }
        }

        const { data: persistedRefund, error: persistError } = await supabase
            .from("return_refunds")
            .update({
                status: "APPROVED",
                payment_provider: "Mercado Pago",
                mp_payment_id: params.order.mp_payment_id,
                mp_refund_id: mpRefundId,
                updated_at: new Date().toISOString(),
            })
            .eq("id", params.refundId)
            .eq("status", "PROCESSING")
            .select("id")
            .maybeSingle()

        if (persistError || !persistedRefund) {
            return { success: false, error: "O Mercado Pago confirmou o reembolso, mas não foi possível gravar a confirmação local. Tente reconciliar antes de reenviar." }
        }

        return { success: true, mpRefundId: mpRefundId || undefined }
    } catch (error: any) {
        const errorMsg = error?.message || "Mercado Pago refund failed"
        await supabase
            .from("return_refunds")
            .update({ status: "FAILED", error_message: errorMsg, updated_at: new Date().toISOString() })
            .eq("id", params.refundId)
            .eq("status", "PROCESSING")
        return { success: false, error: errorMsg }
    }
}

export async function processReturnRequestAction(
    input: unknown,
    opts?: { adminBypass?: boolean; actionCtx?: AdminActionContext | null },
) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    try {
        const user = await requireUser()
        const data = processReturnSchema.parse(input)
        const adminBypass = Boolean(opts?.adminBypass)
        let adminActorId: string | null = null
        let adminActorEmail: string | null = null

        if (adminBypass) {
            const admin = await requireAdminScope("moderation")
            adminActorId = admin.userId
            adminActorEmail = admin.email || null
        } else {
            await requireMinimumPlan(data.partnerId, "crescer")
        }

        if (data.nextStatus && !RETURN_STATUS_SET.has(data.nextStatus)) throw new Error("Status invalido")

        if (!adminBypass) {
            const access = await requirePermission(data.partnerId, "orders", "edit")
            assertPermission(access, "orders.can_refund")
        }
        const supabase = createAdminClient()

        const { data: request, error: requestError } = await supabase
            .from("return_requests")
            .select(`
                id, partner_id, store_id, order_id, status, request_type, source, reason_category, desired_resolution, approved_resolution, order_total_snapshot, customer_id, customer_name_snapshot, customer_email_snapshot,
                orders!order_id(total_amount, amount_paid, payment_provider, mp_payment_id, payment_breakdown, buyer_id, customer_name, store_id),
                return_items!return_items_return_request_id_fkey(net_item_value_snapshot)
            `)
            .eq("id", data.requestId)
            .eq("partner_id", data.partnerId)
            .is("deleted_at", null)
            .single()

        if (requestError || !request) throw new Error("Solicitação nao encontrada")
        if (!adminBypass && ["RESOLVED", "REJECTED", "EXPIRED"].includes(request.status)) throw new Error("Solicitação bloqueada")

        const requestStoreId = request.store_id || (request as any).orders?.store_id
        if (!adminBypass && requestStoreId) {
            await requireStorePermission(requestStoreId, data.partnerId, "orders", "can_refund")
        }

        const capabilities = await getPartnerCapabilities(request.partner_id, { storeId: request.store_id || (request as any).orders?.store_id })

        // Map buyer user UUID to ERP customers table ID to avoid foreign key violations on transactions
        const buyerId = (request as any).orders?.buyer_id || (request as any).customer_id
        let erpCustomerId: string | null = null
        if (data.customerId) {
            const { data: requestedCustomer } = await supabase
                .from("customers")
                .select("id")
                .eq("id", data.customerId)
                .eq("partner_id", request.partner_id)
                .maybeSingle()
            if (!requestedCustomer?.id) {
                throw new Error("Cliente invÃ¡lido para este parceiro.")
            }
            erpCustomerId = requestedCustomer.id
        }
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

        const isApprovedStatus = ["APPROVED", "PROCESSING", "RESOLVED"].includes(data.nextStatus || "")
        const isRejectedStatus = data.nextStatus === "REJECTED"

        if (isRejectedStatus) {
            data.refundAmount = 0
            data.refundStatus = "FAILED"
            data.storeCreditAmount = 0
            data.exchangeItems = []
            data.exchangeBalanceResolution = null
            data.accountId = null
        } else if (data.nextStatus && !isApprovedStatus) {
            data.refundAmount = 0
            data.refundStatus = "PENDING"
            data.storeCreditAmount = 0
            data.exchangeItems = []
            data.exchangeBalanceResolution = null
            data.accountId = null
        }

        const refundStatus = isRejectedStatus
            ? "FAILED"
            : (isApprovedStatus && data.refundAmount > 0 ? "APPROVED" : (data.refundStatus || "PENDING"))

        const useSelectiveReturn = data.returnToInventoryItems !== undefined && data.returnToInventoryItems !== null
        const pReturnToInventoryForRpc = useSelectiveReturn ? false : data.returnToInventory

        const approvedResolution = request.desired_resolution || request.approved_resolution
        const isExchange = approvedResolution === "exchange"
        const pRefundAmountForRpc = isRejectedStatus ? 0 : (isExchange ? 0 : data.refundAmount)

        const { data: processed, error } = await supabase.rpc("process_return_request", {
            p_request_id: data.requestId,
            p_actor_user_id: user.id,
            p_action: data.action,
            p_next_status: data.nextStatus || null,
            p_refund_amount: pRefundAmountForRpc,
            p_refund_status: refundStatus,
            p_refund_payment_method: isRejectedStatus ? null : (data.refundPaymentMethod || null),
            p_return_to_inventory: pReturnToInventoryForRpc,
            p_store_credit_amount: isRejectedStatus ? 0 : data.storeCreditAmount,
            p_exchange_items: isRejectedStatus ? [] : (data.exchangeItems || []),
            p_exchange_balance_resolution: (isExchange && !isRejectedStatus) ? (data.exchangeBalanceResolution || null) : null,
            p_notes: sanitizeNotes(data.notes),
            p_idempotency_key: data.idempotencyKey || crypto.randomUUID(),
            p_account_id: isApprovedStatus ? (data.accountId || null) : null,
        })

        if (error) throw error

        const result = processed as any

        // Selective inventory return handling
        let returnToStockItems: { product_id: string; variant_id: string | null; quantity: number }[] = []
        if (useSelectiveReturn && data.returnToInventoryItems && data.returnToInventoryItems.length > 0) {
            const itemIds = data.returnToInventoryItems.map(i => i.id)
            const { data: dbItems, error: dbItemsErr } = await supabase
                .from("return_items")
                .select("id, order_item_id, product_id, variant_id")
                .eq("return_request_id", data.requestId)

            if (dbItemsErr) throw dbItemsErr

            const matchedDbItems = (dbItems || []).filter((item: any) =>
                itemIds.includes(item.id) || itemIds.includes(item.order_item_id)
            )

            const qtyMap = new Map(data.returnToInventoryItems.map(i => [i.id, i.quantity]))
            returnToStockItems = matchedDbItems.map((item: any) => ({
                product_id: item.product_id,
                variant_id: item.variant_id || null,
                quantity: qtyMap.get(item.id) || qtyMap.get(item.order_item_id) || 1,
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

        if (capabilities.hasStockMovements && returnToStockItems.length > 0) {
            const { data: existingMovement } = await supabase
                .from("stock_movements")
                .select("id")
                .eq("source_return_request_id", data.requestId)
                .limit(1)
                .maybeSingle()

            if (!existingMovement) {
                const effectiveStoreId = (request as any).store_id || (request as any).orders?.store_id || null

                const { data: stockMovementRes, error: stockMovementErr } = await supabase.rpc("create_batch_stock_movement", {
                    p_partner_id: request.partner_id,
                    p_movement_type: "in",
                    p_reason: "RETURN_IN",
                    p_notes: `Devolução DVL-${data.requestId.slice(0, 6).toUpperCase()}`,
                    p_created_by: user.id,
                    p_items: returnToStockItems,
                    p_store_id: effectiveStoreId,
                })

                if (stockMovementErr) throw stockMovementErr

                const v_stock_movement_id = stockMovementRes?.id || null
                if (v_stock_movement_id) {
                    await supabase
                        .from("stock_movements")
                        .update({
                            source_return_request_id: data.requestId,
                            store_id: effectiveStoreId,
                            reason: "RETURN_IN",
                            reference_name: `Devolução DVL-${data.requestId.slice(0, 6).toUpperCase()}`,
                            notes: `Devolução DVL-${data.requestId.slice(0, 6).toUpperCase()}`
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
                // Cancelamento aprovado: a etiqueta da transportadora (ainda não
                // postada) é cancelada junto para não ficar órfã.
                try {
                    const { data: shipments } = await supabase
                        .from("order_shipments")
                        .select("id, external_label_id, status")
                        .eq("order_id", request.order_id)
                        .neq("kind", "return")

                    for (const shipment of shipments || []) {
                        if (!shipment?.external_label_id) continue
                        const { cancelCarrierLabelForOrder } = await import("@/lib/services/shipping/superfrete-label-cancel")
                        await cancelCarrierLabelForOrder({
                            partnerId: request.partner_id,
                            orderId: request.order_id,
                            labelId: String(shipment.external_label_id),
                            reason: "Cancelamento aprovado pelo lojista",
                            currentStatus: shipment.status,
                            actorUserId: user.id,
                        })
                    }
                } catch (labelErr) {
                    console.error("[processReturnRequest] Error cancelling carrier label:", labelErr)
                }

                await syncCancelledOrderAppointmentsAndTransactions(supabase, request.order_id)
                await logAuditEvent({
                    partnerId: request.partner_id,
                    actorUserId: user.id,
                    entityType: "order",
                    entityId: request.order_id,
                    actionType: "cancelled",
                    changeLines: ["Pedido cancelado - solicitação de cancelamento aprovada."],
                    source: "erp",
                })
            }
        }
        const requestedRefundAmount = data.refundAmount > 0
            ? data.refundAmount
            : data.exchangeBalanceResolution === "refund"
                ? toNumber(result?.exchange_surplus_amount)
                : 0

        // Ledger Fase 2: reconcilia settlements da venda original quando a
        // solicitação é aprovada/resolvida. Não cria transações novas - só
        // cancela/reduz settlements pending (parcelas já quitadas são cobertas
        // pelo refund existente). Idempotente por reconcileKey.
        if (capabilities.hasFinancial && (data.nextStatus === "APPROVED" || data.nextStatus === "RESOLVED")) {
            const { cancelPendingSettlementsForOrder, reduceFutureSettlementsForRefund } =
                await import("@/lib/services/transaction.service")
            const orderId = request.order_id
            const orderNumber = (request as any).orders?.order_number || null
            const reconcileKey = `return:${request.id}`
            const shortId = request.id.slice(0, 8).toUpperCase()
            const reason = isExchange
                ? `Troca DVL-${shortId}`
                : request.request_type === "cancellation"
                    ? `Cancelamento DVL-${shortId}`
                    : `Devolução DVL-${shortId}`

            if (request.request_type === "cancellation" || isExchange) {
                await cancelPendingSettlementsForOrder({
                    supabase,
                    partnerId: request.partner_id,
                    orderId,
                    orderNumber,
                    reason,
                    reconcileKey,
                    actorUserId: user.id,
                })
            } else if (requestedRefundAmount > 0.009) {
                const totalPaid = getOrderAmountPaid((request as any).orders || {})
                const isFullRefund = maxActionAmount + 0.009 >= totalPaid
                if (isFullRefund) {
                    await cancelPendingSettlementsForOrder({
                        supabase,
                        partnerId: request.partner_id,
                        orderId,
                        orderNumber,
                        reason,
                        reconcileKey,
                        actorUserId: user.id,
                    })
                } else {
                    await reduceFutureSettlementsForRefund({
                        supabase,
                        partnerId: request.partner_id,
                        orderId,
                        orderNumber,
                        refundAmount: requestedRefundAmount,
                        reason,
                        reconcileKey,
                        actorUserId: user.id,
                    })
                }
            }
        }
        // Refund MP não é mais executado aqui.
        // A aprovação da devolução cria o registro return_refund com status PENDING.
        // A execução real do reembolso MP ocorre em executeMercadoPagoRefundAction,
        // que possui todas as validações de segurança (confirmação, senha, cooldown, rate limit, etc.).

        // Movimentação financeira ao aprovar reembolso manual: debita o valor da conta bancária selecionada
        const effectiveAccountId = data.accountId || null
        if (
            capabilities.hasFinancial &&
            effectiveAccountId &&
            requestedRefundAmount > 0.009 &&
            !isMpRefund &&
            !(result as any)?.balance_deducted &&
            (data.nextStatus === "APPROVED" || data.nextStatus === "RESOLVED") &&
            (data.refundStatus === "APPROVED" || (result as any)?.refund_transaction_id)
        ) {
            try {
                const { error: balanceErr } = await supabase.rpc("apply_account_balance_delta", {
                    p_account_id: effectiveAccountId,
                    p_partner_id: request.partner_id,
                    p_delta: -requestedRefundAmount,
                })
                if (balanceErr) {
                    console.error("[processReturnRequest] Error deducting refund from finance account:", balanceErr)
                }
            } catch (balanceEx) {
                console.error("[processReturnRequest] Exception deducting refund from finance account:", balanceEx)
            }
        }

        await revalidateReturns(data.partnerId, request.order_id, data.requestId)
        if (capabilities.hasStockMovements && (data.returnToInventory || returnToStockItems.length > 0)) await revalidateStockMovements(data.partnerId)
        if (capabilities.hasFinancial && (data.refundAmount > 0 || data.storeCreditAmount > 0 || requestedRefundAmount > 0 || toNumber(result?.exchange_shortfall_amount) > 0 || toNumber(result?.exchange_surplus_amount) > 0)) await revalidateTransactions(data.partnerId)

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
                        partner_id: data.partnerId,
                        return_request_id: request.id,
                        status: data.nextStatus,
                    },
                    idempotencyKey: `return-notify:${request.id}:${data.nextStatus}:${Date.now()}`
                })
            } catch (notifyErr) {
                console.error("[processReturnRequest] Failed to send notification to customer:", notifyErr)
            }
        }

        // Re-sync store in Redis so reputation changes (return fault penalty)
        // reflect immediately in marketplace store ranking.
        if (request.source === "marketplace" && (data.nextStatus === "APPROVED" || data.nextStatus === "RESOLVED")) {
            const storeId = request.store_id || (request as any).orders?.store_id
            if (storeId) {
                try {
                    const { syncToExploreRedis } = await import("@/lib/redis-sync")
                    await syncToExploreRedis({ id: storeId, type: "loja", data: {} })
                } catch (redisErr) {
                    console.error("[processReturnRequest] Redis store re-sync failed:", redisErr)
                }
            }
        }

        // Webhook Discord: notificar troca criada (fail-open)
        if (isExchange && data.nextStatus === "APPROVED") {
            sendExchangeCreated({
                returnRequestId: data.requestId,
                exchangeOrderId: result?.exchange_order_id || data.requestId,
                orderNumber: (request as any).orders?.order_number,
                partnerId: data.partnerId,
                customerEmail: request.customer_email_snapshot,
                items: data.exchangeItems.map(item => ({
                    name: (item as any).product_name || item.product_id,
                    quantity: item.quantity,
                })),
                shortfallAmount: toNumber(result?.exchange_shortfall_amount),
                surplusAmount: toNumber(result?.exchange_surplus_amount),
            }).catch(err => console.warn("[EXCHANGE] Discord webhook failed (non-blocking):", err))
        }

        // ─── Admin edit: registra na timeline da devolução + auditoria ────────
        if (adminBypass && adminActorId) {
            const actionCtx = opts?.actionCtx || null
            const changedFields = actionCtx?.changedFields || []
            const effectiveStoreId = request.store_id || (request as any).orders?.store_id || null
            const changeLines: string[] = []

            if (data.nextStatus && data.nextStatus !== request.status) {
                changeLines.push(`Equipe Dudit alterou o status de ${request.status} para ${data.nextStatus}.`)
            }
            if (changedFields.length > 0) {
                changeLines.push(`Equipe Dudit atualizou: ${changedFields.join(", ")}.`)
            }
            if (actionCtx?.reason?.trim()) {
                changeLines.push(`Motivo: "${actionCtx.reason.trim()}"`)
            }
            if (changeLines.length === 0) {
                changeLines.push("Equipe Dudit atualizou a solicitação.")
            }

            try {
                await logAuditEvent({
                    partnerId: request.partner_id,
                    actorUserId: adminActorId,
                    actorName: "Equipe Dudit",
                    entityType: "return_request",
                    entityId: data.requestId,
                    actionType: "updated",
                    changeLines,
                    metadata: {
                        dudit_action: true,
                        is_admin_action: true,
                        admin_actor_name: adminActorEmail || adminActorId,
                        admin_actor_id: adminActorId,
                        from_status: request.status,
                        to_status: data.nextStatus || request.status,
                        changed_fields: changedFields,
                        reason: actionCtx?.reason?.trim() || null,
                        ...(typeof actionCtx?.riskScore === "number" ? { risk_score: actionCtx.riskScore } : {}),
                    },
                    source: "admin",
                    storeId: effectiveStoreId,
                })

                if (request.order_id) {
                    await logAuditEvent({
                        partnerId: request.partner_id,
                        actorUserId: adminActorId,
                        actorName: "Equipe Dudit",
                        entityType: "order",
                        entityId: request.order_id,
                        actionType: "updated",
                        changeLines: [
                            `Equipe Dudit atualizou a solicitação de devolução/troca (DVL-${data.requestId.slice(0, 6).toUpperCase()}).`,
                            ...changeLines,
                        ],
                        metadata: {
                            dudit_action: true,
                            is_admin_action: true,
                            admin_actor_name: adminActorEmail || adminActorId,
                            admin_actor_id: adminActorId,
                            return_request_id: data.requestId,
                            from_status: request.status,
                            to_status: data.nextStatus || request.status,
                            changed_fields: changedFields,
                            reason: actionCtx?.reason?.trim() || null,
                            ...(typeof actionCtx?.riskScore === "number" ? { risk_score: actionCtx.riskScore } : {}),
                        },
                        source: "admin",
                        storeId: effectiveStoreId,
                    })
                }

                await adminAuditLog({
                    adminUserId: adminActorId,
                    actionType: AdminActionType.RETURN_UPDATE,
                    targetType: "return_request",
                    targetId: data.requestId,
                    metadata: {
                        partnerId: request.partner_id,
                        storeId: effectiveStoreId,
                        returnId: data.requestId,
                        fromStatus: request.status,
                        toStatus: data.nextStatus || request.status,
                        fields: changedFields,
                        reason: actionCtx?.reason?.trim() || null,
                    },
                })

                await applyAdminActionContext({
                    adminUserId: adminActorId,
                    partnerId: request.partner_id,
                    storeId: effectiveStoreId,
                    targetType: "return_request",
                    targetId: data.requestId,
                    actionTitle: "Solicitação de devolução atualizada pela Dudit",
                    entityLabel: "devolução",
                    entityName: `DVL-${data.requestId.slice(0, 6).toUpperCase()}`,
                    sellerUrl: `/erp/devolucoes?view=${data.requestId}`,
                    ctx: actionCtx,
                })
            } catch (auditErr) {
                console.error("[processReturnRequest] admin audit failed:", auditErr)
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
                        order_number, customer_name, store_id
                    )
                )
            `)
            .eq("id", data.refundId)
            .eq("partner_id", data.partnerId)
            .eq("return_request_id", data.requestId)
            .single()

        if (refundErr || !refundRec) throw new Error("Registro de reembolso não encontrado")
        if (refundRec.status !== "PENDING") throw new Error("Reembolso já foi processado ou está bloqueado")

        const request = refundRec.return_requests as any
        const order = request.orders || {}
        if (request.partner_id !== data.partnerId || order.partner_id !== data.partnerId) {
            throw new Error("A solicitação e o pedido não pertencem a este parceiro.")
        }
        if (order.store_id) await requireStorePermission(order.store_id, data.partnerId, "orders", "can_refund")
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

            const verifyResult = await verifyUserPassword(userEmail, data.refundPassword)
            if (!verifyResult.success) throw new Error("Senha incorreta")
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
            refundId: data.refundId,
            amount: cappedAmount,
            order,
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

                const { error: deltaErr } = await createAdminClient().rpc("apply_account_balance_delta", {
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
            source: "erp",
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
            source: "erp",
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
                const { data: fallbackRefund, error: fallbackError } = await supabase
                    .from("return_refunds")
                    .update({
                        status: "FAILED",
                        error_message: `[FALLBACK] ${e?.message || "Erro inesperado"}`,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", data.refundId)
                    .eq("status", "PROCESSING")
                    .select("id")
                    .maybeSingle()

                if (fallbackError) throw fallbackError
                if (fallbackRefund) {
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
                }
            } catch (fallbackErr) {
                console.error("[executeMercadoPagoRefundAction] Fallback FAILED update also failed:", fallbackErr)
            }
        }

        return errorResponse(e?.message || "Erro ao executar reembolso Mercado Pago")
    }
}

export async function escalateReturnRequestAction(partnerId: string, requestId: string, reason?: string) {
    const user = await requireUser()
    if (!user) throw new Error("Não autenticado")
    const access = await requirePermission(partnerId, "orders", "edit", user)
    assertPermission(access, "orders.can_refund")
    const supabase = createAdminClient()
    const { data: request } = await supabase
        .from("return_requests")
        .select("id, partner_id, store_id, customer_id, customer_email_snapshot, sla_due_at, order_id, orders!order_id(order_number, store_id)")
        .eq("id", requestId)
        .eq("partner_id", partnerId)
        .is("deleted_at", null)
        .maybeSingle()

    if (!request) throw new Error("Solicitação de devolução não encontrada.")
    const requestStoreId = request.store_id || (request as any).orders?.store_id
    if (requestStoreId) await requireStorePermission(requestStoreId, partnerId, "orders", "can_refund")

    const result = await processReturnRequestAction({
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

    if (!(result as any)?.success) return result

    if (request) {
        const slaDueAt = request.sla_due_at ? new Date(request.sla_due_at) : null
        const daysOverdue = slaDueAt ? Math.ceil((Date.now() - slaDueAt.getTime()) / (1000 * 60 * 60 * 24)) : 0

        sendSlaExpired({
            returnRequestId: requestId,
            orderNumber: (request.orders as any)?.order_number,
            partnerId,
            customerEmail: request.customer_email_snapshot,
            daysOverdue: Math.max(daysOverdue, 1),
            slaDueAt: request.sla_due_at,
        }).catch(err => console.warn("[SLA] Discord webhook failed (non-blocking):", err))
    }

    return result
}

export async function fetchReturnOrderBucketAction(partnerId: string) {
    try {
        const access = await requirePermission(partnerId, "orders", "view")
        assertPermission(access, "orders.list")
        const supabase = createAdminClient()
        const ctx = await getCurrentPartnerContext()
        const storeId = ctx?.activeStoreId || ""

        let query = supabase
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
        customer_id,
        customer_name,
        delivery_address,
        created_at,
        situation,
        delivery_status,
        delivery_type,
        delivery_breakdown,
        order_shipments ( id, status, kind, carrier, created_at ),
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
          service_id,
          line_type,
          products (
            sku,
            images,
            video_thumbnail,
            name
          ),
          services (
            id,
            name,
            sku,
            images,
            video_thumbnail
          )
        )
      `)
            .eq("partner_id", partnerId)
            .eq("situation", "paid")

        if (storeId) {
            query = query.eq("store_id", storeId)
        }

        const { data: orders, error } = await query
            .order("created_at", { ascending: false })
            .limit(200)

        if (error) throw error

        // Batch query to get returned quantities and active returns for all retrieved orders
        const orderIds = (orders || []).map((o: any) => o.id)
        const returnedQtyMap: Record<string, number> = {}
        const returnCountMap: Record<string, number> = {}
        const ACTIVE_RETURN_STATUSES = new Set([
            "PENDING_REVIEW", "UNDER_ANALYSIS", "WAITING_CUSTOMER",
            "WAITING_ITEM_RETURN", "ESCALATED", "PROCESSING",
        ])
        const ordersWithActiveReturns = new Set<string>()

        if (orderIds.length > 0) {
            const { data: retRequests } = await supabase
                .from("return_requests")
                .select(`
                    order_id,
                    status,
                    return_items!return_items_return_request_id_fkey (
                        order_item_id,
                        quantity
                    )
                `)
                .in("order_id", orderIds)
                .is("deleted_at", null)

            if (retRequests) {
                retRequests.forEach((rr: any) => {
                    const status = String(rr.status || "").toUpperCase()
                    if (ACTIVE_RETURN_STATUSES.has(status)) {
                        ordersWithActiveReturns.add(rr.order_id)
                    }
                    returnCountMap[rr.order_id] = (returnCountMap[rr.order_id] || 0) + 1
                    if (status === "REJECTED" || status === "EXPIRED" || status === "CANCELLED") return
                    const riList = rr.return_items || []
                    riList.forEach((ri: any) => {
                        if (ri.order_item_id) {
                            returnedQtyMap[ri.order_item_id] = (returnedQtyMap[ri.order_item_id] || 0) + (ri.quantity || 0)
                        }
                    })
                })
            }
        }

        const buyerIds = Array.from(new Set((orders || []).map((o: any) => o.customer_id || o.buyer_id).filter(Boolean)))
        const customersMap = new Map<string, any>()
        if (buyerIds.length > 0) {
            try {
                const { data: customersData } = await supabase
                    .from("customers")
                    .select("id, name, email, phone, image_url, addresses(*)")
                    .in("id", buyerIds)
                    .eq("partner_id", partnerId)
                    ; (customersData || []).forEach((c: any) => customersMap.set(c.id, c))
            } catch (_) {
                // customers join is optional - snapshot fields cover the essential data
            }
        }

        const filteredOrders = (orders || []).filter((order: any) => !ordersWithActiveReturns.has(order.id))

        return filteredOrders.map((order: any) => {
            const customer = (order.customer_id || order.buyer_id) ? customersMap.get(order.customer_id || order.buyer_id) : null
            const orderItems = order.order_items || []
            const amountPaid = getOrderAmountPaid(order)
            const subtotalOriginal = getOrderSubtotalOriginal(order, orderItems)
            return {
                id: order.id,
                displayId: order.order_number || `#${String(order.id).slice(0, 8).toUpperCase()}`,
                order_number: order.order_number || null,
                status: order.situation || "pending",
                deliveryStatus: order.delivery_status || "not_sent",
                delivery_status: order.delivery_status || "not_sent",
                delivery_type: order.delivery_type || "delivery",
                delivery_breakdown: order.delivery_breakdown || null,
                order_shipments: Array.isArray(order.order_shipments)
                    ? order.order_shipments.filter((shipment: any) => shipment?.kind !== "return")
                    : [],
                returnCount: returnCountMap[order.id] || 0,
                return_count: returnCountMap[order.id] || 0,
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
                    const returnedQty = returnedQtyMap[item.id] || 0
                    const remainingQty = Math.max(0, (item.quantity || 0) - returnedQty)
                    return {
                        ...item,
                        net_item_value: persistedNet > 0 ? persistedNet : Number(fallbackNet.toFixed(2)),
                        remainingQuantity: remainingQty,
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

export async function retryMercadoPagoRefundAction(partnerId: string, refundId: string, requestId: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    let processingStarted = false
    try {
        const user = await requireUser()
        const access = await requirePermission(partnerId, "orders", "edit")
        assertPermission(access, "orders.can_refund")
        const supabase = createAdminClient()

        const { data: refund, error: refundError } = await supabase
            .from("return_refunds")
            .select("*")
            .eq("id", refundId)
            .eq("return_request_id", requestId)
            .eq("partner_id", partnerId)
            .single()

        if (refundError || !refund) throw new Error("Reembolso não encontrado.")
        if (refund.status !== "FAILED") throw new Error("Somente reembolsos com falha podem ser reenviados.")

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, partner_id, store_id, mp_payment_id, total_amount, paid_amount, payment_breakdown, payment_method")
            .eq("id", refund.order_id)
            .eq("partner_id", partnerId)
            .single()

        if (orderError || !order) throw new Error("Pedido correspondente não encontrado.")
        if (order.partner_id !== partnerId) throw new Error("O pedido não pertence a este parceiro.")
        if (order.store_id) await requireStorePermission(order.store_id, partnerId, "orders", "can_refund")
        if (!order.mp_payment_id) throw new Error("Este pedido não foi pago via Mercado Pago (mp_payment_id ausente).")

        const { data: processingRefund, error: processingError } = await supabase
            .from("return_refunds")
            .update({ status: "PROCESSING", error_message: null, updated_at: new Date().toISOString() })
            .eq("id", refundId)
            .eq("partner_id", partnerId)
            .eq("status", "FAILED")
            .select("id")
            .maybeSingle()
        if (processingError || !processingRefund) throw new Error("Reembolso já está sendo processado ou foi concluído.")
        processingStarted = true

        const res = await maybeRefundMercadoPago({
            partnerId,
            refundId,
            amount: Number(refund.amount),
            order,
        })

        if (!res.success) {
            throw new Error(res.error || "Erro ao processar reembolso no Mercado Pago.")
        }

        await logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: requestId,
            actionType: "refund_retried",
            changeLines: [`Processamento manual de reembolso no Mercado Pago aprovado (ID MP: ${res.mpRefundId}).`],
            metadata: { refundId, mpRefundId: res.mpRefundId },
            source: "erp"
        })

        await revalidateReturns(partnerId, order.id, requestId)
        return successResponse({ mpRefundId: res.mpRefundId })
    } catch (e: any) {
        if (processingStarted) {
            try {
                const { error: releaseError } = await createAdminClient()
                    .from("return_refunds")
                    .update({ status: "FAILED", error_message: e?.message || "Erro ao reprocessar reembolso", updated_at: new Date().toISOString() })
                    .eq("id", refundId)
                    .eq("partner_id", partnerId)
                    .eq("status", "PROCESSING")
                if (releaseError) throw releaseError
            } catch (fallbackError) {
                console.error("[retryMercadoPagoRefundAction] failed to release refund state", { refundId, error: fallbackError })
            }
        }
        return errorResponse(e?.message || "Erro ao reprocessar reembolso")
    }
}

export async function getReturnEvidencePresignedUploadUrlAction(
    partnerId: string,
    fileName: string,
    fileType: string,
    fileSize: number
): Promise<
    | { success: true; uploadUrl: string; publicUrl: string | null; key: string }
    | { success: false; error: string }
> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        const user = await requireUser()
        await requirePermission(partnerId, "orders", "edit")

        const plan = await getPartnerPlan(partnerId)
        if (plan.slug.toLowerCase() !== "crescer" && plan.slug.toLowerCase() !== "escalar") {
            return { success: false, error: "Upload de documentos não permitido no seu plano. Faça um upgrade!" }
        }

        const { validateUploadRequest } = await import("@/lib/security/file-validator")
        const validation = validateUploadRequest(fileName, fileType, fileSize)
        if (!validation.success) {
            return { success: false, error: validation.error || "Arquivo inválido" }
        }

        const { R2_PREFIXES } = await import("@/lib/r2/config")
        const { generateSignedUploadUrl } = await import("@/lib/r2/server")

        const uploadRes = await generateSignedUploadUrl({
            fileName,
            fileType,
            contentLength: fileSize,
            userId: user.id,
            prefix: R2_PREFIXES.orderAttachments,
            kind: "document",
        })

        return {
            success: true,
            uploadUrl: uploadRes.uploadUrl,
            publicUrl: uploadRes.publicUrl,
            key: uploadRes.key,
        }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao gerar URL de upload" }
    }
}

export async function saveReturnEvidenceAction(
    partnerId: string,
    returnRequestId: string,
    fileKey: string,
    fileName: string,
    fileType: string,
    fileSize: number,
    fileHash?: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        await requirePermission(partnerId, "orders", "edit")
        const user = await requireUser()

        const plan = await getPartnerPlan(partnerId)
        if (plan.slug.toLowerCase() !== "crescer" && plan.slug.toLowerCase() !== "escalar") {
            return { success: false, error: "Upload de documentos não permitido no seu plano. Faça um upgrade!" }
        }

        const maxCount = plan.slug.toLowerCase() === "crescer" ? 2 : 5
        const admin = createAdminClient()

        const { data: request, error: requestErr } = await admin
            .from("return_requests")
            .select("id, partner_id, store_id, orders!order_id(store_id)")
            .eq("id", returnRequestId)
            .eq("partner_id", partnerId)
            .is("deleted_at", null)
            .maybeSingle()
        if (requestErr) throw requestErr
        if (!request) return { success: false, error: "Solicitação de devolução não encontrada." }
        const requestStoreId = request.store_id || (request as any).orders?.store_id || null
        if (requestStoreId) await requireStorePermission(requestStoreId, partnerId, "orders", "edit")

        const { R2_PREFIXES } = await import("@/lib/r2/config")
        const { validateKeyOwnership } = await import("@/lib/r2/server")
        const allowedPrefixes = [
            `users/${user.id}/${R2_PREFIXES.orderAttachments}`,
            `users/${user.id}/returns/`,
        ]
        if (
            typeof fileKey !== "string" ||
            !validateKeyOwnership(fileKey, user.id) ||
            !allowedPrefixes.some((prefix) => fileKey.startsWith(prefix)) ||
            fileKey.includes("..") ||
            fileKey.startsWith("/")
        ) {
            return { success: false, error: "Chave de arquivo inválida para este usuário." }
        }
        const { validateUploadRequest } = await import("@/lib/security/file-validator")
        const uploadValidation = validateUploadRequest(fileName, fileType, fileSize)
        if (!uploadValidation.success) {
            return { success: false, error: uploadValidation.error || "Arquivo inválido." }
        }

        const { verifyUploadedObject } = await import("@/lib/r2/server")
        const verified = await verifyUploadedObject(fileKey, fileSize, fileType, fileHash)
        const actualFileSize = verified.contentLength
        const finalHash = verified.sha256
        const actualValidation = validateUploadRequest(fileName, fileType, actualFileSize)
        if (!actualValidation.success) {
            return { success: false, error: actualValidation.error || "Arquivo excede os limites permitidos." }
        }

        const { data: insertedRows, error } = await admin.rpc("register_return_evidence_atomic", {
            p_partner_id: partnerId,
            p_return_request_id: returnRequestId,
            p_uploaded_by: user.id,
            p_file_key: fileKey,
            p_file_name: fileName,
            p_file_type: fileType,
            p_file_size: actualFileSize,
            p_file_hash: finalHash,
            p_attachment_limit: maxCount,
        })

        if (error) throw error
        const data = Array.isArray(insertedRows) ? insertedRows[0] : insertedRows
        if (!data) throw new Error("Não foi possível registrar a evidência.")

        await logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: returnRequestId,
            actionType: "evidence_uploaded",
            changeLines: [`Evidência adicionada: ${fileName}`],
            metadata: { file_name: fileName, file_size: fileSize, file_key: fileKey },
            source: "user"
        })

        return { success: true, data }
    } catch (err: any) {
        console.error("[saveReturnEvidenceAction] Erro:", err);
        return { success: false, error: err.message || "Erro ao salvar evidência" }
    }
}

export async function deleteReturnEvidenceAction(
    partnerId: string,
    evidenceId: string,
    returnRequestId: string
): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        await requirePermission(partnerId, "orders", "edit")
        const user = await requireUser()
        const supabase = await getSupabaseServerClient()

        const { data: request } = await supabase
            .from("return_requests")
            .select("id, partner_id, store_id, orders!order_id(store_id)")
            .eq("id", returnRequestId)
            .eq("partner_id", partnerId)
            .maybeSingle()
        if (!request) return { success: false, error: "Solicitação de devolução não encontrada." }
        const requestStoreId = request.store_id || (request as any).orders?.store_id
        if (requestStoreId) {
            await requireStorePermission(requestStoreId, partnerId, "orders", "edit")
        }

        const { data: evidence } = await supabase
            .from("return_evidence")
            .select("id, file_key, file_name")
            .eq("id", evidenceId)
            .eq("return_request_id", returnRequestId)
            .maybeSingle()

        if (!evidence) {
            return { success: false, error: "Evidência não encontrada" }
        }

        if (evidence.file_key) {
            const { deleteFileFromR2 } = await import("@/lib/r2/server")
            // Keep the database reference if R2 fails so the deletion can be retried.
            await deleteFileFromR2(evidence.file_key)
        }

        const admin = createAdminClient()
        const { error: deleteError } = await admin.from("return_evidence").delete().eq("id", evidenceId).eq("return_request_id", returnRequestId)
        if (deleteError) throw deleteError

        await logAuditEvent({
            partnerId,
            actorUserId: user.id,
            entityType: "return_request",
            entityId: returnRequestId,
            actionType: "evidence_deleted",
            changeLines: [`Evidência removida: ${evidence.file_name || "Documento"}`],
            metadata: { file_name: evidence.file_name, file_key: evidence.file_key },
            source: "user"
        })

        return { success: true }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao deletar evidência" }
    }
}

export async function getReturnEvidenceAction(
    returnRequestId: string,
    partnerId?: string,
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
    try {
        const user = await requireUser()
        const supabase = await getSupabaseServerClient()

        const { data: request } = await supabase
            .from("return_requests")
            .select("id, partner_id, store_id, customer_user_id, created_by, orders!order_id(store_id)")
            .eq("id", returnRequestId)
            .maybeSingle()
        if (!request || (partnerId && request.partner_id !== partnerId)) {
            return { success: false, error: "Solicitação de devolução não encontrada." }
        }
        if (partnerId) {
            const requestStoreId = request.store_id || (request as any).orders?.store_id
            if (requestStoreId) await requireStorePermission(requestStoreId, partnerId, "orders", "view")
            else await requirePermission(partnerId, "orders", "view")
        } else if (request.customer_user_id !== user.id) {
            return { success: false, error: "Acesso negado às evidências desta solicitação." }
        }

        const { data, error } = await supabase
            .from("return_evidence")
            .select("*")
            .eq("return_request_id", returnRequestId)
            .order("created_at", { ascending: false })

        if (error) throw error

        const mapped = (data || []).map((e: any) => ({
            id: e.id,
            file_key: e.file_key || e.file_url || "",
            file_name: e.file_name || String(e.file_key || e.file_url || "evidencia").split("/").pop(),
            file_type: e.file_type || "application/octet-stream",
            file_size: e.file_size || 0,
            created_at: e.created_at
        }))

        return { success: true, data: mapped }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao listar evidências" }
    }
}

export async function getReturnEvidenceUrlAction(
    returnRequestId: string,
    fileKey: string,
    partnerId?: string
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
    try {
        const user = await requireUser()
        const supabase = await getSupabaseServerClient()
        const { data: request } = await supabase
            .from("return_requests")
            .select("id, partner_id, store_id, customer_user_id, created_by, orders!order_id(store_id)")
            .eq("id", returnRequestId)
            .maybeSingle()
        if (!request || (partnerId && request.partner_id !== partnerId)) {
            return { success: false, error: "Solicitação de devolução não encontrada." }
        }

        const { data: evidenceRows } = await supabase
            .from("return_evidence")
            .select("id, file_key, file_url, uploaded_by")
            .eq("return_request_id", returnRequestId)
        const evidence = evidenceRows?.find((row: any) => row.file_key === fileKey || row.file_url === fileKey)
        if (!evidence) return { success: false, error: "Arquivo não encontrado nesta solicitação." }

        if (partnerId) {
            const requestStoreId = request.store_id || (request as any).orders?.store_id
            if (requestStoreId) {
                await requireStorePermission(requestStoreId, partnerId, "orders", "view")
            } else {
                await requirePermission(partnerId, "orders", "view")
            }
        } else if (request.customer_user_id !== user.id) {
            return { success: false, error: "Acesso negado ao arquivo." }
        }

        const { extractKeyFromR2Url, generateSignedDownloadUrl } = await import("@/lib/r2/server")
        const registeredKey = evidence.file_key || extractKeyFromR2Url(evidence.file_url || "")
        const fileOwnerId = evidence.uploaded_by || request.created_by
        if (
            !fileOwnerId ||
            !new RegExp(`^users/${fileOwnerId}/(?:returns|orders/attachments)/[^/]+$`).test(registeredKey) ||
            registeredKey.includes("..")
        ) {
            return { success: false, error: "A evidência registrada não pertence ao autor desta solicitação." }
        }
        const downloadUrl = await generateSignedDownloadUrl(registeredKey)
        return { success: true, downloadUrl }
    } catch (err: any) {
        return { success: false, error: err.message || "Erro ao obter URL de download" }
    }
}

