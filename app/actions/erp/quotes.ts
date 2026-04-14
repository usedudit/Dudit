"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { revalidateOrders } from "@/lib/utils/revalidation"
import { revalidateQuotes } from "@/lib/utils/revalidation"
import { createQuoteHistoryEntry, getQuoteHistoryEntries } from "@/lib/services/quote-history.service"
import { createOrderHistoryEntry } from "@/lib/services/order-history.service"
import { createERPOrderAction } from "@/app/actions/erp/orders"
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
    const productIds = Array.from(new Set(items.map((item) => item.productId).filter(Boolean))) as string[]
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

    const stockMap = new Map<string, { name: string; stock: number }>((products || []).map((product: any) => [
        product.id,
        {
            name: product.name || "Produto",
      stock: Number(product.stock_available || 0),
        },
    ]))

    const requestedMap = new Map<string, number>()
    for (const item of items) {
        if (!item.productId) continue
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
        return { items: null, error: "NÃ£o foi possÃ­vel validar os itens do orÃ§amento." }
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
            await requirePartnerAccessWithPermission(partnerId, "quotes", "view", user)

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

            let nextNumber = "ORC-0001"
            if (data?.quote_number) {
                const match = data.quote_number.match(/(\d+)$/)
                if (match) {
                    const currentNum = parseInt(match[0], 10)
                    nextNumber = `ORC-${(currentNum + 1).toString().padStart(4, '0')}`
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
}) {
    return withTelemetry("createQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const user = await requireUser()
            await requirePartnerAccessWithPermission(data.partnerId, "quotes", "create", user)

            const limitCheck = await checkLimit(data.partnerId, "quotes_per_month")
            if (!limitCheck.allowed) {
                return errorResponse(limitCheck.message || "Limite mensal de orçamentos atingido para este plano.")
            }

            const supabase = await getSupabaseServerClient()
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
                custom_name: item.customName || null,
                description: item.description || null,
                quantity: item.quantity,
                unit_price: item.unitPrice,
                sort_order: item.sortOrder ?? idx
            })) : null;

            // Execute Native DB Transaction
            const { data: quoteResult, error: rpcError } = await supabase.rpc('create_quote_with_items', {
                p_partner_id: data.partnerId,
                p_user_id: user.id,
                p_customer_id: data.customerId || null,
                p_status: "draft",
                p_issue_date: data.issueDate || new Date().toISOString().split("T")[0],
                p_expiration_date: data.expirationDate || null,
                p_notes: data.notes || null,
                p_internal_notes: data.internalNotes ?? null,
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

            // Sync full state to compute native triggers (subtotals)
            const { data: updatedQuote } = await supabase
                .from("quotes")
                .select("id, quote_number, total, subtotal, status")
                .eq("id", quoteResult.id)
                .single()

            const newQuoteId = updatedQuote?.id || quoteResult.id

            await revalidateQuotes(data.partnerId, newQuoteId)

            increment_usage_counter(data.partnerId, "quotes_month_count").catch(console.error)

            try {
                await createQuoteHistoryEntry({
                    quoteId: newQuoteId,
                    partnerId: data.partnerId,
                    actorUserId: user.id,
                    entryType: "created",
                    changeLines: [`criou o orçamento ${updatedQuote?.quote_number || quoteResult.quote_number || ""}`.trim()],
                })
            } catch (historyError) {
                console.error("[quotes_history] createQuoteAction:", historyError)
            }

            return successResponse({
                id: newQuoteId,
                quote_number: updatedQuote?.quote_number || quoteResult.quote_number,
                total: updatedQuote?.total || 0,
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
}) {
    return withTelemetry("updateQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const user = await requireUser()
            await requirePartnerAccessWithPermission(data.partnerId, "quotes", "edit", user)

            const supabase = await getSupabaseServerClient()
            const existingItemsResult = await getQuoteItemsForValidation(data.quoteId, data.partnerId, supabase)
            if (existingItemsResult.error || !existingItemsResult.items) {
                return errorResponse(existingItemsResult.error || "NÃ£o foi possÃ­vel validar o orÃ§amento")
            }

            const { data: currentQuote, error: currentQuoteError } = await supabase
                .from("quotes")
                .select(
                    "status, customer_id, issue_date, expiration_date, notes, internal_notes, discount_type, discount_value, shipping_cost, additional_costs, converted",
                )
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .single()

            if (currentQuoteError || !currentQuote) {
                console.error("[updateQuoteAction] Error fetching current quote:", currentQuoteError)
                return errorResponse("OrÃ§amento nÃ£o encontrado")
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
            if (data.customerId !== undefined) updatePayload.customer_id = data.customerId || null
            if (data.issueDate) updatePayload.issue_date = data.issueDate
            if (data.expirationDate !== undefined) updatePayload.expiration_date = data.expirationDate || null
            if (data.notes !== undefined) updatePayload.notes = data.notes || null
            if (data.internalNotes !== undefined) updatePayload.internal_notes = data.internalNotes || null
            if (data.discountType) updatePayload.discount_type = data.discountType
            if (data.discountValue !== undefined) updatePayload.discount_value = data.discountValue
            if (data.shippingCost !== undefined) updatePayload.shipping_cost = data.shippingCost
            if (data.additionalCosts !== undefined) updatePayload.additional_costs = data.additionalCosts

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

            if (Object.keys(updatePayload).length === 0) {
                return successResponse({ id: data.quoteId, noop: true })
            }

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

            try {
                await createQuoteHistoryEntry({
                    quoteId: data.quoteId,
                    partnerId: data.partnerId,
                    actorUserId: user.id,
                    entryType: "updated",
                    changeLines: ["atualizou os dados do orçamento"],
                })
            } catch (historyError) {
                console.error("[quotes_history] updateQuoteAction:", historyError)
            }

            return successResponse({ id: data.quoteId })
        } catch (err: any) {
            console.error("[updateQuoteAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao atualizar orçamento")
        }
    });
}

// ─── UPDATE QUOTE STATUS ────────────────────────────────────────────────────

export async function updateQuoteStatusAction(data: {
    quoteId: string
    partnerId: string
    status: "draft" | "sent" | "approved" | "rejected" | "expired" | "cancelled"
}) {
    return withTelemetry("updateQuoteStatusAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const user = await requireUser()
            await requirePartnerAccessWithPermission(data.partnerId, "quotes", "edit", user)

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
                draft: ["sent", "approved", "rejected", "cancelled"],
                sent: ["approved", "rejected", "draft", "cancelled", "expired"],
                approved: ["expired", "cancelled"],
                rejected: ["draft"],
                expired: ["draft"],
                cancelled: ["draft"],
            }

            const allowed = allowedTransitions[current.status] || []
            if (!allowed.includes(data.status)) {
                return errorResponse(
                    `Não é possível mudar de "${current.status}" para "${data.status}"`
                )
            }

            const { error } = await supabase
                .from("quotes")
                .update({
                    status: data.status,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .eq("updated_at", current.updated_at) // Optimistic lock: prevents TOCTOU race

            if (error) {
                // If updated_at changed between read and write, the row won't match and no update happens
                console.error("[updateQuoteStatusAction] Error:", error)
                return errorResponse(error.message || "O or\u00e7amento foi modificado por outro usu\u00e1rio. Atualize a p\u00e1gina.")
            }

            await revalidateQuotes(data.partnerId, data.quoteId)

            const statusLabels: Record<string, string> = {
                draft: "Rascunho",
                sent: "Enviado",
                approved: "Aprovado",
                rejected: "Rejeitado",
                expired: "Expirado",
                cancelled: "Cancelado",
            }
            try {
                await createQuoteHistoryEntry({
                    quoteId: data.quoteId,
                    partnerId: data.partnerId,
                    actorUserId: user.id,
                    entryType: "status_changed",
                    changeLines: [
                        `alterou o status de ${statusLabels[current.status] || current.status} para ${statusLabels[data.status] || data.status}`,
                    ],
                })
            } catch (historyError) {
                console.error("[quotes_history] updateQuoteStatusAction:", historyError)
            }

            return successResponse({ id: data.quoteId, status: data.status })
        } catch (err: any) {
            console.error("[updateQuoteStatusAction] Error:", err)
            return errorResponse(err.message || "Erro interno ao atualizar status")
        }
    });
}

