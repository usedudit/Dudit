"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser, requirePartner } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { revalidatePath } from "next/cache"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { invalidateProductCache } from "@/lib/cache/invalidation"

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
        // requirePartner resolve tanto o usuário quanto o parceiro em uma única árvore de cache
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

        revalidatePath('/erp/stock-movements')
        revalidatePath('/erp/products')
        await invalidateProductCache(data.productId, partnerId, 'update', { silent: true })

        return successResponse(movementRecord)
    } catch (err: any) {
        console.error("createStockMovementAction error:", err)
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
                quantity,
                previous_quantity,
                new_quantity,
                reference_name,
                reason,
                notes,
                created_by,
                products (
                    name,
                    sku,
                    images,
                    category
                )
            `)
            .eq("id", id)
            .eq("partner_id", ctx.partnerId)
            .single()

        if (error) {
            console.error("getStockMovementDetails query error:", error)
            return errorResponse("Erro ao buscar detalhes da movimentação")
        }

        if (!data) return errorResponse("Movimentação não encontrada")

        // Resolve user name separately since there's no FK from stock_movements to user_profiles
        let userName = 'Sistema'
        if (data.created_by) {
            const { data: profile } = await supabase
                .from("user_profiles")
                .select("full_name")
                .eq("id", data.created_by)
                .single()
            userName = profile?.full_name || data.created_by
        }

        let reason = data.reason || data.movement_type;
        if (!data.reason && data.reference_name) {
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

        return successResponse({
            id: data.id,
            displayId: data.id.split('-')[0].toUpperCase() + '-' + data.id.slice(-4).toUpperCase(),
            date: `${dateStr}, ${timeStr}`,
            product: {
                name: data.products?.name || 'Produto Excluído',
                sku: data.products?.sku || 'N/A',
                image: (data.products?.images && data.products.images.length > 0) ? data.products.images[0] : null,
                category: data.products?.category || 'Sem Categoria',
                previousStock: data.previous_quantity || 0,
                currentStock: data.new_quantity || 0,
            },
            type: data.quantity > 0 ? 'in' : 'out',
            quantity: Math.abs(data.quantity),
            reason: reason,
            user: userName,
            notes: data.notes || '',
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
        // Single partner resolution (previously called getCurrentPartnerContext + requirePartner = 2x DB)
        const partner = await requirePartner()
        const partnerId = partner.id
        const userId = partner.user_id
        const supabase = await getSupabaseServerClient()

        // 1. Buscar a movimentação original para saber o que inverter
        const { data: original, error: fetchError } = await supabase
            .from("stock_movements")
            .select("product_id, variant_id, quantity")
            .eq("id", id)
            .eq("partner_id", partnerId)
            .single()

        if (fetchError || !original) {
            console.error("undoStockMovementAction fetch error:", fetchError)
            return errorResponse("Movimentação original não encontrada")
        }

        // 2. Determinar o tipo inverso e o motivo
        // Se a original era > 0 (entrada), o estorno é saida ('out')
        // Se a original era < 0 (saida), o estorno é entrada ('in')
        const invertedType = original.quantity > 0 ? 'out' : 'in'
        const reason = customReason || "Movimentação desfeita"
        const notes = `Estorno da movimentação ID: ${id.split('-')[0].toUpperCase()}`

        // 3. Criar a nova movimentação usando o RPC existente
        const { data: movementRecord, error } = await supabase.rpc('create_manual_stock_movement', {
            p_partner_id: partnerId,
            p_product_id: original.product_id,
            p_movement_type: invertedType,
            p_quantity: Math.abs(original.quantity), // A quantidade é sempre positiva para o RPC
            p_reason: customReason || "Estorno",
            p_notes: notes,
            p_created_by: userId,
            p_variant_id: original.variant_id || null
        })

        if (error) {
            console.error("undoStockMovementAction RPC error:", error)
            return errorResponse(error.message)
        }

        revalidatePath('/erp/stock-movements')
        revalidatePath('/erp/products')

        // Sync estorno change to Redis/Marketplace (silent avoids thundering herd)
        await invalidateProductCache(original.product_id, partnerId, 'update', { silent: true })

        return successResponse(movementRecord)

    } catch (err: any) {
        console.error("undoStockMovementAction error:", err)
        return errorResponse("Erro interno ao desfazer movimentação")
    }
}
