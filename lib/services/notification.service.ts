import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { getNotificationHref } from "@/lib/notifications/navigation"
import type {
  CreateNotificationInput,
  NotificationAudience,
  NotificationPageCursor,
  NotificationRecord,
  NotificationsPageResult,
  NotificationType,
} from "@/lib/notifications/types"
import { resolveAndDeliverNotification } from "./notification-resolver.service"

const PAGE_SIZE = 30

export async function createNotification(
  input: CreateNotificationInput,
): Promise<{ notification: NotificationRecord | null; created: boolean }> {
  if (!input.userId) {
    return { notification: null, created: false }
  }

  const admin = getAdminClient()

  try {
    const { data: authLookup, error: authError } = await admin.auth.admin.getUserById(input.userId)

    if (authError || !authLookup?.user) {
      console.warn(`[notifications] User ${input.userId} not found in auth.users. Skipping notification.`)
      return { notification: null, created: false }
    }
  } catch {
    console.warn(`[notifications] Could not verify user ${input.userId} in auth.users (schema may be inaccessible). Proceeding.`)
  }

  const { data: existing } = await admin
    .from("notifications")
    .select("*")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle()

  if (existing) {
    return { notification: existing as NotificationRecord, created: false }
  }

  const audience = (input.data?.audience as NotificationAudience | undefined) || "customer"
  const origin = input.origin || "system"

  if (origin === "manual" && audience !== "customer") {
    return { notification: null, created: false }
  }

  const href = getNotificationHref({
    type: input.type,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    data: input.data,
    audience,
  })

  const row = {
    user_id: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    data: { ...input.data, href, audience, origin },
    idempotency_key: input.idempotencyKey,
  }

  const { data, error } = await admin
    .from("notifications")
    .insert(row)
    .select("*")
    .single()

  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await admin
        .from("notifications")
        .select("*")
        .eq("idempotency_key", input.idempotencyKey)
        .maybeSingle()
      return { notification: (raced as NotificationRecord) ?? null, created: false }
    }
    console.error("[notifications] create error", error.message)
    return { notification: null, created: false }
  }

  const notification = data as NotificationRecord

  await admin.from("notification_delivery_log").insert({
    notification_id: notification.id,
    channel: "in_app",
    status: "sent",
    metadata: { type: input.type, origin },
  })

  try {
    await resolveAndDeliverNotification({
      userId: input.userId,
      notificationId: notification.id,
      type: input.type,
      title: input.title,
      body: input.message,
      href,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      partnerId: (input.data?.partner_id as string | undefined) || null,
      storeId: (input.data?.store_id as string | undefined) || null,
      customerId: (input.data?.customer_id as string | undefined) || null,
      phone: (input.data?.phone as string | undefined) || null,
      data: input.data,
    })
  } catch (err) {
    console.error("[notifications] delivery resolver failed", err instanceof Error ? err.message : err)
  }

  return { notification, created: true }
}

export async function createNotificationsForUsers(
  userIds: string[],
  build: (userId: string) => CreateNotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))]
  await Promise.all(
    unique.map(async (userId) => {
      try {
        await createNotification(build(userId))
      } catch (err) {
        console.error("[notifications] batch create failed", userId, err)
      }
    }),
  )
}

export async function getPartnerTeamUserIds(partnerId: string): Promise<string[]> {
  const admin = getAdminClient()
  const userIds = new Set<string>()

  const [{ data: partner }, { data: members }] = await Promise.all([
    admin.from("partners").select("user_id").eq("id", partnerId).maybeSingle(),
    admin.from("partner_users").select("user_id").eq("partner_id", partnerId),
  ])

  if (partner?.user_id) userIds.add(partner.user_id)
  for (const member of members || []) {
    if (member.user_id) userIds.add(member.user_id)
  }

  return [...userIds]
}

