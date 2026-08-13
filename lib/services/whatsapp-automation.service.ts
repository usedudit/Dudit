import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { queueWhatsappMessage, processWhatsappMessageById } from "./whatsapp-dispatch.service"
import { normalizePhoneToE164 } from "@/lib/whatsapp/phone"
import { buildWhatsappMessage } from "@/lib/notifications/templates"
import { resolveCustomerUserId } from "./notification.service"
import { shouldDeliverWhatsapp } from "./notification-preferences.service"
import { parseInTz } from "@/lib/date"
import { SecureLogger } from "@/lib/secure-logger"
import type { WhatsappAutomationTrigger, WhatsappExecutionResult } from "@/lib/whatsapp/types"

const APPOINTMENT_BUTTONS = [
  { id: "confirm_appointment", title: "✅ Confirmar" },
  { id: "cancel_appointment", title: "❌ Cancelar" },
  { id: "talk_to_business", title: "💬 Falar com a empresa" },
]

const TEMPLATE_BY_TRIGGER: Partial<Record<WhatsappAutomationTrigger, string>> = {
  appointment_created: "appointment_created",
  appointment_confirmed: "appointment_confirmed",
  appointment_cancelled: "appointment_cancelled",
  appointment_rescheduled: "appointment_rescheduled",
  appointment_reminder_24h: "appointment_reminder",
  appointment_reminder_2h: "appointment_reminder",
  order_created: "order_created",
  order_payment_approved: "order_payment_approved",
  order_preparing: "order_preparing",
  order_ready_pickup: "order_ready_pickup",
  order_shipped: "order_shipped",
  order_out_for_delivery: "order_out_for_delivery",
  order_delivered: "order_delivered",
  delivery_route_started: "delivery_route_started",
  delivery_in_progress: "delivery_in_progress",
  delivery_delivered: "delivery_delivered",
  delivery_failed: "delivery_failed",
  quote_shared: "quote_shared",
  quote_reminder: "quote_reminder",
  payment_reminder: "payment_reminder",
  test_message: "hello_world",
}

async function resolveCustomerPhone(params: {
  partnerId: string
  customerId?: string | null
  fallbackPhone?: string | null
}): Promise<string | null> {
  if (params.fallbackPhone) {
    const n = normalizePhoneToE164(params.fallbackPhone)
    if (n) return n
  }
  if (!params.customerId) return null
  const admin = getAdminClient()
  const { data } = await admin
    .from("customers")
    .select("phone")
    .eq("id", params.customerId)
    .eq("partner_id", params.partnerId)
    .maybeSingle()
  return normalizePhoneToE164(data?.phone || null)
}

