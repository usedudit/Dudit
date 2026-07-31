"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getDashboardLayout } from "@/lib/dashboard-engine/engine"
import { scopeActiveOnly } from "@/lib/supabase/query-helpers"

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
            .select("business_info")
            .eq("id", partnerId)
            .single()

        if (partnerError || !partner) throw new Error("Parceiro não encontrado")

        const { data: store } = await supabase
            .from("stores")
            .select("name")
            .eq("partner_id", partnerId)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle()

        const businessInfo = normalizeBusinessInfo(partner.business_info)

        // 2. Fetch Stats
        // - Active items (products + services)
        // - Received orders
        // - Views (mocked for now)

        const [productsCount, servicesCount, ordersCount] = await Promise.all([
            scopeActiveOnly(supabase.from("products").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true)),
            scopeActiveOnly(supabase.from("services").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true)),
            supabase.from("orders").select("id", { count: "exact", head: true }).eq("partner_id", partnerId)
        ])

        const stats = {
            activeItems: (productsCount.count || 0) + (servicesCount.count || 0),
            receivedOrders: ordersCount.count || 0,
        }

        // 3. Fetch Recent Items (Products + Services merged)
        const [recentProducts, recentServices] = await Promise.all([
            scopeActiveOnly(supabase.from("products")
                .select("id, name, price, images, is_active, created_at, type:id") // type trick to identify
                .eq("partner_id", partnerId))
                .order("created_at", { ascending: false })
                .limit(4),
            scopeActiveOnly(supabase.from("services")
                .select("id, name, price, images, is_active, created_at, type:id")
                .eq("partner_id", partnerId))
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
                storeName: store?.name || "",
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

export async function getOnboardingStatusAction(partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }

        const supabase = createAdminClient()

        // 1. Fetch Store Data
        const { data: store, error: storeError } = await supabase
            .from("stores")
            .select("id, name, phone, category_id, logo_url, banner_url, opening_hours, is_showcase_active, addresses!store_id(*)")
            .eq("partner_id", partnerId)
            .order("is_headquarters", { ascending: false })
            .limit(1)
            .maybeSingle()

        if (storeError || !store) throw new Error("Loja não encontrada")

        // 3. Fetch Payment Methods
        const { data: paymentMethods } = await supabase
            .from("payment_methods")
            .select("id, type, is_active")
            .eq("partner_id", partnerId)

        // 4. Fetch Products/Services count
        const [productsCount, servicesCount] = await Promise.all([
            scopeActiveOnly(supabase.from("products").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true)),
            scopeActiveOnly(supabase.from("services").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true)),
        ])

        const addresses = store.addresses || []
        const hasPix = (paymentMethods || []).some((m: any) => (m.type === 'pix' || m.payment_type === 'pix') && m.is_active)
        const hasAddress = (addresses || []).length > 0 && !!(addresses as any)[0].zip_code
        const hasHours = !!store.opening_hours && Object.keys(store.opening_hours as any).length > 0
        const hasItems = ((productsCount.count || 0) + (servicesCount.count || 0)) > 0
        const hasShowcase = !!store.logo_url && !!store.banner_url && !store.banner_url.includes('default/')

        // Checks
        const checklist = {
            profile: {
                completed: !!store.name && !!store.phone && !!store.category_id,
                title: "Dados Gerais e Segmento",
                description: "Defina o nome da loja, categoria principal e número de WhatsApp.",
                tab: "dados-do-negocio"
            },
            address: {
                completed: hasAddress,
                title: "Endereço Comercial",
                description: "Cadastre o endereço da sua loja para cálculo de rotas e entrega.",
                tab: "dados-do-negocio"
            },
            hours: {
                completed: hasHours,
                title: "Horários de Funcionamento",
                description: "Defina os horários em que seu estabelecimento aceita pedidos.",
                tab: "dados-do-negocio"
            },
            payments: {
                completed: hasPix,
                title: "Forma de Recebimento (Pix)",
                description: "Cadastre uma chave Pix ativa para receber pagamentos diretos.",
                tab: "formas-de-pagamento"
            },
            items: {
                completed: hasItems,
                title: "Cadastrar Produto ou Serviço",
                description: "Adicione pelo menos um item ativo ao seu catálogo.",
                path: hasItems ? "" : "/erp/products?create=true"
            },
            showcase: {
                completed: hasShowcase,
                title: "Visual da sua Vitrine",
                description: "Personalize sua logo e banner para atrair clientes.",
                tab: "vitrine"
            }
        }

        return {
            success: true,
            data: {
                storeName: store.name,
                isShowcaseActive: store.is_showcase_active,
                checklist
            }
        }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao obter status de onboarding" }
    }
}

export async function getUnifiedDashboardAction(partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }

        // Basic check for view permission on general modules
        await requirePermission(partnerId, "products", "view")

        const layout = await getDashboardLayout(partnerId)
        return { success: true, data: layout }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar o dashboard inteligente" }
    }
}


