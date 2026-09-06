"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentUser } from "@/lib/auth/server-user"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeNotes } from "@/lib/input-validator"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { revalidateQuotes } from "@/lib/utils/revalidation"
import { getQuoteHistoryEntries } from "@/lib/services/quote-history.service"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { createERPOrderAction } from "@/app/actions/erp/orders"
import { getAdminClient } from "@/lib/supabase/admin"
import { resolveMarketplaceOrderFinanceAccountId } from "@/app/actions/erp/finance-accounts"
import {
    getQuoteEditCaps,
    MSG_APPROVED_FINANCIAL,
    MSG_REJECTED_EXPIRED_CANCELLED,
    MSG_SENT_FINANCIAL,
    canEditFinancialFields,
    normalizeQuoteStatus,
    QUOTE_DEFAULT_CUSTOMER_LABEL,
} from "@/lib/quotes/quote-edit-rules"
import { checkLimit, increment_usage_counter, decrement_usage_counter } from "@/lib/services/subscription.service"
import { withTelemetry } from "@/lib/utils/action-logger"
import { notifyQuoteEvent } from "@/lib/services/quote-notifications.service"
import { endOfDay, getTodayYmd } from "@/lib/date"
import { requireAuthorizedCustomerContext, requireAuthorizedPartnerContext } from "@/lib/services/authorized-customer-access"
import { createNotification } from "@/lib/services/notification.service"
import { generateShortId, isUuid } from "@/lib/utils/short-id"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"


export type ERPQuoteListCursor = { createdAt: string; id: string }

function buildQuotesKeysetOrFilter(cursor: ERPQuoteListCursor): string {
    const ts = cursor.createdAt
    const id = cursor.id
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    // Page after (created_at DESC, id DESC)
    return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_QUOTES_PAGE_SIZE = 100

function isMissingQuotesCreatedByUserIdColumnError(error: unknown): boolean {
    const message = String((error as any)?.message || "").toLowerCase()
    return message.includes("created_by_user_id") && message.includes("quotes")
}

export async function getERPQuotesPageAction(
    partnerId: string,
    options?: { cursor?: ERPQuoteListCursor | null; limit?: number; storeId?: string | null },
): Promise<
    | { success: true; items: any[]; nextCursor: ERPQuoteListCursor | null; hasMore: boolean }
    | { success: false; error: string }
> {
    return withTelemetry("getERPQuotesPageAction", async () => {
        try {
            const quoteAccess = await requireAuthorizedPartnerContext(partnerId, "quotes", "view")
            const user = quoteAccess.user
            partnerId = quoteAccess.partnerId
            const supabase = quoteAccess.admin
            const cursor = options?.cursor ?? null
            const storeId = options?.storeId ?? null
            const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_QUOTES_PAGE_SIZE))))
            const fetchLimit = limit + 1

            const selectWithCreator = `
                    id,
                    quote_number,
                    status,
                    issue_date,
                    expiration_date,
                    total,
                    customer_id,
                    user_id,
                    created_by_user_id,
                    created_at,
                    updated_at,
                    public_token,
                    customers (id, name, email),
                    items_count:quote_items(count)
                `
            const selectWithoutCreator = `
                    id,
                    quote_number,
                    status,
                    issue_date,
                    expiration_date,
                    total,
                    customer_id,
                    user_id,
                    created_at,
                    updated_at,
                    public_token,
                    customers (id, name, email),
                    items_count:quote_items(count)
                `
            const queryResult = await getCachedErpPage(
                ["erp-quotes-page", partnerId, storeId || "all-stores", cursor ? `${cursor.createdAt}:${cursor.id}` : "first", String(limit)],
                [TAGS.quotes(partnerId)],
                async () => {
                    const cachedSupabase = getAdminClient()
                    const runQuotesPageQuery = async (selectClause: string) => {
                        let query = cachedSupabase.from("quotes").select(selectClause).eq("partner_id", partnerId)
                        if (storeId) query = query.eq("store_id", storeId)
                        if (cursor) query = query.or(buildQuotesKeysetOrFilter(cursor))
                        return query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(fetchLimit)
                    }
                    let result = await runQuotesPageQuery(selectWithCreator)
                    if (result.error && isMissingQuotesCreatedByUserIdColumnError(result.error)) {
                        result = await runQuotesPageQuery(selectWithoutCreator)
                    }
                    if (result.error) throw result.error
                    return { data: result.data || [], error: null }
                },
                30,
            )

            const rowsWithCreator = (queryResult.data || []).map((row: any) => ({
                ...row,
                user_id: row?.user_id || null,
                created_by_user_id: row?.created_by_user_id || null,
            }))
            const creatorIds = Array.from(
                new Set(rowsWithCreator.map((row: any) => row.user_id || row.created_by_user_id).filter(Boolean))
            ) as string[]
            const creatorNameById = new Map<string, string>()
            if (creatorIds.length > 0) {
                const { data: profileRows } = await supabase
                    .from("user_profiles")
                    .select("user_id, full_name")
                    .in("user_id", creatorIds)

                for (const p of profileRows || []) {
                    creatorNameById.set(String((p as any).user_id), String((p as any).full_name || "Sistema"))
                }
            }

            // Mark expired quotes on read (virtual status, never for finalized)
            const now = new Date()
            now.setHours(0, 0, 0, 0)
            const finalizedStatuses = ["approved", "rejected", "expired", "cancelled", "converted_to_order"]

            const mappedData = rowsWithCreator.map((row: any) => {
                let cleanToken = row.public_token
                if (!cleanToken || isUuid(cleanToken)) {
                    cleanToken = generateShortId(6)
                    getAdminClient().from("quotes").update({ public_token: cleanToken }).eq("id", row.id).then(() => {})
                }
                const mappedRow = {
                    ...row,
                    public_token: cleanToken,
                    user_profiles: (row.user_id || row.created_by_user_id)
                        ? { full_name: creatorNameById.get(String(row.user_id || row.created_by_user_id)) || "Sistema" }
                        : null,
                }
                if (
                    row.expiration_date &&
                    !finalizedStatuses.includes(row.status) &&
                    new Date(row.expiration_date) < now
                ) {
                    return { ...mappedRow, status: "expired", _originalStatus: row.status }
                }
                return mappedRow
            })

            const rows = mappedData
            const hasMore = rows.length > limit
            const items = hasMore ? rows.slice(0, limit) : rows
            const last = items[items.length - 1]
            const nextCursor: ERPQuoteListCursor | null =
                hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

            return { success: true, items, nextCursor, hasMore }
        } catch (e: any) {
            return { success: false, error: e?.message || "Erro ao carregar orçamentos" }
        }
    })
}

function quoteItemsEditBlockedMessage(status: string): string {
    const s = normalizeQuoteStatus(status)
    if (s === "sent") return MSG_SENT_FINANCIAL
    if (s === "approved") return MSG_APPROVED_FINANCIAL
    if (s === "rejected" || s === "expired" || s === "cancelled") return MSG_REJECTED_EXPIRED_CANCELLED
    return "Itens do orçamento só podem ser alterados em rascunho."
}

async function assertQuoteAllowsItemEdits(
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
    quoteId: string,
    partnerId: string,
) {
    const { data: row, error } = await supabase
        .from("quotes")
        .select("status, converted")
        .eq("id", quoteId)
        .eq("partner_id", partnerId)
        .single()

    if (error || !row) {
        return "Orçamento não encontrado" as const
    }
    if (row.converted) {
        return "Este orçamento já foi convertido em pedido e não pode ser alterado." as const
    }
    if (!canEditFinancialFields(String(row.status || ""))) {
        return quoteItemsEditBlockedMessage(String(row.status || ""))
    }
    return null
}

type QuoteItemPayload = {
    productId?: string | null
    serviceId?: string | null
    lineType?: string | null
    customName?: string
    description?: string
    quantity: number
    unitPrice: number
    sortOrder?: number
}

function validateQuotePayload(items: QuoteItemPayload[] = [], shippingCost = 0, additionalCosts = 0, discountValue = 0) {
    if (items.length === 0) {
        return "Adicione pelo menos um item ao orçamento."
    }

    let subtotal = 0

    for (const item of items) {
        if (!item.productId && !String(item.customName || "").trim()) {
            return "Preencha o nome dos itens adicionados manualmente antes de salvar o orçamento."
        }

        if (Number(item.quantity || 0) <= 0) {
            return "Todos os itens do orçamento devem ter quantidade mínima de 1."
        }

        if (!item.productId && Number(item.unitPrice || 0) <= 0) {
            return "Preencha o preço dos itens adicionados manualmente antes de salvar o orçamento."
        }

        subtotal += Number(item.quantity || 0) * Number(item.unitPrice || 0)
    }

    const total = subtotal + Number(shippingCost || 0) + Number(additionalCosts || 0) - Number(discountValue || 0)
    if (total <= 0) {
        return "O orçamento não pode ser salvo com valor total zerado."
    }

    return null
}

async function validateQuoteItemsStock(partnerId: string, items: QuoteItemPayload[], supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>) {
    const stockItems = items.filter(item => !item.serviceId && item.lineType !== 'service_booking' && item.lineType !== 'service' && item.productId)
    const productIds = Array.from(new Set(stockItems.map((item) => item.productId).filter(Boolean))) as string[]
    if (productIds.length === 0) return null

    const { data: products, error } = await supabase
        .from("products")
        .select("id, name, stock_available")
        .eq("partner_id", partnerId)
        .in("id", productIds)

    if (error) {
        console.error("[validateQuoteItemsStock] Error:", error)
        return "Não foi possível validar o estoque dos itens do orçamento."
    }

    const foundProductIds = new Set((products || []).map((p: any) => p.id))
    const missingProductIds = productIds.filter((id) => !foundProductIds.has(id))

    let serviceIdsFoundInMissing = new Set<string>()
    if (missingProductIds.length > 0) {
        const { data: foundServices } = await supabase
            .from("services")
            .select("id")
            .eq("partner_id", partnerId)
            .in("id", missingProductIds)

        if (foundServices && foundServices.length > 0) {
            serviceIdsFoundInMissing = new Set(foundServices.map((s: any) => s.id))
        }
    }

    const stockMap = new Map<string, { name: string; stock: number }>((products || []).map((product: any) => [
        product.id,
        {
            name: product.name || "Produto",
            stock: Number(product.stock_available || 0),
        },
    ]))

    const requestedMap = new Map<string, number>()
    for (const item of stockItems) {
        if (!item.productId || serviceIdsFoundInMissing.has(item.productId)) continue
        requestedMap.set(item.productId, (requestedMap.get(item.productId) || 0) + Number(item.quantity || 0))
    }

    for (const [productId, requestedQty] of requestedMap.entries()) {
        const stockInfo = stockMap.get(productId)
        if (!stockInfo) {
            return "Um dos produtos do orçamento não foi encontrado para validar o estoque."
        }

        if (requestedQty > stockInfo.stock) {
            return `A quantidade de "${stockInfo.name}" está maior que o estoque disponível.`
        }
    }

    return null
}

async function getQuoteItemsForValidation(
    quoteId: string,
    partnerId: string,
    supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>
) {
    const { data, error } = await supabase
        .from("quote_items")
        .select("product_id, custom_name, description, quantity, unit_price, sort_order")
        .eq("quote_id", quoteId)
        .eq("partner_id", partnerId)
        .order("sort_order", { ascending: true })

    if (error) {
        console.error("[getQuoteItemsForValidation] Error:", error)
        return { items: null, error: "Não foi possível validar os itens do orçamento." }
    }

    return {
        items: (data || []).map((item: any) => ({
            productId: item.product_id || null,
            customName: item.custom_name || "",
            description: item.description || "",
            quantity: Number(item.quantity || 0),
            unitPrice: Number(item.unit_price || 0),
            sortOrder: Number(item.sort_order || 0),
        })) as QuoteItemPayload[],
        error: null,
    }
}

// ─── GET NEXT QUOTE NUMBER ──────────────────────────────────────────────────