export async function getStoreTeamUserIds(params: {
  partnerId: string
  storeId?: string | null
  staffPartnerUserId?: string | null
}): Promise<string[]> {
  const admin = getAdminClient()
  const userIds = new Set<string>()

  // 1. Owner do partner
  const { data: partner } = await admin
    .from("partners")
    .select("user_id")
    .eq("id", params.partnerId)
    .maybeSingle()

  if (partner?.user_id) userIds.add(partner.user_id)

  // 2. Todos os partner_users do partner
  const { data: rawPartnerUsers } = await admin
    .from("partner_users")
    .select("id, user_id, role")
    .eq("partner_id", params.partnerId)

  const partnerUsers = (rawPartnerUsers || []) as Array<{ id: string; user_id: string | null; role: string | null }>

  if (partnerUsers.length === 0) {
    return [...userIds]
  }

  // 2a. Usuários com role OWNER sempre recebem acesso
  for (const pu of partnerUsers) {
    if (pu.role === "OWNER" && pu.user_id) {
      userIds.add(pu.user_id)
    }
  }

  // 3. Se um funcionário/profissional específico foi atribuído (ex: agendamento)
  if (params.staffPartnerUserId) {
    const staffPu = partnerUsers.find((pu: { id: string; user_id: string | null }) => pu.id === params.staffPartnerUserId)
    if (staffPu?.user_id) {
      userIds.add(staffPu.user_id)
    }
  }

  // 4. Se storeId foi fornecido, filtrar membros vinculados à loja
  if (params.storeId) {
    const puIds = partnerUsers.map((pu: { id: string }) => pu.id).filter(Boolean)
    if (puIds.length > 0) {
      const { data: rawStoreMembers } = await admin
        .from("store_members")
        .select("partner_user_id")
        .eq("store_id", params.storeId)
        .in("partner_user_id", puIds)

      const storeMembers = (rawStoreMembers || []) as Array<{ partner_user_id: string }>

      if (storeMembers.length > 0) {
        const memberPuIds = new Set(storeMembers.map((sm: { partner_user_id: string }) => sm.partner_user_id))
        for (const pu of partnerUsers) {
          if (memberPuIds.has(pu.id) && pu.user_id) {
            userIds.add(pu.user_id)
          }
        }
      }
    }
  } else {
    // Fallback caso não haja storeId: incluir todos os partner_users
    for (const pu of partnerUsers) {
      if (pu.user_id) userIds.add(pu.user_id)
    }
  }

  return [...userIds]
}

async function resolveUserIdFromCustomerLookup(admin: ReturnType<typeof getAdminClient>, customerId: string): Promise<string | null> {
  const { data: customer } = await admin
    .from("customers")
    .select("id, user_id, marketplace_user_id, email")
    .eq("id", customerId)
    .maybeSingle()

  if (customer?.user_id || customer?.marketplace_user_id) {
    return customer.user_id || customer.marketplace_user_id
  }

  return null
}

export async function resolveCustomerUserId(params: {
  customerId?: string | null
  buyerId?: string | null
  marketplaceOrderId?: string | null
}): Promise<string | null> {
  const admin = getAdminClient()

  if (params.buyerId) {
    const resolved = await resolveUserIdFromCustomerLookup(admin, params.buyerId)
    if (resolved) return resolved
    return params.buyerId
  }

  if (params.marketplaceOrderId) {
    const { data: order } = await admin
      .from("orders")
      .select("buyer_id, customer_id")
      .eq("id", params.marketplaceOrderId)
      .maybeSingle()
    if (order?.buyer_id) {
      const resolved = await resolveUserIdFromCustomerLookup(admin, order.buyer_id)
      if (resolved) return resolved
      return order.buyer_id
    }
    if (order?.customer_id) {
      const resolved = await resolveUserIdFromCustomerLookup(admin, order.customer_id)
      if (resolved) return resolved
    }
  }

  if (params.customerId) {
    const resolved = await resolveUserIdFromCustomerLookup(admin, params.customerId)
    if (resolved) return resolved
  }

  return null
}

export async function fetchNotificationsPage(params: {
  userId: string
  cursor?: NotificationPageCursor | null
  limit?: number
}): Promise<NotificationsPageResult> {
  const admin = getAdminClient()
  const limit = params.limit ?? PAGE_SIZE

  let query = admin
    .from("notifications")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1)

  if (params.cursor) {
    const ts = params.cursor.createdAt
    query = query.or(
      `and(created_at.eq."${ts}",id.lt.${params.cursor.id}),created_at.lt."${ts}"`,
    )
  }

  const { data, error } = await query

  if (error) {
    console.error("[notifications] fetch page error", error.message)
    return { items: [], nextCursor: null, hasMore: false }
  }

  const rows = (data || []) as NotificationRecord[]
  const hasMore = rows.length > limit
  const items = hasMore ? rows.slice(0, limit) : rows
  const last = items[items.length - 1]

  return {
    items,
    hasMore,
    nextCursor: last ? { createdAt: last.created_at, id: last.id } : null,
  }
}

export async function getUnreadCountForUser(userId: string): Promise<number> {
  const admin = getAdminClient()
  const { count, error } = await admin
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false)

  if (error) {
    console.error("[notifications] unread count error", error.message)
    return 0
  }
  return count ?? 0
}

export async function markNotificationsReadForUser(
  userId: string,
  notificationIds: string[],
): Promise<number> {
  if (notificationIds.length === 0) return 0

  const admin = getAdminClient()
  const { data, error } = await admin
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", notificationIds)
    .eq("is_read", false)
    .select("id")

  if (error) {
    console.error("[notifications] mark read error", error.message)
    return 0
  }
  return data?.length ?? 0
}

