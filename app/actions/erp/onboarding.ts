"use server"

import { getAdminClient } from "@/lib/supabase/admin"
import { requireUser } from "@/lib/auth/authorization"
import { requirePermission } from "@/lib/permissions/access"
import { createServiceAction } from "@/app/actions/erp/servicos"
import { createProductComprehensiveAction } from "@/app/actions/erp/products"
import { createPaymentMethodAction } from "@/app/actions/erp/payment-methods"
import { safeRevalidateTag, safeRevalidatePath } from "@/lib/utils/revalidation"
import { TAGS } from "@/lib/utils/revalidation-tags"
import { normalizeBusinessInfo } from "@/lib/business-info"

export type ERPOnboardingWizardInput = {
    partnerId: string
    businessType: "services" | "products" | "hybrid"
    goal: "appointments" | "whatsapp_catalog" | "cash_control"
    firstItem?: {
        name: string
        price: number
        durationMinutes?: number
    } | null
    paymentPreference?: "pix" | "card_machine" | "cash" | "online"
    pixKey?: string | null
    pixKeyType?: "cpf" | "cnpj" | "email" | "phone" | "random" | null
}

function detectPixKeyType(key: string): "cpf" | "cnpj" | "email" | "phone" | "random" {
    const clean = key.trim()
    if (clean.includes("@")) return "email"
    const digits = clean.replace(/\D/g, "")
    if (digits.length === 11 && !clean.startsWith("+")) return "cpf"
    if (digits.length === 14) return "cnpj"
    if (digits.length >= 10 && digits.length <= 13) return "phone"
    return "random"
}

export async function completeERPOnboardingWizardAction(input: ERPOnboardingWizardInput) {
    try {
        const user = await requireUser()
        if (!user) {
            return { success: false, error: "Não autenticado" }
        }

        const { partnerId, businessType, goal, firstItem, pixKey, pixKeyType } = input
        if (!partnerId) {
            return { success: false, error: "Parceiro não informado" }
        }

        await requirePermission(partnerId, "products", "create", user)

        const admin = getAdminClient()

        // 1. Busca dados do parceiro e loja
        const [partnerRes, storeRes] = await Promise.all([
            admin.from("partners").select("id, business_info").eq("id", partnerId).single(),
            admin.from("stores").select("id, name").eq("partner_id", partnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle(),
        ])

        if (partnerRes.error || !partnerRes.data) {
            return { success: false, error: "Parceiro não encontrado" }
        }

        const currentBusinessInfo = normalizeBusinessInfo(partnerRes.data.business_info)
        const rawBusinessInfo = (partnerRes.data.business_info && typeof partnerRes.data.business_info === "object")
            ? partnerRes.data.business_info
            : {}

        // 2. Define os recursos ativos ideais para o perfil do autônomo
        let activeResources: string[] = []
        if (businessType === "services") {
            activeResources = [
                "services",
                "appointments",
                "orders",
                "customers",
                "financial",
                "showcase",
                "quotes",
            ]
        } else if (businessType === "products") {
            activeResources = [
                "products",
                "orders",
                "pos",
                "deliveries",
                "customers",
                "financial",
                "showcase",
                "stockMovements",
            ]
        } else {
            // hybrid
            activeResources = [
                "products",
                "services",
                "appointments",
                "orders",
                "pos",
                "deliveries",
                "customers",
                "financial",
                "showcase",
                "stockMovements",
                "quotes",
            ]
        }

        const updatedBusinessInfo = {
            ...rawBusinessInfo,
            mode: currentBusinessInfo.mode === "desapego" ? "desapego" : "quick",
            activeResources,
            onboardingCompleted: true,
            onboardingGoal: goal,
            businessType,
            onboardingCompletedAt: new Date().toISOString(),
        }

        // 3. Atualiza partners table
        const { error: updatePartnerError } = await admin
            .from("partners")
            .update({ business_info: updatedBusinessInfo })
            .eq("id", partnerId)

        if (updatePartnerError) {
            console.error("[ONBOARDING] Erro ao atualizar business_info do parceiro:", updatePartnerError)
            return { success: false, error: "Erro ao salvar configurações do negócio" }
        }

        const storeId = storeRes.data?.id || null

        // 4. Cadastra o primeiro item se fornecido
        let createdItemId: string | null = null
        if (firstItem && firstItem.name?.trim() && Number(firstItem.price) > 0) {
            const trimmedName = firstItem.name.trim()
            const numPrice = Number(firstItem.price)

            if (businessType === "services" || businessType === "hybrid") {
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

        // 5. Cadastra método Pix simples se chave foi fornecida
        if (pixKey && pixKey.trim()) {
            const cleanKey = pixKey.trim()
            const keyType = pixKeyType || detectPixKeyType(cleanKey)
            try {
                await createPaymentMethodAction({
                    partnerId,
                    storeId,
                    name: "Pix",
                    paymentType: "pix",
                    pixKey: cleanKey,
                    pixKeyType: keyType,
                    isDefault: true,
                    isOnlineDefault: true,
                    isActive: true,
                })
            } catch (err) {
                console.warn("[ONBOARDING] Falha ao cadastrar método Pix inicial:", err)
            }
        }

        // 6. Invalidação de cache
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