export async function getNextQuoteNumberAction(partnerId: string) {
    return withTelemetry("getNextQuoteNumberAction", async () => {
        try {
            const user = await requireUser()
            await requirePermission(partnerId, "quotes", "view", user)

            const supabase = await getSupabaseServerClient()

            // Fetch the latest quote number for this partner
            const { data, error } = await supabase
                .from("quotes")
                .select("quote_number")
                .eq("partner_id", partnerId)
                .order("quote_number", { ascending: false })
                .limit(1)
                .single()

            if (error && error.code !== 'PGRST116') { // PGRST116 is 'no rows found'
                console.error("[getNextQuoteNumberAction] Error:", error)
                return errorResponse("Erro ao buscar próximo número")
            }

            let nextNumber = "ORC00001"
            if (data?.quote_number) {
                const match = data.quote_number.match(/(\d+)$/)
                if (match) {
                    const currentNum = parseInt(match[0], 10)
                    nextNumber = `ORC${(currentNum + 1).toString().padStart(5, '0')}`
                }
            }

            return successResponse(nextNumber)
        } catch (err: any) {
            console.error("[getNextQuoteNumberAction] Error:", err)
            return errorResponse(err.message || "Erro interno")
        }
    })
}

// ─── CREATE QUOTE ───────────────────────────────────────────────────────────

export async function createQuoteAction(data: {
    partnerId: string
    customerId?: string | null
    issueDate?: string
    expirationDate?: string | null
    notes?: string
    /** Observações internas (não vão para o cliente na proposta). */
    internalNotes?: string | null
    discountType?: "fixed" | "percentage"
    discountValue?: number
    shippingCost?: number
    additionalCosts?: number
    items?: QuoteItemPayload[]
    userId?: string | null
    storeId?: string | null
    preview?: {
        primaryColor?: string
        secondaryColor?: string
        quoteTitle?: string
        quoteSubtitle?: string
        showDecoration?: boolean
    }
}) {
    return withTelemetry("createQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const user = await requireUser()
            await requirePermission(data.partnerId, "quotes", "create", user)

            // Validate discount permission if a discount is being applied
            if ((data.discountValue || 0) > 0) {
                await requirePermission(data.partnerId, "quotes", "can_apply_discount")
            }

            const limitCheck = await checkLimit(data.partnerId, "monthly_quotes")
            if (!limitCheck.allowed) {
                return errorResponse(limitCheck.message || "Limite mensal de orçamentos atingido para este plano.")
            }

            const supabase = await getSupabaseServerClient()
            let customerId = data.customerId || null
            if (customerId) {
                const { data: customer } = await getAdminClient()
                    .from("customers")
                    .select("id")
                    .eq("id", customerId)
                    .eq("partner_id", data.partnerId)
                    .maybeSingle()
                if (!customer?.id) return errorResponse("Cliente invÃ¡lido para este parceiro.")
                customerId = customer.id
            }
            const payloadValidationError = validateQuotePayload(
                data.items || [],
                data.shippingCost || 0,
                data.additionalCosts || 0,
                data.discountValue || 0
            )
            if (payloadValidationError) {
                return errorResponse(payloadValidationError)
            }
            const stockValidationError = await validateQuoteItemsStock(data.partnerId, data.items || [], supabase)
            if (stockValidationError) {
                return errorResponse(stockValidationError)
            }

            // Map data to JSON for the Postgres RPC Function
            const itemsJson = data.items && data.items.length > 0 ? data.items.map((item, idx) => ({
                product_id: item.productId || null,
                custom_name: item.customName?.trim().substring(0, 150) || null,
                description: item.description || null,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                sort_order: item.sortOrder ?? idx
            })) : null;

            // Execute Native DB Transaction
            const { data: quoteResult, error: rpcError } = await supabase.rpc('create_quote_with_items', {
                p_partner_id: data.partnerId,
                // The RPC context is always the authenticated actor. A client
                // supplied userId is not an authorization input.
                p_user_id: user.id,
                p_customer_id: customerId,
                p_status: "draft",
                p_issue_date: data.issueDate || new Date().toISOString().split("T")[0],
                p_expiration_date: data.expirationDate || null,
                p_notes: sanitizeNotes(data.notes),
                p_internal_notes: sanitizeNotes(data.internalNotes),
                p_discount_type: data.discountType || "fixed",
                p_discount_value: data.discountValue || 0,
                p_shipping_cost: data.shippingCost || 0,
                p_additional_costs: data.additionalCosts || 0,
                p_items: itemsJson
            })

            if (rpcError || !quoteResult) {
                console.error("[createQuoteAction] RPC Error:", rpcError)
                return errorResponse(rpcError?.message || "Erro fatal ao criar orçamento. Operação revertida.")
            }

            // Save preview customization to metadata
            if (data.preview) {
                const previewMeta = {
                    preview: {
                        primaryColor: data.preview.primaryColor || null,
                        secondaryColor: data.preview.secondaryColor || null,
                        quoteTitle: data.preview.quoteTitle || null,
                        quoteSubtitle: data.preview.quoteSubtitle || null,
                        showDecoration: data.preview.showDecoration ?? true,
                    }
                }
                await supabase
                    .from("quotes")
                    .update({ metadata: previewMeta as any })
                    .eq("id", quoteResult.id)
            }

            // Set store_id after RPC creation
            if (data.storeId) {
                await supabase
                    .from("quotes")
                    .update({ store_id: data.storeId })
                    .eq("id", quoteResult.id)
            }

            // Sync full state to compute native triggers (subtotals)
            const { data: updatedQuote } = await supabase
                .from("quotes")
                .select("id, quote_number, total, subtotal, status, public_token")
                .eq("id", quoteResult.id)
                .single()

            let shortPublicToken = updatedQuote?.public_token
            if (!shortPublicToken || isUuid(shortPublicToken)) {
                shortPublicToken = generateShortId(6)
                await supabase.from("quotes").update({ public_token: shortPublicToken }).eq("id", quoteResult.id)
            }

            const newQuoteId = updatedQuote?.id || quoteResult.id

            await revalidateQuotes(data.partnerId, newQuoteId)

            await increment_usage_counter(data.partnerId, "quotes_month_count")

            await logAuditEvent({
                partnerId: data.partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: newQuoteId,
                actionType: "created",
                changeLines: [`criou o orçamento ${updatedQuote?.quote_number || quoteResult.quote_number || ""}`.trim()],
                source: "manual",
            })

            return successResponse({
                id: newQuoteId,
                quote_number: updatedQuote?.quote_number || quoteResult.quote_number,
                total: updatedQuote?.total || 0,
                public_token: shortPublicToken,
            })
        } catch (err: any) {
            console.error("[createQuoteAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao criar orçamento")
        }
    });
}

// ─── UPDATE QUOTE ───────────────────────────────────────────────────────────

export async function updateQuoteAction(data: {
    quoteId: string
    partnerId: string
    customerId?: string | null
    issueDate?: string
    expirationDate?: string | null
    notes?: string
    internalNotes?: string | null
    discountType?: "fixed" | "percentage"
    discountValue?: number
    shippingCost?: number
    additionalCosts?: number
    storeId?: string | null
    preview?: {
        primaryColor?: string
        secondaryColor?: string
        quoteTitle?: string
        quoteSubtitle?: string
        showDecoration?: boolean
    }
}) {
    return withTelemetry("updateQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const user = await requireUser()
            await requirePermission(data.partnerId, "quotes", "edit", user)

            // Validate discount permission if discount fields are being changed
            if ((data.discountValue !== undefined && data.discountValue > 0) || data.discountType) {
                await requirePermission(data.partnerId, "quotes", "can_apply_discount")
            }

            const supabase = await getSupabaseServerClient()
            let customerId = data.customerId || null
            if (data.customerId !== undefined && customerId) {
                const { data: customer } = await getAdminClient()
                    .from("customers")
                    .select("id")
                    .eq("id", customerId)
                    .eq("partner_id", data.partnerId)
                    .maybeSingle()
                if (!customer?.id) return errorResponse("Cliente invÃ¡lido para este parceiro.")
                customerId = customer.id
            }
            const existingItemsResult = await getQuoteItemsForValidation(data.quoteId, data.partnerId, supabase)
            if (existingItemsResult.error || !existingItemsResult.items) {
                return errorResponse(existingItemsResult.error || "Não foi possí­vel validar o orçamento")
            }

            const { data: currentQuote, error: currentQuoteError } = await supabase
                .from("quotes")
                .select(
                    "status, customer_id, issue_date, expiration_date, notes, internal_notes, discount_type, discount_value, shipping_cost, additional_costs, converted, metadata",
                )
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .single()

            if (currentQuoteError || !currentQuote) {
                console.error("[updateQuoteAction] Error fetching current quote:", currentQuoteError)
                return errorResponse("Orçamento não encontrado")
            }

            if (currentQuote.converted) {
                return errorResponse("Este orçamento já foi convertido em pedido e não pode ser editado.")
            }

            const caps = getQuoteEditCaps(String(currentQuote.status || "draft"), Boolean(currentQuote.converted))

            const payloadValidationError = validateQuotePayload(
                existingItemsResult.items,
                data.shippingCost ?? Number(currentQuote.shipping_cost || 0),
                data.additionalCosts ?? Number(currentQuote.additional_costs || 0),
                data.discountValue ?? Number(currentQuote.discount_value || 0)
            )
            if (payloadValidationError) {
                return errorResponse(payloadValidationError)
            }

            const updatePayload: Record<string, unknown> = {}
            if (data.customerId !== undefined) updatePayload.customer_id = customerId
            if (data.issueDate) updatePayload.issue_date = data.issueDate
            if (data.expirationDate !== undefined) updatePayload.expiration_date = data.expirationDate || null
            if (data.notes !== undefined) updatePayload.notes = sanitizeNotes(data.notes)
            if (data.internalNotes !== undefined) updatePayload.internal_notes = sanitizeNotes(data.internalNotes)
            if (data.discountType) updatePayload.discount_type = data.discountType
            if (data.discountValue !== undefined) updatePayload.discount_value = data.discountValue
            if (data.shippingCost !== undefined) updatePayload.shipping_cost = data.shippingCost
            if (data.additionalCosts !== undefined) updatePayload.additional_costs = data.additionalCosts
            if (data.storeId !== undefined) updatePayload.store_id = data.storeId || null
            if (data.preview) {
                const existingMeta = (currentQuote as any)?.metadata || {}
                updatePayload.metadata = {
                    ...existingMeta,
                    preview: {
                        primaryColor: data.preview.primaryColor || null,
                        secondaryColor: data.preview.secondaryColor || null,
                        quoteTitle: data.preview.quoteTitle || null,
                        quoteSubtitle: data.preview.quoteSubtitle || null,
                        showDecoration: data.preview.showDecoration ?? true,
                    }
                }
            }

            const fieldCap: Record<string, keyof typeof caps> = {
                customer_id: "canEditCustomer",
                issue_date: "canEditIssueDate",
                expiration_date: "canEditExpirationDate",
                notes: "canEditProposalNotes",
                internal_notes: "canEditInternalNotes",
                discount_type: "canEditDiscountShipping",
                discount_value: "canEditDiscountShipping",
                shipping_cost: "canEditDiscountShipping",
                additional_costs: "canEditDiscountShipping",
            }

            for (const key of Object.keys(updatePayload)) {
                const capKey = fieldCap[key]
                if (!capKey) continue
                if (!caps[capKey]) {
                    const st = normalizeQuoteStatus(String(currentQuote.status))
                    if (st === "sent") return errorResponse(MSG_SENT_FINANCIAL)
                    if (st === "approved") return errorResponse(MSG_APPROVED_FINANCIAL)
                    if (st === "rejected" || st === "expired" || st === "cancelled") {
                        return errorResponse(MSG_REJECTED_EXPIRED_CANCELLED)
                    }
                    return errorResponse("Este orçamento não pode ser alterado no status atual.")
                }
            }

            // Recalculate subtotal and total from quote items in database
            const { data: allItems } = await supabase
                .from("quote_items")
                .select("quantity, unit_price")
                .eq("quote_id", data.quoteId)

            const calculatedSubtotal = (allItems || []).reduce(
                (acc, it) => acc + Number(it.quantity || 0) * Number(it.unit_price || 0),
                0
            )

            const discType = data.discountType || currentQuote.discount_type || "fixed"
            const discVal = data.discountValue !== undefined ? Number(data.discountValue) : Number(currentQuote.discount_value || 0)
            const shipping = data.shippingCost !== undefined ? Number(data.shippingCost) : Number(currentQuote.shipping_cost || 0)
            const additional = data.additionalCosts !== undefined ? Number(data.additionalCosts) : Number(currentQuote.additional_costs || 0)

            let discountAmount = 0
            if (discType === "percentage") {
                discountAmount = (calculatedSubtotal * discVal) / 100
            } else {
                discountAmount = discVal
            }

            const calculatedTotal = Math.max(0, calculatedSubtotal - discountAmount + shipping + additional)

            updatePayload.subtotal = Number(calculatedSubtotal.toFixed(2))
            updatePayload.total = Number(calculatedTotal.toFixed(2))
            updatePayload.updated_at = new Date().toISOString()

            const { error } = await supabase
                .from("quotes")
                .update(updatePayload as any)
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)

            if (error) {
                console.error("[updateQuoteAction] Error:", error)
                return errorResponse(error.message)
            }

            await revalidateQuotes(data.partnerId, data.quoteId)

            await logAuditEvent({
                partnerId: data.partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: data.quoteId,
                actionType: "updated",
                changeLines: ["atualizou os dados do orçamento"],
                source: "manual",
            })

            // If quote originated from marketplace, notify customer
            await notifyMarketplaceQuoteReady(data.quoteId, data.partnerId)

            return successResponse({ id: data.quoteId })
        } catch (err: any) {
            console.error("[updateQuoteAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao atualizar orçamento")
        }
    });
}