// ─── DELETE QUOTE ───────────────────────────────────────────────────────────

export async function deleteQuoteAction(quoteId: string) {
    return withTelemetry("deleteQuoteAction", async () => {
        await requireRateLimit(RateLimitCategory.ERP_GENERAL)

        try {
            const ctx = await getCurrentPartnerContext()
            if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

            const user = await requireUser()
            await requirePartnerAccessWithPermission(ctx.partnerId, "quotes", "delete", user)

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

            // Decrement usage counter (fire-and-forget)
            decrement_usage_counter(ctx.partnerId, "quotes_month_count").catch(console.error)

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
            await requirePartnerAccessWithPermission(ctx.partnerId, "quotes", "create", user)

            const limitCheck = await checkLimit(ctx.partnerId, "quotes_per_month")
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

            increment_usage_counter(ctx.partnerId, "quotes_month_count").catch(console.error)

            try {
                await createQuoteHistoryEntry({
                    quoteId: created.id,
                    partnerId: ctx.partnerId,
                    actorUserId: user.id,
                    entryType: "duplicated",
                    changeLines: [`criou este orçamento duplicando o orçamento ${sourceLabel}`],
                })
                await createQuoteHistoryEntry({
                    quoteId,
                    partnerId: ctx.partnerId,
                    actorUserId: user.id,
                    entryType: "duplicated",
                    changeLines: [`duplicou para o novo orçamento ${created.quote_number}`],
                })
            } catch (historyError) {
                console.error("[quotes_history] duplicateQuoteAction:", historyError)
            }

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
        await requirePartnerAccessWithPermission(data.partnerId, "quotes", "edit", user)

        if (data.quantity <= 0) return errorResponse("Quantidade deve ser maior que zero")
        if (data.quantity > 999999) return errorResponse("Quantidade m\u00e1xima excedida")
        if (data.unitPrice < 0) return errorResponse("Pre\u00e7o unit\u00e1rio n\u00e3o pode ser negativo")
        if (data.unitPrice > 99999999.99) return errorResponse("Pre\u00e7o unit\u00e1rio m\u00e1ximo excedido")
        if (!data.productId && !String(data.customName || "").trim()) {
            return errorResponse("Nome do item manual Ã© obrigatÃ³rio")
        }
        if (!data.productId && data.unitPrice <= 0) {
            return errorResponse("PreÃ§o do item manual deve ser maior que zero")
        }

        const supabase = await getSupabaseServerClient()

        const itemGuard = await assertQuoteAllowsItemEdits(supabase, data.quoteId, data.partnerId)
        if (itemGuard) return errorResponse(itemGuard)

        const { data: item, error } = await supabase
            .from("quote_items")
            .insert({
                quote_id: data.quoteId,
                partner_id: data.partnerId,
                product_id: data.productId || null,
                custom_name: data.customName || null,
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
        await requirePartnerAccessWithPermission(data.partnerId, "quotes", "edit", user)

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
            return errorResponse("Item do orÃ§amento nÃ£o encontrado")
        }

        const itemGuard = await assertQuoteAllowsItemEdits(supabase, existingItem.quote_id, data.partnerId)
        if (itemGuard) return errorResponse(itemGuard)

        if (!existingItem.product_id) {
            const resolvedCustomName = data.customName !== undefined ? data.customName : existingItem.custom_name
            const resolvedUnitPrice = data.unitPrice !== undefined ? data.unitPrice : Number(existingItem.unit_price || 0)

            if (!String(resolvedCustomName || "").trim()) {
                return errorResponse("Nome do item manual Ã© obrigatÃ³rio")
            }

            if (Number(resolvedUnitPrice || 0) <= 0) {
                return errorResponse("PreÃ§o do item manual deve ser maior que zero")
            }
        }

        const updatePayload: any = {}
        if (data.customName !== undefined) updatePayload.custom_name = data.customName
        if (data.description !== undefined) updatePayload.description = data.description
        if (data.quantity !== undefined) updatePayload.quantity = data.quantity
        if (data.unitPrice !== undefined) updatePayload.unit_price = data.unitPrice
        if (data.sortOrder !== undefined) updatePayload.sort_order = data.sortOrder

        const { error } = await supabase
            .from("quote_items")
            .update(updatePayload)
            .eq("id", data.itemId)
            .eq("partner_id", data.partnerId)

        if (error) {
            console.error("[updateQuoteItemAction] Error:", error)
            return errorResponse(error.message)
        }

        await revalidateQuotes(data.partnerId)
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
        await requirePartnerAccessWithPermission(partnerId, "quotes", "edit", user)

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
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        const supabase = await getSupabaseServerClient()
        let queryBuilder = supabase
            .from("customers")
            .select("id, name, email, phone, created_at")
            .eq("partner_id", ctx.partnerId)
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
    const exp = new Date(`${quote.expiration_date}T12:00:00`)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    exp.setHours(0, 0, 0, 0)
    return exp < today && (quote.status === "draft" || quote.status === "sent")
}

function pickPrimaryCustomerAddress(addresses: any[] | undefined | null) {
    if (!addresses?.length) return null
    return addresses.find((a) => a.address_type === "primary" || a.is_default) || addresses[0]
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
            const user = await requireUser()
            await requirePartnerAccessWithPermission(data.partnerId, "quotes", "edit", user)
            await requirePartnerAccessWithPermission(data.partnerId, "orders", "create", user)

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

            const { data: quote, error: quoteError } = await supabase
                .from("quotes")
                .select(`
                    id,
                    partner_id,
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
                    customers ( id, name, addresses(*) )
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

            if (quote.status !== "sent" && quote.status !== "approved") {
                return errorResponse("Só é possível converter orçamentos com status Enviado ou Aprovado.")
            }

            if (quote.status === "sent" && !data.acknowledgeUnapprovedConversion) {
                return errorResponse(
                    "Para converter um orçamento enviado sem aprovação formal, confirme a ação no diálogo.",
                )
            }

            const { data: rawItems, error: itemsError } = await supabase
                .from("quote_items")
                .select("product_id, custom_name, quantity, unit_price, sort_order, product_name_snapshot, products(name)")
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

            const erpItems = quoteItems.map((row: any, idx: number) => ({
                productId: row.product_id || null,
                variantId: null as string | null,
                customName:
                    (row.custom_name && String(row.custom_name).trim())
                    || (row.product_name_snapshot && String(row.product_name_snapshot).trim())
                    || (row.products?.name && String(row.products.name).trim())
                    || "Item",
                quantity: Number(row.quantity || 0),
                unitPrice: Number(row.unit_price || 0),
                sortOrder: Number(row.sort_order ?? idx),
            }))

            const primaryAddress = pickPrimaryCustomerAddress(quote.customers?.addresses)
            const { data: defaultFinanceAccount } = await supabase
                .from("finance_accounts")
                .select("id")
                .eq("partner_id", data.partnerId)
                .eq("is_active", true)
                .eq("is_default", true)
                .or("integration_source.is.null,integration_source.neq.mercadopago")
                .limit(1)
                .maybeSingle()
            if (!defaultFinanceAccount?.id) {
                return errorResponse("Defina uma conta financeira padrão para converter o orçamento em pedido.")
            }
            const hasFullDeliveryAddress = Boolean(
                primaryAddress?.street
                && primaryAddress?.number
                && primaryAddress?.neighborhood
                && primaryAddress?.city
                && primaryAddress?.state
                && primaryAddress?.zip_code,
            )

            const orderPayload = {
                partnerId: data.partnerId,
                customerId: quote.customers?.id || quote.customer_id || undefined,
                customerName: quote.customers?.name || QUOTE_DEFAULT_CUSTOMER_LABEL,
                sourceQuoteId: data.quoteId,
                salesChannel: "Orçamento",
                deliveryMethod: hasFullDeliveryAddress ? ("delivery" as const) : ("pickup" as const),
                financeAccountId: defaultFinanceAccount.id,
                paymentStatus: "unpaid" as const,
                deliveryStatus: "not_sent" as const,
                paymentMethod: "pendente",
                paymentBreakdown: [] as { method: string; amount: number }[],
                address: hasFullDeliveryAddress && primaryAddress
                    ? {
                        zipCode: String(primaryAddress.zip_code || ""),
                        street: String(primaryAddress.street || ""),
                        number: String(primaryAddress.number || ""),
                        complement: primaryAddress.complement ? String(primaryAddress.complement) : undefined,
                        neighborhood: String(primaryAddress.neighborhood || ""),
                        city: String(primaryAddress.city || ""),
                        state: String(primaryAddress.state || ""),
                    }
                    : undefined,
                items: erpItems,
                subtotal: Number(quote.subtotal || 0),
                discountValue: Number(quote.discount_value || 0),
                discountType: (quote.discount_type === "percentage" ? "percentage" : "fixed") as "fixed" | "percentage",
                shippingCost: Number(quote.shipping_cost || 0),
                additionalCosts: Number(quote.additional_costs || 0),
                totalAmount: Number(quote.total || 0),
                notes: buildConversionOrderNotes(String(quote.quote_number || ""), quote.notes),
                csrf_token: data.csrf_token,
            }

            const orderResult = await createERPOrderAction(orderPayload as any)

            if (!orderResult || !("success" in orderResult) || !orderResult.success) {
                const errMsg = orderResult && "error" in orderResult ? String(orderResult.error) : "Erro ao criar pedido"
                return errorResponse(errMsg)
            }

            const newOrderId = orderResult.orderId as string
            const withoutApproval = quote.status === "sent"

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

            try {
                await createQuoteHistoryEntry({
                    quoteId: data.quoteId,
                    partnerId: data.partnerId,
                    actorUserId: user.id,
                    entryType: "converted_to_order",
                    changeLines: historyLines,
                })
            } catch (historyError) {
                console.error("[quotes_history] convertQuoteToOrderAction:", historyError)
            }

            try {
                await createOrderHistoryEntry({
                    orderId: newOrderId,
                    partnerId: data.partnerId,
                    actorUserId: user.id,
                    entryType: "quote_conversion",
                    changeLines: [
                        `Pedido originado do orçamento ${quote.quote_number || data.quoteId}.`,
                    ],
                })
            } catch (historyError) {
                console.error("[orders_history] convertQuoteToOrderAction:", historyError)
            }

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
        await requirePartnerAccessWithPermission(partnerId, "quotes", "view", user)

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
        const user = await requireUser()
        await requirePartnerAccessWithPermission(partnerId, "quotes", "view", user)

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

export async function getPartnerAddressAction(partnerId: string) {
    try {
        const supabase = await getSupabaseServerClient()

        const { data, error } = await supabase
            .from("addresses")
            .select("*")
            .eq("partner_id", partnerId)
            .eq("is_default", true)
            .maybeSingle()

        if (error) {
            console.error("[getPartnerAddressAction] Error:", error)
            return errorResponse("Erro ao buscar endereço do parceiro")
        }

        if (!data) return successResponse(null)

        const formattedAddress = `${data.street}, ${data.number}${data.complement ? ` - ${data.complement}` : ''}\n${data.neighborhood} - ${data.city}/${data.state}\nCEP: ${data.zip_code}`;

        return successResponse({
            ...data,
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
            await requirePartnerAccessWithPermission(ctx.partnerId, "quotes", "delete", user)

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
                decrement_usage_counter(ctx.partnerId, "quotes_month_count").catch(console.error).catch(() => { })
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
            await requirePartnerAccessWithPermission(ctx.partnerId, "quotes", "edit", user)

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
