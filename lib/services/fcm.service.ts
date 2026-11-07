import "server-only"

import { cert, getApp, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"
import { getAdminClient } from "@/lib/supabase/admin"
import type { NotificationType } from "@/lib/notifications/types"

type FirebaseAdminApp = import("firebase-admin/app").App

let firebaseApp: FirebaseAdminApp | null = null
let initAttempted = false

function getFirebaseAdmin(): FirebaseAdminApp | null {
  if (initAttempted) return firebaseApp
  initAttempted = true

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!serviceAccountJson) {
    return null
  }

  try {
    const normalized = serviceAccountJson.trim()

    const parsed = JSON.parse(
      normalized.startsWith('"')
        ? JSON.parse(normalized)
        : normalized
    )

    const credential = cert(parsed)

    firebaseApp = getApps().length ? getApp() : initializeApp({ credential })
    return firebaseApp
  } catch (err) {
    console.error("[fcm] Firebase Admin init failed", err instanceof Error ? err.message : err)
    return null
  }
}

export function isFcmConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT_JSON && process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY)
}

export async function sendPushToUser(params: {
  userId: string
  notificationId: string
  title: string
  body: string
  href: string
  type: NotificationType
  entityType: string | null
  entityId: string | null
}): Promise<{ sent: number; failed: number; skipped: boolean; reason?: string }> {
  const app = getFirebaseAdmin()
  const adminDb = getAdminClient()

  if (!app || !isFcmConfigured()) {
    await adminDb.from("notification_delivery_log").insert({
      notification_id: params.notificationId,
      channel: "push",
      status: "skipped",
      metadata: { reason: "fcm_not_configured" },
    })
    return { sent: 0, failed: 0, skipped: true, reason: "fcm_not_configured" }
  }

  const { data: subscriptions } = await adminDb
    .from("push_subscriptions")
    .select("id, fcm_token")
    .eq("user_id", params.userId)

  if (!subscriptions?.length) {
    await adminDb.from("notification_delivery_log").insert({
      notification_id: params.notificationId,
      channel: "push",
      status: "skipped",
      metadata: { reason: "no_active_push_subscriptions" },
    })
    return { sent: 0, failed: 0, skipped: true, reason: "no_subscriptions" }
  }

  const messaging = getMessaging(app)

  let sent = 0
  let failed = 0
  const invalidTokenIds: string[] = []

  await Promise.all(
    subscriptions.map(async (sub: { id: string; fcm_token: string }) => {
      try {
        const targetUrl = params.href.startsWith("http")
          ? params.href
          : `https://dudit.com.br${params.href}`

        await messaging.send({
          token: sub.fcm_token,
          notification: {
            title: params.title,
            body: params.body,
          },
          data: {
            title: params.title,
            body: params.body,
            notificationId: params.notificationId,
            href: params.href,
            type: params.type,
            entityType: params.entityType || "",
            entityId: params.entityId || "",
          },
          android: {
            priority: "high",
            notification: {
              title: params.title,
              body: params.body,
              icon: "icon_192",
              color: "#79c325",
              clickAction: targetUrl,
              priority: "high",
              defaultSound: true,
              defaultVibrateTimings: true,
            },
          },
          webpush: {
            headers: {
              Urgency: "high",
              TTL: "86400",
            },
            notification: {
              title: params.title,
              body: params.body,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-192x192.png",
              tag: params.notificationId || `dudit-${Date.now()}`,
              requireInteraction: false,
              renotify: true,
              data: {
                href: params.href,
                notificationId: params.notificationId,
                type: params.type,
                entityType: params.entityType || "",
                entityId: params.entityId || "",
              },
            },
            fcmOptions: {
              link: targetUrl,
            },
          },
        })

        sent++
        await adminDb.from("notification_delivery_log").insert({
          notification_id: params.notificationId,
          channel: "push",
          status: "sent",
          push_subscription_id: sub.id,
          metadata: { user_id: params.userId, type: params.type },
        })
      } catch (err: unknown) {
        failed++
        const message = err instanceof Error ? err.message : String(err)
        const code = (err as { code?: string })?.code

        if (
          code === "messaging/registration-token-not-registered" ||
          code === "messaging/invalid-registration-token"
        ) {
          invalidTokenIds.push(sub.id)
        }

        await adminDb.from("notification_delivery_log").insert({
          notification_id: params.notificationId,
          channel: "push",
          status: "failed",
          push_subscription_id: sub.id,
          error_message: message.slice(0, 500),
          metadata: { user_id: params.userId, code: code || null, error_details: message },
        })
      }
    }),
  )

  if (invalidTokenIds.length > 0) {
    await adminDb.from("push_subscriptions").delete().in("id", invalidTokenIds)
  }

  return { sent, failed, skipped: false }
}

export async function cleanupStalePushSubscriptions(maxAgeDays = 60): Promise<number> {
  const adminDb = getAdminClient()
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await adminDb
    .from("push_subscriptions")
    .delete()
    .lt("last_seen_at", cutoff)
    .select("id")

  if (error) {
    console.error("[fcm] stale subscriptions cleanup error", error.message)
    return 0
  }
  return data?.length ?? 0
}

