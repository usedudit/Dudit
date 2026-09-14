"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { createServiceAction } from "@/app/actions/erp/servicos"
import { createProductComprehensiveAction } from "@/app/actions/erp/products"
import { safeRevalidateTag, safeRevalidatePath } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"

export type ERPOnboardingWizardInput = {
    partnerId: string
    goals?: string[]
    firstItem?: {
        name: string
        price: number
        itemType?: "service" | "product"
        durationMinutes?: number
    } | null
}

export async function completeERPOnboardingWizardAction(input: ERPOnboardingWizardInput) {
    try {
        const user = await requireUser()
        if (!user) {
            return { success: false, error: "Não autenticado" }
        }

        const { partnerId, goals, firstItem } = input
        if (!partnerId) {
            return { success: false, error: "Parceiro não informado" }
        }

        await requirePermission(partnerId, "products", "create", user)

        const admin = getAdminClient()

        // 1. Busca dados do parceiro e loja
        const [partnerRes, storeRes] = await Promise.all([
            admin.from("partners").select("id, business_info").eq("id", partnerId).single(),
            admin.from("stores").select("id, name, business_info").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
        ])

        if (partnerRes.error || !partnerRes.data) {
            return { success: false, error: "Parceiro não encontrado" }
        }

        const rawBusinessInfo = (partnerRes.data.business_info && typeof partnerRes.data.business_info === "object")
            ? partnerRes.data.business_info
            : {}

        const updatedBusinessInfo = {
            ...rawBusinessInfo,
            onboardingCompleted: true,
            onboardingGoals: goals || [],
            onboardingCompletedAt: new Date().toISOString(),
        }

        // Determinar order_flow padrão baseado no modo de negócio
        const businessMode = rawBusinessInfo.mode || "erp"
        const isQuickMode = businessMode === "quick" || businessMode === "showcase"
        const defaultOrderFlow = isQuickMode ? "whatsapp" : "dudit"

        // 2. Atualiza partners table (e stores table se houver)
        const updatePromises: Promise<any>[] = [
            admin.from("partners").update({ 
                business_info: updatedBusinessInfo,
                order_flow: defaultOrderFlow,
            }).eq("id", partnerId),
        ]

        if (storeRes.data?.id) {
            const rawStoreBusinessInfo = (storeRes.data.business_info && typeof storeRes.data.business_info === "object")
                ? storeRes.data.business_info
                : {}
            updatePromises.push(
                admin.from("stores").update({
                    business_info: {
                        ...rawStoreBusinessInfo,
                        onboardingCompleted: true,
                        onboardingGoals: goals || [],
                        onboardingCompletedAt: new Date().toISOString(),
                    },
                }).eq("id", storeRes.data.id)
            )
        }

        const [partnerUpdateRes] = await Promise.all(updatePromises)

        if (partnerUpdateRes?.error) {
            console.error("[ONBOARDING] Erro ao atualizar business_info do parceiro:", partnerUpdateRes.error)
            return { success: false, error: "Erro ao salvar configurações do negócio" }
        }

        const storeId = storeRes.data?.id || null

        // 3. Cadastra o primeiro item se fornecido
        let createdItemId: string | null = null
        if (firstItem && firstItem.name?.trim() && Number(firstItem.price) > 0) {
            const trimmedName = firstItem.name.trim()
            const numPrice = Number(firstItem.price)
            const itemType = firstItem.itemType || "service"

            if (itemType === "service") {
                try {
                    const res = await createServiceAction({
                        partnerId,
                        storeId,
                        name: trimmedName,
                        price: numPrice,
                        duration_minutes: Math.max(10, Number(firstItem.durationMinutes || 45)),
                        service_type: "in_person",
                        show_in_marketplace: true,
                    })
                    if (res?.success && res.data?.id) {
                        createdItemId = res.data.id
                    }
                } catch (err) {
                    console.warn("[ONBOARDING] Falha ao criar serviço inicial:", err)
                }
            } else {
                try {
                    const res = await createProductComprehensiveAction({
                        partnerId,
                        storeId: storeId || "",
                        name: trimmedName,
                        price: numPrice,
                        stockQuantity: 1,
                        isActive: true,
                        showInMarketplace: true,
                    })
                    if (res?.success && (res as any).data?.id) {
                        createdItemId = (res as any).data.id
                    }
                } catch (err) {
                    console.warn("[ONBOARDING] Falha ao criar produto inicial:", err)
                }
            }
        }

        // 4. Invalidação de cache
        try {
            await safeRevalidateTag(TAGS.partner(partnerId))
            await safeRevalidateTag(TAGS.products(partnerId))
            await safeRevalidateTag(TAGS.services(partnerId))
            await safeRevalidatePath("/erp/inicio")
        } catch {
            // Ignorar erros de revalidação em ambiente de teste/SSR
        }

        return {
            success: true,
            createdItemId,
            businessInfo: updatedBusinessInfo,
        }
    } catch (e: any) {
        console.error("[ONBOARDING] Erro inesperado no wizard:", e)
        return { success: false, error: e.message || "Erro ao concluir o onboarding" }
    }
}
