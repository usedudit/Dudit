"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { createAdminClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/services/timeline.service"
import { errorResponse, successResponse } from "@/lib/utils/action-helpers"
import { invalidateProductCache } from "@/lib/cache/invalidation"
import { revalidateStockMovements } from "@/lib/utils/revalidation"
import { reserveOrderInventory, releaseOrderInventory, finalizeOrderInventory } from "@/lib/stock/reservations"

export type AppointmentItemInput = {
    id?: string
    product_id?: string | null
    variant_id?: string | null
    service_id?: string | null
    name: string
    quantity: number
    usage_type: 'consumed' | 'returnable' | 'reference'
}

export async function getAppointmentItemsAction(appointmentId: string) {
    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("ERP não selecionado")

        await requirePermission(ctx.partnerId, "appointments", "view")
        const supabase = createAdminClient()

        const { data, error } = await supabase
            .from("appointment_items")
            .select(`
                id,
                appointment_id,
                product_id,
                variant_id,
                service_id,
                name,
                quantity,
                usage_type,
                created_at,
                updated_at,
                products:product_id(name, sku, images, stock_quantity),
                services:service_id(name)
            `)
            .eq("appointment_id", appointmentId)
            .order("created_at", { ascending: true })

        if (error) {
            console.error("getAppointmentItemsAction error:", error)
            return errorResponse("Erro ao buscar itens do agendamento")
        }

        const items = (data || []).map((item: any) => ({
            id: item.id,
            appointmentId: item.appointment_id,
            productId: item.product_id,
            variantId: item.variant_id,
            serviceId: item.service_id,
            name: item.name,
            quantity: item.quantity,
            usageType: item.usage_type,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            product: item.products ? {
                name: item.products.name,
                sku: item.products.sku,
                image: item.products.images?.[0] || null,
                stock: item.products.stock_quantity || 0,
            } : null,
            serviceName: item.services?.name || null,
        }))

        return successResponse(items)
    } catch (err: any) {
        console.error("getAppointmentItemsAction error:", err)
        return errorResponse("Erro interno ao buscar itens")
    }
}

export async function saveAppointmentItemsAction(
    appointmentId: string,
    items: AppointmentItemInput[]
) {
    try {
        const user = await requireUser()
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return errorResponse("ERP não selecionado")
        const partnerId = ctx.partnerId
        const userId = user.id

        await requirePermission(partnerId, "appointments", "edit")
        const supabase = createAdminClient()

        // Get existing items to track changes for history
        const { data: existingItems } = await supabase
            .from("appointment_items")
            .select("id, name, quantity, usage_type")
            .eq("appointment_id", appointmentId)

        const existingMap = new Map((existingItems || []).map((i: any) => [i.id, i]))
        const newIds = new Set(items.filter(i => !i.id).map(() => crypto.randomUUID()))
        const incomingIds = new Set(items.filter(i => i.id).map(i => i.id))

        // Delete items that were removed
        const toDelete = (existingItems || [])
            .filter((e: any) => !incomingIds.has(e.id))
            .map((e: any) => e.id)

        if (toDelete.length > 0) {
            const { error: delError } = await supabase
                .from("appointment_items")
                .delete()
                .in("id", toDelete)

            if (delError) {
                console.error("saveAppointmentItemsAction delete error:", delError)
                return errorResponse("Erro ao remover itens antigos")
            }
        }

        // Upsert items
        for (const item of items) {
            const payload = {
                appointment_id: appointmentId,
                product_id: item.product_id || null,
                variant_id: item.variant_id || null,
                service_id: item.service_id || null,
                name: item.name,
                quantity: item.quantity,
                usage_type: item.usage_type,
            }

            if (item.id && existingMap.has(item.id)) {
                const { error: updError } = await supabase
                    .from("appointment_items")
                    .update(payload)
                    .eq("id", item.id)

                if (updError) {
                    console.error("saveAppointmentItemsAction update error:", updError)
                    return errorResponse(`Erro ao atualizar item "${item.name}"`)
                }
            } else {
                const { error: insError } = await supabase
                    .from("appointment_items")
                    .insert({ ...payload })

                if (insError) {
                    console.error("saveAppointmentItemsAction insert error:", insError)
                    return errorResponse(`Erro ao adicionar item "${item.name}"`)
                }
            }
        }

        // Log audit event
        const changeLines: string[] = []
        const totalItems = items.length
        changeLines.push(`atualizou itens de estoque (${totalItems} item${totalItems !== 1 ? 'ns' : ''})`)

        await logAuditEvent({
            partnerId,
            actorUserId: userId,
            entityType: "appointment",
            entityId: appointmentId,
            actionType: "updated",
            changeLines,
            metadata: { itemCount: totalItems },
            source: "manual",
        })

        // Invalidate caches for affected products
        const productIds = Array.from(new Set(items.filter(i => i.product_id).map(i => i.product_id!)))
        for (const pid of productIds) {
            await invalidateProductCache(pid, partnerId, 'update', { silent: true })
        }
        revalidateStockMovements(partnerId)

        return successResponse({ count: items.length })
    } catch (err: any) {
        console.error("saveAppointmentItemsAction error:", err)
        return errorResponse("Erro interno ao salvar itens")
    }
}

