import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { buildNotificationContent } from "@/lib/notifications/templates"
import { getNotificationRecipientRoles } from "@/lib/notifications/audience"
import type { NotificationType } from "@/lib/notifications/types"
import { parseInTz, getDefaultTimezone } from "@/lib/date"
import {
  buildIdempotencyKey,
  createNotification,
  createNotificationsForUsers,
  getPartnerTeamUserIds,
  getStoreTeamUserIds,
  resolveCustomerUserId,
  scheduleNotificationJob,
} from "./notification.service"
import { checkIsAddonActive, recordAddonEvent } from "@/lib/services/addon.service"

function formatCurrency(value: number | null | undefined): string | undefined {
  if (value == null || Number.isNaN(Number(value))) return undefined
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value))
}

async function notifyPartnerTeam(params: {
  partnerId: string
  storeId?: string | null
  staffPartnerUserId?: string | null
  type: NotificationType
  entityType: "order" | "appointment" | "subscription"
  entityId: string
  ctx: Parameters<typeof buildNotificationContent>[2]
  variant?: string
  origin?: "manual" | "automation" | "system"
}) {
  if (params.origin === "manual") return

  const roles = getNotificationRecipientRoles(params.type)
  const userIds = await getStoreTeamUserIds({
    partnerId: params.partnerId,
    storeId: params.storeId,
    staffPartnerUserId: params.staffPartnerUserId,
    roles,
  })
  const content = buildNotificationContent(params.type, "seller", params.ctx)

  await createNotificationsForUsers(userIds, (userId) => ({
    userId,
    type: params.type,
    title: content.title,
    message: content.message,
    entityType: params.entityType,
    entityId: params.entityId,
    data: { ...params.ctx, audience: "seller", partner_id: params.partnerId, store_id: params.storeId },
    idempotencyKey: buildIdempotencyKey(
      params.type,
      params.entityType,
      params.entityId,
      userId,
      params.variant,
    ),
    origin: params.origin,
  }))
}

async function notifyCustomer(params: {
  userId: string
  type: NotificationType
  entityType: "order" | "appointment" | "subscription"
  entityId: string
  partnerId?: string | null
  customerId?: string | null
  phone?: string | null
  storeId?: string | null
  ctx: Parameters<typeof buildNotificationContent>[2]
  variant?: string
  origin?: "manual" | "automation" | "system"
}) {
  const content = buildNotificationContent(params.type, "customer", params.ctx)
  await createNotification({
    userId: params.userId,
    type: params.type,
    title: content.title,
    message: content.message,
    entityType: params.entityType,
    entityId: params.entityId,
    data: {
      ...params.ctx,
      audience: "customer",
      partner_id: params.partnerId,
      store_id: params.storeId,
      customer_id: params.customerId,
      phone: params.phone,
    },
    idempotencyKey: buildIdempotencyKey(
      params.type,
      params.entityType,
      params.entityId,
      params.userId,
      params.variant,
    ),
    origin: params.origin,
  })
}

export async function getOrderMixType(orderId: string): Promise<"product" | "service" | "both" | null> {
  const admin = getAdminClient()
  const { data: items } = await admin
    .from("order_items")
    .select("line_type")
    .eq("order_id", orderId)

  if (!items || items.length === 0) return null

  const hasProduct = items.some((i: { line_type: string }) => i.line_type === "product")
  const hasService = items.some((i: { line_type: string }) => i.line_type === "service_booking")

  if (hasProduct && hasService) return "both"
  if (hasService) return "service"
  return "product"
}