export async function notifyMarketplaceQuoteReady(quoteId: string, partnerId: string) {
    try {
        const supabase = await getSupabaseServerClient()
        const { data: quote } = await supabase
            .from("quotes")
            .select(`
                id,
                quote_number,
                status,
                total,
                public_token,
                metadata,
                customer_id,
                customers (
                    id,
                    name,
                    marketplace_user_id
                )
            `)
            .eq("id", quoteId)
            .eq("partner_id", partnerId)
            .maybeSingle()

        if (!quote) return

        const meta = (quote.metadata || {}) as Record<string, any>
        const marketplaceUserId = meta.marketplace_user_id || (quote.customers as any)?.marketplace_user_id
        if (!marketplaceUserId) return

        // Auto-generate public_token if missing
        let publicToken = quote.public_token
        if (!publicToken) {
            publicToken = generateShortId(6)
            await getAdminClient().from("quotes").update({ public_token: publicToken }).eq("id", quoteId)
        }

        // Fetch store / partner name
        const { data: store } = await supabase
            .from("stores")
            .select("name")
            .eq("partner_id", partnerId)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle()

        const partnerName = store?.name || "Estabelecimento"
        const serviceName = meta.service_name || "Serviço"

        await createNotification({
            userId: marketplaceUserId,
            title: `🧾 Orçamento pronto: ${partnerName}`,
            message: `Seu orçamento para "${serviceName}" foi preparado com os valores e prazos! Clique para visualizar a proposta.`,
            type: "message_received",
            entityType: "quote",
            entityId: quoteId,
            data: {
                public_token: publicToken,
                token: publicToken,
                audience: "customer",
                quote_id: quoteId,
                quote_number: quote.quote_number,
                partner_id: partnerId,
                service_name: serviceName,
                href: `/quote/${publicToken}`,
            },
            idempotencyKey: `quote-ready-${quoteId}-${Math.floor(Date.now() / (10 * 60 * 1000))}`,
            origin: "system",
        })
    } catch (err) {
        console.error("[notifyMarketplaceQuoteReady] Error:", err)
    }
}

async function saveQuoteSnapshot(supabase: any, quoteId: string, partnerId: string) {
    // 1. Fetch quote
    const { data: quote, error: quoteErr } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", quoteId)
        .eq("partner_id", partnerId)
        .single()
    if (quoteErr || !quote) return

    // 2. Fetch partner, store and address details
    const [partnerRes, storeRes, addressRes] = await Promise.all([
        supabase.from("partners").select("id, user_id").eq("id", partnerId).maybeSingle(),
        quote.store_id
            ? supabase.from("stores").select("id, name, logo_url, phone").eq("id", quote.store_id).maybeSingle()
            : supabase.from("stores").select("id, name, logo_url, phone").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
        getPartnerAddressAction(partnerId, quote.store_id || undefined)
    ])
    const partner = partnerRes.data
    const store = storeRes.data

    const partnerAddressFormatted = (addressRes.success && addressRes.data?.formatted) || "Endereço não cadastrado"
    const resolvedPartnerName = store?.name || "Parceiro"
    const resolvedPartnerLogo = store?.logo_url || null
    const resolvedPartnerPhone = store?.phone || null

    let partnerEmail = null
    if (partner?.user_id) {
        try {
            const admin = getAdminClient()
            const { data: authData } = await admin.auth.admin.getUserById(partner.user_id)
            partnerEmail = authData?.user?.email || null
        } catch (err) {
            console.error("Error fetching partner email:", err)
        }
    }

    // 3. Fetch seller profile
    let sellerInfo = null
    if (quote.user_id) {
        const { data: profile } = await supabase
            .from("user_profiles")
            .select("full_name")
            .eq("user_id", quote.user_id)
            .maybeSingle()
        if (profile) {
            const admin = getAdminClient()
            const { data: authData } = await admin.auth.admin.getUserById(quote.user_id)
            const authUser = authData?.user ? { email: authData.user.email } : null
            sellerInfo = {
                name: profile.full_name,
                email: authUser?.email || null
            }
        }
    }

    // 4. Fetch customer and address
    let customerInfo = null
    if (quote.customer_id) {
        const { data: customer } = await getAdminClient()
            .from("customers")
            .select("id, name, email, phone, image_url")
            .eq("id", quote.customer_id)
            .eq("partner_id", partnerId)
            .maybeSingle()

        if (customer) {
            const { data: customerAddrs } = await supabase
                .from("addresses")
                .select("*")
                .eq("customer_id", quote.customer_id)

            customerInfo = {
                ...customer,
                addresses: customerAddrs || []
            }
        }
    }

    // 5. Fetch items
    const { data: items } = await supabase
        .from("quote_items")
        .select("*, products(name, sku, images, unit)")
        .eq("quote_id", quoteId)
        .order("sort_order", { ascending: true })

    const formattedItems = (items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        name: item.custom_name || item.product_name_snapshot || item.products?.name || "Produto sem nome",
        sku: item.product_sku_snapshot || item.products?.sku || "",
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        total_price: Number(item.total_price || 0),
        description: item.description || "",
        image: item.products?.images && item.products.images.length > 0 ? item.products.images[0] : "https://img.dudit.com.br/static/Placeholder.png",
        unit: item.products?.unit || "un"
    }))

    // 6. Build snapshot object
    const snapshotData = {
        quote_number: quote.quote_number,
        issue_date: quote.issue_date,
        expiration_date: quote.expiration_date,
        notes: quote.notes,
        subtotal: Number(quote.subtotal || 0),
        discount_type: quote.discount_type,
        discount_value: Number(quote.discount_value || 0),
        shipping_cost: Number(quote.shipping_cost || 0),
        additional_costs: Number(quote.additional_costs || 0),
        total: Number(quote.total || 0),
        partner: {
            name: resolvedPartnerName,
            image_url: resolvedPartnerLogo,
            email: partnerEmail,
            phone: resolvedPartnerPhone,
            address: partnerAddressFormatted
        },
        seller: sellerInfo,
        customer: customerInfo,
        items: formattedItems,
        payment_terms: quote.metadata?.payment_terms || null,
        coupon_data: quote.metadata?.coupon_data || null,
        metadata: quote.metadata || {}
    }

    // 7. Update DB with snapshot
    await supabase
        .from("quotes")
        .update({
            snapshot: snapshotData,
            snapshot_version: 1,
            snapshot_generated_at: new Date().toISOString()
        })
        .eq("id", quoteId)
        .eq("partner_id", partnerId)
}

// ─── UPDATE QUOTE STATUS ────────────────────────────────────────────────────

export async function updateQuoteStatusAction(data: {
    quoteId: string
    partnerId: string
    status: "draft" | "sent" | "pending_client" | "viewed" | "approved" | "rejected" | "expired" | "cancelled" | "converted_to_order"
}) {
    return withTelemetry("updateQuoteStatusAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const user = await requireUser()
            await requirePermission(data.partnerId, "quotes", "edit", user)

            // Validate status transition
            const supabase = await getSupabaseServerClient()

            const { data: current, error: fetchError } = await supabase
                .from("quotes")
                .select("status, updated_at, converted")
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .single()

            if (fetchError || !current) {
                return errorResponse("Orçamento não encontrado")
            }

            if (current.converted) {
                return errorResponse("Este orçamento já foi convertido em pedido.")
            }

            // Define allowed transitions
            const allowedTransitions: Record<string, string[]> = {
                draft: ["sent", "pending_client", "viewed", "approved", "rejected", "cancelled"],
                sent: ["pending_client", "viewed", "approved", "rejected", "draft", "cancelled", "expired"],
                pending_client: ["viewed", "approved", "rejected", "draft", "cancelled", "expired"],
                viewed: ["approved", "rejected", "draft", "cancelled", "expired"],
                approved: ["cancelled", "converted_to_order"],
                rejected: ["draft"],
                expired: ["draft"],
                cancelled: ["draft"],
            }

            if (current.status === data.status) {
                return successResponse({ id: data.quoteId, status: data.status, noop: true })
            }

            const allowed = allowedTransitions[current.status] || []
            if (!allowed.includes(data.status)) {
                return errorResponse(
                    `Não é possível mudar de "${current.status}" para "${data.status}"`
                )
            }

            // Get current user profile for audit / approver attribution
            const { data: userProfile } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", user.id)
                .maybeSingle()

            const approverDisplayName = userProfile?.full_name?.trim() || user.email?.split("@")[0] || "Operador ERP"

            const updatePayload: Record<string, any> = {
                status: data.status,
                updated_at: new Date().toISOString(),
            }

            if (data.status === "approved") {
                updatePayload.approved_at = new Date().toISOString()
                updatePayload.approver_name = approverDisplayName
                updatePayload.approval_method = "erp_manual"
            } else if (data.status === "rejected") {
                updatePayload.rejected_at = new Date().toISOString()
                updatePayload.approver_name = approverDisplayName
                updatePayload.approval_method = "erp_manual"
            } else if (data.status === "draft" || data.status === "sent" || data.status === "pending_client") {
                updatePayload.approved_at = null
                updatePayload.rejected_at = null
                updatePayload.approver_name = null
                updatePayload.approval_method = null
                updatePayload.rejection_reason = null
            }

            const { error } = await supabase
                .from("quotes")
                .update(updatePayload)
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)

            if (error) {
                console.error("[updateQuoteStatusAction] Error:", error)
                return errorResponse(error.message || "Erro ao atualizar status.")
            }

            // Generate snapshot if transitioning out of draft
            if (current.status === "draft" && data.status !== "draft" && data.status !== "cancelled") {
                await saveQuoteSnapshot(supabase, data.quoteId, data.partnerId)
            }

            // Fetch fully updated quote for notifications and RLS / details
            const { data: updatedQuote } = await getAdminClient()
                .from("quotes")
                .select("*, customers(id, name, email)")
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .single()

            // Trigger notification for customer if transitioned from draft to sent/pending_client
            if (current.status === "draft" && (data.status === "sent" || data.status === "pending_client")) {
                await notifyQuoteEvent({
                    event: "shared",
                    quote: updatedQuote,
                    actorUserId: user.id
                }).catch(console.error)
                import("@/lib/services/whatsapp-automation.service")
                    .then(({ onQuoteShared }) => onQuoteShared(updatedQuote))
                    .catch(console.error)
            } else if (data.status === "approved") {
                await notifyQuoteEvent({
                    event: "approved",
                    quote: updatedQuote,
                    actorUserId: user.id,
                    actorName: approverDisplayName,
                    approvalMethod: "erp_manual",
                }).catch(console.error)
            } else if (data.status === "rejected") {
                await notifyQuoteEvent({
                    event: "rejected",
                    quote: updatedQuote,
                    actorUserId: user.id,
                    actorName: approverDisplayName,
                    approvalMethod: "erp_manual",
                }).catch(console.error)
            }

            await revalidateQuotes(data.partnerId, data.quoteId)

            const statusLabels: Record<string, string> = {
                draft: "Rascunho",
                sent: "Enviado",
                pending_client: "Pendente do Cliente",
                viewed: "Visualizado",
                approved: "Aprovado",
                rejected: "Rejeitado",
                expired: "Expirado",
                cancelled: "Cancelado",
                converted_to_order: "Convertido em Pedido"
            }
            await logAuditEvent({
                partnerId: data.partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: data.quoteId,
                actionType: "status_changed",
                changeLines: [
                    `alterou o status de ${statusLabels[current.status] || current.status} para ${statusLabels[data.status] || data.status}`,
                ],
                metadata: {
                    oldStatus: statusLabels[current.status] || current.status,
                    newStatus: statusLabels[data.status] || data.status,
                },
                source: "manual",
            })

            return successResponse({ id: data.quoteId, status: data.status })
        } catch (err: any) {
            console.error("[updateQuoteStatusAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao atualizar status")
        }
    })
}