export async function handleAppointmentItemsStockMovement(params: {
    appointmentId: string
    partnerId: string
    oldStatus: string | null
    newStatus: string
    userId: string
}) {
    const supabase = createAdminClient()
    const { appointmentId, partnerId, oldStatus, newStatus, userId } = params

    // 1. Movement Classification
    const isInProgress = (s: string | null) => s === 'Em andamento' || s === 'Iniciado'
    const isCompleted = (s: string | null) => ['Concluído', 'Pago', 'Pago Parcialmente', 'Partially Paid'].includes(s || "")
    const isCancelled = (s: string | null) => ['Cancelado', 'Ausência'].includes(s || "")
    const isWaiting = (s: string | null) => ['Reservado', 'Confirmado', 'Aguardando'].includes(s || "")

    let action: 'reserve' | 'finalize' | 'release' | null = null

    if (isWaiting(oldStatus) && isInProgress(newStatus)) {
        action = 'reserve'
    } else if (isInProgress(oldStatus) && isCompleted(newStatus)) {
        action = 'finalize'
    } else if (isInProgress(oldStatus) && isCancelled(newStatus)) {
        action = 'release'
    } else if (isWaiting(oldStatus) && isCompleted(newStatus)) {
        action = 'finalize'
    }

    if (!action) return

    // 2. Fetch items from appointment_items table
    const { data: appointmentItems } = await supabase
        .from("appointment_items")
        .select("product_id, variant_id, quantity, usage_type")
        .eq("appointment_id", appointmentId)

    if (!appointmentItems || appointmentItems.length === 0) return

    // 3. Execute Movements
    if (action === 'reserve') {
        // Reserve returnable items only
        const returnableItems = appointmentItems
            .filter((i: any) => i.usage_type === 'returnable' && i.product_id)
            .map((i: any) => ({
                product_id: i.product_id,
                variant_id: i.variant_id || null,
                quantity: Number(i.quantity),
            }))

        if (returnableItems.length > 0) {
            await reserveOrderInventory({
                client: supabase,
                partnerId,
                orderId: appointmentId,
                items: returnableItems,
            })
        }
    } else if (action === 'finalize') {
        // Consumable items → finalize (deduct from stock)
        const consumableItems = appointmentItems
            .filter((i: any) => i.usage_type === 'consumed' && i.product_id)
            .map((i: any) => ({
                product_id: i.product_id,
                variant_id: i.variant_id || null,
                quantity: Number(i.quantity),
            }))

        // Returnable items → release back to stock
        const returnableItems = appointmentItems
            .filter((i: any) => i.usage_type === 'returnable' && i.product_id)
            .map((i: any) => ({
                product_id: i.product_id,
                variant_id: i.variant_id || null,
                quantity: Number(i.quantity),
            }))

        if (consumableItems.length > 0) {
            await finalizeOrderInventory({
                client: supabase,
                partnerId,
                orderId: appointmentId,
                items: consumableItems,
                createdBy: userId,
                reason: "Uso em serviço",
                notes: `Agendamento concluído`,
            })
        }

        if (returnableItems.length > 0) {
            await releaseOrderInventory({
                client: supabase,
                partnerId,
                orderId: appointmentId,
                items: returnableItems,
            })
        }
    } else if (action === 'release') {
        // Release all reserved items back to stock
        const allItems = appointmentItems
            .filter((i: any) => i.product_id)
            .map((i: any) => ({
                product_id: i.product_id,
                variant_id: i.variant_id || null,
                quantity: Number(i.quantity),
            }))

        if (allItems.length > 0) {
            await releaseOrderInventory({
                client: supabase,
                partnerId,
                orderId: appointmentId,
                items: allItems,
            })
        }
    }

    // 4. Invalidate Caches
    const productIds = Array.from(new Set(appointmentItems.filter((i: any) => i.product_id).map((i: any) => i.product_id))) as string[]
    for (const pid of productIds) {
        await invalidateProductCache(pid, partnerId, 'update', { silent: true })
    }
    revalidateStockMovements(partnerId)
}

export async function searchProductsForAppointmentItems(query: string) {
    if (!query || query.trim().length < 2) return []

    try {
        const ctx = await getCurrentPartnerContext()
        if (!ctx?.partnerId) return []

        await requirePermission(ctx.partnerId, "stock_movements", "view")
        const supabase = createAdminClient()
        const searchTerm = `%${query}%`

        const { data, error } = await supabase
            .from("products")
            .select("id, name, sku, stock_quantity, images, has_variants")
            .eq("partner_id", ctx.partnerId)
            .eq("is_active", true)
            .or(`name.ilike.${searchTerm},sku.ilike.${searchTerm}`)
            .limit(10)

        if (error) {
            console.error("Error searching products for appointment items:", error)
            return []
        }

        return data.map((p: any) => ({
            id: p.id,
            name: p.name,
            sku: p.sku || 'N/A',
            stock: p.stock_quantity || 0,
            image: p.images && p.images.length > 0 ? p.images[0] : null,
            hasVariants: p.has_variants || false,
        }))
    } catch (err) {
        console.error("searchProductsForAppointmentItems error:", err)
        return []
    }
}
