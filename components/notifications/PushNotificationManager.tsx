"use client"

import { useEffect, useRef } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { isFirebaseClientConfigured } from "@/lib/notifications/firebase-config"
import {
  registerPushSubscriptionAction,
  unregisterPushSubscriptionAction,
} from "@/app/actions/notifications"

async function getDeviceName(): Promise<string> {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return "Android"
  if (/iphone|ipad/i.test(ua)) return "iOS"
  if (/windows/i.test(ua)) return "Windows"
  if (/mac/i.test(ua)) return "macOS"
  return "Web"
}

export function PushNotificationManager() {
  const { user } = useSupabase()
  const tokenRef = useRef<string | null>(null)
  const registeredRef = useRef(false)

  useEffect(() => {
    if (!user?.id || !isFirebaseClientConfigured()) return
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    if (!("Notification" in window)) return

    let cancelled = false

    async function setup() {
      try {
        if (Notification.permission === "denied") return

        const permission =
          Notification.permission === "granted"
            ? "granted"
            : await Notification.requestPermission()

        if (permission !== "granted" || cancelled) return

        const { initializeApp, getApps } = await import("firebase/app")
        const { getMessaging, getToken, onMessage } = await import("firebase/messaging")
        const { firebaseClientConfig } = await import("@/lib/notifications/firebase-config")

        const app = getApps().length ? getApps()[0]! : initializeApp(firebaseClientConfig)
        const registration = await navigator.serviceWorker.ready
        const messaging = getMessaging(app)

        const token = await getToken(messaging, {
          vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        })

        if (!token || cancelled) return

        tokenRef.current = token
        if (!registeredRef.current) {
          await registerPushSubscriptionAction({
            fcmToken: token,
            deviceName: await getDeviceName(),
          })
          registeredRef.current = true
        }

        onMessage(messaging, (payload) => {
          if (document.visibilityState !== "visible") return
          const title = payload.notification?.title || "Dudit"
          const body = payload.notification?.body || ""
          if (Notification.permission === "granted") {
            new Notification(title, { body, icon: "/icons/icon-192x192.png" })
          }
        })
      } catch (err) {
        console.warn("[push] registration skipped", err)
      }
    }

    setup()

    return () => {
      cancelled = true
      const token = tokenRef.current
      if (token && registeredRef.current) {
        unregisterPushSubscriptionAction(token).catch(() => {})
      }
    }
  }, [user?.id])

  return null
}