// ─── DELETE QUOTE ───────────────────────────────────────────────────────────

export async function deleteQuoteAction(quoteId: string) {
    return withTelemetry("deleteQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const ctx = await getCurrentPartnerContext()
            if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

            const user = await requireUser()
            await requirePermission(ctx.partnerId, "quotes", "delete", user)

            const supabase = await getSupabaseServerClient()

            // Delete quote (cascade deletes items)
            const { error } = await supabase
                .from("quotes")
                .delete()
                .eq("id", quoteId)
                .eq("partner_id", ctx.partnerId)

            if (error) {
                console.error("[deleteQuoteAction] Error:", error)
                return errorResponse(error.message)
            }

            await revalidateQuotes(ctx.partnerId, quoteId)

            // Decrement usage counter
            await decrement_usage_counter(ctx.partnerId, "quotes_month_count")

            return successResponse({ id: quoteId })
        } catch (err: any) {
            console.error("[deleteQuoteAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao deletar orçamento")
        }
    });
}

// ─── DUPLICATE QUOTE ────────────────────────────────────────────────────────

export async function duplicateQuoteAction(quoteId: string) {
    return withTelemetry("duplicateQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const ctx = await getCurrentPartnerContext()
            if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

            const user = await requireUser()
            await requirePermission(ctx.partnerId, "quotes", "create", user)

            const limitCheck = await checkLimit(ctx.partnerId, "monthly_quotes")
            if (!limitCheck.allowed) {
                return errorResponse(limitCheck.message || "Limite mensal de orçamentos atingido para este plano.")
            }

            const supabase = await getSupabaseServerClient()

            const { data: sourceMeta } = await supabase
                .from("quotes")
                .select("quote_number")
                .eq("id", quoteId)
                .eq("partner_id", ctx.partnerId)
                .maybeSingle()

            // Call Transaction RPC Function
            const { data: newQuote, error: rpcError } = await supabase.rpc('duplicate_quote_with_items', {
                p_quote_id: quoteId,
                p_partner_id: ctx.partnerId,
                p_user_id: user.id
            })

            if (rpcError || !newQuote) {
                console.error("[duplicateQuoteAction] Error:", rpcError)
                return errorResponse(rpcError?.message || "Erro fatal ao duplicar orçamento.")
            }

            const created = newQuote as { id: string; quote_number: string }
            const sourceLabel = sourceMeta?.quote_number || quoteId

            await revalidateQuotes(ctx.partnerId, created.id)
            await revalidateQuotes(ctx.partnerId, quoteId)

            await increment_usage_counter(ctx.partnerId, "quotes_month_count")

            await logAuditEvent({
                partnerId: ctx.partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: created.id,
                actionType: "duplicated",
                changeLines: [`criou este orçamento duplicando o orçamento ${sourceLabel}`],
                source: "manual",
            })
            await logAuditEvent({
                partnerId: ctx.partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: quoteId,
                actionType: "duplicated",
                changeLines: [`duplicou para o novo orçamento ${created.quote_number}`],
                source: "manual",
            })

            return successResponse({
                id: created.id,
                quote_number: created.quote_number,
            })
        } catch (err: any) {
            console.error("[duplicateQuoteAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao duplicar orçamento")
        }
    });
}

// ─── ADD QUOTE ITEM ─────────────────────────────────────────────────────────

export async function addQuoteItemAction(data: {
    quoteId: string
    partnerId: string
    productId?: string | null
    customName?: string
    description?: string
    quantity: number
    unitPrice: number
    sortOrder?: number
}) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const user = await requireUser()
        await requirePermission(data.partnerId, "quotes", "edit", user)

        if (data.quantity <= 0) return errorResponse("Quantidade deve ser maior que zero")
        if (data.quantity > 999999) return errorResponse("Quantidade máxima excedida")
        if (data.unitPrice < 0) return errorResponse("Preço unitário não pode ser negativo")
        if (data.unitPrice > 99999999.99) return errorResponse("Preço unitário máximo excedido")
        if (!data.productId && !String(data.customName || "").trim()) {
            return errorResponse("Nome do item manual é obrigatório")
        }
        if (!data.productId && data.unitPrice <= 0) {
            return errorResponse("Preço do item manual deve ser maior que zero")
        }

        const supabase = await getSupabaseServerClient()

        // Resolve store_id from parent quote
        const { data: quote } = await supabase
            .from("quotes")
            .select("store_id")
            .eq("id", data.quoteId)
            .eq("partner_id", data.partnerId)
            .maybeSingle()

        const itemGuard = await assertQuoteAllowsItemEdits(supabase, data.quoteId, data.partnerId)
        if (itemGuard) return errorResponse(itemGuard)

        const { data: item, error } = await supabase
            .from("quote_items")
            .insert({
                quote_id: data.quoteId,
                partner_id: data.partnerId,
                store_id: quote?.store_id || null,
                product_id: data.productId || null,
                custom_name: data.customName?.trim().substring(0, 150) || null,
                description: data.description || null,
                quantity: data.quantity,
                unit_price: data.unitPrice,
                sort_order: data.sortOrder ?? 0,
            })
            .select()
            .single()

        if (error) {
            console.error("[addQuoteItemAction] Error:", error)
            return errorResponse(error.message)
        }

        await revalidateQuotes(data.partnerId)
        return successResponse(item)
    } catch (err: any) {
        console.error("[addQuoteItemAction] Error:", err)
        return errorResponse(err.message || "Erro interno ao adicionar item")
    }
}

// ─── UPDATE QUOTE ITEM ──────────────────────────────────────────────────────

export async function updateQuoteItemAction(data: {
    itemId: string
    partnerId: string
    customName?: string
    description?: string
    quantity?: number
    unitPrice?: number
    sortOrder?: number
}) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const user = await requireUser()
        await requirePermission(data.partnerId, "quotes", "edit", user)

        if (data.quantity !== undefined && data.quantity <= 0) {
            return errorResponse("Quantidade deve ser maior que zero")
        }
        if (data.quantity !== undefined && data.quantity > 999999) {
            return errorResponse("Quantidade máxima excedida")
        }
        if (data.unitPrice !== undefined && data.unitPrice < 0) {
            return errorResponse("Preço unitário não pode ser negativo")
        }
        if (data.unitPrice !== undefined && data.unitPrice > 99999999.99) {
            return errorResponse("Preço unitário máximo excedido")
        }

        const supabase = await getSupabaseServerClient()
        const { data: existingItem, error: existingItemError } = await supabase
            .from("quote_items")
            .select("id, quote_id, product_id, custom_name, unit_price")
            .eq("id", data.itemId)
            .eq("partner_id", data.partnerId)
            .single()

        if (existingItemError || !existingItem) {
            console.error("[updateQuoteItemAction] Error fetching current item:", existingItemError)
            return errorResponse("Item do orçamento não encontrado")
        }

        const itemGuard = await assertQuoteAllowsItemEdits(supabase, existingItem.quote_id, data.partnerId)
        if (itemGuard) return errorResponse(itemGuard)

        if (!existingItem.product_id) {
            const resolvedCustomName = data.customName !== undefined ? data.customName : existingItem.custom_name
            const resolvedUnitPrice = data.unitPrice !== undefined ? data.unitPrice : Number(existingItem.unit_price || 0)

            if (!String(resolvedCustomName || "").trim()) {
                return errorResponse("Nome do item manual é obrigatório")
            }

            if (Number(resolvedUnitPrice || 0) <= 0) {
                return errorResponse("Preço do item manual deve ser maior que zero")
            }
        }

        const updatePayload: any = {}
        if (data.customName !== undefined) updatePayload.custom_name = String(data.customName || "").trim().substring(0, 150)
        if (data.description !== undefined) updatePayload.description = data.description
        if (data.quantity !== undefined) updatePayload.quantity = data.quantity
        if (data.unitPrice !== undefined) updatePayload.unit_price = data.unitPrice
        if (data.sortOrder !== undefined) updatePayload.sort_order = data.sortOrder

        const newQty = data.quantity !== undefined ? data.quantity : Number((existingItem as any).quantity || 1)
        const newPrice = data.unitPrice !== undefined ? data.unitPrice : Number(existingItem.unit_price || 0)
        updatePayload.total_price = Number((newQty * newPrice).toFixed(2))

        const { error } = await supabase
            .from("quote_items")
            .update(updatePayload)
            .eq("id", data.itemId)
            .eq("partner_id", data.partnerId)

        if (error) {
            console.error("[updateQuoteItemAction] Error:", error)
            return errorResponse(error.message)
        }

        // Recalculate parent quote subtotal and total
        const { data: allQuoteItems } = await supabase
            .from("quote_items")
            .select("quantity, unit_price")
            .eq("quote_id", existingItem.quote_id)

        const calculatedSubtotal = (allQuoteItems || []).reduce(
            (acc, it) => acc + Number(it.quantity || 0) * Number(it.unit_price || 0),
            0
        )

        const { data: parentQuote } = await supabase
            .from("quotes")
            .select("discount_type, discount_value, shipping_cost, additional_costs")
            .eq("id", existingItem.quote_id)
            .single()

        if (parentQuote) {
            const discType = parentQuote.discount_type || "fixed"
            const discVal = Number(parentQuote.discount_value || 0)
            const shipping = Number(parentQuote.shipping_cost || 0)
            const additional = Number(parentQuote.additional_costs || 0)

            let discountAmount = 0
            if (discType === "percentage") {
                discountAmount = (calculatedSubtotal * discVal) / 100
            } else {
                discountAmount = discVal
            }

            const calculatedTotal = Math.max(0, calculatedSubtotal - discountAmount + shipping + additional)

            await supabase
                .from("quotes")
                .update({
                    subtotal: Number(calculatedSubtotal.toFixed(2)),
                    total: Number(calculatedTotal.toFixed(2)),
                    updated_at: new Date().toISOString()
                })
                .eq("id", existingItem.quote_id)
        }

        await revalidateQuotes(data.partnerId, existingItem.quote_id)
        return successResponse({ id: data.itemId })
    } catch (err: any) {
        console.error("[updateQuoteItemAction] Error:", err)
        return errorResponse(err.message || "Erro interno ao atualizar item")
    }
}

// ─── DELETE QUOTE ITEM ──────────────────────────────────────────────────────

export async function deleteQuoteItemAction(itemId: string, partnerId: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const user = await requireUser()
        await requirePermission(partnerId, "quotes", "edit", user)

        const supabase = await getSupabaseServerClient()

        const { data: row, error: rowError } = await supabase
            .from("quote_items")
            .select("quote_id")
            .eq("id", itemId)
            .eq("partner_id", partnerId)
            .single()

        if (rowError || !row) {
            return errorResponse("Item do orçamento não encontrado")
        }

        const itemGuard = await assertQuoteAllowsItemEdits(supabase, row.quote_id, partnerId)
        if (itemGuard) return errorResponse(itemGuard)

        const { error } = await supabase
            .from("quote_items")
            .delete()
            .eq("id", itemId)
            .eq("partner_id", partnerId)

        if (error) {
            console.error("[deleteQuoteItemAction] Error:", error)
            return errorResponse(error.message)
        }

        await revalidateQuotes(partnerId)
        return successResponse({ id: itemId })
    } catch (err: any) {
        console.error("[deleteQuoteItemAction] Error:", err)
        return errorResponse(err.message || "Erro interno ao deletar item")
    }
}

// ─── SEARCH PRODUCTS FOR QUOTE ──────────────────────────────────────────────

