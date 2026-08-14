"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePermission } from "@/lib/permissions/access"
import { successResponse, errorResponse } from "@/lib/utils/action-helpers"
import { ActionResponse } from "@/lib/types/action-response"
import { sanitizeInput } from "@/lib/input-validator"

export async function getUnavailableTypesAction(partnerId: string): Promise<ActionResponse<any[]>> {
    try {
        await requirePermission(partnerId, "appointments", "view")
        const supabase = await getSupabaseServerClient()

        const { data, error } = await supabase
            .from("unavailable_types")
            .select("*")
            .eq("partner_id", partnerId)
            .eq("is_active", true)
            .order("name")

        if (error) throw error
        return successResponse(data || [])
    } catch (e: any) {
        return errorResponse(e.message)
    }
}

export async function createUnavailableTypeAction(data: {
    partnerId: string,
    name: string,
    durationMinutes?: number,
    iconName?: string,
    colorHex?: string
}): Promise<ActionResponse<any>> {
    try {
        await requirePermission(data.partnerId, "appointments", "create")
        const supabase = await getSupabaseServerClient()

        const { data: inserted, error } = await supabase
            .from("unavailable_types")
            .insert({
                partner_id: data.partnerId,
                name: sanitizeInput(data.name, 150).trim(),
                default_duration: data.durationMinutes || 60,
                icon_name: data.iconName || null,
                color_hex: data.colorHex || null
            })
            .select()
            .single()

        if (error) throw error
        return successResponse(inserted)
    } catch (e: any) {
        return errorResponse(e.message)
    }
}

export async function deleteUnavailableTypeAction(id: string, partnerId: string): Promise<ActionResponse<any>> {
    try {
        await requirePermission(partnerId, "appointments", "delete")
        const supabase = await getSupabaseServerClient()

        const { error } = await supabase
            .from("unavailable_types")
            .update({ is_active: false })
            .eq("id", id)
            .eq("partner_id", partnerId)

        if (error) throw error
        return successResponse({ deleted: true })
    } catch (e: any) {
        return errorResponse(e.message)
    }
}
