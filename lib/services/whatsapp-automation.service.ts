import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { queueWhatsappMessage, processWhatsappMessageById } from "./whatsapp-dispatch.service"
import { normalizePhoneToE164 } from "@/lib/whatsapp/phone"
import { buildWhatsappMessage } from "@/lib/notifications/templates"
import type { WhatsappAutomationTrigger } from "@/lib/whatsapp/types"

const APPOINTMENT_BUTTONS = [
  { id: "confirm_appointment", title: "✅ Confirmar" },
  { id: "cancel_appointment", title: "❌ Cancelar" },
  { id: "talk_to_business", title: "💬 Falar com a empresa" },
]

const TEMPLATE_BY_TRIGGER: Partial<Record<WhatsappAutomationTrigger, string>> = {
  appointment_created: "appointment_created",
  appointment_confirmed: "appointment_confirmed",
  appointment_cancelled: "appointment_cancelled",
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
      payload: params.payload || {},
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
    // Log the error explicitly — Trigger.dev is required, not optional.
    // The DB record (whatsapp_scheduled_jobs) serves as recovery source
    // and will be picked up by the cron-job.org → process-whatsapp-reminders endpoint.
    console.error("[whatsapp] Failed to enqueue Trigger.dev job — will be recovered by cron sweep", {
      jobType: params.jobType,
      entityId: params.entityId,
      error: err instanceof Error ? err.message : "unknown",
    })
  }
}