export async function searchProductsForQuote(query: string) {
    if (!query || query.trim().length < 2) return []

    await requireRateLimit(RateLimitCategory.API_GENERAL)

    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        const supabase = await getSupabaseServerClient()
        const searchTerm = `%${query}%`

        const { data, error } = await supabase
            .from("products")
            .select("id, name, sku, price, images")
            .eq("partner_id", ctx.partnerId)
            .eq("is_active", true)
            .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm}`)
            .limit(10)

        if (error) {
            console.error("[searchProductsForQuote] Error:", error)
            return []
        }

        return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku || "N/A",
            price: p.price,
            image: p.images && p.images.length > 0
                ? p.images[0]
                : "https://img.dudit.com.br/static/Placeholder.png",
        }))
    } catch (err) {
        console.error("[searchProductsForQuote] Error:", err)
        return []
    }
}

// ─── SEARCH CUSTOMERS FOR QUOTE ─────────────────────────────────────────────

export async function searchCustomersForQuote(query?: string) {
    await requireRateLimit(RateLimitCategory.API_GENERAL)

    try {
        const customerAccess = await requireAuthorizedCustomerContext(undefined, "view")
        let queryBuilder = customerAccess.admin
            .from("customers")
            .select("id, name, email, phone, created_at")
            .eq("partner_id", customerAccess.partnerId)
            .limit(10)

        if (query && query.trim().length >= 2) {
            const searchTerm = `%${query}%`
            queryBuilder = queryBuilder.or(`name.ilike.${searchTerm},email.ilike.${searchTerm}`)
        } else {
            queryBuilder = queryBuilder.order('created_at', { ascending: false })
        }

        const { data, error } = await queryBuilder

        if (error) {
            console.error("[searchCustomersForQuote] Error:", error)
            return []
        }

        return data || []
    } catch (err) {
        console.error("[searchCustomersForQuote] Error:", err)
        return []
    }
}
// ─── SEARCH PRODUCTS WITH VARIANTS ────────────────────────────────────────────────

export async function searchProductsForQuotes(query: string) {
    if (!query || query.trim().length < 2) return []

    await requireRateLimit(RateLimitCategory.API_GENERAL)

    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        const supabase = await getSupabaseServerClient()
        const searchTerm = `%${query}%`

        const { data, error } = await supabase
            .from("products")
            .select(`
      id, name, sku, price, stock_available, allow_sell_without_stock, images, unit,
      variants:product_variants(id, variant_name, sku, price_adjustment, stock_available)
            `)
            .eq("partner_id", ctx.partnerId)
            .eq("is_active", true)
            .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm}`)
            .limit(10)

        if (error) {
            console.error("Error searching products for quotes:", error)
            return []
        }

        return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku || 'N/A',
            stock: p.stock_available || 0,
            allow_sell_without_stock: Boolean(p.allow_sell_without_stock),
            price: p.price || 0,
            unit: p.unit || 'un',
            image: p.images && p.images.length > 0 ? p.images[0] : 'https://img.dudit.com.br/static/Placeholder.png',
            variants: p.variants ? p.variants.map((v: any) => ({
                id: v.id,
                name: v.variant_name,
                sku: v.sku || 'N/A',
                stock: v.stock_available || 0,
                price: (p.price || 0) + (v.price_adjustment || 0)
            })) : []
        }))
    } catch (err) {
        console.error("searchProductsForQuotes error:", err)
        return []
    }
}

import { getQuoteWithItemsCached } from "@/lib/data/quotes"

function quoteIsEffectivelyExpired(quote: { status: string; expiration_date: string | null }) {
    if (quote.status === "expired") return true
    if (!quote.expiration_date) return false
    const finalizedStatuses = ["approved", "rejected", "cancelled", "converted_to_order"]
    if (finalizedStatuses.includes(quote.status)) return false
    return quote.expiration_date < getTodayYmd()
}

function buildConversionOrderNotes(quoteNumber: string, quoteNotes: string | null | undefined) {
    const header = `Pedido criado a partir do orçamento ${quoteNumber}.`
    const body = (quoteNotes || "").trim()
    return body ? `${header}\n\n${body}` : header
}

// ─── CONVERT QUOTE → ERP ORDER ───────────────────────────────────────────────

