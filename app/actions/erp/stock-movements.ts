"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { revalidatePath } from "next/cache"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"

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
            image: p.images && p.images.length > 0 ? p.images[0] : 'https://img.dudit.com.br/static/mascots/Box.png'
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
    movementDate: string
    responsible: string
}) {
    await requireRateLimit(RateLimitCategory.ERP_GENERAL)

    try {
        const user = await requireUser()
        if (!user) return errorResponse("Não autenticado")

        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("Parceiro não encontrado")

        if (!data.productId) return errorResponse("Produto inválido")
        if (data.quantity <= 0) return errorResponse("Quantidade deve ser maior que zero")
        if (!data.reason) return errorResponse("Motivo é obrigatório")

        const supabase = await getSupabaseServerClient()

        // Combine notes with responsible/date info if needed
        const fullNotes = `Responsável: ${data.responsible}\nData de Referência: ${data.movementDate}\n${data.notes}`

        const { data: movementRecord, error } = await supabase.rpc('create_manual_stock_movement', {
            p_partner_id: ctx.partnerId,
            p_product_id: data.productId,
            p_movement_type: data.type,
            p_quantity: data.quantity,
            p_reason: data.reason,
            p_notes: fullNotes,
            p_created_by: user.email,
            p_variant_id: data.variantId || null
        })

        if (error) {
            console.error("createStockMovementAction RPC error:", error)
            return errorResponse(error.message)
        }

        revalidatePath('/erp/stock-movements')
        revalidatePath('/erp/products')

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
                notes,
                created_by,
                products (
                    name,
                    sku,
                    images,
                    categories ( name )
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

        let reason = data.movement_type;
        if (data.reference_name) {
            reason = data.reference_name;
        }

        const dateObj = new Date(data.created_at);
        const dateStr = dateObj.toLocaleDateString("pt-BR", { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = dateObj.toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });

        return successResponse({
            id: data.id,
            displayId: data.id.split('-')[0].toUpperCase() + '-' + data.id.slice(-4).toUpperCase(),
            date: `${dateStr}, ${timeStr}`,
            product: {
                name: data.products?.name || 'Produto Excluído',
                sku: data.products?.sku || 'N/A',
                image: (data.products?.images && data.products.images.length > 0) ? data.products.images[0] : 'https://img.dudit.com.br/static/mascots/Box.png',
                category: data.products?.categories?.name || 'Sem Categoria',
                previousStock: data.previous_quantity || 0,
                currentStock: data.new_quantity || 0,
            },
            type: data.quantity > 0 ? 'in' : 'out',
            quantity: Math.abs(data.quantity),
            reason: reason,
            user: data.created_by || 'Sistema',
            notes: data.notes || '',
        });

    } catch (err: any) {
        console.error("getStockMovementDetails error:", err)
        return errorResponse("Erro interno ao buscar detalhes")
    }
}
