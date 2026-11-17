import "server-only"

import { getAdminClient } from "@/lib/supabase/admin"
import { getNotificationHref } from "@/lib/notifications/navigation"
import { normalizePartnerRole } from "@/lib/notifications/audience"
import type { PartnerRole } from "@/lib/permissions/types"
import type {
  CreateNotificationInput,
  NotificationAudience,
  NotificationPageCursor,
  NotificationRecord,
  NotificationsPageResult,
  NotificationType,
} from "@/lib/notifications/types"
import { resolveAndDeliverNotification } from "./notification-resolver.service"
import { resolveNotificationOrigin } from "./notification-origin.service"

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

  // `origin` diz apenas de onde veio o evento (automação, sistema ou ação
  // manual no ERP). Ele não decide se o time da loja deve ser avisado: essa
  // decisão é do call site. Quem precisa ignorar ações manuais já faz isso
  // explicitamente em notification-automation.service (`if (manual) return`).
  //
  // Antes existia aqui um `return` silencioso para `manual` + vendedor, que
  // engolia notificações legítimas (ex.: confirmação de pagamento/envio em
  // lote no ERP avisando o restante do time).
  const originMeta = await resolveNotificationOrigin(input.data)

  const scope: "platform" | "partner" =
    ((input.data?.scope as string | undefined) === "partner" ? "partner" :
     (input.data?.scope as string | undefined) === "platform" ? "platform" :
     (originMeta.partnerId ? "partner" : "platform"))

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
    data: {
      ...input.data,
      partner_id: originMeta.partnerId,
      store_id: originMeta.storeId,
      store_name: originMeta.storeName,
      partner_name: originMeta.partnerName,
      scope,
      href,
      audience,
      origin,
    },
    idempotency_key: input.idempotencyKey,
  }

  const { data, error } = await admin
    .from("notifications")
    .upsert(row, { onConflict: "idempotency_key", ignoreDuplicates: true })
    .select("*")
    .maybeSingle()

  if (error) {
    if (error.code === "23505" || error.message?.includes("duplicate")) {
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

  if (!data) {
    const { data: existingAfterConflict } = await admin
      .from("notifications")
      .select("*")
      .eq("idempotency_key", input.idempotencyKey)
      .maybeSingle()
    return { notification: (existingAfterConflict as NotificationRecord) ?? null, created: false }
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

/**
 * Usuários do time do partner, opcionalmente filtrados por papel.
 *
 * - `roles` ausente/null => retorna o time inteiro (compatibilidade).
 * - `roles` informado => retorna apenas quem tem um dos papéis.
 * - O dono legado (`partners.user_id`) conta como OWNER.
 * - Nunca devolve vazio quando existe dono: se o filtro não casar com
 *   ninguém, pelo menos o dono recebe (lojas pequenas não ficam no escuro).
 */
export async function getPartnerTeamUserIds(
  partnerId: string,
  roles?: PartnerRole[] | null,
): Promise<string[]> {
  const admin = getAdminClient()

  const [{ data: partner }, { data: members }] = await Promise.all([
    admin.from("partners").select("user_id").eq("id", partnerId).maybeSingle(),
    admin.from("partner_users").select("user_id, role, role_id").eq("partner_id", partnerId),
  ])

  const ownerUserId = partner?.user_id || null
  const memberRows = (members || []) as Array<{
    user_id: string | null
    role: string | null
    role_id: string | null
  }>
  const rolesFilter = roles == null ? null : new Set(roles)
  const userIds = new Set<string>()

  for (const member of memberRows) {
    if (!member.user_id) continue
    const role = normalizePartnerRole(member.role_id || member.role)
    if (rolesFilter && !(role && rolesFilter.has(role))) continue
    userIds.add(member.user_id)
  }

  if (ownerUserId && (!rolesFilter || rolesFilter.has("OWNER"))) {
    userIds.add(ownerUserId)
  }

  // Rede de segurança: filtro de papel nunca deve silenciar a loja inteira.
  const filterHasRecipients = !rolesFilter || rolesFilter.size > 0
  if (userIds.size === 0 && filterHasRecipients) {
    if (ownerUserId) {
      userIds.add(ownerUserId)
    } else {
      for (const member of memberRows) {
        if (member.user_id) userIds.add(member.user_id)
      }
    }
  }

  return [...userIds]
}

/**
 * Usuários do time que atuam em uma loja, opcionalmente filtrados por papel.
 *
 * - OWNER (inclusive o dono legado) sempre atravessa o escopo de loja.
 * - Demais papéis precisam estar vinculados à loja via `store_members`
 *   quando um `storeId` é informado; sem `storeId`, vale o time inteiro.
 * - `staffPartnerUserId` (profissional atribuído a um agendamento) é sempre
 *   incluído, independentemente de papel.
 */
export async function getStoreTeamUserIds(params: {
  partnerId: string
  storeId?: string | null
  staffPartnerUserId?: string | null
  roles?: PartnerRole[] | null
}): Promise<string[]> {
  const admin = getAdminClient()

  const [{ data: partner }, { data: rawPartnerUsers }] = await Promise.all([
    admin
      .from("partners")
      .select("user_id")
      .eq("id", params.partnerId)
      .maybeSingle(),
    admin
      .from("partner_users")
      .select("id, user_id, role, role_id")
      .eq("partner_id", params.partnerId),
  ])

  const partnerUsers = (rawPartnerUsers || []) as Array<{
    id: string
    user_id: string | null
    role: string | null
    role_id: string | null
  }>

  const ownerUserId = partner?.user_id || null
  const rolesFilter = params.roles == null ? null : new Set(params.roles)
  const userIds = new Set<string>()

  // 1. Vínculo com a loja (e possível override de papel por loja).
  let storeMemberPuIds: Set<string> | null = null
  const storeRoleByPuId = new Map<string, PartnerRole | null>()

  if (params.storeId && partnerUsers.length > 0) {
    const { data: rawStoreMembers } = await admin
      .from("store_members")
      .select("partner_user_id, role")
      .eq("store_id", params.storeId)
      .in("partner_user_id", partnerUsers.map((pu) => pu.id))

    storeMemberPuIds = new Set()
    for (const sm of (rawStoreMembers || []) as Array<{ partner_user_id: string; role: string | null }>) {
      storeMemberPuIds.add(sm.partner_user_id)
      storeRoleByPuId.set(sm.partner_user_id, normalizePartnerRole(sm.role))
    }
  }

  // 2. Membros do time que passam no filtro de papel e no escopo da loja.
  for (const pu of partnerUsers) {
    if (!pu.user_id) continue

    const baseRole = normalizePartnerRole(pu.role_id || pu.role)
    const effectiveRole = storeRoleByPuId.get(pu.id) ?? baseRole

    if (rolesFilter && !(effectiveRole && rolesFilter.has(effectiveRole))) continue

    const isOwner = effectiveRole === "OWNER"
    if (storeMemberPuIds && !isOwner && !storeMemberPuIds.has(pu.id)) continue

    userIds.add(pu.user_id)
  }

  // 3. Dono legado sempre que o filtro permitir OWNER.
  if (ownerUserId && (!rolesFilter || rolesFilter.has("OWNER"))) {
    userIds.add(ownerUserId)
  }

  // 4. Profissional atribuído (ex.: agendamento) sempre recebe.
  if (params.staffPartnerUserId) {
    const staffPu = partnerUsers.find((pu) => pu.id === params.staffPartnerUserId)
    if (staffPu?.user_id) {
      userIds.add(staffPu.user_id)
    }
  }

  // 5. Rede de segurança contra time silenciado por filtro/escopo.
  const filterHasRecipients = !rolesFilter || rolesFilter.size > 0
  if (userIds.size === 0 && filterHasRecipients) {
    if (ownerUserId) {
      userIds.add(ownerUserId)
    } else {
      for (const pu of partnerUsers) {
        if (pu.user_id) userIds.add(pu.user_id)
      }
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

export async function deleteAllNotificationsForUser(userId: string): Promise<number> {
  const admin = getAdminClient()
  const { data, error } = await admin
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .select("id")

  if (error) {
    console.error("[notifications] delete all error", error.message)
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
