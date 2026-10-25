"use server"

import { createAdminClient } from "@/lib/supabase/server"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { getCurrentPartnerContext } from "@/lib/auth/partner-context"
import { normalizeBusinessInfo } from "@/lib/business-info"
import { revalidatePath } from "next/cache"
import { safeRevalidateTag } from "@/lib/utils/revalidation"
import { redirect } from "next/navigation"
import { getDashboardLayout } from "@/lib/dashboard-engine/engine"
import { scopeActiveOnly } from "@/lib/supabase/query-helpers"
import { getCachedErpPage } from "@/lib/data/erp-page-cache"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { getActiveStoreId } from "@/lib/auth/partner-context"

export async function getQuickModeHomeDataAction(partnerId: string) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }

        // Basic check for view permission on general modules
        await requirePermission(partnerId, "products", "view")

        // Authorization stays outside the cache. The cached value contains only
        // partner-scoped read data and is invalidated by the same entity tags as
        // the ERP mutations. This avoids repeating the dashboard bootstrap on
        // every navigation while keeping tenant boundaries intact.
        const data = await getCachedErpPage(
            ["erp-quick-mode-home", partnerId],
            [
                TAGS.partner(partnerId),
                TAGS.products(partnerId),
                TAGS.services(partnerId),
                TAGS.orders(partnerId),
            ],
            async () => {
                const supabase = createAdminClient()

                // Single parallel batch for all partner-scoped queries after authorization is validated
                const [
                    partnerRes,
                    storeRes,
                    productsCountRes,
                    servicesCountRes,
                    ordersCountRes,
                    recentProductsRes,
                    recentServicesRes,
                    recentOrdersRes
                ] = await Promise.all([
                    supabase.from("partners").select("business_info").eq("id", partnerId).single(),
                    supabase.from("stores").select("name").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
                    scopeActiveOnly(supabase.from("products").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true)),
                    scopeActiveOnly(supabase.from("services").select("id", { count: "exact", head: true }).eq("partner_id", partnerId).eq("is_active", true)),
                    supabase.from("orders").select("id", { count: "exact", head: true }).eq("partner_id", partnerId),
                    scopeActiveOnly(supabase.from("products")
                        .select("id, name, price, images, is_active, created_at, type:id")
                        .eq("partner_id", partnerId))
                        .order("created_at", { ascending: false })
                        .limit(4),
                    scopeActiveOnly(supabase.from("services")
                        .select("id, name, price, images, is_active, created_at, type:id")
                        .eq("partner_id", partnerId))
                        .order("created_at", { ascending: false })
                        .limit(4),
                    supabase.from("orders")
                        .select("id, order_number, customer_name, total_amount, situation, created_at, delivery_status")
                        .eq("partner_id", partnerId)
                        .order("created_at", { ascending: false })
                        .limit(5)
                ])

                if (partnerRes.error || !partnerRes.data) throw new Error("Parceiro não encontrado")

                const businessInfo = normalizeBusinessInfo(partnerRes.data.business_info)
                const items = [
                    ...(recentProductsRes.data || []).map((p: any) => ({ ...p, itemType: 'product' })),
                    ...(recentServicesRes.data || []).map((s: any) => ({ ...s, itemType: 'service' }))
                ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    .slice(0, 8)

                return {
                    stats: {
                        activeItems: (productsCountRes.count || 0) + (servicesCountRes.count || 0),
                        receivedOrders: ordersCountRes.count || 0,
                    },
                    items,
                    recentOrders: recentOrdersRes.data || [],
                    storeName: storeRes.data?.name || "",
                    businessInfo,
                }
            },
            30,
        )

        return { success: true, data }

    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar dados do Início" }
    }
}

import { getDefaultResourcesForModeAndCategory } from "@/lib/system-resources"
import type { BusinessMode } from "@/lib/business-info"

export async function upgradeToERPAction(partnerId: string) {
    return switchBusinessModeAction(partnerId, "erp")
}

export async function switchBusinessModeAction(partnerId: string, targetMode: BusinessMode) {
    try {
        const user = await requireUser()
        if (!user) return { success: false, error: "Não autenticado" }

        const supabase = createAdminClient()
        const { data: partnerAccess } = await supabase
            .from("partner_users")
            .select("role_id")
            .eq("partner_id", partnerId)
            .eq("user_id", user.id)
            .maybeSingle()

        // If not found in partner_users, check if they are the direct owner in partners table
        const { data: partnerData } = await supabase
            .from("partners")
            .select("user_id, business_info, category:category_id(name)")
            .eq("id", partnerId)
            .single()

        const isOwner = (partnerAccess?.role_id === "owner") || (partnerData?.user_id === user.id)

        if (!isOwner) return { success: false, error: "Apenas o proprietário pode alterar o modo de negócio." }

        const businessInfo = normalizeBusinessInfo(partnerData?.business_info)
        const defaultResources = getDefaultResourcesForModeAndCategory(targetMode, (partnerData as any)?.category?.name || "")
        const updatedInfo = {
            ...businessInfo,
            mode: targetMode,
            activeResources: defaultResources,
        }

        const { error: updateError } = await supabase
            .from("partners")
            .update({ business_info: updatedInfo })
            .eq("id", partnerId)

        if (updateError) throw updateError

        revalidatePath("/erp")
        // Invalidar o cache de acesso do usuário para que o businessInfo atualizado seja carregado
        await safeRevalidateTag(TAGS.userAccess(user.id))
        return { success: true }

    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao alterar modo de negócio" }
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

        // Verifica se pelo menos 1 dia está habilitado nos horários
        const openingHours = store.opening_hours as any
        const hasHours = !!openingHours && typeof openingHours === "object" && Object.values(openingHours).some(
            (day: any) => day?.enabled === true
        )

        const hasItems = ((productsCount.count || 0) + (servicesCount.count || 0)) > 0

        // Considera completo se tem logo OU (banner e não é o default)
        const hasLogo = !!store.logo_url
        const hasCustomBanner = !!store.banner_url && !store.banner_url.includes('default/')
        const hasShowcase = hasLogo || hasCustomBanner

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
                path: hasItems ? "" : "/erp/produtos?create=true"
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

        const activeStoreId = await getActiveStoreId()
        const layout = await getCachedErpPage(
            ["erp-dashboard-layout", partnerId, activeStoreId || "default-store"],
            [
                TAGS.partner(partnerId),
                TAGS.products(partnerId),
                TAGS.services(partnerId),
                TAGS.orders(partnerId),
                TAGS.transactions(partnerId),
            ],
            () => getDashboardLayout(partnerId, activeStoreId),
            30,
        )
        return { success: true, data: layout }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar o dashboard inteligente" }
    }
}
