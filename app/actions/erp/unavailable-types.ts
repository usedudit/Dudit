"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { successResponse, errorResponse } from "@/lib/utils/action-helpers"
import { ActionResponse } from "@/lib/types/action-response"

export async function getUnavailableTypesAction(partnerId: string): Promise<ActionResponse<any[]>> {
    try {
        await requirePartnerAccessWithPermission(partnerId, "appointments", "view")
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
        await requirePartnerAccessWithPermission(data.partnerId, "appointments", "create")
        const supabase = await getSupabaseServerClient()

        const { data: inserted, error } = await supabase
            .from("unavailable_types")
            .insert({
                partner_id: data.partnerId,
                name: data.name.trim(),
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
