import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { buildNotificationContent } from "@/lib/notifications/templates"
import type { NotificationType } from "@/lib/notifications/types"
import {
  buildIdempotencyKey,
  createNotification,
  createNotificationsForUsers,
  getPartnerTeamUserIds,
  resolveCustomerUserId,
  scheduleNotificationJob,
} from "./notification.service"

function formatCurrency(value: number | null | undefined): string | undefined {
  if (value == null || Number.isNaN(Number(value))) return undefined
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value))
}

async function notifyPartnerTeam(params: {
  partnerId: string
  type: NotificationType
  entityType: "order" | "appointment" | "subscription"
  entityId: string
  ctx: Parameters<typeof buildNotificationContent>[2]
  variant?: string
}) {
  const userIds = await getPartnerTeamUserIds(params.partnerId)
  const content = buildNotificationContent(params.type, "seller", params.ctx)

  await createNotificationsForUsers(userIds, (userId) => ({
    userId,
    type: params.type,
    title: content.title,
    message: content.message,
    entityType: params.entityType,
    entityId: params.entityId,
    data: { ...params.ctx, audience: "seller", partner_id: params.partnerId },
    idempotencyKey: buildIdempotencyKey(
      params.type,
      params.entityType,
      params.entityId,
      userId,
      params.variant,
    ),
  }))
}

async function notifyCustomer(params: {
  userId: string
  type: NotificationType
  entityType: "order" | "appointment" | "subscription"
  entityId: string
  ctx: Parameters<typeof buildNotificationContent>[2]
  variant?: string
}) {
  const content = buildNotificationContent(params.type, "customer", params.ctx)
  await createNotification({
    userId: params.userId,
    type: params.type,
    title: content.title,
    message: content.message,
    entityType: params.entityType,
    entityId: params.entityId,
    data: { ...params.ctx, audience: "customer" },
    idempotencyKey: buildIdempotencyKey(
      params.type,
      params.entityType,
      params.entityId,
      params.userId,
      params.variant,
    ),
  })
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
}) {
  const start = new Date(`${params.startDate}T${params.startTime}`)
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
    .select("store_name")
    .eq("id", appointment.partner_id)
    .maybeSingle()

  const reminderLabel =
    job.job_type === "appointment_reminder_24h"
      ? "Lembrete: agendamento amanhã"
      : "Lembrete: agendamento em 2 horas"

  await notifyCustomer({
    userId,
    type: "appointment_reminder",
    entityType: "appointment",
    entityId: appointment.id,
    variant: job.job_type,
    ctx: {
      serviceName: appointment.service_name,
      storeName: partner?.store_name || undefined,
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

  await notifyPartnerTeam({
    partnerId,
    type: "appointment_created",
    entityType: "appointment",
    entityId: appointmentId,
    ctx: {
      customerName: String(appointment.customer_name || "Cliente"),
      serviceName: String(appointment.service_name),
      date: String(appointment.start_date),
      time: String(appointment.start_time).slice(0, 5),
      storeName: partner?.store_name || undefined,
    },
  })

  await scheduleNotificationAppointmentReminders({
    partnerId,
    appointmentId,
    startDate: String(appointment.start_date),
    startTime: String(appointment.start_time),
    customerId: appointment.customer_id as string | null,
    marketplaceOrderId: appointment.marketplace_order_id as string | null | undefined,
    serviceName: String(appointment.service_name),
    storeName: partner?.store_name || undefined,
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

  const ctx = {
    serviceName: String(appointment.service_name),
    storeName: partner?.store_name || undefined,
    customerName: String(appointment.customer_name || "Cliente"),
    date: String(appointment.start_date),
    time: String(appointment.start_time).slice(0, 5),
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
        ctx,
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
        ctx,
      })
    }
    await notifyPartnerTeam({
      partnerId,
      type: "appointment_cancelled",
      entityType: "appointment",
      entityId: appointmentId,
      ctx,
    })
  }
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
) {
  const partnerId = String(order.partner_id)
  const orderId = String(order.id)
  const orderNumber = String(order.order_number || orderId.slice(0, 8))

  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", partnerId)
    .maybeSingle()

  const ctx = {
    orderNumber,
    storeName: partner?.store_name || undefined,
    customerName: String(order.customer_name || "Cliente"),
    amount: formatCurrency(order.total_amount as number | null),
  }

  if (situation === "pending") {
    await notifyPartnerTeam({
      partnerId,
      type: "order_created",
      entityType: "order",
      entityId: orderId,
      ctx,
    })
    return
  }

  if (situation && CUSTOMER_SITUATION_TYPES[situation]) {
    const type = CUSTOMER_SITUATION_TYPES[situation]
    const buyerId = order.buyer_id as string | null
    if (buyerId) {
      await notifyCustomer({
        userId: buyerId,
        type,
        entityType: "order",
        entityId: orderId,
        ctx: { ...ctx, orderNumber },
      })
    }
    if (situation === "paid" || situation === "cancelled" || situation === "refunded") {
      await notifyPartnerTeam({
        partnerId,
        type,
        entityType: "order",
        entityId: orderId,
        ctx,
      })
    }
    return
  }

  if (deliveryStatus && CUSTOMER_DELIVERY_TYPES[deliveryStatus]) {
    const type = CUSTOMER_DELIVERY_TYPES[deliveryStatus]
    const buyerId = order.buyer_id as string | null
    if (buyerId) {
      await notifyCustomer({
        userId: buyerId,
        type,
        entityType: "order",
        entityId: orderId,
        ctx: { ...ctx, orderNumber },
      })
    }
  }
}

export async function onSubscriptionCreated(params: {
  partnerId: string
  subscriptionId: string
  customerId?: string | null
  customerName?: string
  planName?: string
}) {
  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", params.partnerId)
    .maybeSingle()

  const ctx = {
    customerName: params.customerName || "Cliente",
    storeName: partner?.store_name || params.planName,
  }

  await notifyPartnerTeam({
    partnerId: params.partnerId,
    type: "subscription_created",
    entityType: "subscription",
    entityId: params.subscriptionId,
    ctx,
  })

  const userId = await resolveCustomerUserId({ customerId: params.customerId })
  if (userId) {
    await notifyCustomer({
      userId,
      type: "subscription_created",
      entityType: "subscription",
      entityId: params.subscriptionId,
      ctx,
    })
  }
}

export async function onSubscriptionRenewed(params: {
  partnerId: string
  subscriptionId: string
  customerId?: string | null
  customerName?: string
}) {
  const admin = getAdminClient()
  const { data: partner } = await admin
    .from("partners")
    .select("store_name")
    .eq("id", params.partnerId)
    .maybeSingle()

  const ctx = {
    customerName: params.customerName || "Cliente",
    storeName: partner?.store_name || undefined,
  }

  await notifyPartnerTeam({
    partnerId: params.partnerId,
    type: "subscription_renewed",
    entityType: "subscription",
    entityId: params.subscriptionId,
    ctx,
  })

  const userId = await resolveCustomerUserId({ customerId: params.customerId })
  if (userId) {
    await notifyCustomer({
      userId,
      type: "subscription_renewed",
      entityType: "subscription",
      entityId: params.subscriptionId,
      ctx,
    })
  }
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
      announcement_id: params.announcementId,
    },
    idempotencyKey: `admin_announcement:${params.announcementId}:${userId}`,
  }))
}
