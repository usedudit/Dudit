"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { sanitizeNotes } from "@/lib/input-validator"
import { getPartnerPlan } from "@/lib/services/subscription.service"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { revalidateStockMovements } from "@/lib/utils/revalidation"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"

export async function searchProductsForMovement(query: string, storeId?: string | null) {
    if (!query || query.trim().length < 2) return []

    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        await requirePermission(ctx.partnerId, "stock_movements", "view")
        const supabase = createAdminClient()
        const searchTerm = `%${query}%`

        if (storeId) {
            const { data, error } = await supabase
                .from("products")
                .select("id, name, sku, stock_quantity, images")
                .eq("store_id", storeId)
                .eq("is_active", true)
                .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm}`)
                .limit(10)

            if (error) {
                console.error("Error searching products for movement:", error)
                return []
            }

            return (data || []).map((p: any) => ({
                id: p.id,
                name: p.name,
                sku: p.sku || 'N/A',
                stock: p.stock_quantity || 0,
                image: p.images && p.images.length > 0 ? p.images[0] : null
            }))
        }

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

// Legacy single-item action - preserved for backward compat (undo, triggers)
export async function createStockMovementAction(data: {
    productId: string
    variantId?: string | null
    type: 'in' | 'out' | 'adjustment'
    quantity: number
    reason: string
    notes: string
}) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const user = await requireUser()
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("ERP não selecionado")
        const partnerId = ctx.partnerId
        const userId = user.id
        await requirePermission(partnerId, "stock_movements", "create")

        if (!data.productId) return errorResponse("Produto inválido")
        if (data.type !== 'adjustment' && data.quantity <= 0) return errorResponse("Quantidade deve ser maior que zero")
        if (data.type === 'adjustment' && data.quantity < 0) return errorResponse("O estoque ajustado não pode ser negativo")
        if (!data.reason) return errorResponse("Motivo é obrigatório")

        const supabase = createAdminClient()

        const { data: movementRecord, error } = await supabase.rpc('create_batch_stock_movement', {
            p_partner_id: partnerId,
            p_movement_type: data.type,
            p_reason: data.reason,
            p_notes: sanitizeNotes(data.notes),
            p_created_by: userId,
            p_items: [{
                product_id: data.productId,
                variant_id: data.variantId || null,
                quantity: data.quantity,
            }],
            p_store_id: ctx.activeStoreId || null,
        })

        if (error) {
            console.error("createStockMovementAction RPC error:", error)
            return errorResponse(error.message)
        }

        revalidateStockMovements(partnerId)
        revalidatePath('/erp/movimentacao-estoque')
        revalidatePath('/erp/produtos')

        await invalidateProductCache(data.productId, partnerId, 'update', { silent: true })

        return successResponse(movementRecord)
    } catch (err: any) {
        console.error("createStockMovementAction error:", err)
        return errorResponse("Erro interno ao processar a movimentação")
    }
}

// New batch action for multi-item movements
export async function createBatchStockMovementAction(data: {
    type: 'in' | 'out' | 'adjustment'
    reason: string
    notes: string
    items: { productId: string; variantId?: string | null; quantity: number }[]
}) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const user = await requireUser()
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("ERP não selecionado")
        const partnerId = ctx.partnerId
        const userId = user.id
        await requirePermission(partnerId, "stock_movements", "create")

        if (!data.items || data.items.length === 0) return errorResponse("Adicione pelo menos um item")
        if (!data.reason) return errorResponse("Motivo é obrigatório")

        for (const item of data.items) {
            if (!item.productId) return errorResponse("Produto inválido em um dos itens")
            if (data.type !== 'adjustment' && item.quantity <= 0) {
                return errorResponse("Quantidade deve ser maior que zero em todos os itens")
            }
            if (data.type === 'adjustment' && item.quantity < 0) {
                return errorResponse("O estoque ajustado não pode ser negativo em nenhum dos itens")
            }
        }

        const supabase = createAdminClient()

        if (data.type === 'out') {
            const productIds = Array.from(new Set(data.items.map((item) => item.productId)))
            const variantIds = Array.from(
                new Set(data.items.map((item) => item.variantId).filter((id): id is string => Boolean(id)))
            )

            const { data: products, error: productsError } = await supabase
                .from("products")
                .select("id, name, stock_quantity, stock_available")
                .eq("partner_id", partnerId)
                .in("id", productIds)

            if (productsError) {
                console.error("createBatchStockMovementAction stock validation error (products):", productsError)
                return errorResponse("Não foi possível validar o estoque disponível")
            }

            const productMap = new Map<string, { name: string; stock: number }>((products || []).map((product: any) => [
                product.id,
                {
                    name: product.name || "Produto",
                    stock: Number(product.stock_available ?? product.stock_quantity ?? 0),
                },
            ]))

            const variantMap = new Map<string, { name: string; stock: number; productId: string }>()
            if (variantIds.length > 0) {
                const { data: variants, error: variantsError } = await supabase
                    .from("product_variants")
                    .select("id, product_id, variant_name, stock_quantity, stock_available")
                    .in("id", variantIds)

                if (variantsError) {
                    console.error("createBatchStockMovementAction stock validation error (variants):", variantsError)
                    return errorResponse("Não foi possível validar o estoque disponível das variações")
                }

                for (const variant of variants || []) {
                    variantMap.set(variant.id, {
                        name: variant.variant_name || "Variação",
                        stock: Number(variant.stock_available ?? variant.stock_quantity ?? 0),
                        productId: variant.product_id,
                    })
                }
            }

            const requestedMap = new Map<string, {
                quantity: number
                productId: string
                variantId?: string | null
                displayName: string
            }>()

            for (const item of data.items) {
                const key = item.variantId ? `variant:${item.variantId}` : `product:${item.productId}`
                const existing = requestedMap.get(key)
                if (existing) {
                    existing.quantity += Number(item.quantity || 0)
                    continue
                }

                const productInfo = productMap.get(item.productId)
                const variantInfo = item.variantId ? variantMap.get(item.variantId) : null
                const displayName = variantInfo
                    ? `${productInfo?.name || "Produto"} - ${variantInfo.name}`
                    : (productInfo?.name || "Produto")

                requestedMap.set(key, {
                    quantity: Number(item.quantity || 0),
                    productId: item.productId,
                    variantId: item.variantId || null,
                    displayName,
                })
            }

            for (const request of requestedMap.values()) {
                if (request.variantId) {
                    const variantInfo = variantMap.get(request.variantId)
                    if (!variantInfo) {
                        return errorResponse("Uma das variações da movimentação não foi encontrada")
                    }
                    if (request.quantity > variantInfo.stock) {
                        return errorResponse(`A quantidade de "${request.displayName}" está maior que o estoque disponível`)
                    }
                } else {
                    const productInfo = productMap.get(request.productId)
                    if (!productInfo) {
                        return errorResponse("Um dos produtos da movimentação não foi encontrado")
                    }
                    if (request.quantity > productInfo.stock) {
                        return errorResponse(`A quantidade de "${productInfo.name}" está maior que o estoque disponível`)
                    }
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
            p_notes: sanitizeNotes(data.notes),
            p_created_by: userId,
            p_items: itemsPayload,
            p_store_id: ctx.activeStoreId || null,
        })

        if (error) {
            console.error("createBatchStockMovementAction RPC error:", error)
            return errorResponse(error.message)
        }

        revalidateStockMovements(partnerId)
        revalidatePath('/erp/movimentacao-estoque')
        revalidatePath('/erp/produtos')

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

        await requirePermission(ctx.partnerId, "stock_movements", "view")
        const supabase = createAdminClient()

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
                reversed_at,
                reversed_by,
                reversal_movement_id,
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
                    unit,
                    category:product_categories!category_id(name)
                ),
                product_variants (
                    id,
                    variant_name,
                    sku,
                    variant_options
                )
            `)
            .eq("movement_id", id)
            .order("created_at", { ascending: true })

        if (itemsError) {
            console.error("getStockMovementDetails items query error:", itemsError)
            return errorResponse("Erro ao buscar itens da movimentação")
        }

        // Resolve user name
        const userNamePromise = data.created_by
            ? supabase
                .from("user_profiles")
                .select("full_name")
                .eq("user_id", data.created_by)
                .maybeSingle()
                .then((r: any) => r.data?.full_name?.trim() || "Usuário")
            : Promise.resolve("Sistema")

        const userName = await userNamePromise

        let reason = data.reason || data.movement_type;
        if (!data.reason && data.order_id && data.orders?.order_number) {
            reason += ` (Pedido #${data.orders.order_number})`;
        } else if (!data.reason && data.reference_name) {
            reason = data.reference_name;
        }

        const { getPartnerTimezone } = await import("@/lib/date")
        const tz = await getPartnerTimezone(ctx.partnerId)
        const dateObj = new Date(data.created_at);
        const dateStr = dateObj.toLocaleDateString("pt-BR", {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: tz
        });
        const timeStr = dateObj.toLocaleTimeString("pt-BR", {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: tz
        });

        const items = (itemsData || []).map((item: any) => {
            const variantObj = item.product_variants
            const variantName = variantObj?.variant_name
            const productName = item.products?.name || 'Produto Excluído'
            const fullDisplayName = variantName ? `${productName} - ${variantName}` : productName
            const fullSku = variantObj?.sku || item.products?.sku || 'N/A'
            const variantImage = typeof variantObj?.variant_options === 'object' && variantObj?.variant_options
                ? variantObj.variant_options.image || null
                : null
            const itemImage = variantImage || (item.products?.images && item.products.images.length > 0 ? item.products.images[0] : null)

            const itemType = item.quantity > 0 ? 'in' : item.quantity < 0 ? 'out' : 'adjustment'

            return {
                id: item.id,
                product: {
                    name: fullDisplayName,
                    sku: fullSku,
                    image: itemImage,
                    category: item.products?.category?.name || 'Sem Categoria',
                    unit: item.products?.unit || null,
                    previousStock: item.previous_quantity || 0,
                    currentStock: item.new_quantity || 0,
                },
                quantity: Math.abs(item.quantity),
                rawQuantity: item.quantity,
                type: data.movement_type === 'adjustment' ? itemType : (item.quantity > 0 ? 'in' : 'out'),
            }
        })

        const totalQuantity = items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0)

        return successResponse({
            id: data.id,
            displayId: data.id.split('-')[0].toUpperCase() + '-' + data.id.slice(-4).toUpperCase(),
            date: `${dateStr}, ${timeStr}`,
            items,
            items_count: items.length,
            type: data.movement_type,
            quantity: totalQuantity,
            reason: reason,
            user: userName,
            notes: data.notes || '',
            referenceName: data.reference_name || data.reference_type || '-',
            orderId: data.order_id || null,
            reversedAt: data.reversed_at || null,
            reversedBy: data.reversed_by || null,
            reversalMovementId: data.reversal_movement_id || null,
            isReversed: !!data.reversed_at || !!data.reversal_movement_id,
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

        await requirePermission(ctx.partnerId, "stock_movements", "undo")
        const supabase = createAdminClient()

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
        revalidatePath('/erp/movimentacao-estoque')
        revalidatePath('/erp/produtos')

        return successResponse({ id })
    } catch (err: any) {
        console.error("deleteStockMovementAction error:", err)
        return errorResponse("Erro interno ao deletar movimentação")
    }
}

