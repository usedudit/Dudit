"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requirePartner } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { revalidatePath } from "next/cache"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { revalidateStockMovements } from "@/lib/utils/revalidation"

export async function searchProductsForMovement(query: string) {
    if (!query || query.trim().length < 2) return []

    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        const supabase = await getSupabaseServerClient()
        const searchTerm = `%${query}%`

        const { data, error } = await supabase
            .from("products")
            .select("id, name, sku, stock_quantity, images")
            .eq("partner_id", ctx.partnerId)
            .eq("is_active", true)
            .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm}`)
            .limit(10)

        if (error) {
            console.error("Error searching products for movement:", error)
            return []
        }

        return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku || 'N/A',
            stock: p.stock_quantity || 0,
            image: p.images && p.images.length > 0 ? p.images[0] : null
        }))
    } catch (err) {
        console.error("searchProductsForMovement error:", err)
        return []
    }
}

// Legacy single-item action — preserved for backward compat (undo, triggers)
export async function createStockMovementAction(data: {
    productId: string
    variantId?: string | null
    type: 'in' | 'out'
    quantity: number
    reason: string
    notes: string
}) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const partner = await requirePartner()
        const partnerId = partner.id
        const userId = partner.user_id

        if (!data.productId) return errorResponse("Produto inválido")
        if (data.quantity <= 0) return errorResponse("Quantidade deve ser maior que zero")
        if (!data.reason) return errorResponse("Motivo é obrigatório")

        const supabase = await getSupabaseServerClient()

        const { data: movementRecord, error } = await supabase.rpc('create_manual_stock_movement', {
            p_partner_id: partnerId,
            p_product_id: data.productId,
            p_movement_type: data.type,
            p_quantity: data.quantity,
            p_reason: data.reason,
            p_notes: data.notes,
            p_created_by: userId,
            p_variant_id: data.variantId || null
        })

        if (error) {
            console.error("createStockMovementAction RPC error:", error)
            return errorResponse(error.message)
        }

        revalidateStockMovements(partnerId)
        revalidatePath('/erp/stock-movements')
        revalidatePath('/erp/products')
        await invalidateProductCache(data.productId, partnerId, 'update', { silent: true })

        return successResponse(movementRecord)
    } catch (err: any) {
        console.error("createStockMovementAction error:", err)
        return errorResponse("Erro interno ao processar a movimentação")
    }
}

// New batch action for multi-item movements
export async function createBatchStockMovementAction(data: {
    type: 'in' | 'out'
    reason: string
    notes: string
    items: { productId: string; variantId?: string | null; quantity: number }[]
}) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const partner = await requirePartner()
        const partnerId = partner.id
        const userId = partner.user_id

        if (!data.items || data.items.length === 0) return errorResponse("Adicione pelo menos um item")
        if (!data.reason) return errorResponse("Motivo é obrigatório")

        for (const item of data.items) {
            if (!item.productId) return errorResponse("Produto inválido em um dos itens")
            if (item.quantity <= 0) return errorResponse("Quantidade deve ser maior que zero em todos os itens")
        }

        const supabase = await getSupabaseServerClient()

        if (data.type === 'out') {
            const productIds = Array.from(new Set(data.items.map((item) => item.productId)))
            const { data: products, error: productsError } = await supabase
                .from("products")
                .select("id, name, stock_quantity")
                .eq("partner_id", partnerId)
                .in("id", productIds)

            if (productsError) {
                console.error("createBatchStockMovementAction stock validation error:", productsError)
                return errorResponse("Não foi possível validar o estoque disponível")
            }

            const stockMap = new Map<string, { name: string; stock: number }>((products || []).map((product: any) => [
                product.id,
                {
                    name: product.name || "Produto",
                    stock: Number(product.stock_quantity || 0),
                },
            ]))

            const requestedMap = new Map<string, number>()
            for (const item of data.items) {
                requestedMap.set(item.productId, (requestedMap.get(item.productId) || 0) + Number(item.quantity || 0))
            }

            for (const [productId, quantity] of requestedMap.entries()) {
                const stockInfo = stockMap.get(productId)
                if (!stockInfo) {
                    return errorResponse("Um dos produtos da movimentação não foi encontrado")
                }

                if (quantity > stockInfo.stock) {
                    return errorResponse(`A quantidade de "${stockInfo.name}" está maior que o estoque disponível`)
                }
            }
        }

        const itemsPayload = data.items.map(item => ({
            product_id: item.productId,
            variant_id: item.variantId || null,
            quantity: item.quantity,
        }))

        const { data: movementRecord, error } = await supabase.rpc('create_batch_stock_movement', {
            p_partner_id: partnerId,
            p_movement_type: data.type,
            p_reason: data.reason,
            p_notes: data.notes,
            p_created_by: userId,
            p_items: itemsPayload
        })

        if (error) {
            console.error("createBatchStockMovementAction RPC error:", error)
            return errorResponse(error.message)
        }

        revalidateStockMovements(partnerId)
        revalidatePath('/erp/stock-movements')
        revalidatePath('/erp/products')

        // Invalidate cache for all products
        for (const item of data.items) {
            await invalidateProductCache(item.productId, partnerId, 'update', { silent: true })
        }

        return successResponse(movementRecord)
    } catch (err: any) {
        console.error("createBatchStockMovementAction error:", err)
        return errorResponse("Erro interno ao processar a movimentação")
    }
}

export async function getStockMovementDetails(id: string) {
    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

        const supabase = await getSupabaseServerClient()

        const { data, error } = await supabase
            .from("stock_movements")
            .select(`
                id,
                created_at,
                movement_type,
                order_id,
                reference_name,
                reference_type,
                reason,
                notes,
                created_by,
                orders(order_number)
            `)
            .eq("id", id)
            .eq("partner_id", ctx.partnerId)
            .single()

        if (error) {
            console.error("getStockMovementDetails query error:", error)
            return errorResponse("Erro ao buscar detalhes da movimentação")
        }

        if (!data) return errorResponse("Movimentação não encontrada")

        // Fetch child items from stock_movement_items
        const { data: itemsData, error: itemsError } = await supabase
            .from("stock_movement_items")
            .select(`
                id,
                product_id,
                variant_id,
                quantity,
                previous_quantity,
                new_quantity,
                products (
                    name,
                    sku,
                    images,
                    category
                )
            `)
            .eq("movement_id", id)
            .order("created_at", { ascending: true })

        if (itemsError) {
            console.error("getStockMovementDetails items query error:", itemsError)
            return errorResponse("Erro ao buscar itens da movimentaÃ§Ã£o")
        }

        // Resolve user name
        const userNamePromise = data.created_by
            ? supabase.from("user_profiles").select("full_name").eq("user_id", data.created_by).single().then((r: any) => r.data?.full_name || data.created_by)
            : Promise.resolve('Sistema')

        const userName = await userNamePromise

        let reason = data.reason || data.movement_type;
        if (!data.reason && data.order_id && data.orders?.order_number) {
            reason += ` (Pedido #${data.orders.order_number})`;
        } else if (!data.reason && data.reference_name) {
            reason = data.reference_name;
        }

        const dateObj = new Date(data.created_at);
        const dateStr = dateObj.toLocaleDateString("pt-BR", {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: 'America/Sao_Paulo'
        });
        const timeStr = dateObj.toLocaleTimeString("pt-BR", {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Sao_Paulo'
        });

        const items = (itemsData || []).map((item: any) => ({
            id: item.id,
            product: {
                name: item.products?.name || 'Produto Excluído',
                sku: item.products?.sku || 'N/A',
                image: (item.products?.images && item.products.images.length > 0) ? item.products.images[0] : null,
                category: item.products?.category || 'Sem Categoria',
                previousStock: item.previous_quantity || 0,
                currentStock: item.new_quantity || 0,
            },
            quantity: Math.abs(item.quantity),
            type: item.quantity > 0 ? 'in' : 'out',
        }))

        const movementType = data.movement_type === 'out' ? 'out' : 'in'
        const totalQuantity = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)

        return successResponse({
            id: data.id,
            displayId: data.id.split('-')[0].toUpperCase() + '-' + data.id.slice(-4).toUpperCase(),
            date: `${dateStr}, ${timeStr}`,
            items,
            items_count: items.length,
            type: movementType,
            quantity: totalQuantity,
            reason: reason,
            user: userName,
            notes: data.notes || '',
            reference: data.order_id && data.orders?.order_number
                ? `Pedido #${data.orders.order_number}`
                : data.reference_name || data.reference_type || '-',
            // Legacy single product for backward compat
            product: items[0]?.product || null,
        });

    } catch (err: any) {
        console.error("getStockMovementDetails error:", err)
        return errorResponse("Erro interno ao buscar detalhes")
    }
}

