"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { revalidateQuotes } from "@/lib/utils/revalidation"
import { checkLimit, increment_usage_counter, decrement_usage_counter } from "@/lib/services/subscription.service"
import { withTelemetry } from "@/lib/utils/action-logger"

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
    discountType?: "fixed" | "percentage"
    discountValue?: number
    shippingCost?: number
    additionalCosts?: number
    items?: Array<{
        productId?: string | null
        customName?: string
        description?: string
        quantity: number
        unitPrice: number
        sortOrder?: number
    }>
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
                p_status: 'draft',
                p_issue_date: data.issueDate || new Date().toISOString().split("T")[0],
                p_expiration_date: data.expirationDate || null,
                p_notes: data.notes || null,
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

            await revalidateQuotes(data.partnerId)

            increment_usage_counter(data.partnerId, "quotes_month_count").catch(console.error)

            return successResponse({
                id: updatedQuote?.id || quoteResult.id,
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

            const updatePayload: any = {}
            if (data.customerId !== undefined) updatePayload.customer_id = data.customerId || null
            if (data.issueDate) updatePayload.issue_date = data.issueDate
            if (data.expirationDate !== undefined) updatePayload.expiration_date = data.expirationDate || null
            if (data.notes !== undefined) updatePayload.notes = data.notes || null
            if (data.discountType) updatePayload.discount_type = data.discountType
            if (data.discountValue !== undefined) updatePayload.discount_value = data.discountValue
            if (data.shippingCost !== undefined) updatePayload.shipping_cost = data.shippingCost
            if (data.additionalCosts !== undefined) updatePayload.additional_costs = data.additionalCosts

            const { error } = await supabase
                .from("quotes")
                .update(updatePayload)
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)

            if (error) {
                console.error("[updateQuoteAction] Error:", error)
                return errorResponse(error.message)
            }

            await revalidateQuotes(data.partnerId)
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
    status: "draft" | "sent" | "approved" | "rejected" | "expired"
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
                .select("status, updated_at")
                .eq("id", data.quoteId)
                .eq("partner_id", data.partnerId)
                .single()

            if (fetchError || !current) {
                return errorResponse("Orçamento não encontrado")
            }

            // Define allowed transitions
            const allowedTransitions: Record<string, string[]> = {
                draft: ["sent", "approved", "rejected"],
                sent: ["approved", "rejected", "draft"],
                approved: ["expired"],
                rejected: ["draft"], // allow reopening rejected quotes as draft
                expired: ["draft"], // allow reopening expired quotes as draft
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

            await revalidateQuotes(data.partnerId)
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

            await revalidateQuotes(ctx.partnerId)

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

            await revalidateQuotes(ctx.partnerId)

            increment_usage_counter(ctx.partnerId, "quotes_month_count").catch(console.error)

            return successResponse({
                id: newQuote.id,
                quote_number: newQuote.quote_number,
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

        const supabase = await getSupabaseServerClient()

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
                : "https://img.dudit.com.br/static/mascots/Box.png",
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
                id, name, sku, price, stock_quantity, images, unit,
                variants:product_variants(id, variant_name, sku, price_adjustment, stock_quantity)
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
            stock: p.stock_quantity || 0,
            price: p.price || 0,
            unit: p.unit || 'un',
            image: p.images && p.images.length > 0 ? p.images[0] : 'https://img.dudit.com.br/static/mascots/Box.png',
            variants: p.variants ? p.variants.map((v: any) => ({
                id: v.id,
                name: v.variant_name,
                sku: v.sku || 'N/A',
                stock: v.stock_quantity || 0,
                price: (p.price || 0) + (v.price_adjustment || 0)
            })) : []
        }))
    } catch (err) {
        console.error("searchProductsForQuotes error:", err)
        return []
    }
}

import { getQuoteWithItemsCached } from "@/lib/data/quotes"

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
