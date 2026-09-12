"use server"

import { getCurrentUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeString, sanitizeUUID } from "@/lib/security/input-sanitizer"
import {
  sendDiscordSupportNotification,
  generateTicketId,
  type SupportCategory,
} from "@/lib/services/discord-support.service"

export type { SupportCategory }

export interface SubmitSupportInput {
  email: string
  category: SupportCategory
  description: string
  pageUrl?: string | null
  partnerId?: string | null
  metadata?: {
    browser?: string
    screen?: string
    app_area?: string
    partner_plan?: string
    user_role?: string
    [key: string]: unknown
  }
}

export interface SupportActionResult {
  success: boolean
  error?: string
  ticketId?: string
}

const ALLOWED_CATEGORIES: SupportCategory[] = [
  "duvida",
  "bug",
  "sugestao",
  "problema-conta",
  "problema-pedido",
  "cobranca-plano",
  "outro",
]

/**
 * Submit a support ticket. Sends to Discord webhook, no DB persistence.
 */
export async function submitSupportTicketAction(
  input: SubmitSupportInput
): Promise<SupportActionResult> {
  // 1. Rate limiting
  try {
    await requireRateLimit(RateLimitCategory.SUPPORT_CREATE)
  } catch {
    return {
      success: false,
      error: "Muitas tentativas em pouco tempo. Por favor, aguarde alguns minutos antes de enviar outro ticket.",
    }
  }

  // 2. Validate email
  const rawEmail = typeof input.email === "string" ? input.email : ""
  const sanitizedEmail = sanitizeString(rawEmail, 200).trim()
  if (!sanitizedEmail || !sanitizedEmail.includes("@") || !sanitizedEmail.includes(".")) {
    return { success: false, error: "Por favor, informe um e-mail válido." }
  }

  // 3. Validate category
  if (!ALLOWED_CATEGORIES.includes(input.category)) {
    return { success: false, error: "Categoria inválida." }
  }

  // 4. Validate and sanitize description
  const rawDescription = typeof input.description === "string" ? input.description : ""
  const sanitizedDescription = sanitizeString(rawDescription, 2000).trim()
  if (sanitizedDescription.length < 10) {
    return {
      success: false,
      error: "A descrição deve conter pelo menos 10 caracteres.",
    }
  }

  const sanitizedPageUrl = input.pageUrl ? sanitizeString(input.pageUrl, 500) : null
  const sanitizedPartnerId = input.partnerId ? sanitizeUUID(input.partnerId) : null

  const metadata: Record<string, unknown> = {
    browser: input.metadata?.browser ? sanitizeString(input.metadata.browser, 100) : "unknown",
    screen: input.metadata?.screen ? sanitizeString(input.metadata.screen, 50) : "unknown",
    app_area: input.metadata?.app_area ? sanitizeString(input.metadata.app_area, 50) : "general",
    partner_plan: input.metadata?.partner_plan
      ? sanitizeString(input.metadata.partner_plan, 50)
      : undefined,
    user_role: input.metadata?.user_role ? sanitizeString(input.metadata.user_role, 50) : undefined,
  }

  // 5. Get user info if authenticated (optional — support works for non-logged users too)
  let userId: string | null = null
  let userName: string | null = null
  let partnerName: string | null = null

  try {
    const user = await getCurrentUser()
    if (user) {
      userId = user.id
      userName = user.email?.split("@")[0] || null

      const admin = getAdminClient()

      const [{ data: profile }, storeRes] = await Promise.all([
        admin.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
        sanitizedPartnerId
          ? admin
              .from("stores")
              .select("name")
              .eq("partner_id", sanitizedPartnerId)
              .order("is_headquarters", { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ])

      if (profile?.full_name) userName = profile.full_name
      if (storeRes?.data?.name) partnerName = storeRes.data.name
    }
  } catch {
    // Non-critical
  }

  // 6. Generate ticket ID
  const ticketId = generateTicketId()

  // 7. Send Discord notification (non-blocking)
  sendDiscordSupportNotification({
    ticketId,
    email: sanitizedEmail,
    category: input.category,
    description: sanitizedDescription,
    pageUrl: sanitizedPageUrl,
    userId,
    userName,
    partnerId: sanitizedPartnerId,
    partnerName,
    metadata,
    createdAt: new Date(),
  }).catch((err) => {
    console.error("[submitSupportTicketAction] Background Discord webhook error:", err)
  })

  return {
    success: true,
    ticketId,
  }
}
