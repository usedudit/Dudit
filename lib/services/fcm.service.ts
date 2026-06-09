import "server-only"

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
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const admin = require("firebase-admin") as typeof import("firebase-admin")
    const credential = admin.credential.cert(JSON.parse(serviceAccountJson))
    firebaseApp = admin.apps.length
      ? admin.app()
      : admin.initializeApp({ credential })
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
}): Promise<{ sent: number; failed: number; skipped: boolean }> {
  const app = getFirebaseAdmin()
  const adminDb = getAdminClient()

  if (!app || !isFcmConfigured()) {
    await adminDb.from("notification_delivery_log").insert({
      notification_id: params.notificationId,
      channel: "push",
      status: "skipped",
      metadata: { reason: "fcm_not_configured" },
    })
    return { sent: 0, failed: 0, skipped: true }
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
      metadata: { reason: "no_subscriptions" },
    })
    return { sent: 0, failed: 0, skipped: true }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const admin = require("firebase-admin") as typeof import("firebase-admin")
  const messaging = admin.messaging(app)

  let sent = 0
  let failed = 0
  const invalidTokenIds: string[] = []

  await Promise.all(
    subscriptions.map(async (sub: { id: string; fcm_token: string }) => {
      try {
        await messaging.send({
          token: sub.fcm_token,
          notification: {
            title: params.title,
            body: params.body,
          },
          data: {
            notificationId: params.notificationId,
            href: params.href,
            type: params.type,
            entityType: params.entityType || "",
            entityId: params.entityId || "",
          },
          webpush: {
            fcmOptions: {
              link: params.href.startsWith("http") ? params.href : `https://dudit.com.br${params.href}`,
            },
          },
        })

        sent++
        await adminDb.from("notification_delivery_log").insert({
          notification_id: params.notificationId,
          channel: "push",
          status: "sent",
          push_subscription_id: sub.id,
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
          metadata: { code: code || null },
        })
      }
    }),
  )

  if (invalidTokenIds.length > 0) {
    await adminDb.from("push_subscriptions").delete().in("id", invalidTokenIds)
  }

  return { sent, failed, skipped: false }
}
