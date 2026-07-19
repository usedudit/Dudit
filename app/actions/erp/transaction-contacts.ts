"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePermission } from "@/lib/permissions/access"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"

export type TransactionContactRow = {
    id: string
    name: string
    type: string
    description: string | null
    store_id: string | null
}

const CONTACT_TYPES = new Set(["customer", "supplier", "service", "employee", "partner", "other"])

function normalizeName(value: string) {
    return value.trim().replace(/\s+/g, " ")
}

export async function listAllTransactionContactsAction(
    partnerId: string,
    storeId?: string | null,
): Promise<{ success: true; data: TransactionContactRow[] } | { success: false; error: string }> {
    try {
        await requirePermission(partnerId, "financial", "view")
        const supabase = await getSupabaseServerClient()
        let query = supabase
            .from("transaction_contacts")
            .select("id, name, type, description, store_id")
            .eq("partner_id", partnerId)

        if (storeId !== undefined) {
            if (storeId === null) {
                query = query.is("store_id", null)
            } else {
                query = query.eq("store_id", storeId)
            }
        }

        const { data, error } = await query.order("name")
        if (error) throw error
        return { success: true, data: (data || []) as TransactionContactRow[] }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao carregar contatos" }
    }
}

export async function listTransactionContactsByTypeAction(
    partnerId: string,
    contactType: string,
    storeId?: string | null,
): Promise<{ success: true; data: TransactionContactRow[] } | { success: false; error: string }> {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        await requirePermission(partnerId, "financial", "view")
        if (!CONTACT_TYPES.has(contactType)) throw new Error("Tipo de contato inválido.")

        const supabase = await getSupabaseServerClient()
        let query = supabase
            .from("transaction_contacts")
            .select("id, name, type, description, store_id")
            .eq("partner_id", partnerId)
            .eq("type", contactType)

        if (storeId !== undefined) {
            if (storeId === null) {
                query = query.is("store_id", null)
            } else {
                query = query.eq("store_id", storeId)
            }
        }

        const { data, error } = await query.order("name")
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
    store_id?: string | null
}): Promise<{ success: true; data: TransactionContactRow } | { success: false; error: string }> {
    try {
        const rl = await requireRateLimit(RateLimitCategory.ERP_GENERAL)
        if (!rl.success) return { success: false, error: rl.error || "Muitas tentativas." }

        await requirePermission(input.partnerId, "financial", "edit")
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
                store_id: input.store_id || null,
            })
            .select("id, name, type, description, store_id")
            .single()

        if (error) throw error
        return { success: true, data: data as TransactionContactRow }
    } catch (e: any) {
        return { success: false, error: e.message || "Erro ao criar contato" }
    }
}
