"use server"

import { requireUser, getCurrentUser } from "@/lib/auth/authorization"
import { getAdminClient } from "@/lib/supabase/admin"
import { requireRateLimit } from "@/lib/security/require-rate-limit"
import { RateLimitCategory } from "@/lib/rate-limiter"
import { sanitizeString, sanitizeUUID } from "@/lib/security/input-sanitizer"
import { sendDiscordFeedbackNotification } from "@/lib/services/discord-feedback.service"
import { createNotificationsForUsers } from "@/lib/services/notification.service"

export type FeedbackType = "onboarding" | "help_article" | "general" | "bug"
export type FeedbackSentiment = "positive" | "neutral" | "negative"

export interface SubmitFeedbackInput {
  type: FeedbackType
  sentiment?: FeedbackSentiment | null
  message: string
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

export interface FeedbackActionResult {
  success: boolean
  error?: string
  feedbackId?: string
}

/**
 * Submit user feedback across Onboarding, Help Center, General suggestions, and Bug reports.
 * Enforces authentication, rate-limiting, sanitization, database persistence, Discord webhook, and admin alerts.
 */
export async function submitFeedbackAction(
  input: SubmitFeedbackInput
): Promise<FeedbackActionResult> {
  const user = await getCurrentUser()
  if (!user) {
    return {
      success: false,
      error: "Você precisa estar autenticado para enviar feedback.",
    }
  }

  // 1. Rate limiting (fail-open for general feedback to avoid blocking users)
  try {
    await requireRateLimit(RateLimitCategory.FEEDBACK_CREATE)
  } catch (err) {
    return {
      success: false,
      error: "Muitas tentativas em pouco tempo. Por favor, aguarde alguns minutos antes de enviar outro feedback.",
    }
  }

  // 2. Validate and sanitize inputs
  const allowedTypes: FeedbackType[] = ["onboarding", "help_article", "general", "bug"]
  if (!allowedTypes.includes(input.type)) {
    return { success: false, error: "Tipo de feedback inválido." }
  }

  let sentiment: FeedbackSentiment | null = null
  if (input.sentiment && ["positive", "neutral", "negative"].includes(input.sentiment)) {
    sentiment = input.sentiment
  }

  const rawMessage = typeof input.message === "string" ? input.message : ""
  const sanitizedMessage = sanitizeString(rawMessage, 2000).trim()

  if (sanitizedMessage.length < 2) {
    return {
      success: false,
      error: "A mensagem deve conter pelo menos 2 caracteres.",
    }
  }

  const sanitizedPageUrl = input.pageUrl ? sanitizeString(input.pageUrl, 500) : null
  const sanitizedPartnerId = input.partnerId ? sanitizeUUID(input.partnerId) : null

  const metadata: Record<string, unknown> = {
    browser: input.metadata?.browser ? sanitizeString(input.metadata.browser, 100) : "unknown",
    screen: input.metadata?.screen ? sanitizeString(input.metadata.screen, 50) : "unknown",
    app_area: input.metadata?.app_area ? sanitizeString(input.metadata.app_area, 50) : "general",
    partner_plan: input.metadata?.partner_plan ? sanitizeString(input.metadata.partner_plan, 50) : undefined,
    user_role: input.metadata?.user_role ? sanitizeString(input.metadata.user_role, 50) : undefined,
  }

  const admin = getAdminClient()

  // 3. Save to database
  const { data: inserted, error: dbError } = await admin
    .from("feedbacks")
    .insert({
      user_id: user.id,
      partner_id: sanitizedPartnerId,
      type: input.type,
      sentiment,
      message: sanitizedMessage,
      page_url: sanitizedPageUrl,
      metadata,
      status: "new",
    })
    .select("id, created_at")
    .single()

  if (dbError || !inserted) {
    console.error("[submitFeedbackAction] Error inserting feedback:", dbError?.message)
    return {
      success: false,
      error: "Não foi possível salvar seu feedback. Tente novamente.",
    }
  }

  // 4. If onboarding, mark prompt completed
  if (input.type === "onboarding" && sanitizedPartnerId) {
    try {
      await admin
        .from("feedback_prompts")
        .upsert(
          {
            user_id: user.id,
            partner_id: sanitizedPartnerId,
            type: "erp_onboarding",
            completed_at: new Date().toISOString(),
          },
          { onConflict: "user_id,partner_id,type" }
        )
    } catch (promptErr) {
      console.warn("[submitFeedbackAction] Failed to update prompt completion:", promptErr)
    }
  }

  // 5. Fetch user profile and partner name for rich Discord context (non-blocking)
  let userName = user.email?.split("@")[0] || "Usuário"
  let userEmail = user.email || ""
  let partnerName: string | null = null

  try {
    const [{ data: profile }, storeRes] = await Promise.all([
      admin.from("user_profiles").select("full_name").eq("user_id", user.id).maybeSingle(),
      sanitizedPartnerId
        ? admin.from("stores").select("name").eq("partner_id", sanitizedPartnerId).order("is_headquarters", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ])

    if (profile?.full_name) userName = profile.full_name
    if (storeRes?.data?.name) partnerName = storeRes.data.name
  } catch {
    // Non-critical, fallback to defaults
  }

  // 6. Send Discord Notification (non-blocking, errors caught internally)
  sendDiscordFeedbackNotification({
    id: inserted.id,
    type: input.type,
    sentiment,
    message: sanitizedMessage,
    pageUrl: sanitizedPageUrl,
    userId: user.id,
    userEmail,
    userName,
    partnerId: sanitizedPartnerId,
    partnerName,
    metadata,
    createdAt: inserted.created_at,
  }).catch((err) => {
    console.error("[submitFeedbackAction] Background Discord webhook error:", err)
  })

  // 7. Trigger in-app notification to platform admins if feedback is critical
  const isCritical = input.type === "bug" || sentiment === "negative" || input.type === "onboarding"
  if (isCritical) {
    try {
      const { data: adminRoles } = await admin
        .from("admin_roles")
        .select("user_id")
        .in("role", ["super_admin", "admin"])

      if (adminRoles && adminRoles.length > 0) {
        const adminUserIds = adminRoles.map((r: { user_id: string }) => r.user_id)
        const typeTitles: Record<FeedbackType, string> = {
          bug: "🐛 Novo Bug Reportado",
          onboarding: "🚀 Feedback de Onboarding ERP",
          help_article: "📖 Feedback da Central de Ajuda",
          general: "💬 Novo Feedback Geral",
        }

        const notificationTitle = typeTitles[input.type] || "Novo Feedback"
        const previewMessage =
          sanitizedMessage.length > 120 ? `${sanitizedMessage.slice(0, 117)}...` : sanitizedMessage

        await createNotificationsForUsers(adminUserIds, (adminId) => ({
          userId: adminId,
          type: "admin_announcement",
          title: notificationTitle,
          message: `${userName}: "${previewMessage}"`,
          data: {
            feedbackId: inserted.id,
            type: input.type,
            partnerId: sanitizedPartnerId,
            audience: "admin",
          },
          idempotencyKey: `feedback:${inserted.id}:${adminId}`,
        }))
      }
    } catch (notifErr) {
      console.error("[submitFeedbackAction] Failed to create admin notification:", notifErr)
    }
  }

  return {
    success: true,
    feedbackId: inserted.id,
  }
}

/**
 * Checks if the ERP onboarding prompt should be displayed to the current user.
 * Rule: Partner created >= 7 days ago AND prompt has not been dismissed or completed.
 */
export async function checkERPOnboardingFeedbackPromptAction(partnerId: string): Promise<{
  shouldShow: boolean
  partnerName?: string
  daysSinceCreation?: number
}> {
  try {
    const user = await getCurrentUser()
    if (!user || !partnerId) return { shouldShow: false }

    const sanitizedPartnerId = sanitizeUUID(partnerId)
    if (!sanitizedPartnerId) return { shouldShow: false }

    const admin = getAdminClient()

    // 1. Check partner creation date and store name
    const [{ data: partner }, { data: store }] = await Promise.all([
      admin
        .from("partners")
        .select("id, created_at")
        .eq("id", sanitizedPartnerId)
        .maybeSingle(),
      admin
        .from("stores")
        .select("name")
        .eq("partner_id", sanitizedPartnerId)
        .order("is_headquarters", { ascending: false })
        .limit(1)
        .maybeSingle()
    ])

    if (!partner?.created_at) return { shouldShow: false }

    const createdAt = new Date(partner.created_at).getTime()
    const now = Date.now()
    const diffDays = (now - createdAt) / (1000 * 60 * 60 * 24)

    // Must be at least ~7 days old
    if (diffDays < 7) {
      return { shouldShow: false, daysSinceCreation: Math.floor(diffDays) }
    }

    // 2. Check if user already saw / dismissed / completed this prompt
    const { data: prompt } = await admin
      .from("feedback_prompts")
      .select("id, dismissed_at, completed_at")
      .eq("user_id", user.id)
      .eq("partner_id", sanitizedPartnerId)
      .eq("type", "erp_onboarding")
      .maybeSingle()

    if (prompt && (prompt.dismissed_at || prompt.completed_at)) {
      return { shouldShow: false }
    }

    return {
      shouldShow: true,
      partnerName: store?.name || "Loja",
      daysSinceCreation: Math.floor(diffDays),
    }
  } catch (err) {
    console.error("[checkERPOnboardingFeedbackPromptAction] Error:", err)
    return { shouldShow: false }
  }
}

/**
 * Record that the ERP onboarding prompt was shown to the user.
 */
export async function recordFeedbackPromptShownAction(
  partnerId: string,
  type: string = "erp_onboarding"
): Promise<{ success: boolean }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false }

    const sanitizedPartnerId = sanitizeUUID(partnerId)
    if (!sanitizedPartnerId) return { success: false }

    const admin = getAdminClient()
    await admin.from("feedback_prompts").upsert(
      {
        user_id: user.id,
        partner_id: sanitizedPartnerId,
        type,
        shown_at: new Date().toISOString(),
      },
      { onConflict: "user_id,partner_id,type" }
    )

    return { success: true }
  } catch (err) {
    console.error("[recordFeedbackPromptShownAction] Error:", err)
    return { success: false }
  }
}

/**
 * Record that the ERP onboarding prompt was dismissed by the user.
 */
export async function dismissFeedbackPromptAction(
  partnerId: string,
  type: string = "erp_onboarding"
): Promise<{ success: boolean }> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: false }

    const sanitizedPartnerId = sanitizeUUID(partnerId)
    if (!sanitizedPartnerId) return { success: false }

    const admin = getAdminClient()
    await admin.from("feedback_prompts").upsert(
      {
        user_id: user.id,
        partner_id: sanitizedPartnerId,
        type,
        dismissed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,partner_id,type" }
    )

    return { success: true }
  } catch (err) {
    console.error("[dismissFeedbackPromptAction] Error:", err)
    return { success: false }
  }
}
