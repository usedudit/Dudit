"use server"

import { requireUser } from "@/lib/auth/authorization"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { getAdminClient } from "@/lib/supabase/admin"
import {
    createNotification,
    createNotificationsForUsers,
    getPartnerTeamUserIds,
    buildIdempotencyKey,
} from "@/lib/services/notification.service"
import { buildNotificationContent } from "@/lib/notifications/templates"
import { getNotificationRecipientRoles } from "@/lib/notifications/audience"
import { fetchLowStockProducts } from "@/lib/erp/replenishment"

export async function notifyLowStockAction(productId: string) {
    try {
        const user = await requireUser()
        if (!user) return

        const admin = getAdminClient()
        const { data: product } = await admin
            .from("products")
            .select("id, name, stock_quantity, min_stock, partner_id")
            .eq("id", productId)
            .maybeSingle()

        if (!product) return
        if (!product.min_stock || product.min_stock <= 0) return
        if ((Number(product.stock_quantity) || 0) > Number(product.min_stock)) return

        const userIds = await getPartnerTeamUserIds(
            product.partner_id,
            getNotificationRecipientRoles("low_stock"),
        )
        const { title, message } = buildNotificationContent("low_stock", "seller", {
            productName: product.name,
            stock: String(product.stock_quantity),
            minStock: String(product.min_stock),
        })

        await createNotificationsForUsers(userIds, (uid) => ({
            userId: uid,
            type: "low_stock" as const,
            title,
            message,
            entityType: "product" as const,
            entityId: product.id,
            data: {
                partner_id: product.partner_id,
                productName: product.name,
                stock: product.stock_quantity,
                minStock: product.min_stock,
            },
            idempotencyKey: buildIdempotencyKey("low_stock", "product", product.id, uid),
        }))
    } catch (err) {
        console.error("[notifications] low stock failed", err instanceof Error ? err.message : err)
    }
}

export async function notifyReplenishmentSuggestedAction() {
    try {
        const user = await requireUser()
        if (!user) return

        const partnerContext = await getCurrentPartnerContext()
        const partnerId = partnerContext?.partnerId
        if (!partnerId) return

        const admin = getAdminClient()
        // Mesmo critério da aba Sugestões & Oportunidades: só produtos com
        // estoque no/abaixo do mínimo e escopados pela loja ativa.
        const lowStockProducts = await fetchLowStockProducts(admin, {
            partnerId,
            storeId: partnerContext?.activeStoreId ?? null,
            select: "id, stock_quantity, min_stock",
        })

        if (lowStockProducts.length === 0) return

        const count = lowStockProducts.length
        const userIds = await getPartnerTeamUserIds(
            partnerId,
            getNotificationRecipientRoles("replenishment_suggested"),
        )
        const { title, message } = buildNotificationContent("replenishment_suggested", "seller", {
            count: String(count),
        })

        await createNotificationsForUsers(userIds, (uid) => ({
            userId: uid,
            type: "replenishment_suggested" as const,
            title,
            message,
            entityType: "product" as const,
            entityId: null,
            data: { partner_id: partnerId, count },
            idempotencyKey: buildIdempotencyKey("replenishment_suggested", "product", partnerId, uid),
            // Mantém o aviso único por usuário, mas atualiza o texto quando a
            // quantidade de produtos a repor muda (evita contagem defasada).
            refreshExisting: true,
        }))
    } catch (err) {
        console.error("[notifications] replenishment suggested failed", err instanceof Error ? err.message : err)
    }
}