export async function undoStockMovementAction(id: string, customReason?: string) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const user = await requireUser()
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("ERP não selecionado")
        const partnerId = ctx.partnerId
        const userId = user.id
        await requirePermission(partnerId, "stock_movements", "undo")
        const supabase = createAdminClient()

        // 1. Fetch the original movement
        const { data: original, error: fetchError } = await supabase
            .from("stock_movements")
            .select("id, movement_type, reversed_at, reversal_movement_id, reason, reference_name")
            .eq("id", id)
            .eq("partner_id", partnerId)
            .single()

        if (fetchError || !original) {
            console.error("undoStockMovementAction fetch error:", fetchError)
            return errorResponse("Movimentação original não encontrada")
        }

        // Validate double reversal
        if (original.reversed_at || original.reversal_movement_id) {
            return errorResponse("Esta movimentação já foi desfeita anteriormente")
        }

        // 2. Fetch all items
        const { data: childItems } = await supabase
            .from("stock_movement_items")
            .select("product_id, variant_id, quantity, previous_quantity, new_quantity")
            .eq("movement_id", id)

        if (!childItems || childItems.length === 0) {
            return errorResponse("Itens da movimentação não encontrados")
        }

        const shortId = id.split('-')[0].toUpperCase()
        const isAdjustment = original.movement_type === 'adjustment'
        const invertedType = isAdjustment ? 'adjustment' : (original.movement_type === 'in' ? 'out' : 'in')
        const reason = customReason || `Estorno ${isAdjustment ? 'do ajuste' : 'da movimentação'} ${shortId}`
        const notes = customReason ? `Motivo: ${customReason}` : `Estorno da movimentação ID: ${shortId}`

        // Undo: for adjustment, restore previous_quantity; for in/out, reverse delta
        const itemsPayload = childItems.map((item: any) => ({
            product_id: item.product_id,
            variant_id: item.variant_id || null,
            quantity: isAdjustment ? Number(item.previous_quantity ?? 0) : Math.abs(item.quantity),
        }))

        const { data: movementRecord, error } = await supabase.rpc('create_batch_stock_movement', {
            p_partner_id: partnerId,
            p_movement_type: invertedType,
            p_reason: reason,
            p_notes: notes,
            p_created_by: userId,
            p_items: itemsPayload,
            p_store_id: ctx.activeStoreId || null,
            p_reference_name: shortId,
            p_reference_type: 'adjustment',
        })

        if (error) {
            console.error("undoStockMovementAction batch RPC error:", error)
            return errorResponse(error.message)
        }

        const newMovementId = movementRecord?.id || movementRecord

        // Mark original movement as reversed
        if (newMovementId) {
            await supabase
                .from("stock_movements")
                .update({
                    reversed_at: new Date().toISOString(),
                    reversed_by: userId,
                    reversal_movement_id: newMovementId,
                })
                .eq("id", id)
        }

        revalidateStockMovements(partnerId)
        revalidatePath('/erp/movimentacao-estoque')
        revalidatePath('/erp/produtos')

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
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("ERP não selecionado")
        const partnerId = ctx.partnerId
        await requirePermission(partnerId, "stock_movements", "view")

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

