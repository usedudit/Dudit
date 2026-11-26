"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requireStorePermission } from "@/lib/auth/authorization"
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

async function requireMovementItemAccess(
    partnerId: string,
    activeStoreId: string | null,
    items: Array<{ productId: string; variantId?: string | null }>,
) {
    const productIds = Array.from(new Set(items.map((item) => item.productId)))
    const variantIds = Array.from(new Set(items.map((item) => item.variantId).filter((id): id is string => Boolean(id))))
    const admin = createAdminClient()
    const [{ data: products, error: productsError }, { data: variants, error: variantsError }] = await Promise.all([
        admin.from("products").select("id, partner_id, store_id").eq("partner_id", partnerId).in("id", productIds),
        variantIds.length > 0
            ? admin.from("product_variants").select("id, product_id").in("id", variantIds)
            : Promise.resolve({ data: [] as Array<{ id: string; product_id: string }>, error: null }),
    ])
    if (productsError || !products || products.length !== productIds.length) {
        throw new Error("Um ou mais produtos não pertencem ao parceiro ativo.")
    }
    if (variantsError || !variants || variants.length !== variantIds.length) {
        throw new Error("Uma ou mais variações não foram encontradas.")
    }

    const productById = new Map<string, any>((products as any[]).map((product: any) => [String(product.id), product]))
    const variantById = new Map<string, any>((variants || []).map((variant: any) => [String(variant.id), variant]))
    for (const item of items) {
        const product = productById.get(String(item.productId))
        if (!product) throw new Error("Produto não encontrado no parceiro ativo.")
        if (activeStoreId && product.store_id && product.store_id !== activeStoreId) {
            throw new Error("O produto pertence a outra loja ativa.")
        }
        if (product.store_id) await requireStorePermission(product.store_id, partnerId, "stock_movements", "create")
        if (item.variantId) {
            const variant = variantById.get(String(item.variantId))
            if (!variant || variant.product_id !== item.productId) {
                throw new Error("A variação não pertence ao produto informado.")
            }
        }
    }
}

