"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export type TransactionContactRow = {
    id: string
    name: string
    type: string
    description: string | null
}

const CONTACT_TYPES = new Set(["customer", "supplier", "service", "employee", "partner", "other"])

function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, " ")
}

export async function listAllTransactionContactsAction(
    partnerId: string,
): Promise<{ success: true; data: TransactionContactRow[] } | { success: false; error: string }> {
    try {
        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()
        const { data, error } = await supabase
            .from("transaction_contacts")
            .select("id, name, type, description")
            .eq("partner_id", partnerId)
            .order("name")

        if (error) throw error
        return { success: true, data: (data || []) as TransactionContactRow[] }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar contatos" }
    }
}

export async function listTransactionContactsByTypeAction(
    partnerId: string,
    contactType: string,
): Promise<{ success: true; data: TransactionContactRow[] } | { success: false; error: string }> {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        await requirePartnerAccessWithPermission(partnerId, "financial", "view")
        if (!CONTACT_TYPES.has(contactType)) throw new Error("Tipo de contato inválido.")

        const supabase = await getSupabaseServerClient()
        const { data, error } = await supabase
            .from("transaction_contacts")
            .select("id, name, type, description")
            .eq("partner_id", partnerId)
            .eq("type", contactType)
            .order("name")

        if (error) throw error
        return { success: true, data: (data || []) as TransactionContactRow[] }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar contatos" }
    }
}

export async function createTransactionContactAction(input: {
    partnerId: string
    name: string
    type: "customer" | "supplier" | "service" | "employee" | "partner" | "other"
    description?: string | null
}): Promise<{ success: true; data: TransactionContactRow } | { success: false; error: string }> {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        await requirePartnerAccessWithPermission(input.partnerId, "financial", "edit")
        if (!input.name?.trim()) throw new Error("O nome é obrigatório.")
        if (!CONTACT_TYPES.has(input.type)) throw new Error("Tipo de contato inválido.")
        const normalizedName = normalizeName(input.name)

        const supabase = await getSupabaseServerClient()
        const { data: duplicate } = await supabase
            .from("transaction_contacts")
            .select("id")
            .eq("partner_id", input.partnerId)
            .ilike("name", normalizedName)
            .eq("type", input.type)
            .limit(1)
            .maybeSingle()
        if (duplicate?.id) throw new Error("Já existe um contato com esse nome para esse tipo.")

        const { data, error } = await supabase
            .from("transaction_contacts")
            .insert({
                partner_id: input.partnerId,
                name: normalizedName,
                type: input.type,
                description: input.description?.trim() || null,
            })
            .select("id, name, type, description")
            .single()

        if (error) throw error
        return { success: true, data: data as TransactionContactRow }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao criar contato" }
    }
}