export type ERPStockMovementListCursor = { createdAt: string; id: string }

function buildStockMovementKeysetOrFilter(cursor: ERPStockMovementListCursor): string {
    const ts = cursor.createdAt
    const id = cursor.id
    const q = (s: string) => `"${String(s).replace(/"/g, '""')}"`
    return `created_at.lt.${q(ts)},and(created_at.eq.${q(ts)},id.lt.${q(id)})`
}

const ERP_STOCK_MOVEMENTS_PAGE_SIZE = 100

export async function getERPStockMovementsPageAction(
    partnerId: string,
    options?: { cursor?: ERPStockMovementListCursor | null; limit?: number; storeId?: string | null },
): Promise<
    | { success: true; items: any[]; nextCursor: ERPStockMovementListCursor | null; hasMore: boolean }
    | { success: false; error: string }
> {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }
        await requirePermission(partnerId, "stock_movements", "view")
        const cursor = options?.cursor ?? null
        const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_STOCK_MOVEMENTS_PAGE_SIZE))))
        const fetchLimit = limit + 1
        const storeId = options?.storeId
        const rows = await getCachedErpPage(
            ["erp-stock-movements-page", partnerId, storeId || "all-stores", cursor ? `${cursor.createdAt}:${cursor.id}` : "first", String(limit)],
            [TAGS.stockMovements(partnerId)],
            async () => {
                const supabase = createAdminClient()
                let q = supabase
                    .from("stock_movements")
                    .select(`
                        id, created_at, movement_type, order_id, reference_type,
                        reference_name, reason, notes, created_by, store_id,
                        reversed_at, reversed_by, reversal_movement_id,
                        orders(order_number), stock_movement_items(quantity, products(name, sku))
                    `)
                    .eq("partner_id", partnerId)
                if (storeId) q = q.eq("store_id", storeId)
                if (cursor) q = q.or(buildStockMovementKeysetOrFilter(cursor))
                const { data, error } = await q
                    .order("created_at", { ascending: false })
                    .order("id", { ascending: false })
                    .limit(fetchLimit)
                if (error) throw error
                return data || []
            },
            30,
        )
        const hasMore = rows.length > limit
        const items = hasMore ? rows.slice(0, limit) : rows
        const last = items[items.length - 1]
        const nextCursor: ERPStockMovementListCursor | null =
            hasMore && last?.created_at && last?.id ? { createdAt: String(last.created_at), id: String(last.id) } : null

        return { success: true, items, nextCursor, hasMore }
    } catch (e: any) {
        return { success: false, error: e?.message || "Erro ao carregar movimentações" }
    }
}