export async function searchProductsForMovement(query: string, storeId?: string | null) {
    if (!query || query.trim().length < 2) return []

    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        await requirePermission(ctx.partnerId, "stock_movements", "view")
        const supabase = createAdminClient()
        const searchTerm = `%${query}%`
        const effectiveStoreId = storeId || ctx.activeStoreId

        if (effectiveStoreId) {
            await requireStorePermission(effectiveStoreId, ctx.partnerId, "stock_movements", "view")
            const { data, error } = await supabase
                .from("products")
                .select("id, name, sku, stock_quantity, images")
                .eq("store_id", effectiveStoreId)
                .eq("partner_id", ctx.partnerId)
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
        if (ctx.activeStoreId) {
            await requireStorePermission(ctx.activeStoreId, partnerId, "stock_movements", "create")
        }

        if (!data.productId) return errorResponse("Produto inválido")
        if (!['in', 'out', 'adjustment'].includes(data.type)) return errorResponse("Tipo de movimentação inválido")
        if (!Number.isSafeInteger(data.quantity)) return errorResponse("Quantidade inválida")
        if (data.type !== 'adjustment' && data.quantity <= 0) return errorResponse("Quantidade deve ser maior que zero")
        if (data.type === 'adjustment' && data.quantity < 0) return errorResponse("O estoque ajustado não pode ser negativo")
        if (!data.reason) return errorResponse("Motivo é obrigatório")

        await requireMovementItemAccess(partnerId, ctx.activeStoreId || null, [{ productId: data.productId, variantId: data.variantId }])

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

        await revalidateStockMovements(partnerId)
        revalidatePath('/erp/movimentacao-estoque')
        revalidatePath('/erp/produtos')

        await invalidateProductCache(data.productId, partnerId, 'update', { silent: true })

        // Sincroniza estoque no ERP conectado (Tiny / Bling) de forma não-bloqueante
        import("@/lib/services/integrations/erp-sync")
          .then(async ({ syncStockToConnectedErps }) => {
            let newStock = 0
            if (data.variantId) {
              const { data: vRow } = await supabase
                .from("product_variants")
                .select("stock_quantity")
                .eq("id", data.variantId)
                .maybeSingle()
              newStock = Number(vRow?.stock_quantity || 0)
            } else {
              const { data: pRow } = await supabase
                .from("products")
                .select("stock_quantity")
                .eq("id", data.productId)
                .maybeSingle()
              newStock = Number(pRow?.stock_quantity || 0)
            }
            await syncStockToConnectedErps({
              partnerId,
              productId: data.productId,
              variantId: data.variantId || undefined,
              newStock,
              reason: `Movimentação ${data.type} na Dudit: ${data.reason}`,
            })
          })
          .catch(() => {})

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
        if (ctx.activeStoreId) {
            await requireStorePermission(ctx.activeStoreId, partnerId, "stock_movements", "create")
        }

        if (!data.items || data.items.length === 0) return errorResponse("Adicione pelo menos um item")
        if (!Array.isArray(data.items) || data.items.length > 100) return errorResponse("A movimentação deve conter de 1 a 100 itens")
        if (!['in', 'out', 'adjustment'].includes(data.type)) return errorResponse("Tipo de movimentação inválido")
        if (!data.reason) return errorResponse("Motivo é obrigatório")

        for (const item of data.items) {
            if (!item.productId) return errorResponse("Produto inválido em um dos itens")
            if (!Number.isSafeInteger(item.quantity)) return errorResponse("Quantidade inválida em um dos itens")
            if (data.type !== 'adjustment' && item.quantity <= 0) {
                return errorResponse("Quantidade deve ser maior que zero em todos os itens")
            }
            if (data.type === 'adjustment' && item.quantity < 0) {
                return errorResponse("O estoque ajustado não pode ser negativo em nenhum dos itens")
            }
        }

        await requireMovementItemAccess(partnerId, ctx.activeStoreId || null, data.items)

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

        await revalidateStockMovements(partnerId)
        revalidatePath('/erp/movimentacao-estoque')
        revalidatePath('/erp/produtos')

        // Invalidate cache for all products
        for (const item of data.items) {
            await invalidateProductCache(item.productId, partnerId, 'update', { silent: true })
        }

        // Sincroniza estoque no ERP conectado (Tiny / Bling) de forma não-bloqueante
        import("@/lib/services/integrations/erp-sync")
            .then(async ({ syncStockToConnectedErps }) => {
                for (const item of data.items) {
                    try {
                        let newStock = 0
                        if (item.variantId) {
                            const { data: vRow } = await supabase
                                .from("product_variants")
                                .select("stock_quantity")
                                .eq("id", item.variantId)
                                .maybeSingle()
                            newStock = Number(vRow?.stock_quantity || 0)
                        } else {
                            const { data: pRow } = await supabase
                                .from("products")
                                .select("stock_quantity")
                                .eq("id", item.productId)
                                .maybeSingle()
                            newStock = Number(pRow?.stock_quantity || 0)
                        }
                        await syncStockToConnectedErps({
                            partnerId,
                            productId: item.productId,
                            variantId: item.variantId || undefined,
                            newStock,
                            reason: `Movimentação em lote ${data.type} na Dudit: ${data.reason}`,
                        })
                    } catch { }
                }
            })
            .catch(() => { })

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
                store_id,
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
        if (data.store_id) await requireStorePermission(data.store_id, ctx.partnerId, "stock_movements", "view")

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

        const { getPartnerTimezone } = await import("@/lib/date/server")
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
    // Preserve the inventory ledger: a movement must be reversed through the
    // compensating movement flow, never deleted independently of stock changes.
    return undoStockMovementAction(id)
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
            .select("id, movement_type, store_id, reversed_at, reversal_movement_id, reason, reference_name")
            .eq("id", id)
            .eq("partner_id", partnerId)
            .single()

        if (fetchError || !original) {
            console.error("undoStockMovementAction fetch error:", fetchError)
            return errorResponse("Movimentação original não encontrada")
        }
        if (original.store_id) {
            await requireStorePermission(original.store_id, partnerId, "stock_movements", "undo")
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

        const reason = customReason?.trim().slice(0, 500)
        const { data: movementRecord, error } = await supabase.rpc('undo_stock_movement_atomic', {
            p_partner_id: partnerId,
            p_movement_id: id,
            p_user_id: userId,
            p_reason: reason || null,
        })

        if (error) {
            console.error("undoStockMovementAction atomic RPC error:", error)
            return errorResponse(error.message)
        }

        await revalidateStockMovements(partnerId)
        revalidatePath('/erp/movimentacao-estoque')
        revalidatePath('/erp/produtos')

        for (const productId of movementRecord?.product_ids || []) {
            await invalidateProductCache(productId, partnerId, 'update', { silent: true })
        }

        // Sincroniza o estoque revertido no ERP conectado (Tiny / Bling) de forma não-bloqueante
        import("@/lib/services/integrations/erp-sync")
            .then(({ syncItemsStockToConnectedErps }) =>
                syncItemsStockToConnectedErps({
                    partnerId,
                    items: (childItems || []).map((it: any) => ({
                        productId: it.product_id,
                        variantId: it.variant_id || null,
                    })),
                    reason: `Estorno movimentação na Dudit${reason ? `: ${reason}` : ""}`,
                })
            )
            .catch(() => {})

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
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) return errorResponse("Informe de 1 a 100 movimentações para desfazer")
        if (new Set(ids).size !== ids.length) return errorResponse("A lista contém movimentações repetidas")
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
        const context = await getCurrentPartnerContext(user)
        if (!context?.partnerId || context.partnerId !== partnerId) {
            return { success: false, error: "O parceiro informado não corresponde ao contexto ativo" }
        }
        await requirePermission(context.partnerId, "stock_movements", "view", user)
        const cursor = options?.cursor ?? null
        const limit = Math.max(1, Math.min(250, Math.floor(Number(options?.limit || ERP_STOCK_MOVEMENTS_PAGE_SIZE))))
        const fetchLimit = limit + 1
        const storeId = options?.storeId || context.activeStoreId || null
        if (storeId) {
            await requireStorePermission(storeId, partnerId, "stock_movements", "view")
        }
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
  movementId: string,
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
    await requirePermission(partnerId, "stock_movements", "create")
    const supabase = await getSupabaseServerClient()
    const { data: movement } = await supabase
      .from("stock_movements")
      .select("id, store_id")
      .eq("id", movementId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!movement) return { success: false, error: "Movimentação não encontrada." }
    if (movement.store_id) await requireStorePermission(movement.store_id, partnerId, "stock_movements", "create")

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
    const supabase = await getSupabaseServerClient()
    const { data: movement } = await supabase
      .from("stock_movements")
      .select("id, store_id")
      .eq("id", movementId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!movement) return { success: false, error: "Movimentação não encontrada." }
    if (movement.store_id) await requireStorePermission(movement.store_id, partnerId, "stock_movements", "create")

    const { R2_PREFIXES } = await import("@/lib/r2/config")
    const { validateKeyOwnership } = await import("@/lib/r2/server")
    const expectedPrefix = `users/${user.id}/${R2_PREFIXES.orderAttachments}`
    if (
      typeof fileKey !== "string" ||
      !validateKeyOwnership(fileKey, user.id) ||
      !fileKey.startsWith(expectedPrefix) ||
      fileKey.includes("..") ||
      fileKey.startsWith("/")
    ) {
      return { success: false, error: "Chave de arquivo inválida para este usuário." }
    }
    const { validateUploadRequest } = await import("@/lib/security/file-validator")
    const validation = validateUploadRequest(fileName, fileType, fileSize)
    if (!validation.success) return { success: false, error: validation.error || "Arquivo inválido." }

    const plan = await getPartnerPlan(partnerId)
    if (plan.slug.toLowerCase() !== "crescer" && plan.slug.toLowerCase() !== "escalar") {
      return { success: false, error: "Upload de documentos não permitido no seu plano. Faça um upgrade!" }
    }

    const maxCount = plan.slug.toLowerCase() === "crescer" ? 2 : 5
    const admin = createAdminClient()

    const { verifyUploadedObject } = await import("@/lib/r2/server")
    const verified = await verifyUploadedObject(fileKey, fileSize, fileType, fileHash)
    const actualFileSize = verified.contentLength
    const finalHash = verified.sha256
    const actualValidation = validateUploadRequest(fileName, fileType, actualFileSize)
    if (!actualValidation.success) {
      return { success: false, error: actualValidation.error || "Arquivo excede os limites permitidos." }
    }

    const { data: insertedRows, error } = await admin.rpc("register_stock_movement_attachment_atomic", {
      p_partner_id: partnerId,
      p_movement_id: movementId,
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
    if (!data) throw new Error("Não foi possível registrar o anexo.")

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
    console.error("[saveStockMovementAttachmentAction] Erro:", err);
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
    const supabase = await getSupabaseServerClient()

    const { data: movement } = await supabase
      .from("stock_movements")
      .select("id, partner_id, store_id")
      .eq("id", movementId)
      .eq("partner_id", partnerId)
      .maybeSingle()
    if (!movement) return { success: false, error: "Movimentação não encontrada." }
    if (movement.store_id) {
      await requireStorePermission(movement.store_id, partnerId, "stock_movements", "create")
    }

    const { data: attachment } = await supabase
      .from("stock_movement_attachments")
      .select("id, file_key, file_name")
      .eq("id", attachmentId)
      .eq("stock_movement_id", movementId)
      .maybeSingle()

    if (!attachment) {
      return { success: false, error: "Anexo não encontrado" }
    }

    const { deleteFileFromR2 } = await import("@/lib/r2/server")
    await deleteFileFromR2(attachment.file_key)

    const admin = createAdminClient()
    await admin.from("stock_movement_attachments").delete().eq("id", attachmentId).eq("stock_movement_id", movementId)

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
  movementId: string,
  partnerId?: string,
): Promise<{ success: true; data: any[] } | { success: false; error: string }> {
  try {
    await requireUser()
    const supabase = await getSupabaseServerClient()

    const { data: movement } = await supabase
      .from("stock_movements")
      .select("id, partner_id, store_id")
      .eq("id", movementId)
      .maybeSingle()
    if (!movement || (partnerId && movement.partner_id !== partnerId)) {
      return { success: false, error: "Movimentação não encontrada." }
    }
    if (movement.store_id) await requireStorePermission(movement.store_id, movement.partner_id, "stock_movements", "view")
    else await requirePermission(movement.partner_id, "stock_movements", "view")

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
    const supabase = await getSupabaseServerClient()
    const { data: movement } = await supabase
      .from("stock_movements")
      .select("id, partner_id, store_id")
      .eq("id", movementId)
      .maybeSingle()
    if (!movement || (partnerId && movement.partner_id !== partnerId)) {
      return { success: false, error: "Movimentação não encontrada." }
    }

    const { data: attachment } = await supabase
      .from("stock_movement_attachments")
      .select("id")
      .eq("stock_movement_id", movementId)
      .eq("file_key", fileKey)
      .maybeSingle()
    if (!attachment) return { success: false, error: "Anexo não encontrado nesta movimentação." }

    if (movement.store_id) {
      await requireStorePermission(movement.store_id, movement.partner_id, "stock_movements", "view")
    } else {
      await requirePermission(movement.partner_id, "stock_movements", "view")
    }

    const { generateSignedDownloadUrl } = await import("@/lib/r2/server")
    const downloadUrl = await generateSignedDownloadUrl(fileKey)
    return { success: true, downloadUrl }
  } catch (err: any) {
    return { success: false, error: err.message || "Erro ao obter URL de download" }
  }
}

export async function getProductStockStatusAction(productId: string, variantId?: string | null) {
  try {
    await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx?.partnerId) return errorResponse("ERP não selecionado")
    const partnerId = ctx.partnerId

    const admin = createAdminClient()

    if (variantId) {
      const { data, error } = await admin
        .from("product_variants")
        .select("id, product_id, stock_quantity, stock_reserved, stock_available, products!inner(partner_id, store_id)")
        .eq("id", variantId)
        .eq("product_id", productId)
        .single()

      if (error || !data) return errorResponse("Variação não encontrada")
      if ((data.products as any)?.partner_id !== partnerId) {
        return errorResponse("Variação não pertence ao parceiro ativo")
      }

      const stockQuantity = Number(data.stock_quantity) || 0
      const stockReserved = Math.max(0, Number(data.stock_reserved) || 0)
      const stockAvailable = Number(data.stock_available ?? (stockQuantity - stockReserved))

      return successResponse({
        stock_quantity: stockQuantity,
        stock_reserved: stockReserved,
        stock_available: stockAvailable,
      })
    } else {
      const { data, error } = await admin
        .from("products")
        .select("id, stock_quantity, stock_reserved, stock_available, partner_id, store_id")
        .eq("id", productId)
        .eq("partner_id", partnerId)
        .single()

      if (error || !data) return errorResponse("Produto não encontrado")

      const stockQuantity = Number(data.stock_quantity) || 0
      const stockReserved = Math.max(0, Number(data.stock_reserved) || 0)
      const stockAvailable = Number(data.stock_available ?? (stockQuantity - stockReserved))

      return successResponse({
        stock_quantity: stockQuantity,
        stock_reserved: stockReserved,
        stock_available: stockAvailable,
      })
    }
  } catch (err: any) {
    console.error("getProductStockStatusAction error:", err)
    return errorResponse(err.message || "Erro ao consultar status de estoque")
  }
}

export async function releaseReservedStockAction(data: {
  productId: string
  variantId?: string | null
  quantity?: number
  reason: string
  notes?: string
}) {
  await requireRateLimit(RateLimitCategory.ERP_GENERAL)

  try {
    const user = await requireUser()
    const ctx = await getCurrentPartnerContext()
    if (!ctx?.partnerId) return errorResponse("ERP não selecionado")
    const partnerId = ctx.partnerId

    await requirePermission(partnerId, "stock_movements", "create")
    if (ctx.activeStoreId) {
      await requireStorePermission(ctx.activeStoreId, partnerId, "stock_movements", "create")
    }

    if (!data.productId) return errorResponse("Produto inválido")
    const trimmedReason = (data.reason || "").trim()
    if (!trimmedReason || trimmedReason === "Selecione um motivo...") {
      return errorResponse("Selecione um motivo para a liberação de reserva")
    }

    const admin = createAdminClient()

    if (data.variantId) {
      const { data: variant, error: varErr } = await admin
        .from("product_variants")
        .select("id, product_id, variant_name, stock_quantity, stock_reserved, stock_available, products!inner(id, name, partner_id, store_id)")
        .eq("id", data.variantId)
        .eq("product_id", data.productId)
        .single()

      if (varErr || !variant) {
        return errorResponse("Variação não encontrada")
      }
      if ((variant.products as any)?.partner_id !== partnerId) {
        return errorResponse("Variação não pertence ao parceiro ativo")
      }
      if (ctx.activeStoreId && (variant.products as any)?.store_id && (variant.products as any).store_id !== ctx.activeStoreId) {
        return errorResponse("A variação pertence a outra loja")
      }

      const currentReserved = Math.max(0, Number(variant.stock_reserved) || 0)
      if (currentReserved <= 0) {
        return errorResponse("Esta variação não possui estoque reservado para liberar")
      }

      const requestedQty = data.quantity !== undefined && data.quantity !== null ? Number(data.quantity) : currentReserved
      if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
        return errorResponse("A quantidade a liberar deve ser maior que zero")
      }

      const qtyToRelease = Math.min(requestedQty, currentReserved)
      const newReserved = Math.max(0, currentReserved - qtyToRelease)
      const currentStock = Number(variant.stock_quantity) || 0
      const newAvailable = Math.max(0, currentStock - newReserved)

      const { error: updateErr } = await admin
        .from("product_variants")
        .update({
          stock_reserved: newReserved,
          updated_at: new Date().toISOString()
        })
        .eq("id", data.variantId)
        .eq("product_id", data.productId)

      if (updateErr) {
        console.error("releaseReservedStockAction variant update error:", updateErr)
        return errorResponse("Falha ao atualizar estoque reservado da variação")
      }

      const { logAuditEvent } = await import("@/lib/services/timeline.service")
      const variantName = variant.variant_name || "Variação"
      await logAuditEvent({
        partnerId,
        actorUserId: user.id,
        entityType: "product",
        entityId: data.productId,
        actionType: "stock_reservation_released",
        source: "manual",
        changeLines: [
          `Liberação de estoque reservado na variação "${variantName}": ${qtyToRelease} unidade(s) liberada(s). Reserva anterior: ${currentReserved}, nova reserva: ${newReserved}. Motivo: ${trimmedReason}.${data.notes ? ` Obs: ${sanitizeNotes(data.notes)}` : ""}`
        ],
      })

      await invalidateProductCache(data.productId, partnerId, 'update', { silent: true })
      await revalidateStockMovements(partnerId)
      revalidatePath('/erp/produtos')
      revalidatePath(`/erp/produtos/${data.productId}`)
      revalidatePath('/erp/movimentacao-estoque')

      return successResponse({
        releasedQuantity: qtyToRelease,
        stock_quantity: currentStock,
        stock_reserved: newReserved,
        stock_available: newAvailable,
      })
    } else {
      const { data: product, error: prodErr } = await admin
        .from("products")
        .select("id, name, partner_id, store_id, stock_quantity, stock_reserved, stock_available")
        .eq("id", data.productId)
        .eq("partner_id", partnerId)
        .single()

      if (prodErr || !product) {
        return errorResponse("Produto não encontrado")
      }
      if (ctx.activeStoreId && product.store_id && product.store_id !== ctx.activeStoreId) {
        return errorResponse("O produto pertence a outra loja")
      }

      const currentReserved = Math.max(0, Number(product.stock_reserved) || 0)
      if (currentReserved <= 0) {
        return errorResponse("Este produto não possui estoque reservado para liberar")
      }

      const requestedQty = data.quantity !== undefined && data.quantity !== null ? Number(data.quantity) : currentReserved
      if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
        return errorResponse("A quantidade a liberar deve ser maior que zero")
      }

      const qtyToRelease = Math.min(requestedQty, currentReserved)
      const newReserved = Math.max(0, currentReserved - qtyToRelease)
      const currentStock = Number(product.stock_quantity) || 0
      const newAvailable = Math.max(0, currentStock - newReserved)

      const { error: updateErr } = await admin
        .from("products")
        .update({
          stock_reserved: newReserved,
          updated_at: new Date().toISOString()
        })
        .eq("id", data.productId)
        .eq("partner_id", partnerId)

      if (updateErr) {
        console.error("releaseReservedStockAction product update error:", updateErr)
        return errorResponse("Falha ao atualizar estoque reservado do produto")
      }

      const { logAuditEvent } = await import("@/lib/services/timeline.service")
      await logAuditEvent({
        partnerId,
        actorUserId: user.id,
        entityType: "product",
        entityId: data.productId,
        actionType: "stock_reservation_released",
        source: "manual",
        changeLines: [
          `Liberação de estoque reservado no produto "${product.name}": ${qtyToRelease} unidade(s) liberada(s). Reserva anterior: ${currentReserved}, nova reserva: ${newReserved}. Motivo: ${trimmedReason}.${data.notes ? ` Obs: ${sanitizeNotes(data.notes)}` : ""}`
        ],
      })

      await invalidateProductCache(data.productId, partnerId, 'update', { silent: true })
      await revalidateStockMovements(partnerId)
      revalidatePath('/erp/produtos')
      revalidatePath(`/erp/produtos/${data.productId}`)
      revalidatePath('/erp/movimentacao-estoque')

      return successResponse({
        releasedQuantity: qtyToRelease,
        stock_quantity: currentStock,
        stock_reserved: newReserved,
        stock_available: newAvailable,
      })
    }
  } catch (err: any) {
    console.error("releaseReservedStockAction error:", err)
    return errorResponse(err.message || "Erro interno ao liberar estoque reservado")
  }
}