export async function scheduleNotificationAppointmentReminders(params: {
  partnerId: string
  appointmentId: string
  startDate: string
  startTime: string
  customerId?: string | null
  marketplaceOrderId?: string | null
  serviceName?: string
  storeName?: string
  timezone?: string
}) {
  const userId = await resolveCustomerUserId({
    customerId: params.customerId,
    marketplaceOrderId: params.marketplaceOrderId,
  })
  if (!userId) return

  const start = parseInTz(params.startDate, params.startTime, params.timezone || getDefaultTimezone())
  if (Number.isNaN(start.getTime())) return

  const reminder24h = new Date(start.getTime() - 24 * 60 * 60 * 1000)
  const reminder2h = new Date(start.getTime() - 2 * 60 * 60 * 1000)
  const now = Date.now()
  const basePayload = {
    partnerId: params.partnerId,
    customerId: params.customerId,
    marketplaceOrderId: params.marketplaceOrderId,
    serviceName: params.serviceName,
    storeName: params.storeName,
    startDate: params.startDate,
    startTime: params.startTime,
  }

  if (reminder24h.getTime() > now) {
    await scheduleNotificationJob({
      jobType: "appointment_reminder_24h",
      entityType: "appointment",
      entityId: params.appointmentId,
      partnerId: params.partnerId,
      runAt: reminder24h,
      payload: basePayload,
    })
  }

  if (reminder2h.getTime() > now) {
    await scheduleNotificationJob({
      jobType: "appointment_reminder_2h",
      entityType: "appointment",
      entityId: params.appointmentId,
      partnerId: params.partnerId,
      runAt: reminder2h,
      payload: basePayload,
    })
  }
}