export async function getStockMovementPresignedUploadUrlAction(
  partnerId: string,
  fileName: string,
  fileType: string,
  fileSize: number
): Promise<
  | { success: true; uploadUrl: string; publicUrl: string; key: string }
  | { success: false; error: string }
> {
  try {
    const user = await requireUser()
    await requirePermission(partnerId, "stock_movements", "create")

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

export async function saveStockMovementAttachmentAction(
  partnerId: string,
  movementId: string,
  fileKey: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  fileHash?: string
): Promise<{ success: true; data: any } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "stock_movements", "create")
    const user = await requireUser()

    const plan = await getPartnerPlan(partnerId)
    if (plan.slug.toLowerCase() !== "crescer" && plan.slug.toLowerCase() !== "escalar") {
      return { success: false, error: "Upload de documentos não permitido no seu plano. Faça um upgrade!" }
    }

    const maxCount = plan.slug.toLowerCase() === "crescer" ? 2 : 5
    const admin = createAdminClient()

    const { count, error: countErr } = await admin
      .from("stock_movement_attachments")
      .select("id", { count: "exact", head: true })
      .eq("stock_movement_id", movementId)

    if (countErr) throw countErr

    if ((count || 0) >= maxCount) {
      return {
        success: false,
        error: `Limite de anexos excedido para o seu plano (${maxCount}). Remova algum para adicionar.`,
      }
    }

    let finalHash = fileHash || ""
    if (!finalHash && fileSize < 5 * 1024 * 1024) {
      try {
        const { getR2ServerConfig } = await import("@/lib/r2/r2-server-config")
        const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3")
        const serverConfig = getR2ServerConfig()
        const s3 = new S3Client({
          region: "auto",
          credentials: {
            accessKeyId: serverConfig.accessKeyId,
            secretAccessKey: serverConfig.secretAccessKey,
          },
          endpoint: `https://${serverConfig.accountId}.r2.cloudflarestorage.com`,
        })
        const obj = await s3.send(new GetObjectCommand({ Bucket: serverConfig.bucketName, Key: fileKey }))
        if (obj.Body) {
          const bytes = await obj.Body.transformToByteArray()
          const crypto = await import("crypto")
          finalHash = crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex")
        }
        s3.destroy()
      } catch (e) {
        console.error("Erro ao calcular hash do R2 no fallback:", e)
      }
    }

    const { data, error } = await admin
      .from("stock_movement_attachments")
      .insert({
        stock_movement_id: movementId,
        file_key: fileKey,
        file_name: fileName,
        file_type: fileType,
        file_size: fileSize,
        uploaded_by: user.id,
        file_hash: finalHash,
      })
      .select("*")
      .single()

    if (error) throw error

    const { logAuditEvent } = await import("@/lib/services/timeline.service")
    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "stock_movement",
      entityId: movementId,
      actionType: "attachment_created",
      source: "manual",
      changeLines: [`Anexo adicionado: ${fileName}`],
    })

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao salvar anexo" }
  }
}