export async function dispatchWhatsappAutomation(params: {
  partnerId: string
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
}) {
  const phone = await resolveCustomerPhone({
    partnerId: params.partnerId,
    customerId: params.customerId,
    fallbackPhone: params.phone,
  })
  if (!phone) return { queued: false, reason: "no_phone" }

  const body = buildWhatsappMessage(params.trigger, params.templateVariables || {})
  const idempotencyKey = `${params.trigger}:${params.entityType}:${params.entityId}`

  const result = await queueWhatsappMessage({
    partnerId: params.partnerId,
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

  if (result.messageId && !result.skipped && !params.scheduledAt) {
    try {
      await processWhatsappMessageById(result.messageId)
    } catch (err) {
      console.error(`[whatsapp] Inline processing failed for message ${result.messageId}:`, err)
    }
  }

  return { queued: !result.skipped, messageId: result.messageId }
}

export async function scheduleAppointmentReminders(params: {
  partnerId: string
  appointmentId: string
  startDate: string
  startTime: string
  customerId?: string | null
  phone?: string | null
}) {
  const start = new Date(`${params.startDate}T${params.startTime}`)
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

  if (job.entity_type === "appointment") {
    const { data: apt } = await admin
      .from("appointments")
      .select("id, partner_id, customer_id, customer_name, service_name, start_date, start_time, status, source")
      .eq("id", job.entity_id)
      .eq("partner_id", job.partner_id)
      .maybeSingle()

    if (!apt || apt.source === "unavailable") {
      await admin.from("whatsapp_scheduled_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", job.id)
      return
    }

    const cancelled = String(apt.status).toLowerCase() === "cancelado"
    if (cancelled && job.job_type.includes("reminder")) {
      await admin.from("whatsapp_scheduled_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() }).eq("id", job.id)
      return
    }

    const { data: jobPartner } = await admin
      .from("partners")
      .select("store_name")
      .eq("id", job.partner_id)
      .maybeSingle()

    await dispatchWhatsappAutomation({
      partnerId: job.partner_id,
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
        store_name: jobPartner?.store_name || "",
      },
      includeAppointmentButtons: job.job_type.includes("reminder"),
    })
  } else if (job.entity_type === "quote") {
    await dispatchWhatsappAutomation({
      partnerId: job.partner_id,
      trigger: job.job_type as WhatsappAutomationTrigger,
      entityType: "quote",
      entityId: job.entity_id,
      quoteId: job.entity_id,
      customerId: job.payload.customerId as string | undefined,
    })
  }

  await admin
    .from("whatsapp_scheduled_jobs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", job.id)
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

// ─── Entity-specific triggers ───────────────────────────────────────────────

export async function onAppointmentCreated(appointment: Record<string, unknown>) {
  if (appointment.source === "unavailable") return
  const partnerId = String(appointment.partner_id)
  const appointmentId = String(appointment.id)

  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", partnerId)
    .maybeSingle()

  await dispatchWhatsappAutomation({
    partnerId,
    trigger: "appointment_created",
    entityType: "appointment",
    entityId: appointmentId,
    appointmentId,
    customerId: appointment.customer_id as string | null,
    templateVariables: {
      customer_name: String(appointment.customer_name),
      service_name: String(appointment.service_name),
      date: String(appointment.start_date),
      time: String(appointment.start_time),
      store_name: partner?.store_name || "",
    },
    includeAppointmentButtons: true,
  })

  await scheduleAppointmentReminders({
    partnerId,
    appointmentId,
    startDate: String(appointment.start_date),
    startTime: String(appointment.start_time),
    customerId: appointment.customer_id as string | null,
  })
}

export async function onAppointmentStatusChanged(
  appointment: Record<string, unknown>,
  previousStatus: string,
  newStatus: string,
) {
  const partnerId = String(appointment.partner_id)
  const appointmentId = String(appointment.id)
  const prev = previousStatus.toLowerCase()
  const next = newStatus.toLowerCase()

  if (prev === next) return

  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", partnerId)
    .maybeSingle()

  const vars = {
    customer_name: String(appointment.customer_name || "cliente"),
    service_name: String(appointment.service_name || "serviço"),
    date: String(appointment.start_date || ""),
    time: String(appointment.start_time || ""),
    store_name: partner?.store_name || "",
  }

  if (next === "confirmado") {
    await dispatchWhatsappAutomation({
      partnerId,
      trigger: "appointment_confirmed",
      entityType: "appointment",
      entityId: appointmentId,
      appointmentId,
      customerId: appointment.customer_id as string | null,
      templateVariables: vars,
    })
  } else if (next === "cancelado") {
    await dispatchWhatsappAutomation({
      partnerId,
      trigger: "appointment_cancelled",
      entityType: "appointment",
      entityId: appointmentId,
      appointmentId,
      customerId: appointment.customer_id as string | null,
      templateVariables: vars,
    })
  }
}

const ORDER_TRIGGER_MAP: Record<string, WhatsappAutomationTrigger> = {
  pending: "order_created",
  paid: "order_payment_approved",
  in_process: "order_preparing",
  pickup_available: "order_ready_pickup",
  shipped: "order_shipped",
  sent: "order_out_for_delivery",
  delivered: "order_delivered",
}

export async function onOrderStatusChanged(order: Record<string, unknown>, situation?: string, deliveryStatus?: string) {
  const partnerId = String(order.partner_id)
  const orderId = String(order.id)

  let trigger: WhatsappAutomationTrigger | null = null
  if (situation && ORDER_TRIGGER_MAP[situation]) {
    trigger = ORDER_TRIGGER_MAP[situation]
  } else if (deliveryStatus === "preparing") {
    trigger = "order_preparing"
  } else if (deliveryStatus === "pickup_available") {
    trigger = "order_ready_pickup"
  } else if (deliveryStatus === "sent") {
    trigger = "order_out_for_delivery"
  } else if (deliveryStatus === "delivered") {
    trigger = "order_delivered"
  }

  if (!trigger) return

  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", partnerId)
    .maybeSingle()

  const formatCurrency = (v: unknown) => {
    const n = Number(v)
    if (v == null || Number.isNaN(n)) return ""
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
  }

  await dispatchWhatsappAutomation({
    partnerId,
    trigger,
    entityType: "order",
    entityId: orderId,
    orderId,
    customerId: order.buyer_id as string | null,
    phone: order.buyer_phone as string | null,
    templateVariables: {
      order_number: String(order.order_number || orderId.slice(0, 8)),
      customer_name: String(order.customer_name || order.buyer_name || "cliente"),
      amount: formatCurrency(order.total_amount),
      store_name: partner?.store_name || "",
    },
  })
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
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", partnerId)
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
      store_name: partner?.store_name || "",
    },
  })
}

export async function onQuoteShared(quote: Record<string, unknown>) {
  const partnerId = String(quote.partner_id)
  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", partnerId)
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
      store_name: partner?.store_name || "",
    },
  })

  const expiresAt = quote.valid_until ? new Date(String(quote.valid_until)) : null
  if (expiresAt && expiresAt.getTime() > Date.now()) {
    const reminderAt = new Date(expiresAt.getTime() - 24 * 60 * 60 * 1000)
    if (reminderAt.getTime() > Date.now()) {
      await scheduleWhatsappJob({
        partnerId,
        jobType: "quote_reminder",
        entityType: "quote",
        entityId: String(quote.id),
        runAt: reminderAt,
        payload: { customerId: quote.customer_id },
      })
    }
  }
}