export async function runScheduledNotificationJob(job: {
  id: string
  job_type: string
  entity_type: string
  entity_id: string
  partner_id?: string | null
  payload: Record<string, unknown>
}) {
  const admin = getAdminClient()

  await admin
    .from("notification_scheduled_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("status", "pending")

  const { data: appointment } = await admin
    .from("appointments")
    .select("id, partner_id, customer_id, service_name, start_date, start_time, status, marketplace_order_id")
    .eq("id", job.entity_id)
    .maybeSingle()

  if (!appointment) {
    await admin
      .from("notification_scheduled_jobs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return
  }

  const status = String(appointment.status || "").toLowerCase()
  if (status === "cancelado" || status === "ausência") {
    await admin
      .from("notification_scheduled_jobs")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return
  }

  const userId = await resolveCustomerUserId({
    customerId: appointment.customer_id,
    marketplaceOrderId: appointment.marketplace_order_id,
  })

  if (!userId) {
    await admin
      .from("notification_scheduled_jobs")
      .update({
        status: "failed",
        last_error: "no_linked_user",
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)
    return
  }

  const { data: partner } = await admin
    .from("partners")
    .select("id")
    .eq("id", appointment.partner_id)
    .maybeSingle()

  // Get store name from stores table
  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", appointment.partner_id)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (job.job_type === "service_return_reminder") {
    // Verificar se o aplicativo de Retorno de Serviços está ativo para o parceiro
    const isAddonActive = await checkIsAddonActive(appointment.partner_id as string, "service_return")
    if (!isAddonActive) {
      await admin
        .from("notification_scheduled_jobs")
        .update({ status: "cancelled", updated_at: new Date().toISOString() })
        .eq("id", job.id)
      return
    }

    const returnInterval = (job.payload?.returnInterval as string) || undefined
    const serviceNameFromPayload = (job.payload?.serviceName as string) || appointment.service_name

    await notifyCustomer({
      userId,
      type: "service_return_reminder",
      entityType: "appointment",
      entityId: appointment.id,
      partnerId: appointment.partner_id as string,
      customerId: appointment.customer_id as string,
      storeId: appointment.store_id as string | null,
      variant: job.job_type,
      ctx: {
        serviceName: serviceNameFromPayload,
        storeName: hqStore?.name || undefined,
        returnInterval,
      },
    })

    // Registrar métrica do aplicativo
    await recordAddonEvent({
      partnerId: appointment.partner_id as string,
      addonSlug: "service_return",
      eventType: "sent",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: {
        serviceName: serviceNameFromPayload,
        returnInterval,
        customerId: appointment.customer_id,
      },
    })

    await admin
      .from("notification_scheduled_jobs")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", job.id)
    return
  }

  const reminderLabel =
    job.job_type === "appointment_reminder_24h"
      ? "Lembrete: agendamento amanhã"
      : "Lembrete: agendamento em 2 horas"

  await notifyCustomer({
    userId,
    type: "appointment_reminder",
    entityType: "appointment",
    entityId: appointment.id,
    partnerId: appointment.partner_id as string,
    customerId: appointment.customer_id as string,
    storeId: appointment.store_id as string | null,
    variant: job.job_type,
    ctx: {
      serviceName: appointment.service_name,
      storeName: hqStore?.name || undefined,
      date: appointment.start_date,
      time: String(appointment.start_time).slice(0, 5),
      reminderLabel,
    },
  })

  await admin
    .from("notification_scheduled_jobs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", job.id)
}

export async function onAppointmentCreated(
  appointment: Record<string, unknown>,
  origin: "manual" | "automation" | "system" = "automation",
) {
  if (appointment.source === "unavailable") return

  const partnerId = String(appointment.partner_id)
  const appointmentId = String(appointment.id)
  const storeId = appointment.store_id ? String(appointment.store_id) : null
  const staffPartnerUserId = appointment.staff_partner_user_id ? String(appointment.staff_partner_user_id) : null

  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle()

  // Get store name from stores table
  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  await notifyPartnerTeam({
    partnerId,
    storeId,
    staffPartnerUserId,
    type: "appointment_created",
    entityType: "appointment",
    entityId: appointmentId,
    ctx: {
      customerName: String(appointment.customer_name || "Cliente"),
      serviceName: String(appointment.service_name),
      date: String(appointment.start_date),
      time: String(appointment.start_time).slice(0, 5),
      storeName: hqStore?.name || undefined,
    },
    origin,
  })

  await scheduleNotificationAppointmentReminders({
    partnerId,
    appointmentId,
    startDate: String(appointment.start_date),
    startTime: String(appointment.start_time),
    customerId: appointment.customer_id as string | null,
    marketplaceOrderId: appointment.marketplace_order_id as string | null | undefined,
    serviceName: String(appointment.service_name),
    storeName: hqStore?.name || undefined,
  })
}

export async function onAppointmentStatusChanged(
  appointment: Record<string, unknown>,
  previousStatus: string,
  newStatus: string,
  origin: "manual" | "automation" | "system" = "automation",
) {
  const partnerId = String(appointment.partner_id)
  const appointmentId = String(appointment.id)
  const storeId = appointment.store_id ? String(appointment.store_id) : null
  const staffPartnerUserId = appointment.staff_partner_user_id ? String(appointment.staff_partner_user_id) : null
  const prev = previousStatus.toLowerCase()
  const next = newStatus.toLowerCase()
  if (prev === next) return

  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle()

  // Get store name from stores table
  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const ctx = {
    serviceName: String(appointment.service_name),
    storeName: hqStore?.name || undefined,
    customerName: String(appointment.customer_name || "Cliente"),
    date: String(appointment.start_date),
    time: String(appointment.start_time).slice(0, 5),
    cancellationNote: (appointment.cancellation_note as string) || undefined,
  }

  if (next === "confirmado") {
    const userId = await resolveCustomerUserId({
      customerId: appointment.customer_id as string | null,
      marketplaceOrderId: appointment.marketplace_order_id as string | null | undefined,
    })
    if (userId) {
      await notifyCustomer({
        userId,
        type: "appointment_confirmed",
        entityType: "appointment",
        entityId: appointmentId,
        partnerId,
        customerId: appointment.customer_id as string | null | undefined,
        storeId,
        ctx,
        origin,
      })
    }
  } else if (next === "cancelado") {
    const userId = await resolveCustomerUserId({
      customerId: appointment.customer_id as string | null,
      marketplaceOrderId: appointment.marketplace_order_id as string | null | undefined,
    })
    if (userId) {
      await notifyCustomer({
        userId,
        type: "appointment_cancelled",
        entityType: "appointment",
        entityId: appointmentId,
        partnerId,
        customerId: appointment.customer_id as string | null | undefined,
        storeId,
        ctx,
        origin,
      })
    }
    await notifyPartnerTeam({
      partnerId,
      storeId,
      staffPartnerUserId,
      type: "appointment_cancelled",
      entityType: "appointment",
      entityId: appointmentId,
      ctx,
      origin,
    })
  } else if (next === "concluído" || next === "concluido" || next === "completed") {
    await scheduleServiceReturnReminder({
      appointment,
      partnerId,
      storeId,
      origin,
    })
  }
}

export async function onAppointmentRescheduled(
  appointment: Record<string, unknown>,
  origin: "manual" | "automation" | "system" = "automation",
) {
  const partnerId = String(appointment.partner_id)
  const appointmentId = String(appointment.id)
  const storeId = appointment.store_id ? String(appointment.store_id) : null
  const staffPartnerUserId = appointment.staff_partner_user_id ? String(appointment.staff_partner_user_id) : null

  const admin = getAdminClient()

  // Delete old pending scheduled jobs
  await admin
    .from("notification_scheduled_jobs")
    .delete()
    .eq("entity_type", "appointment")
    .eq("entity_id", appointmentId)
    .eq("status", "pending")

  const { data: partner } = await admin
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle()

  // Get store name from stores table
  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const ctx = {
    serviceName: String(appointment.service_name),
    storeName: hqStore?.name || undefined,
    customerName: String(appointment.customer_name || "Cliente"),
    date: String(appointment.start_date),
    time: String(appointment.start_time).slice(0, 5),
  }

  let customerPhone: string | null = null
  if (appointment.marketplace_order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("buyer_phone")
      .eq("id", String(appointment.marketplace_order_id))
      .maybeSingle()
    customerPhone = order?.buyer_phone || null
  }
  if (!customerPhone && appointment.customer_id) {
    const { data: customer } = await admin
      .from("customers")
      .select("phone")
      .eq("id", String(appointment.customer_id))
      .maybeSingle()
    customerPhone = customer?.phone || null
  }

  const userId = await resolveCustomerUserId({
    customerId: appointment.customer_id as string | null,
    marketplaceOrderId: appointment.marketplace_order_id as string | null | undefined,
  })

  if (userId) {
    await notifyCustomer({
      userId,
      type: "appointment_rescheduled",
      entityType: "appointment",
      entityId: appointmentId,
      partnerId,
      customerId: appointment.customer_id as string | null | undefined,
      phone: customerPhone,
      ctx,
      origin,
    })
  }

  await notifyPartnerTeam({
    partnerId,
    storeId,
    staffPartnerUserId,
    type: "appointment_rescheduled",
    entityType: "appointment",
    entityId: appointmentId,
    ctx,
    origin,
  })

  await scheduleNotificationAppointmentReminders({
    partnerId,
    appointmentId,
    startDate: String(appointment.start_date),
    startTime: String(appointment.start_time),
    customerId: appointment.customer_id as string | null,
    marketplaceOrderId: appointment.marketplace_order_id as string | null | undefined,
    serviceName: String(appointment.service_name),
    storeName: hqStore?.name || undefined,
  })
}

function addIntervalToDate(dateStr: string, value: number, unit: string): Date | null {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return null
  const base = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const lower = (unit || "").toLowerCase()
  if (lower === "dias" || lower === "dia") {
    base.setDate(base.getDate() + value)
  } else if (lower === "semanas" || lower === "semana") {
    base.setDate(base.getDate() + value * 7)
  } else if (lower === "meses" || lower === "mês") {
    base.setMonth(base.getMonth() + value)
  } else if (lower === "anos" || lower === "ano") {
    base.setFullYear(base.getFullYear() + value)
  } else {
    base.setMonth(base.getMonth() + value)
  }
  return base
}

function formatIntervalLabel(value: number, unit: string): string {
  const lower = (unit || "").toLowerCase()
  if (lower === "dias" || lower === "dia") return `${value} dia${value > 1 ? "s" : ""}`
  if (lower === "semanas" || lower === "semana") return `${value} semana${value > 1 ? "s" : ""}`
  if (lower === "meses" || lower === "mês") return `${value} mês${value > 1 ? "es" : ""}`
  if (lower === "anos" || lower === "ano") return `${value} ano${value > 1 ? "s" : ""}`
  return `${value} ${unit}`
}

export async function scheduleServiceReturnReminder(params: {
  appointment: Record<string, unknown>
  partnerId: string
  storeId?: string | null
  origin: "manual" | "automation" | "system"
}) {
  const appointment = params.appointment
  const partnerId = params.partnerId
  const serviceId = appointment.service_id as string | null

  if (!serviceId) return

  const admin = getAdminClient()

  const { data: service } = await admin
    .from("services")
    .select("id, recurrence_interval_value, recurrence_interval_unit, name")
    .eq("id", serviceId)
    .maybeSingle()

  const intervalValue = Number(service?.recurrence_interval_value || 0)
  const intervalUnit = String(service?.recurrence_interval_unit || "Meses")

  if (!intervalValue || intervalValue <= 0) return

  const reminderDate = addIntervalToDate(String(appointment.start_date), intervalValue, intervalUnit)
  if (!reminderDate) return

  const now = Date.now()
  if (reminderDate.getTime() <= now) return

  const userId = await resolveCustomerUserId({
    customerId: appointment.customer_id as string | null,
    marketplaceOrderId: appointment.marketplace_order_id as string | null | undefined,
  })

  const returnIntervalLabel = formatIntervalLabel(intervalValue, intervalUnit)

  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const storeName = hqStore?.name || ""

  if (userId) {
    await scheduleNotificationJob({
      jobType: "service_return_reminder",
      entityType: "appointment",
      entityId: String(appointment.id),
      partnerId,
      runAt: reminderDate,
      payload: {
        customerId: appointment.customer_id,
        serviceName: service?.name || String(appointment.service_name),
        storeName,
        returnInterval: returnIntervalLabel,
      },
    })
  }

  try {
    const { scheduleWhatsappJob } = await import("./whatsapp-automation.service")
    const phone = await (async () => {
      const customerId = appointment.customer_id as string | null
      if (!customerId) return null
      const { data: customer } = await admin
        .from("customers")
        .select("phone")
        .eq("id", customerId)
        .eq("partner_id", partnerId)
        .maybeSingle()
      return customer?.phone || null
    })()

    if (phone) {
      await scheduleWhatsappJob({
        partnerId,
        storeId: params.storeId || null,
        jobType: "service_return_reminder",
        entityType: "appointment",
        entityId: String(appointment.id),
        runAt: reminderDate,
        payload: {
          customerId: appointment.customer_id,
          phone,
          serviceName: service?.name || String(appointment.service_name),
          returnInterval: returnIntervalLabel,
        },
      })
    }
  } catch (err) {
    console.error("[scheduleServiceReturnReminder] Failed to schedule WhatsApp job:", err)
  }
}

export async function notifyAppointmentCreatedFromMarketplace(params: {
  partnerId: string
  appointmentId: string
  customerName: string
  serviceName: string
  startDate: string
  startTime: string
  customerId?: string | null
  marketplaceOrderId?: string | null
  storeName?: string
  storeId?: string | null
  staffPartnerUserId?: string | null
}) {
  const appointment = {
    partner_id: params.partnerId,
    id: params.appointmentId,
    customer_name: params.customerName,
    service_name: params.serviceName,
    start_date: params.startDate,
    start_time: params.startTime,
    customer_id: params.customerId || null,
    marketplace_order_id: params.marketplaceOrderId || null,
    store_id: params.storeId || null,
    staff_partner_user_id: params.staffPartnerUserId || null,
    source: "appointment",
  }

  await onAppointmentCreated(appointment)
}

const CUSTOMER_SITUATION_TYPES: Record<string, NotificationType> = {
  paid: "order_paid",
  cancelled: "order_cancelled",
  refunded: "order_refunded",
}

const CUSTOMER_DELIVERY_TYPES: Record<string, NotificationType> = {
  shipped: "order_shipped",
  sent: "order_shipped",
  delivered: "order_delivered",
}

export async function onOrderStatusChanged(
  order: Record<string, unknown>,
  situation?: string,
  deliveryStatus?: string,
  origin: "manual" | "automation" | "system" = "automation",
  cancellationReason?: string,
) {
  const partnerId = String(order.partner_id)
  const orderId = String(order.id)
  const orderNumber = String(order.order_number || orderId.slice(0, 8))

  const admin = getAdminClient()

  let storeId = (order.store_id as string | null) || null
  if (!storeId) {
    const { data: orderDb } = await admin
      .from("orders")
      .select("store_id")
      .eq("id", orderId)
      .maybeSingle()
    if (orderDb?.store_id) {
      storeId = orderDb.store_id
    }
  }

  const { data: partner } = await admin
    .from("partners")
    .select("id")
    .eq("id", partnerId)
    .maybeSingle()

  // Get store name from stores table
  const { data: hqStore } = await admin
    .from("stores")
    .select("name")
    .eq("partner_id", partnerId)
    .order("is_headquarters", { ascending: false })
    .limit(1)
    .maybeSingle()

  const ctx = {
    orderNumber,
    storeName: hqStore?.name || undefined,
    customerName: String(order.customer_name || "Cliente"),
    amount: formatCurrency(order.total_amount as number | null),
    cancellationNote: cancellationReason,
  }

  if (situation === "pending") {
    const mixType = await getOrderMixType(orderId)

    if (mixType === "service" || mixType === "both") {
      const { data: serviceItem } = await admin
        .from("order_items")
        .select("services!inner(name)")
        .eq("order_id", orderId)
        .eq("line_type", "service_booking")
        .limit(1)
        .maybeSingle()

      const serviceName = (serviceItem as any)?.services?.name || "serviço"

      if (mixType !== "service") {
        await notifyPartnerTeam({
          partnerId,
          storeId,
          type: "order_created",
          entityType: "order",
          entityId: orderId,
          ctx: {
            ...ctx,
            serviceName,
            mixType,
          },
          variant: mixType,
          origin,
        })
      }
    } else {
      await notifyPartnerTeam({
        partnerId,
        storeId,
        type: "order_created",
        entityType: "order",
        entityId: orderId,
        ctx,
        origin,
      })
    }
    return
  }

  if (situation && CUSTOMER_SITUATION_TYPES[situation]) {
    const type = CUSTOMER_SITUATION_TYPES[situation]
    const buyerId = order.buyer_id as string | null
    const mixType = await getOrderMixType(orderId)

    if (buyerId) {
      const skipForCustomer = mixType === "service" && situation === "paid"
      if (!skipForCustomer) {
        const userId = await resolveCustomerUserId({ buyerId })
        if (userId) {
          await notifyCustomer({
            userId,
            type,
            entityType: "order",
            entityId: orderId,
            partnerId,
            customerId: (order.customer_id as string) || (order.buyer_id as string) || undefined,
            phone: (order.buyer_phone as string) || undefined,
            storeId,
            ctx: { ...ctx, orderNumber },
            origin,
          })
        }
      }
    }

    if (situation === "paid" || situation === "cancelled" || situation === "refunded") {
      const skipForPartner = mixType === "service" && situation === "cancelled"
      if (!skipForPartner) {
        await notifyPartnerTeam({
          partnerId,
          storeId,
          type,
          entityType: "order",
          entityId: orderId,
          ctx,
          origin,
        })
      }
    }
    return
  }

  if (deliveryStatus && CUSTOMER_DELIVERY_TYPES[deliveryStatus]) {
    const type = CUSTOMER_DELIVERY_TYPES[deliveryStatus]
    const buyerId = order.buyer_id as string | null
    if (buyerId) {
      const userId = await resolveCustomerUserId({ buyerId })
      if (userId) {
        await notifyCustomer({
          userId,
          type,
          entityType: "order",
          entityId: orderId,
          partnerId,
          customerId: (order.customer_id as string) || (order.buyer_id as string) || undefined,
          phone: (order.buyer_phone as string) || undefined,
          storeId,
          ctx: { ...ctx, orderNumber },
          origin,
        })
      }
    }
  }
}

export async function onSubscriptionCreated(_params: {
  partnerId: string
  subscriptionId: string
  customerId?: string | null
  customerName?: string
  planName?: string
}) {
}

export async function onSubscriptionRenewed(_params: {
  partnerId: string
  subscriptionId: string
  customerId?: string | null
  customerName?: string
}) {
}

export async function notifySubscriptionPriceChangeToCustomer(params: {
  subscriptionId: string
  partnerId: string
  storeId?: string | null
  customerId?: string | null
  customerUserId: string
  planName: string
  storeName?: string | null
  oldAmount: number
  newAmount: number
  deadline: string
  windowExpiresAt: string
}) {
  await notifyCustomer({
    userId: params.customerUserId,
    type: "subscription_price_change",
    entityType: "subscription",
    entityId: params.subscriptionId,
    partnerId: params.partnerId,
    customerId: params.customerId,
    storeId: params.storeId,
    ctx: {
      planName: params.planName,
      storeName: params.storeName || undefined,
      oldAmount: formatCurrency(params.oldAmount),
      newAmount: formatCurrency(params.newAmount),
      date: params.deadline,
    },
    variant: `window-${params.windowExpiresAt}`,
    origin: "automation",
  })
}

export async function notifySubscriptionPriceChangeExpired(params: {
  subscriptionId: string
  partnerId: string
  storeId?: string | null
  planName: string
  windowExpiresAt: string
}) {
  await notifyPartnerTeam({
    partnerId: params.partnerId,
    storeId: params.storeId,
    type: "subscription_price_change_expired",
    entityType: "subscription",
    entityId: params.subscriptionId,
    ctx: { planName: params.planName },
    variant: `window-${params.windowExpiresAt}`,
    origin: "automation",
  })
}

export async function broadcastAdminAnnouncement(params: {
  title: string
  message: string
  url?: string
  target: "all" | "sellers" | "customers"
  announcementId: string
}) {
  const admin = getAdminClient()
  let userIds: string[] = []

  if (params.target === "all") {
    const { data } = await admin.from("user_profiles").select("user_id")
    userIds = (data || []).map((r: { user_id: string }) => r.user_id).filter(Boolean)
  } else if (params.target === "sellers") {
    const [{ data: owners }, { data: members }] = await Promise.all([
      admin.from("partners").select("user_id"),
      admin.from("partner_users").select("user_id"),
    ])
    userIds = [
      ...(owners || []).map((r: { user_id: string }) => r.user_id),
      ...(members || []).map((r: { user_id: string }) => r.user_id),
    ].filter(Boolean)
  } else {
    const { data } = await admin
      .from("orders")
      .select("buyer_id")
      .not("buyer_id", "is", null)
    userIds = [...new Set((data || []).map((r: { buyer_id: string }) => r.buyer_id).filter(Boolean))] as string[]
  }

  const unique = [...new Set(userIds)]
  const content = buildNotificationContent("admin_announcement", "admin", {
    storeName: params.title,
    customerName: params.message,
  })

  await createNotificationsForUsers(unique, (userId) => ({
    userId,
    type: "admin_announcement",
    title: params.title || content.title,
    message: params.message || content.message,
    entityType: "announcement",
    entityId: params.announcementId,
    data: {
      url: params.url || "/",
      audience: "admin",
      scope: params.target === "all" || params.target === "sellers" ? "platform" : "partner",
      announcement_id: params.announcementId,
    },
    idempotencyKey: `admin_announcement:${params.announcementId}:${userId}`,
  }))
}

export async function notifyCustomerBatchOrders(params: {
  userId: string
  partnerId: string
  type: NotificationType
  orders: Array<{ id: string; orderNumber?: string }>
  customerName?: string
  storeName?: string
  phone?: string
  origin?: "manual" | "automation" | "system"
  cancellationReason?: string
}) {
  if (!params.orders || params.orders.length === 0) return
  if (params.orders.length === 1) {
    const singleOrder = params.orders[0]
    return onOrderStatusChanged(
      {
        id: singleOrder.id,
        order_number: singleOrder.orderNumber,
        partner_id: params.partnerId,
        buyer_id: params.userId,
        buyer_phone: params.phone,
        customer_name: params.customerName,
      },
      params.type === "order_paid"
        ? "paid"
        : params.type === "order_cancelled"
          ? "cancelled"
          : undefined,
      undefined,
      params.origin,
      params.cancellationReason,
    )
  }

  const count = params.orders.length
  const batchId = params.orders.map((o) => o.id).sort().join("-")
  const orderNumbers = params.orders.map((o) => o.orderNumber).filter(Boolean) as string[]

  let storeName = params.storeName
  if (!storeName) {
    const admin = getAdminClient()
    const { data: hqStore } = await admin
      .from("stores")
      .select("name")
      .eq("partner_id", params.partnerId)
      .order("is_headquarters", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (hqStore?.name) {
      storeName = hqStore.name
    }
  }

  const content = buildNotificationContent(params.type, "customer", {
    isBatch: true,
    batchCount: count,
    orderNumbers,
    storeName,
    customerName: params.customerName,
    cancellationNote: params.cancellationReason,
  })

  await createNotification({
    userId: params.userId,
    type: params.type,
    title: content.title,
    message: content.message,
    entityType: "order",
    entityId: params.orders[0].id,
    data: {
      href: `/marketplace/me/orders`,
      isBatch: true,
      batchCount: count,
      orderIds: params.orders.map((o) => o.id),
      orderNumbers,
      partner_id: params.partnerId,
      customer_id: params.userId,
      phone: params.phone,
      storeName,
      customerName: params.customerName,
      cancellationReason: params.cancellationReason,
    },
    idempotencyKey: buildIdempotencyKey(
      params.type,
      "order_batch",
      batchId,
      params.userId,
    ),
    origin: params.origin,
  })
}

