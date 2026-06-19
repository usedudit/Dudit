"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function getQuickModeHomeDataAction(partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }

        // Basic check for view permission on general modules
        await requirePermission(partnerId, "products", "view")

        const supabase = createAdminClient()

        // 1. Fetch Partner Mode to verify
        const { data: partner, error: partnerError } = await supabase
            .from("partners")
            .select("business_info, store_name")
            .eq("id", partnerId)
            .single()

        if (partnerError || !partner) throw new Error("Parceiro não encontrado")

        const businessInfo = normalizeBusinessInfo(partner.business_info)
        if (businessInfo.mode !== "quick") {
            return { success: false, error: "Modo inválido para esta página", redirect: "/erp/dashboard" }
        }

        // 2. Fetch Stats
        // - Active items (products + services)
        // - Received orders
        // - Views (mocked for now)

        const [productsCount, servicesCount, ordersCount] = await Promise.all([
            supabase.from("products").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true),
            supabase.from("services").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true),
            supabase.from("orders").select("id", { count: "exact", head: true }).eq("partner_id", partnerId)
        ])

        const stats = {
            activeItems: (productsCount.count || 0) + (servicesCount.count || 0),
            receivedOrders: ordersCount.count || 0,
        }

        // 3. Fetch Recent Items (Products + Services merged)
        const [recentProducts, recentServices] = await Promise.all([
            supabase.from("products")
                .select("id, name, price, images, is_active, created_at, type:id") // type trick to identify
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })
                .limit(4),
            supabase.from("services")
                .select("id, name, price, images, is_active, created_at, type:id")
                .eq("partner_id", partnerId)
                .order("created_at", { ascending: false })
                .limit(4)
        ])

        const items = [
            ...(recentProducts.data || []).map((p: any) => ({ ...p, itemType: 'product' })),
            ...(recentServices.data || []).map((s: any) => ({ ...s, itemType: 'service' }))
        ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 8)

        // 4. Fetch Recent Orders
        const { data: recentOrders } = await supabase
            .from("orders")
            .select("id, order_number, customer_name, total_amount, situation, created_at, delivery_status")
            .eq("partner_id", partnerId)
            .order("created_at", { ascending: false })
            .limit(5)

        return {
            success: true,
            data: {
                stats,
                items,
                recentOrders: recentOrders || [],
                storeName: partner.store_name,
                businessInfo
            }
        }

    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar dados do Início" }
    }
}

export async function upgradeToERPAction(partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }

        // Only owners should upgrade
        const supabase = createAdminClient()
        const { data: partnerAccess } = await supabase
            .from("partner_users")
            .select("role_id")
            .eq("partner_id", partnerId)
            .eq("user_id", user.id)
            .single()

        // If not found in partner_users, check if they are the direct owner in partners table
        const { data: partnerData } = await supabase
            .from("partners")
            .select("user_id, business_info")
            .eq("id", partnerId)
            .single()

        const isOwner = (partnerAccess?.role_id === "owner") || (partnerData?.user_id === user.id)

        if (!isOwner) return { success: false, error: "Apenas o proprietário pode alterar o modo de negócio." }

        const businessInfo = normalizeBusinessInfo(partnerData?.business_info)
        const updatedInfo = {
            ...businessInfo,
            mode: "erp"
        }

        const { error: updateError } = await supabase
            .from("partners")
            .update({ business_info: updatedInfo })
            .eq("id", partnerId)

        if (updateError) throw updateError

        revalidatePath("/erp")
        return { success: true }

    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao atualizar para modo ERP" }
    }
}