export async function convertQuoteToOrderAction(data: {
    quoteId: string
    partnerId: string
    csrf_token?: string
    /** Required when quote.status is `sent` (conversion without formal approval). */
    acknowledgeUnapprovedConversion?: boolean
}) {
    return withTelemetry("convertQuoteToOrderAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const quoteAccess = await requireAuthorizedPartnerContext(data.partnerId, "quotes", "edit")
            const user = quoteAccess.user
            data.partnerId = quoteAccess.partnerId
            await requirePermission(data.partnerId, "orders", "create", user)

            const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
            const csrfValidation = await requireCSRF(data.csrf_token)
            if (!csrfValidation.valid) {
                return errorResponse(csrfValidation.error || "Token CSRF inválido")
            }

            const supabase = await getSupabaseServerClient()

            const { data: existingOrder, error: existingOrderError } = await supabase
                .from("orders")
                .select("id, order_number")
                .eq("source_quote_id", data.quoteId)
                .maybeSingle()

            if (existingOrderError) {
                console.error("[convertQuoteToOrderAction] existing order lookup:", existingOrderError)
                return errorResponse(existingOrderError.message)
            }

            if (existingOrder?.id) {
                await supabase
                    .from("quotes")
                    .update({
                        converted: true,
                        converted_at: new Date().toISOString(),
                        converted_order_id: existingOrder.id,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", data.quoteId)
                    .eq("partner_id", data.partnerId)
                    .eq("converted", false)

                await revalidateQuotes(data.partnerId, data.quoteId)
                await revalidateOrders(data.partnerId)
                return successResponse({
                    orderId: existingOrder.id,
                    orderNumber: existingOrder.order_number,
                    alreadyConverted: true,
                })
            }

            const { data: quote, error: quoteError } = await getAdminClient()
                .from("quotes")
                .select(`
                    id,
                    partner_id,
                    store_id,
                    customer_id,
                    status,
                    expiration_date,
                    converted,
                    converted_order_id,
                    quote_number,
                    notes,
                    subtotal,
                    discount_type,
                    discount_value,
                    shipping_cost,
                    additional_costs,
                    total,
                    customers ( id, name, email, phone, image_url, addresses(*) )
                `)
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .single()

            if (quoteError || !quote) {
                return errorResponse("Orçamento não encontrado")
            }

            if (quote.converted && quote.converted_order_id) {
                const { data: existingConvertedOrder } = await supabase
                    .from("orders")
                    .select("order_number")
                    .eq("id", quote.converted_order_id)
                    .maybeSingle()

                await revalidateQuotes(data.partnerId, data.quoteId)
                await revalidateOrders(data.partnerId)
                return successResponse({
                    orderId: quote.converted_order_id,
                    orderNumber: existingConvertedOrder?.order_number ?? null,
                    alreadyConverted: true,
                })
            }

            if (quote.converted) {
                return errorResponse("Este orçamento já foi convertido em pedido.")
            }

            if (quote.status === "draft" || quote.status === "rejected") {
                return errorResponse("Não é possível converter um orçamento em rascunho ou rejeitado.")
            }

            if (quote.status === "cancelled") {
                return errorResponse("Não é possível converter um orçamento cancelado.")
            }

            if (quoteIsEffectivelyExpired(quote)) {
                return errorResponse("Não é possível converter um orçamento expirado.")
            }

            const allowedStatuses = ["sent", "pending_client", "viewed", "approved"]
            if (!allowedStatuses.includes(quote.status)) {
                return errorResponse("Só é possível converter orçamentos com status Enviado, Pendente do Cliente, Visualizado ou Aprovado.")
            }

            const isUnapproved = quote.status === "sent" || quote.status === "pending_client" || quote.status === "viewed"
            if (isUnapproved && !data.acknowledgeUnapprovedConversion) {
                return errorResponse(
                    "Para converter um orçamento enviado sem aprovação formal, confirme a ação no diálogo.",
                )
            }

            const { data: rawItems, error: itemsError } = await supabase
                .from("quote_items")
                .select(`
                    product_id,
                    custom_name,
                    quantity,
                    unit_price,
                    sort_order,
                    product_name_snapshot,
                    product_sku_snapshot,
                    products (
                        id,
                        name,
                        sku,
                        is_active,
                        stock_available,
                        allow_sell_without_stock,
                        product_variants (
                            id,
                            variant_name,
                            sku,
                            price_adjustment,
                            stock_available
                        )
                    )
                `)
                .eq("quote_id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .order("sort_order", { ascending: true })

            if (itemsError) {
                console.error("[convertQuoteToOrderAction] items:", itemsError)
                return errorResponse(itemsError.message)
            }

            const quoteItems = rawItems || []
            if (quoteItems.length === 0) {
                return errorResponse("Este orçamento não possui itens para gerar um pedido.")
            }

            const findMatchedVariant = (row: any, prod: any) => {
                const variants: any[] = prod?.product_variants || []
                if (!variants || variants.length === 0) return null

                const customNameRaw = (row.custom_name && String(row.custom_name).trim()) || ""
                const prodNameRaw = (prod?.name && String(prod.name).trim()) || ""
                const suffix = (prodNameRaw && customNameRaw.startsWith(prodNameRaw))
                    ? customNameRaw.slice(prodNameRaw.length).replace(/^[\s-–-]+/, "").trim()
                    : customNameRaw

                return variants.find(
                    (v: any) =>
                        (v.variant_name && suffix && v.variant_name.toLowerCase().trim() === suffix.toLowerCase()) ||
                        (v.variant_name && customNameRaw && v.variant_name.toLowerCase().trim() === customNameRaw.toLowerCase()) ||
                        (row.product_sku_snapshot && v.sku && v.sku.toLowerCase().trim() === row.product_sku_snapshot.toLowerCase().trim())
                ) || null
            }

            // Perform stock, variant availability, active status, and deleted products checks
            let calculatedSubtotal = 0
            for (const row of quoteItems) {
                calculatedSubtotal += Number(row.quantity || 0) * Number(row.unit_price || 0)

                if (row.product_id) {
                    const prod: any = Array.isArray(row.products) ? row.products[0] : row.products
                    if (!prod) {
                        return errorResponse(`O produto do item "${row.custom_name || 'Item'}" foi removido do sistema.`)
                    }
                    if (prod.is_active === false) {
                        return errorResponse(`O produto "${prod.name}" está inativo. Não é possível converter o orçamento.`)
                    }
                    if (prod.allow_sell_without_stock === false) {
                        const matchedVariant = findMatchedVariant(row, prod)
                        const availableStock = matchedVariant ? Number(matchedVariant.stock_available ?? 0) : Number(prod.stock_available ?? 0)
                        const displayName = matchedVariant ? `${prod.name} - ${matchedVariant.variant_name}` : prod.name

                        if (Number(row.quantity || 0) > availableStock) {
                            return errorResponse(`A quantidade do item "${displayName}" (${row.quantity}) é maior do que o estoque disponível (${availableStock}).`)
                        }
                    }
                }
            }

            // Pricing integrity check
            let discountAmount = 0
            if (quote.discount_type === "percentage") {
                discountAmount = Number((calculatedSubtotal * Number(quote.discount_value || 0) / 100).toFixed(2))
            } else {
                discountAmount = Number(quote.discount_value || 0)
            }
            if (discountAmount > calculatedSubtotal) {
                discountAmount = calculatedSubtotal
            }
            const calculatedTotal = Math.max(0, calculatedSubtotal - discountAmount + Number(quote.shipping_cost || 0) + Number(quote.additional_costs || 0))

            if (Math.abs(calculatedTotal - Number(quote.total || 0)) > 0.05) {
                return errorResponse(`Falha na integridade de preços: o total calculado (${calculatedTotal}) não coincide com o total do orçamento (${quote.total}).`)
            }

            const erpItems = quoteItems.map((row: any, idx: number) => {
                const prod = Array.isArray(row.products) ? row.products[0] : row.products
                const matchedVariant = findMatchedVariant(row, prod)

                const customNameRaw = (row.custom_name && String(row.custom_name).trim()) || ""
                const snapshotNameRaw = (row.product_name_snapshot && String(row.product_name_snapshot).trim()) || ""
                const prodNameRaw = (prod?.name && String(prod.name).trim()) || ""

                let resolvedDisplayName = customNameRaw || snapshotNameRaw || prodNameRaw || "Item"
                if (matchedVariant && prodNameRaw && !resolvedDisplayName.toLowerCase().includes(matchedVariant.variant_name.toLowerCase())) {
                    resolvedDisplayName = `${prodNameRaw} - ${matchedVariant.variant_name}`
                }

                return {
                    productId: row.product_id || null,
                    variantId: matchedVariant?.id || null,
                    customName: resolvedDisplayName,
                    quantity: Number(row.quantity || 0),
                    unitPrice: Number(row.unit_price || 0),
                    sortOrder: Number(row.sort_order ?? idx),
                }
            })

            const customer = Array.isArray(quote.customers) ? quote.customers[0] : quote.customers
            const defaultFinanceAccountId = await resolveMarketplaceOrderFinanceAccountId(
                getAdminClient(),
                data.partnerId,
                false,
            )
            if (!defaultFinanceAccountId) {
                return errorResponse(
                    "Cadastre contas financeiras (conta bancária ou caixa) para converter o orçamento em pedido.",
                )
            }
            const hasShippingCost = Number(quote.shipping_cost || 0) > 0

            const orderPayload = {
                partnerId: data.partnerId,
                storeId: quote.store_id,
                customerId: customer?.id || quote.customer_id || undefined,
                customerName: customer?.name || QUOTE_DEFAULT_CUSTOMER_LABEL,
                sourceQuoteId: data.quoteId,
                salesChannel: "Orçamento",
                deliveryMethod: hasShippingCost ? ("delivery" as const) : ("pickup" as const),
                financeAccountId: defaultFinanceAccountId,
                paymentStatus: "unpaid" as const,
                deliveryStatus: "not_sent" as const,
                paymentMethod: "Método não definido",
                paymentBreakdown: [] as { method: string; amount: number }[],
                address: undefined,
                items: erpItems,
                subtotal: Number(quote.subtotal || 0),
                discountValue: Number(quote.discount_value || 0),
                discountType: (quote.discount_type === "percentage" ? "percentage" : "fixed") as "fixed" | "percentage",
                shippingCost: Number(quote.shipping_cost || 0),
                additionalCosts: Number(quote.additional_costs || 0),
                totalAmount: Number(quote.total || 0),
                notes: (quote.notes || "").trim() || undefined,
                csrf_token: data.csrf_token,
            }

            const orderResult = await createERPOrderAction(orderPayload as any)

            if (!orderResult || !("success" in orderResult) || !orderResult.success) {
                const errMsg = orderResult && "error" in orderResult ? String(orderResult.error) : "Erro ao criar pedido"
                return errorResponse(errMsg)
            }

            const newOrderId = orderResult.orderId as string
            const withoutApproval = quote.status === "sent" || quote.status === "pending_client" || quote.status === "viewed"

            const { error: quoteUpdateError } = await supabase
                .from("quotes")
                .update({
                    converted: true,
                    converted_at: new Date().toISOString(),
                    converted_without_approval: withoutApproval,
                    converted_order_id: newOrderId,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .eq("converted", false)

            if (quoteUpdateError) {
                console.error("[convertQuoteToOrderAction] quote update:", quoteUpdateError)
                return errorResponse(
                    "O pedido foi criado, mas não foi possível atualizar o orçamento. Atualize a página ou entre em contato com o suporte.",
                )
            }

            const historyLines = [
                `converteu o orçamento em pedido (${orderResult.orderNumber || newOrderId})`,
            ]
            if (withoutApproval) {
                historyLines.push("Orçamento convertido sem aprovação formal")
            }

            await logAuditEvent({
                partnerId: data.partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: data.quoteId,
                actionType: "converted_to_order",
                changeLines: historyLines,
                source: "manual",
            })

            await logAuditEvent({
                partnerId: data.partnerId,
                actorUserId: user.id,
                entityType: "order",
                entityId: newOrderId,
                actionType: "quote_conversion",
                changeLines: [
                    `Pedido originado do orçamento ${quote.quote_number || data.quoteId}.`,
                ],
                source: "manual",
            })

            await revalidateQuotes(data.partnerId, data.quoteId)
            await revalidateOrders(data.partnerId)

            return successResponse({
                orderId: newOrderId,
                orderNumber: orderResult.orderNumber,
                alreadyConverted: false,
            })
        } catch (err: any) {
            console.error("[convertQuoteToOrderAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao converter orçamento")
        }
    })
}

// ─── QUOTE HISTORY (AUDIT) ─────────────────────────────────────────────────

export async function getQuoteHistoryAction(quoteId: string, partnerId: string) {
    try {
        const user = await requireUser()
        await requirePermission(partnerId, "quotes", "view", user)

        const entries = await getQuoteHistoryEntries(quoteId, partnerId)
        return successResponse(entries)
    } catch (err: any) {
        console.error("[getQuoteHistoryAction] Error:", err)
        return errorResponse(err.message || "Erro interno ao buscar histórico do orçamento")
    }
}

// ─── GET QUOTE DETAILS ──────────────────────────────────────────────────────

export async function getQuoteDetailsAction(quoteId: string, partnerId: string) {
    try {
        const quoteAccess = await requireAuthorizedPartnerContext(partnerId, "quotes", "view")
        partnerId = quoteAccess.partnerId

        const quoteCache = await getQuoteWithItemsCached(quoteId, partnerId)

        if (!quoteCache) {
            return errorResponse("Orçamento não encontrado")
        }

        return successResponse(quoteCache)
    } catch (err: any) {
        console.error("[getQuoteDetailsAction] Error:", err)
        return errorResponse(err.message || "Erro interno ao buscar detalhes do orçamento")
    }
}

// ─── GET PARTNER ADDRESS ───────────────────────────────────────────────────

export async function getPartnerAddressAction(partnerId: string, storeId?: string) {
    try {
        const supabase = getAdminClient()

        let addrData: any = null

        // 1. Check store_id address if storeId provided
        if (storeId) {
            const { data: sAddr } = await supabase
                .from("addresses")
                .select("*")
                .eq("store_id", storeId)
                .limit(1)
                .maybeSingle()
            if (sAddr && (sAddr.street || sAddr.city)) {
                addrData = sAddr
            }
        }

        // 2. Check default or any address for partner_id
        if (!addrData && partnerId) {
            const { data: pAddr } = await supabase
                .from("addresses")
                .select("*")
                .eq("partner_id", partnerId)
                .order("is_default", { ascending: false })
                .limit(1)
                .maybeSingle()
            if (pAddr && (pAddr.street || pAddr.city)) {
                addrData = pAddr
            }
        }

        // 3. Check any store address for partner_id
        if (!addrData && partnerId) {
            const { data: partnerStores } = await supabase
                .from("stores")
                .select("id")
                .eq("partner_id", partnerId)
            const sIds = (partnerStores as any[] || []).map((s: any) => s.id)
            if (sIds.length > 0) {
                const { data: fallbackStoreAddr } = await supabase
                    .from("addresses")
                    .select("*")
                    .in("store_id", sIds)
                    .limit(1)
                    .maybeSingle()
                if (fallbackStoreAddr && (fallbackStoreAddr.street || fallbackStoreAddr.city)) {
                    addrData = fallbackStoreAddr
                }
            }
        }

        if (!addrData) return successResponse(null)

        const streetNumber = [addrData.street, addrData.number].filter(Boolean).join(", ")
        const neighborhoodCityState = [addrData.neighborhood, [addrData.city, addrData.state].filter(Boolean).join("/")].filter(Boolean).join(" - ")
        const formattedAddress = [streetNumber, neighborhoodCityState].filter(Boolean).join("\n")

        return successResponse({
            ...addrData,
            formatted: formattedAddress
        })
    } catch (err: any) {
        console.error("[getPartnerAddressAction] Error:", err)
        return errorResponse("Erro interno ao buscar endereço")
    }
}

// ─── BATCH DELETE QUOTES ────────────────────────────────────────────────────
export async function batchDeleteQuotesAction(quoteIds: string[]) {
    return withTelemetry("batchDeleteQuotesAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const ctx = await getCurrentPartnerContext()
            if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

            const user = await requireUser()
            await requirePermission(ctx.partnerId, "quotes", "delete", user)

            const supabase = await getSupabaseServerClient()

            const { error } = await supabase
                .from("quotes")
                .delete()
                .in("id", quoteIds)
                .eq("partner_id", ctx.partnerId)

            if (error) {
                console.error("[batchDeleteQuotesAction] Error:", error)
                return errorResponse(error.message)
            }

            await revalidateQuotes(ctx.partnerId)

            // Update usage counter (estimate)
            for (let i = 0; i < quoteIds.length; i++) {
                await decrement_usage_counter(ctx.partnerId, "quotes_month_count")
            }

            return successResponse({ count: quoteIds.length })
        } catch (err: any) {
            console.error("[batchDeleteQuotesAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao deletar orçamentos")
        }
    });
}

// ─── BATCH UPDATE QUOTE STATUS ──────────────────────────────────────────────
export async function batchUpdateQuotesStatusAction(quoteIds: string[], status: "draft" | "sent" | "approved" | "rejected" | "expired" | "cancelled") {
    return withTelemetry("batchUpdateQuotesStatusAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const ctx = await getCurrentPartnerContext()
            if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

            const user = await requireUser()
            await requirePermission(ctx.partnerId, "quotes", "edit", user)

            const supabase = await getSupabaseServerClient()

            const { data: convertedRows, error: convertedError } = await supabase
                .from("quotes")
                .select("id")
                .in("id", quoteIds)
                .eq("partner_id", ctx.partnerId)
                .eq("converted", true)

            if (convertedError) {
                console.error("[batchUpdateQuotesStatusAction] converted check:", convertedError)
                return errorResponse(convertedError.message)
            }

            if (convertedRows && convertedRows.length > 0) {
                return errorResponse(
                    convertedRows.length === 1
                        ? "Um orçamento selecionado já foi convertido em pedido. Remova-o da seleção para alterar o status em massa."
                        : `${convertedRows.length} orçamentos selecionados já foram convertidos em pedido. Remova-os da seleção para alterar o status em massa.`,
                )
            }

            const { error } = await supabase
                .from("quotes")
                .update({
                    status: status,
                    updated_at: new Date().toISOString(),
                })
                .in("id", quoteIds)
                .eq("partner_id", ctx.partnerId)

            if (error) {
                console.error("[batchUpdateQuotesStatusAction] Error:", error)
                return errorResponse(error.message)
            }

            await revalidateQuotes(ctx.partnerId)
            for (const id of quoteIds) {
                await revalidateQuotes(ctx.partnerId, id)
            }
            return successResponse({ count: quoteIds.length, status })
        } catch (err: any) {
            console.error("[batchUpdateQuotesStatusAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao atualizar status")
        }
    });
}

export async function getSalespeopleAction(partnerId: string): Promise<{ success: true; sellers: { id: string; name: string }[] } | { success: false; error: string }> {
    try {
        const user = await requireUser()
        await requirePermission(partnerId, "quotes", "view", user)

        const admin = getAdminClient()
        const { data: partnerUsers, error: puError } = await admin
            .from("partner_users")
            .select("user_id")
            .eq("partner_id", partnerId)

        if (puError) throw puError

        const userIds = Array.from(new Set((partnerUsers || []).map((row: any) => row.user_id).filter(Boolean)))
        if (userIds.length === 0) return { success: true, sellers: [] }

        const { data: profiles, error: pError } = await admin
            .from("user_profiles")
            .select("user_id, full_name")
            .in("user_id", userIds)

        if (pError) throw pError

        const sellers = (profiles || []).map((p: any) => ({
            id: String(p.user_id),
            name: String(p.full_name || "Vendedor")
        })).sort((a: any, b: any) => a.name.localeCompare(b.name))

        return { success: true, sellers }
    } catch (err: any) {
        console.error("[getSalespeopleAction] Error:", err)
        return { success: false, error: err.message || "Erro ao carregar vendedores" }
    }
}

// ─── PUBLIC QUOTE ACTIONS ───────────────────────────────────────────────────