export async function scheduleWhatsappJob(params: {
  partnerId: string
  storeId?: string | null
  jobType: WhatsappAutomationTrigger
  entityType: string
  entityId: string
  runAt: Date
  payload?: Record<string, unknown>
}) {
  const admin = getAdminClient()
  const idempotencyKey = `${params.jobType}:${params.entityType}:${params.entityId}:${params.runAt.toISOString().slice(0, 16)}`

  const { error } = await admin.from("whatsapp_scheduled_jobs").upsert(
    {
      partner_id: params.partnerId,
      job_type: params.jobType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      run_at: params.runAt.toISOString(),
      payload: { ...params.payload, storeId: params.storeId || null },
      idempotency_key: idempotencyKey,
      status: "pending",
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  )

  if (error && !error.message.includes("duplicate")) {
    console.error("[whatsapp] schedule job error", error.message)
  }

  try {
    const { triggerWhatsappScheduledJob } = await import("@/trigger/whatsapp-jobs")
    await triggerWhatsappScheduledJob({
      jobType: params.jobType,
      entityType: params.entityType,
      entityId: params.entityId,
      partnerId: params.partnerId,
      runAt: params.runAt.toISOString(),
    })
  } catch (err) {
    // Log the error explicitly - Trigger.dev is required, not optional.
    // The DB record (whatsapp_scheduled_jobs) serves as recovery source
    // and will be picked up by the cron-job.org → process-whatsapp-reminders endpoint.
    console.error("[whatsapp] Failed to enqueue Trigger.dev job - will be recovered by cron sweep", {
      jobType: params.jobType,
      entityId: params.entityId,
      error: err instanceof Error ? err.message : "unknown",
    })
  }
}

export async function dispatchWhatsappAutomation(params: {
  partnerId: string
  storeId?: string | null
  trigger: WhatsappAutomationTrigger
  entityType: string
  entityId: string
  customerId?: string | null
  phone?: string | null
  orderId?: string | null
  appointmentId?: string | null
  quoteId?: string | null
  deliveryId?: string | null
  templateVariables?: Record<string, string>
  scheduledAt?: Date | null
  includeAppointmentButtons?: boolean
}): Promise<WhatsappExecutionResult> {
  const phone = await resolveCustomerPhone({
    partnerId: params.partnerId,
    customerId: params.customerId,
    fallbackPhone: params.phone,
  })
  if (!phone) {
    SecureLogger.info("[whatsapp] dispatch: no phone resolved", {
      partnerId: params.partnerId,
      trigger: params.trigger,
      entityId: params.entityId,
    })
    return { success: false, resultStatus: "skipped_no_phone", reason: "customer_without_phone", messageId: null, providerMessageId: null }
  }
  SecureLogger.info("[whatsapp] dispatch: phone_resolved", { partnerId: params.partnerId, phone })

  const userId = await resolveCustomerUserId({
    customerId: params.customerId,
    marketplaceOrderId: params.orderId || params.appointmentId,
  })

  if (userId) {
    const isEnabled = await shouldDeliverWhatsapp(userId, params.trigger)
    SecureLogger.info("[whatsapp] dispatch: should_deliver", { userId, trigger: params.trigger, isEnabled })
    if (!isEnabled) {
      return { success: false, resultStatus: "skipped_disabled", reason: "whatsapp_disabled_by_user", messageId: null, providerMessageId: null }
    }
  }

  const body = buildWhatsappMessage(params.trigger, params.templateVariables || {})
  SecureLogger.info("[whatsapp] dispatch: template_built", {
    partnerId: params.partnerId,
    trigger: params.trigger,
    bodyLength: body.length,
  })

  const idempotencyKey = `${params.trigger}:${params.entityType}:${params.entityId}`

  const queueResult = await queueWhatsappMessage({
    partnerId: params.partnerId,
    storeId: params.storeId,
    customerId: params.customerId,
    orderId: params.orderId,
    appointmentId: params.appointmentId,
    quoteId: params.quoteId,
    deliveryId: params.deliveryId,
    phoneNumber: phone,
    templateName: undefined,
    messageType: "text",
    payload: {
      body,
      triggerType: params.trigger,
    },
    triggerType: params.trigger,
    idempotencyKey,
    scheduledAt: params.scheduledAt,
  })

  SecureLogger.info("[whatsapp] dispatch: queued", {
    partnerId: params.partnerId,
    messageId: queueResult.messageId,
    resultStatus: queueResult.resultStatus,
  })

  let sendResult: WhatsappExecutionResult = queueResult

  if (queueResult.resultStatus === "queued" && !params.scheduledAt) {
    try {
      const inlineResult = await processWhatsappMessageById(queueResult.messageId!)
      SecureLogger.info("[whatsapp] dispatch: inline_send", {
        messageId: queueResult.messageId,
        resultStatus: inlineResult.resultStatus,
      })
      if (inlineResult.resultStatus === "sent") {
        sendResult = inlineResult
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown"
      SecureLogger.error("[whatsapp] dispatch: inline_send_error", {
        messageId: queueResult.messageId,
        error: msg,
      })
    }
  }

  SecureLogger.info("[whatsapp] dispatch: final", {
    partnerId: params.partnerId,
    trigger: params.trigger,
    entityId: params.entityId,
    resultStatus: sendResult.resultStatus,
    reason: sendResult.reason,
    messageId: sendResult.messageId,
  })

  return sendResult
}

export async function scheduleAppointmentReminders(params: {
  partnerId: string
  appointmentId: string
  startDate: string
  startTime: string
  customerId?: string | null
  phone?: string | null
}) {
  const phone = await resolveCustomerPhone({
    partnerId: params.partnerId,
    customerId: params.customerId,
    fallbackPhone: params.phone,
  })
  if (!phone) return

  const start = parseInTz(params.startDate, params.startTime)
  if (Number.isNaN(start.getTime())) return

  const reminder24h = new Date(start.getTime() - 24 * 60 * 60 * 1000)
  const reminder2h = new Date(start.getTime() - 2 * 60 * 60 * 1000)
  const now = Date.now()

  if (reminder24h.getTime() > now) {
    await scheduleWhatsappJob({
      partnerId: params.partnerId,
      jobType: "appointment_reminder_24h",
      entityType: "appointment",
      entityId: params.appointmentId,
      runAt: reminder24h,
      payload: { customerId: params.customerId, phone: params.phone },
    })
  }

  if (reminder2h.getTime() > now) {
    await scheduleWhatsappJob({
      partnerId: params.partnerId,
      jobType: "appointment_reminder_2h",
      entityType: "appointment",
      entityId: params.appointmentId,
      runAt: reminder2h,
      payload: { customerId: params.customerId, phone: params.phone },
    })
  }
}

export async function runScheduledWhatsappJob(job: {
  id: string
  partner_id: string
  job_type: string
  entity_type: string
  entity_id: string
  payload: Record<string, unknown>
}) {
  const admin = getAdminClient()

  SecureLogger.info("[whatsapp] run: job_started", {
    jobId: job.id,
    jobType: job.job_type,
    entityType: job.entity_type,
    entityId: job.entity_id,
    partnerId: job.partner_id,
  })

  if (job.entity_type === "appointment") {
    const { data: apt } = await admin
      .from("appointments")
      .select("id, partner_id, customer_id, customer_name, service_name, start_date, start_time, status, source")
      .eq("id", job.entity_id)
      .eq("partner_id", job.partner_id)
      .maybeSingle()

    SecureLogger.info("[whatsapp] run: appointment_lookup", {
      jobId: job.id,
      found: !!apt,
      source: apt?.source,
      status: apt?.status,
    })

    if (!apt || apt.source === "unavailable") {
      const reason = !apt ? "appointment_not_found" : "source_unavailable"
      await admin.from("whatsapp_scheduled_jobs").update({
        status: "cancelled",
        result_status: "skipped_unavailable",
        result_reason: reason,
        completed_at: new Date().toISOString(),
      }).eq("id", job.id)
      SecureLogger.info("[whatsapp] run: cancelled - unavailable", { jobId: job.id, reason })
      return
    }

    const cancelled = String(apt.status).toLowerCase() === "cancelado"
    if (cancelled && job.job_type.includes("reminder")) {
      await admin.from("whatsapp_scheduled_jobs").update({
        status: "cancelled",
        result_status: "skipped_cancelled",
        result_reason: "appointment_cancelled",
        completed_at: new Date().toISOString(),
      }).eq("id", job.id)
      SecureLogger.info("[whatsapp] run: cancelled - appointment cancelled", { jobId: job.id })
      return
    }

    const { data: jobPartner } = await admin
      .from("partners")
      .select("id")
      .eq("id", job.partner_id)
      .maybeSingle()

    // Get store name from stores table
    const { data: hqStore } = await admin
      .from("stores")
      .select("name")
      .eq("partner_id", job.partner_id)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle()

    SecureLogger.info("[whatsapp] run: dispatch_start", { jobId: job.id, partnerName: hqStore?.name })

    const result = await dispatchWhatsappAutomation({
      partnerId: job.partner_id,
      storeId: (job.payload?.storeId as string) || null,
      trigger: job.job_type as WhatsappAutomationTrigger,
      entityType: "appointment",
      entityId: job.entity_id,
      appointmentId: job.entity_id,
      customerId: apt.customer_id,
      templateVariables: {
        customer_name: apt.customer_name,
        service_name: apt.service_name,
        date: apt.start_date,
        time: apt.start_time,
        store_name: hqStore?.name || "",
      },
      includeAppointmentButtons: job.job_type.includes("reminder"),
    })

    const jobStatus = result.success ? "completed" : result.resultStatus.startsWith("failed") ? "failed" : "completed"
    const updateData: Record<string, unknown> = {
      status: jobStatus,
      result_status: result.resultStatus,
      result_reason: result.reason,
      completed_at: new Date().toISOString(),
    }
    if (result.messageId) updateData.message_id = result.messageId
    if (result.providerMessageId) updateData.provider_message_id = result.providerMessageId

    await admin.from("whatsapp_scheduled_jobs").update(updateData).eq("id", job.id)

    SecureLogger.info("[whatsapp] run: job_finished", {
      jobId: job.id,
      jobStatus,
      resultStatus: result.resultStatus,
      reason: result.reason,
      messageId: result.messageId,
    })

  } else if (job.entity_type === "quote") {
    const result = await dispatchWhatsappAutomation({
      partnerId: job.partner_id,
      storeId: (job.payload?.storeId as string) || null,
      trigger: job.job_type as WhatsappAutomationTrigger,
      entityType: "quote",
      entityId: job.entity_id,
      quoteId: job.entity_id,
      customerId: job.payload.customerId as string | undefined,
    })

    const jobStatus = result.success ? "completed" : result.resultStatus.startsWith("failed") ? "failed" : "completed"
    const updateData: Record<string, unknown> = {
      status: jobStatus,
      result_status: result.resultStatus,
      result_reason: result.reason,
      completed_at: new Date().toISOString(),
    }
    if (result.messageId) updateData.message_id = result.messageId
    if (result.providerMessageId) updateData.provider_message_id = result.providerMessageId

    await admin.from("whatsapp_scheduled_jobs").update(updateData).eq("id", job.id)

    SecureLogger.info("[whatsapp] run: job_finished", {
      jobId: job.id,
      jobStatus,
      resultStatus: result.resultStatus,
      reason: result.reason,
      messageId: result.messageId,
    })
  }
}

export async function processDueScheduledJobs(limit = 20): Promise<number> {
  const admin = getAdminClient()
  const { data: jobs, error } = await admin.rpc("claim_whatsapp_scheduled_jobs", { p_limit: limit })
  if (error) {
    console.error("[whatsapp] scheduled claim error", error.message)
    return 0
  }

  for (const job of jobs || []) {
    try {
      await runScheduledWhatsappJob(job)
    } catch (err) {
      await admin
        .from("whatsapp_scheduled_jobs")
        .update({
          status: "failed",
          last_error: err instanceof Error ? err.message : "unknown",
        })
        .eq("id", job.id)
    }
  }
  return (jobs || []).length
}

// ─── Entity-specific triggers (delegated to Central Notification Engine) ───────────

export async function onAppointmentCreated(appointment: Record<string, unknown>, origin?: "manual" | "automation" | "system") {
  const { onAppointmentCreated: centralOnAppointmentCreated } = await import("./notification-automation.service")
  return centralOnAppointmentCreated(appointment, origin)
}

export async function onAppointmentStatusChanged(
  appointment: Record<string, unknown>,
  previousStatus: string,
  newStatus: string,
  origin?: "manual" | "automation" | "system",
) {
  const { onAppointmentStatusChanged: centralOnAppointmentStatusChanged } = await import("./notification-automation.service")
  return centralOnAppointmentStatusChanged(appointment, previousStatus, newStatus, origin)
}

export async function onAppointmentRescheduled(appointment: Record<string, unknown>, origin?: "manual" | "automation" | "system") {
  const { onAppointmentRescheduled: centralOnAppointmentRescheduled } = await import("./notification-automation.service")
  return centralOnAppointmentRescheduled(appointment, origin)
}

export async function onOrderStatusChanged(order: Record<string, unknown>, situation?: string, deliveryStatus?: string, origin?: "manual" | "automation" | "system") {
  const { onOrderStatusChanged: centralOnOrderStatusChanged } = await import("./notification-automation.service")
  return centralOnOrderStatusChanged(order, situation, deliveryStatus, origin)
}

export async function onDeliveryStatusChanged(delivery: Record<string, unknown>, newStatus: string) {
  const partnerId = String(delivery.partner_id)
  const deliveryId = String(delivery.id || delivery.delivery_id || "")

  const map: Record<string, WhatsappAutomationTrigger> = {
    sent: "delivery_in_progress",
    delivered: "delivery_delivered",
    delivery_failed: "delivery_failed",
    preparing: "delivery_route_started",
  }

  const trigger = map[newStatus]
  if (!trigger) return

  const admin = getAdminClient()

  // Get store name from stores table
  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  await dispatchWhatsappAutomation({
    partnerId,
    trigger,
    entityType: "delivery",
    entityId: deliveryId,
    orderId: delivery.order_id as string | undefined,
    deliveryId,
    customerId: delivery.customer_id as string | null,
    templateVariables: {
      customer_name: String(delivery.customer_name || "cliente"),
      store_name: hqStore?.name || "",
    },
  })
}

export async function onQuoteShared(quote: Record<string, unknown>) {
  const partnerId = String(quote.partner_id)
  const admin = getAdminClient()

  // Get store name from stores table
  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  await dispatchWhatsappAutomation({
    partnerId,
    trigger: "quote_shared",
    entityType: "quote",
    entityId: String(quote.id),
    quoteId: String(quote.id),
    customerId: quote.customer_id as string | null,
    templateVariables: {
      quote_number: String(quote.quote_number || quote.id),
      customer_name: String(quote.customer_name || "cliente"),
      store_name: hqStore?.name || "",
    },
  })

  const phone = await resolveCustomerPhone({
    partnerId,
    customerId: quote.customer_id as string | null,
  })
  if (!phone) return

  const expiresAt = quote.valid_until ? parseInTz(String(quote.valid_until), "23:59") : null
  if (expiresAt && expiresAt.getTime() > Date.now()) {
    const reminderAt = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000)
    if (reminderAt.getTime() > Date.now()) {
      await scheduleWhatsappJob({
        partnerId,
        jobType: "quote_reminder",
        entityType: "quote",
        entityId: String(quote.id),
        runAt: reminderAt,
        payload: { customerId: quote.customer_id, phone },
      })
    }
  }
}