export async function markAllNotificationsReadForUser(userId: string): Promise<number> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("notifications")
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_read", false)
    .select("id")

  if (error) {
    console.error("[notifications] mark all read error", error.message)
    return 0
  }
  return data?.length ?? 0
}

export async function registerPushSubscription(params: {
  userId: string
  fcmToken: string
  deviceName?: string | null
  deviceFingerprint?: string | null
}): Promise<{ success: boolean; error?: string }> {
  const admin = getAdminClient()

  // 1. Delete this token from any other users to ensure exclusive ownership
  await admin
    .from("push_subscriptions")
    .delete()
    .eq("fcm_token", params.fcmToken)
    .neq("user_id", params.userId)

  if (params.deviceFingerprint && params.deviceName) {
    const fingerprintTag = `fp:${params.deviceFingerprint}:${params.deviceName}`
    const { data: existing } = await admin
      .from("push_subscriptions")
      .select("id, fcm_token")
      .eq("user_id", params.userId)
      .eq("device_name", fingerprintTag)
      .maybeSingle()

    if (existing) {
      if (existing.fcm_token !== params.fcmToken) {
        const { error: updateError } = await admin
          .from("push_subscriptions")
          .update({
            fcm_token: params.fcmToken,
            last_seen_at: new Date().toISOString(),
          })
          .eq("id", existing.id)

        if (updateError) return { success: false, error: updateError.message }
        return { success: true }
      }

      await admin
        .from("push_subscriptions")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", existing.id)
      return { success: true }
    }
  }

  const deviceTag = params.deviceFingerprint && params.deviceName
    ? `fp:${params.deviceFingerprint}:${params.deviceName}`
    : params.deviceName || null

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: params.userId,
      fcm_token: params.fcmToken,
      device_name: deviceTag,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_id,fcm_token" },
  )

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function unregisterPushSubscription(params: {
  userId: string
  fcmToken: string
}): Promise<void> {
  const admin = getAdminClient()
  await admin
    .from("push_subscriptions")
    .delete()
    .eq("user_id", params.userId)
    .eq("fcm_token", params.fcmToken)
}

export async function scheduleNotificationJob(params: {
  jobType: string
  entityType: string
  entityId: string
  partnerId?: string | null
  runAt: Date
  payload?: Record<string, unknown>
}) {
  const admin = getAdminClient()
  const idempotencyKey = `${params.jobType}:${params.entityType}:${params.entityId}:${params.runAt.toISOString().slice(0, 16)}`

  const { error } = await admin.from("notification_scheduled_jobs").upsert(
    {
      job_type: params.jobType,
      entity_type: params.entityType,
      entity_id: params.entityId,
      partner_id: params.partnerId ?? null,
      run_at: params.runAt.toISOString(),
      payload: params.payload || {},
      idempotency_key: idempotencyKey,
      status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "idempotency_key", ignoreDuplicates: true },
  )

  if (error && !error.message.includes("duplicate")) {
    console.error("[notifications] schedule job error", error.message)
  }

  try {
    const { triggerNotificationScheduledJob } = await import("@/trigger/notification-jobs")
    await triggerNotificationScheduledJob({
      jobType: params.jobType,
      entityType: params.entityType,
      entityId: params.entityId,
      partnerId: params.partnerId ?? null,
      runAt: params.runAt.toISOString(),
    })
  } catch (err) {
    console.error("[notifications] Trigger.dev enqueue failed - cron sweep will recover", {
      jobType: params.jobType,
      entityId: params.entityId,
      error: err instanceof Error ? err.message : "unknown",
    })
  }
}

export async function sweepDueNotificationJobs(limit = 50): Promise<number> {
  const admin = getAdminClient()
  const now = new Date().toISOString()

  const { data: jobs } = await admin
    .from("notification_scheduled_jobs")
    .select("*")
    .eq("status", "pending")
    .lte("run_at", now)
    .order("run_at", { ascending: true })
    .limit(limit)

  if (!jobs?.length) return 0

  const { runScheduledNotificationJob } = await import("./notification-automation.service")

  for (const job of jobs) {
    try {
      await runScheduledNotificationJob(job)
    } catch (err) {
      await admin
        .from("notification_scheduled_jobs")
        .update({
          status: "failed",
          last_error: err instanceof Error ? err.message : "unknown",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id)
    }
  }

  return jobs.length
}

export function buildIdempotencyKey(
  type: NotificationType,
  entityType: string,
  entityId: string,
  userId: string,
  variant?: string,
): string {
  return [type, entityType, entityId, userId, variant].filter(Boolean).join(":")
}