export async function regenerateQuoteApprovalCodeAction(quoteId: string, partnerId: string) {
    return withTelemetry("regenerateQuoteApprovalCodeAction", async () => {
        try {
            const user = await requireUser()
            await requirePermission(partnerId, "quotes", "edit", user)

            const supabase = await getSupabaseServerClient()

            // 1. Check quote status is not finalized
            const { data: quote, error: quoteErr } = await supabase
                .from("quotes")
                .select("status, converted, metadata")
                .eq("id", quoteId)
                .eq("partner_id", partnerId)
                .single()

            if (quoteErr || !quote) {
                return errorResponse("Orçamento não encontrado")
            }

            if (quote.converted || quote.status === "approved" || quote.status === "rejected" || quote.status === "converted_to_order") {
                return errorResponse("Não é possível alterar o código de um orçamento aprovado, rejeitado ou convertido.")
            }

            // 2. Generate new code and salt with cryptographically secure random
            const crypto = await import("crypto")
            const plainCode = crypto.randomInt(1000, 10000).toString() // 4-digit code
            const salt = crypto.randomBytes(16).toString("hex")

            const { data: hashData, error: hashErr } = await supabase
                .rpc("compute_approval_hash", { salt: salt, code: plainCode })

            if (hashErr || !hashData) {
                console.error("[regenerateQuoteApprovalCodeAction] hash computation error:", hashErr)
                return errorResponse("Erro ao gerar hash do código de aprovação.")
            }

            const hash = hashData as string

            // Clean any legacy plain_code from metadata
            const cleanMetadata = { ...(quote.metadata || {}) }
            delete cleanMetadata.plain_code

            // 3. Update quote without persisting plain_code
            const { error: updateErr } = await supabase
                .from("quotes")
                .update({
                    approval_code_salt: salt,
                    approval_code_hash: hash,
                    failed_attempts: 0,
                    lockout_until: null,
                    lockout_count: 0,
                    metadata: cleanMetadata,
                })
                .eq("id", quoteId)
                .eq("partner_id", partnerId)

            if (updateErr) {
                console.error("[regenerateQuoteApprovalCodeAction] update error:", updateErr)
                return errorResponse("Erro ao salvar novo código.")
            }

            // Revalidate
            await revalidateQuotes(partnerId, quoteId)

            // Log audit
            await logAuditEvent({
                partnerId,
                actorUserId: user.id,
                entityType: "quote",
                entityId: quoteId,
                actionType: "quote_code_regenerated",
                changeLines: ["Regenerou o código de aprovação do orçamento comercial."],
                source: "manual",
            })

            return successResponse({ code: plainCode })
        } catch (err: any) {
            console.error("[regenerateQuoteApprovalCodeAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao regenerar código")
        }
    })
}

