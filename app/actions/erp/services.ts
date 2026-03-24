"use server"

import { getSupabaseServerClient } from "@/lib/supabase/request-client"
import { revalidatePath } from "next/cache"
import { redirect } from 'next/navigation'

import { requireUser, requirePartnerAccessWithPermission } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { z } from "zod"
import { syncToExploreRedis, removeFromExploreRedis } from "@/lib/redis-sync"

const ServiceSchema = z.object({
  partnerId: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  price: z.number().min(0.01).max(999999),
})

import { generateUniqueServiceCode } from "@/lib/utils/code-generators"

export async function createServiceAction(data: {
  partnerId: string
  name: string
  description: string
  price: number
  csrf_token?: string
}) {
  await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)

  // Validate CSRF token
  const { requireCSRF, extractCSRFTokenFromObject } = await import("@/lib/security/csrf-action-wrapper")
  const csrfToken = extractCSRFTokenFromObject(data as Record<string, unknown>)
  const csrfValidation = await requireCSRF(csrfToken)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  await requirePartnerAccessWithPermission(data.partnerId, "services", "create")

  const validation = ServiceSchema.safeParse(data)
  if (!validation.success) {
    return { error: validation.error.issues[0].message }
  }

  const supabase = await getSupabaseServerClient()

  const serviceCode = await generateUniqueServiceCode(supabase)

  const { data: newService, error } = await supabase.from("services").insert({
    partner_id: data.partnerId,
    name: data.name,
    description: data.description || null,
    price: data.price,
    service_code: serviceCode,
  }).select().single()

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/services")
  revalidatePath("/marketplace")

  if (newService) {
    await syncToExploreRedis({ id: newService.id, type: "servico", data: {} })
  }

  redirect("/erp/services")
}

export async function deleteServiceAction(serviceId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.PRODUCT_DELETE)
  // Validate CSRF token
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: service } = await supabase
    .from("services")
    .select("partner_id")
    .eq("id", serviceId)
    .single()

  if (!service) {
    return { error: "Serviço não encontrado" }
  }

  // Check partner_users for access, then fallback to partners.user_id (legacy owner)
  const admin = getAdminClient()
  const { data: puAccess } = await admin
    .from("partner_users")
    .select("id")
    .eq("partner_id", service.partner_id)
    .eq("user_id", user.id)
    .maybeSingle()

  if (!puAccess) {
    const { data: partner } = await admin
      .from("partners")
      .select("user_id")
      .eq("id", service.partner_id)
      .single()
    if (!partner || partner.user_id !== user.id) {
      return { error: "Você não tem permissão para excluir este serviço" }
    }
  }

  const { error } = await supabase.from("services").delete().eq("id", serviceId)

  if (error) {
    return { error: error.message }
  }

  revalidatePath("/erp/services")
  revalidatePath("/marketplace")

  await removeFromExploreRedis(serviceId, "servico")

  redirect("/erp/services")
}

export async function duplicateServiceAction(serviceId: string, csrf_token?: string) {
  await requireRateLimit(RateLimitCategory.PRODUCT_CREATE)

  // SECURITY: CSRF validation
  const { requireCSRF } = await import("@/lib/security/csrf-action-wrapper")
  const csrfValidation = await requireCSRF(csrf_token)
  if (!csrfValidation.valid) {
    return { error: csrfValidation.error || "Token CSRF inválido" }
  }

  const user = await requireUser()

  const supabase = await getSupabaseServerClient()
  const { data: service } = await supabase
    .from("services")
    .select("*")
    .eq("id", serviceId)
    .single()

  if (!service) {
    return { error: "Serviço não encontrado" }
  }

  // SECURITY: Granular permission check (replaces legacy partner_users/partners manual check)
  await requirePartnerAccessWithPermission(service.partner_id, "services", "create")

  const newServiceCode = await generateUniqueServiceCode(supabase)

  const { data: newService, error: createError } = await supabase
    .from("services")
    .insert({
      partner_id: service.partner_id,
      name: `${service.name} (copia)`,
      description: service.description,
      price: service.price,
      duration_minutes: service.duration_minutes,
      images: service.images, // Copy all images
      service_code: newServiceCode, // New unique code
      is_active: service.is_active,
    })
    .select()
    .single()

  if (createError) {
    return { error: createError.message }
  }

  revalidatePath("/erp/services")
  revalidatePath("/marketplace")

  await syncToExploreRedis({ id: newService.id, type: "servico", data: {} })

  return { success: true, newServiceId: newService.id }
}