export async function deleteStockMovementAttachmentAction(
  partnerId: string,
  attachmentId: string,
  movementId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)
    await requirePermission(partnerId, "stock_movements", "create")
    const user = await requireUser()
    const admin = createAdminClient()

    const { data: attachment } = await admin
      .from("stock_movement_attachments")
      .select("file_key, file_name")
      .eq("id", attachmentId)
      .eq("stock_movement_id", movementId)
      .maybeSingle()

    if (!attachment) {
      return { success: false, error: "Anexo não encontrado" }
    }

    const { deleteFileFromR2 } = await import("@/lib/r2/server")
    await deleteFileFromR2(attachment.file_key)

    await admin.from("stock_movement_attachments").delete().eq("id", attachmentId)

    const { logAuditEvent } = await import("@/lib/services/timeline.service")
    await logAuditEvent({
      partnerId,
      actorUserId: user.id,
      entityType: "stock_movement",
      entityId: movementId,
      actionType: "attachment_deleted",
      source: "manual",
      changeLines: [`Anexo removido: ${attachment.file_name || "Documento"}`],
    })

    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao deletar anexo" }
  }
}

export async function getStockMovementAttachmentsAction(
  movementId: string
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data, error } = await supabase
      .from("stock_movement_attachments")
      .select("*")
      .eq("stock_movement_id", movementId)
      .order("created_at", { ascending: false })

    if (error) throw error

    return { success: true, data: data || [] }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao listar anexos" }
  }
}

export async function getStockMovementAttachmentUrlAction(
  movementId: string,
  fileKey: string,
  partnerId?: string
): Promise<{ success: true; downloadUrl: string } | { success: false; error: string }> {
  try {
    await requireUser()
    if (partnerId) {
      await requirePermission(partnerId, "stock_movements", "view")
    }

    const { generateSignedDownloadUrl } = await import("@/lib/r2/server")
    const downloadUrl = await generateSignedDownloadUrl(fileKey)
    return { success: true, downloadUrl }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao obter URL de download" }
  }
}