export async function deleteStockMovementAction(id: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

        const supabase = await getSupabaseServerClient()

        const { error } = await supabase
            .from("stock_movements")
            .delete()
            .eq("id", id)
            .eq("partner_id", ctx.partnerId)

        if (error) {
            console.error("deleteStockMovementAction error:", error)
            return errorResponse(error.message)
        }

        revalidateStockMovements(ctx.partnerId)
        revalidatePath('/erp/stock-movements')
        revalidatePath('/erp/products')

        return successResponse({ id })
    } catch (err: any) {
        console.error("deleteStockMovementAction error:", err)
        return errorResponse("Erro interno ao deletar movimentação")
    }
}

export async function undoStockMovementAction(id: string, customReason?: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const partner = await requirePartner()
        const partnerId = partner.id
        const userId = partner.user_id
        const supabase = await getSupabaseServerClient()

        // 1. Fetch the original movement
        const { data: original, error: fetchError } = await supabase
            .from("stock_movements")
            .select("id, movement_type")
            .eq("id", id)
            .eq("partner_id", partnerId)
            .single()

        if (fetchError || !original) {
            console.error("undoStockMovementAction fetch error:", fetchError)
            return errorResponse("Movimentação original não encontrada")
        }

        // 2. Fetch all items
        const { data: childItems } = await supabase
            .from("stock_movement_items")
            .select("product_id, variant_id, quantity")
            .eq("movement_id", id)

        if (!childItems || childItems.length === 0) {
            return errorResponse("Itens da movimentação não encontrados")
        }

        const invertedType = original.movement_type === 'in' ? 'out' : 'in'
        const reason = customReason || "Movimentação desfeita"
        const notes = `Estorno da movimentação ID: ${id.split('-')[0].toUpperCase()}`

        // Undo multi-item: create a batch reversal
        const itemsPayload = childItems.map((item: any) => ({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            quantity: Math.abs(item.quantity),
        }))

        const { data: movementRecord, error } = await supabase.rpc('create_batch_stock_movement', {
            p_partner_id: partnerId,
            p_movement_type: invertedType,
            p_reason: customReason || "Estorno",
            p_notes: notes,
            p_created_by: userId,
            p_items: itemsPayload
        })

        if (error) {
            console.error("undoStockMovementAction batch RPC error:", error)
            return errorResponse(error.message)
        }

        revalidateStockMovements(partnerId)
        revalidatePath('/erp/stock-movements')
        revalidatePath('/erp/products')

        for (const item of childItems) {
            await invalidateProductCache(item.product_id, partnerId, 'update', { silent: true })
        }

        return successResponse(movementRecord)

    } catch (err: any) {
        console.error("undoStockMovementAction error:", err)
        return errorResponse("Erro interno ao desfazer movimentação")
    }
}

// Batch undo for multiple movements at once
export async function undoBatchStockMovementsAction(ids: string[], customReason?: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const partner = await requirePartner()
        const partnerId = partner.id

        const results = []
        for (const id of ids) {
            const result = await undoStockMovementAction(id, customReason)
            results.push({ id, ...result })
        }

        const allSuccess = results.every(r => r.success)
        if (!allSuccess) {
            const failed = results.filter(r => !r.success)
            return errorResponse(`Falha ao desfazer ${failed.length} de ${ids.length} movimentações`)
        }

        return successResponse({ count: ids.length })
    } catch (err: any) {
        console.error("undoBatchStockMovementsAction error:", err)
        return errorResponse("Erro interno ao desfazer movimentações em lote")
    }
}