export async function getPublicQuoteAction(publicToken: string, ip?: string, userAgent?: string) {
    return withTelemetry("getPublicQuoteAction", async () => {
        try {
            await requireRateLimit(RateLimitCategory.ERP_GENERAL)
            const cleanToken = String(publicToken || "").trim()
            if (!cleanToken || cleanToken.length < 6) {
                return errorResponse("Link inválido ou orçamento não encontrado")
            }

            const admin = getAdminClient()

            // 1. Fetch quote strictly by public_token
            const { data: quote, error: quoteErr } = await admin
                .from("quotes")
                .select(`
                    *,
                    customers (
                        id, name, email, phone,
                        addresses (*)
                    ),
                    stores!left (
                        id, name, logo_url, phone
                    ),
                    partners (
                        id, user_id
                    )
                `)
                .eq("public_token", cleanToken)
                .maybeSingle()

            if (quoteErr || !quote) {
                return errorResponse("Link inválido ou orçamento não encontrado")
            }

            const now = new Date()

            // 2. Check lazy expiration (never expire finalized quotes)
            const finalizedStatuses = ["approved", "rejected", "expired", "cancelled", "converted_to_order"]
            if (
                quote.expiration_date &&
                endOfDay(quote.expiration_date) < now &&
                !finalizedStatuses.includes(quote.status)
            ) {
                // Transition to expired
                const { error: expireErr } = await admin
                    .from("quotes")
                    .update({
                        status: "expired",
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", quote.id)

                if (!expireErr) {
                    quote.status = "expired"
                    await notifyQuoteEvent({
                        event: "expired",
                        quote: quote,
                        ipAddress: ip,
                        userAgent: userAgent
                    })
                    try {
                        await revalidateQuotes(quote.partner_id, quote.id)
                    } catch (revalErr) {
                        console.warn("[getPublicQuoteAction] Warning revalidating expired quote:", revalErr)
                    }
                }
            }

            // 3. Debounced view updates
            let statusChangedToViewed = false
            if (quote.status === "draft" || quote.status === "sent" || quote.status === "pending_client") {
                const { error: viewStatusErr } = await admin
                    .from("quotes")
                    .update({
                        status: "viewed",
                        first_viewed_at: quote.first_viewed_at || new Date().toISOString(),
                        last_viewed_at: new Date().toISOString(),
                        total_views: (quote.total_views || 0) + 1,
                        viewer_ip: ip || quote.viewer_ip,
                        user_agent: userAgent || quote.user_agent,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", quote.id)

                if (!viewStatusErr) {
                    quote.status = "viewed"
                    quote.total_views = (quote.total_views || 0) + 1
                    quote.last_viewed_at = new Date().toISOString()
                    quote.first_viewed_at = quote.first_viewed_at || new Date().toISOString()
                    statusChangedToViewed = true
                }
            } else {
                // If it is already viewed or another status, check view debounce of 5 minutes
                const lastViewed = quote.last_viewed_at ? new Date(quote.last_viewed_at) : null
                const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

                if (!lastViewed || lastViewed < fiveMinutesAgo) {
                    await admin
                        .from("quotes")
                        .update({
                            last_viewed_at: new Date().toISOString(),
                            total_views: (quote.total_views || 0) + 1,
                            viewer_ip: ip || quote.viewer_ip,
                            user_agent: userAgent || quote.user_agent,
                            updated_at: new Date().toISOString()
                        })
                        .eq("id", quote.id)

                    quote.total_views = (quote.total_views || 0) + 1
                    quote.last_viewed_at = new Date().toISOString()
                }
            }

            // If status changed to viewed, notify seller
            if (statusChangedToViewed) {
                await notifyQuoteEvent({
                    event: "viewed",
                    quote: quote,
                    ipAddress: ip,
                    userAgent: userAgent
                })
                try {
                    await revalidateQuotes(quote.partner_id, quote.id)
                } catch (revalErr) {
                    console.warn("[getPublicQuoteAction] Warning revalidating viewed quote:", revalErr)
                }
            }

            // 5. Fetch live details and items
            let sellerInfo = null
            let items: any[] = []
            let sellerName = null

            if (quote.user_id) {
                const { data: profile } = await admin
                    .from("user_profiles")
                    .select("full_name")
                    .eq("user_id", quote.user_id)
                    .maybeSingle()
                if (profile) {
                    const { data: authData } = await admin.auth.admin.getUserById(quote.user_id)
                    const authUser = authData?.user ? { email: authData.user.email } : null
                    sellerInfo = {
                        name: profile.full_name,
                        email: authUser?.email || null
                    }
                    sellerName = profile.full_name
                }
            }

            const { data: quoteItems } = await admin
                .from("quote_items")
                .select(`
                    *,
                    products(
                        name,
                        sku,
                        images,
                        unit,
                        product_variants(
                            id,
                            variant_name,
                            sku,
                            variant_options
                        )
                    )
                `)
                .eq("quote_id", quote.id)
                .order("sort_order", { ascending: true })
            items = quoteItems || []

            const formattedItems = items.map((item: any) => {
                let resolvedImage = item.products?.images && item.products.images.length > 0 ? item.products.images[0] : "https://img.dudit.com.br/static/Placeholder.png";
                if (item.custom_name && item.products?.product_variants) {
                    const customName = item.custom_name.trim();
                    const productName = item.products.name || "";
                    const suffix = customName.startsWith(productName)
                        ? customName.slice(productName.length).replace(/^[\s-–-]+/, "").trim()
                        : customName;

                    const match = item.products.product_variants.find(
                        (v: any) =>
                            v.variant_name?.toLowerCase().trim() === suffix.toLowerCase() ||
                            v.variant_name?.toLowerCase().trim() === customName.toLowerCase() ||
                            (item.product_sku_snapshot && v.sku?.toLowerCase().trim() === item.product_sku_snapshot.toLowerCase().trim())
                    );
                    if (match?.variant_options?.image) {
                        resolvedImage = match.variant_options.image;
                    }
                }

                return {
                    id: item.id,
                    product_id: item.product_id,
                    name: item.custom_name || item.product_name_snapshot || item.products?.name || "Produto sem nome",
                    sku: item.product_sku_snapshot || item.products?.sku || "",
                    quantity: Number(item.quantity || 0),
                    unit_price: Number(item.unit_price || 0),
                    total_price: Number(item.unit_price || 0) * Number(item.quantity || 0),
                    description: item.description || "",
                    image: resolvedImage,
                    unit: item.products?.unit || "un"
                };
            })

            // 6. Fetch store, partner and address details with full fallbacks
            let store = quote.stores ? (Array.isArray(quote.stores) ? quote.stores[0] : quote.stores) : null
            if (!store) {
                const storeQuery = quote.store_id
                    ? admin.from("stores").select("id, name, logo_url, phone").eq("id", quote.store_id).maybeSingle()
                    : admin.from("stores").select("id, name, logo_url, phone").eq("partner_id", quote.partner_id).order("is_headquarters", { ascending: false }).limit(1).maybeSingle()
                const { data: storeFallback } = await storeQuery
                store = storeFallback
            }

            const addressRes = await getPartnerAddressAction(quote.partner_id, quote.store_id || store?.id || undefined)

            const partnerAddressFormatted = (addressRes.success && addressRes.data?.formatted) || "Endereço não cadastrado"
            const resolvedPartnerName = store?.name || "Parceiro"
            const resolvedPartnerLogo = store?.logo_url || null
            const resolvedPartnerPhone = store?.phone || null

            const partnerRow = Array.isArray(quote.partners) ? quote.partners[0] : quote.partners
            let partnerEmail = null
            const partnerOwnerId = partnerRow?.user_id
            if (partnerOwnerId) {
                try {
                    const { data: authData } = await admin.auth.admin.getUserById(partnerOwnerId)
                    partnerEmail = authData?.user?.email || null
                } catch (err) {
                    console.error("Error fetching partner email:", err)
                }
            }

            const { getPartnerPlan } = await import("@/lib/services/subscription.service")
            const plan = await getPartnerPlan(quote.partner_id).catch(() => null)
            const planTier = plan?.slug || "free"

            const liveSnapshot = {
                quote_number: quote.quote_number,
                issue_date: quote.issue_date,
                expiration_date: quote.expiration_date,
                notes: quote.notes,
                subtotal: Number(quote.subtotal || 0),
                discount_type: quote.discount_type,
                discount_value: Number(quote.discount_value || 0),
                shipping_cost: Number(quote.shipping_cost || 0),
                additional_costs: Number(quote.additional_costs || 0),
                total: Number(quote.total || 0),
                partner: {
                    name: resolvedPartnerName,
                    image_url: resolvedPartnerLogo,
                    email: partnerEmail,
                    phone: resolvedPartnerPhone,
                    address: partnerAddressFormatted
                },
                seller: sellerInfo,
                customer: quote.customers ? {
                    id: quote.customers.id,
                    name: quote.customers.name,
                    email: quote.customers.email ? `${quote.customers.email.split('@')[0].slice(0, 2)}***@${quote.customers.email.split('@')[1] || 'email.com'}` : null,
                    phone: quote.customers.phone ? `(***) *****-${quote.customers.phone.replace(/\D/g, '').slice(-4)}` : null,
                    addresses: (quote.customers.addresses || []).map((a: any) => ({
                        id: a.id,
                        street: a.street,
                        neighborhood: a.neighborhood,
                        city: a.city,
                        state: a.state,
                        zip_code: a.zip_code ? `${a.zip_code.slice(0, 5)}-***` : null,
                        number: "***",
                        complement: "***",
                    }))
                } : null,
                items: formattedItems,
                payment_terms: quote.metadata?.payment_terms || null,
                coupon_data: quote.metadata?.coupon_data || null,
                metadata: quote.metadata || {}
            }

            let resolvedSnapshot = (quote.converted && quote.snapshot) ? quote.snapshot : liveSnapshot
            if (!sellerName && resolvedSnapshot?.seller?.name) {
                sellerName = resolvedSnapshot.seller.name
            }
            if (resolvedSnapshot && resolvedSnapshot.partner) {
                if (!resolvedSnapshot.partner.name || resolvedSnapshot.partner.name === "Parceiro") {
                    resolvedSnapshot.partner.name = resolvedPartnerName
                }
                if (!resolvedSnapshot.partner.image_url) {
                    resolvedSnapshot.partner.image_url = resolvedPartnerLogo
                }
                if (!resolvedSnapshot.partner.phone) {
                    resolvedSnapshot.partner.phone = resolvedPartnerPhone
                }
                if (!resolvedSnapshot.partner.address || resolvedSnapshot.partner.address === "Endereço não cadastrado" || resolvedSnapshot.partner.address === "Endereço comercial não disponível") {
                    resolvedSnapshot.partner.address = partnerAddressFormatted
                }
                if (!resolvedSnapshot.partner.email) {
                    resolvedSnapshot.partner.email = partnerEmail
                }
            }

            const previewMeta = quote.metadata?.preview || {}

            const currentUser = await getCurrentUser().catch(() => null)
            let canDirectApprove = false
            if (currentUser) {
                const { data: partnerUser } = await admin
                    .from("partner_users")
                    .select("role")
                    .eq("partner_id", quote.partner_id)
                    .eq("user_id", currentUser.id)
                    .maybeSingle()

                const { data: partnerOwner } = await admin
                    .from("partners")
                    .select("id")
                    .eq("id", quote.partner_id)
                    .eq("user_id", currentUser.id)
                    .maybeSingle()

                if (partnerOwner || partnerUser) {
                    canDirectApprove = true
                } else if (quote.customers?.email && currentUser.email && currentUser.email.toLowerCase() === quote.customers.email.toLowerCase()) {
                    canDirectApprove = true
                }
            }

            return successResponse({
                quote: {
                    id: quote.id,
                    quote_number: quote.quote_number,
                    status: quote.status,
                    issue_date: quote.issue_date,
                    expiration_date: quote.expiration_date,
                    notes: quote.notes,
                    subtotal: quote.subtotal,
                    discount_type: quote.discount_type,
                    discount_value: quote.discount_value,
                    shipping_cost: quote.shipping_cost,
                    additional_costs: quote.additional_costs,
                    total: quote.total,
                    public_token: quote.public_token,
                    converted: quote.converted,
                    converted_order_id: quote.converted_order_id,
                    approved_at: quote.approved_at,
                    rejected_at: quote.rejected_at,
                    approver_name: quote.approver_name,
                    rejection_reason: quote.rejection_reason,
                    lockout_until: quote.lockout_until,
                    partner_id: quote.partner_id,
                    can_direct_approve: canDirectApprove,
                    customers: quote.customers || null,
                    partners: {
                        id: quote.partner_id,
                        name: resolvedPartnerName,
                        store_name: resolvedPartnerName,
                        logo_url: resolvedPartnerLogo,
                        store_image_url: resolvedPartnerLogo,
                        phone: resolvedPartnerPhone,
                        address: partnerAddressFormatted,
                        plan_tier: planTier,
                    },
                    items: formattedItems,
                    metadata: quote.metadata || {},
                    primary_color: previewMeta.primaryColor || null,
                    secondary_color: previewMeta.secondaryColor || null,
                    quote_title: previewMeta.quoteTitle || null,
                    quote_subtitle: previewMeta.quoteSubtitle || null,
                    seller_name: sellerName,
                },
                snapshot: resolvedSnapshot
            })
        } catch (err: any) {
            console.error("[getPublicQuoteAction] Error:", err)
            return errorResponse("Erro ao carregar orçamento público")
        }
    })
}

export async function approvePublicQuoteAction(
    publicToken: string,
    approverName: string,
    approvalCode: string,
    ip?: string,
    userAgent?: string
) {
    return withTelemetry("approvePublicQuoteAction", async () => {
        try {
            await requireRateLimit(RateLimitCategory.ERP_GENERAL)
            const cleanToken = String(publicToken || "").trim()
            if (!cleanToken || cleanToken.length < 6) {
                return errorResponse("Link ou código de aprovação inválido")
            }

            const admin = getAdminClient()

            // 1. Fetch quote by public_token using admin client to bypass RLS (matches OS flow)
            const { data: quote, error: quoteErr } = await admin
                .from("quotes")
                .select("id, partner_id, status, quote_number, expiration_date, customers(email, name)")
                .eq("public_token", cleanToken)
                .maybeSingle()

            if (quoteErr || !quote) {
                return errorResponse("Link ou código de aprovação inválido")
            }

            // Ensure draft quotes accessed via public link are treated as viewed
            if (quote.status === "draft") {
                await admin
                    .from("quotes")
                    .update({
                        status: "viewed",
                        first_viewed_at: new Date().toISOString(),
                        last_viewed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", quote.id)
                quote.status = "viewed"
            }

            // 2. Determine auth method and check permission
            const currentUser = await getCurrentUser().catch(() => null)
            const customerEmail = (quote as any).customers?.email || null

            let isAuthorized = false
            let method = "code"
            let approverDisplayName = approverName?.trim() || "Cliente"

            if (currentUser) {
                const { data: partnerUser } = await admin
                    .from("partner_users")
                    .select("role")
                    .eq("partner_id", quote.partner_id)
                    .eq("user_id", currentUser.id)
                    .maybeSingle()

                const { data: partnerOwner } = await admin
                    .from("partners")
                    .select("id")
                    .eq("id", quote.partner_id)
                    .eq("user_id", currentUser.id)
                    .maybeSingle()

                const isErpMember = Boolean(partnerOwner || partnerUser)

                if (isErpMember) {
                    isAuthorized = true
                    method = "erp_portal"
                    const { data: profile } = await admin
                        .from("user_profiles")
                        .select("full_name")
                        .eq("user_id", currentUser.id)
                        .maybeSingle()
                    approverDisplayName = profile?.full_name?.trim() || currentUser.email?.split("@")[0] || "Lojista"
                } else if (customerEmail && currentUser.email && currentUser.email.toLowerCase() === customerEmail.toLowerCase()) {
                    isAuthorized = true
                    method = "auth"
                    approverDisplayName = (quote as any).customers?.name || currentUser.email?.split("@")[0] || "Cliente"
                }
            }

            if (!isAuthorized) {
                if (!approvalCode || !approvalCode.trim()) {
                    return errorResponse("Código de aprovação é obrigatório.")
                }
                method = "code"
                approverDisplayName = approverName?.trim() || "Cliente"
            }

            // 3. Call RPC to approve public quote
            const { data: rpcRes, error: rpcErr } = await admin.rpc("approve_public_quote", {
                p_quote_id: quote.id,
                p_name: approverDisplayName,
                p_code: method === "code" ? approvalCode.trim() : "",
                p_ip: ip || null,
                p_ua: userAgent || null,
                p_method: method
            })

            if (rpcErr) {
                console.error("[approvePublicQuoteAction] RPC Error:", rpcErr)
                return errorResponse(rpcErr.message || "Erro ao processar aprovação.")
            }

            const result = rpcRes as { success: boolean; error?: string }

            if (!result.success) {
                return errorResponse(result.error || "Link ou código de aprovação inválido")
            }

            // 4. Fetch updated quote with customer info to notify
            const { data: updatedQuote } = await admin
                .from("quotes")
                .select("*, customers(id, name, email)")
                .eq("id", quote.id)
                .single()

            // 5. Send notification and audit log
            await notifyQuoteEvent({
                event: "approved",
                quote: updatedQuote || quote,
                actorName: approverDisplayName,
                actorUserId: currentUser?.id || null,
                approvalMethod: method,
                ipAddress: ip,
                userAgent: userAgent
            })

            await revalidateQuotes(quote.partner_id, quote.id)

            return successResponse({ success: true })
        } catch (err: any) {
            console.error("[approvePublicQuoteAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao aprovar orçamento")
        }
    })
}

export async function rejectPublicQuoteAction(
    publicToken: string,
    rejectorName: string,
    approvalCode: string,
    reason: string,
    ip?: string,
    userAgent?: string
) {
    return withTelemetry("rejectPublicQuoteAction", async () => {
        try {
            await requireRateLimit(RateLimitCategory.ERP_GENERAL)
            const cleanToken = String(publicToken || "").trim()
            if (!cleanToken || cleanToken.length < 6) {
                return errorResponse("Link ou código de aprovação inválido")
            }

            if (!reason || !reason.trim()) {
                return errorResponse("O motivo da recusa é obrigatório.")
            }

            const admin = getAdminClient()

            // 1. Fetch quote by public_token using admin client to bypass RLS (matches OS flow)
            const { data: quote, error: quoteErr } = await admin
                .from("quotes")
                .select("id, partner_id, status, quote_number, expiration_date, customers(email, name)")
                .eq("public_token", cleanToken)
                .maybeSingle()

            if (quoteErr || !quote) {
                return errorResponse("Link ou código de aprovação inválido")
            }

            // Ensure draft quotes accessed via public link are treated as viewed
            if (quote.status === "draft") {
                await admin
                    .from("quotes")
                    .update({
                        status: "viewed",
                        first_viewed_at: new Date().toISOString(),
                        last_viewed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", quote.id)
                quote.status = "viewed"
            }

            // 2. Determine auth method and check permission
            const currentUser = await getCurrentUser().catch(() => null)
            const customerEmail = (quote as any).customers?.email || null

            let isAuthorized = false
            let method = "code"
            let rejectorDisplayName = rejectorName?.trim() || "Cliente"

            if (currentUser) {
                const { data: partnerUser } = await admin
                    .from("partner_users")
                    .select("role")
                    .eq("partner_id", quote.partner_id)
                    .eq("user_id", currentUser.id)
                    .maybeSingle()

                const { data: partnerOwner } = await admin
                    .from("partners")
                    .select("id")
                    .eq("id", quote.partner_id)
                    .eq("user_id", currentUser.id)
                    .maybeSingle()

                const isErpMember = Boolean(partnerOwner || partnerUser)

                if (isErpMember) {
                    isAuthorized = true
                    method = "erp_portal"
                    const { data: profile } = await admin
                        .from("user_profiles")
                        .select("full_name")
                        .eq("user_id", currentUser.id)
                        .maybeSingle()
                    rejectorDisplayName = profile?.full_name?.trim() || currentUser.email?.split("@")[0] || "Lojista"
                } else if (customerEmail && currentUser.email && currentUser.email.toLowerCase() === customerEmail.toLowerCase()) {
                    isAuthorized = true
                    method = "auth"
                    rejectorDisplayName = (quote as any).customers?.name || currentUser.email?.split("@")[0] || "Cliente"
                }
            }

            if (!isAuthorized) {
                if (!approvalCode || !approvalCode.trim()) {
                    return errorResponse("Código de aprovação é obrigatório.")
                }
                method = "code"
                rejectorDisplayName = rejectorName?.trim() || "Cliente"
            }

            // 3. Call RPC to reject public quote
            const { data: rpcRes, error: rpcErr } = await admin.rpc("reject_public_quote", {
                p_quote_id: quote.id,
                p_name: rejectorDisplayName,
                p_code: method === "code" ? approvalCode.trim() : "",
                p_reason: reason.trim().substring(0, 500),
                p_ip: ip || null,
                p_ua: userAgent || null,
                p_method: method
            })

            if (rpcErr) {
                console.error("[rejectPublicQuoteAction] RPC Error:", rpcErr)
                return errorResponse(rpcErr.message || "Erro ao processar recusa.")
            }

            const result = rpcRes as { success: boolean; error?: string }

            if (!result.success) {
                return errorResponse(result.error || "Link ou código de aprovação inválido")
            }

            // 4. Fetch updated quote with customer info to notify
            const { data: updatedQuote } = await admin
                .from("quotes")
                .select("*, customers(id, name, email)")
                .eq("id", quote.id)
                .single()

            // 5. Send notification and audit log
            await notifyQuoteEvent({
                event: "rejected",
                quote: updatedQuote || quote,
                actorName: rejectorDisplayName,
                actorUserId: currentUser?.id || null,
                rejectionReason: reason.trim(),
                approvalMethod: method,
                ipAddress: ip,
                userAgent: userAgent
            })

            await revalidateQuotes(quote.partner_id, quote.id)

            return successResponse({ success: true })
        } catch (err: any) {
            console.error("[rejectPublicQuoteAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao recusar orçamento")
        }
    })
}
