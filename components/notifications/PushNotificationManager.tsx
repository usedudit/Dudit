"use client"

import { useEffect, useRef } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { isFirebaseClientConfigured } from "@/lib/notifications/firebase-config"
import { registerPushSubscriptionAction } from "@/app/actions/notifications"

async function getDeviceName(): Promise<string> {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return "Android"
  if (/iphone|ipad/i.test(ua)) return "iOS"
  if (/windows/i.test(ua)) return "Windows"
  if (/mac/i.test(ua)) return "macOS"
  return "Web"
}

function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "unknown"
  const ua = navigator.userAgent
  const screen = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`
  const lang = navigator.language
  let fingerprint = `${ua}|${screen}|${lang}`
  let hash = 0
  for (let i = 0; i < fingerprint.length; i++) {
    const chr = fingerprint.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }
  return hash.toString(36)
}

export function PushNotificationManager() {
  const { user } = useSupabase()
  const lastRegisteredTokenRef = useRef<string | null>(null)

  useEffect(() => {
    if (!user?.id || !isFirebaseClientConfigured()) return
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return
    if (!("Notification" in window)) return

    let cancelled = false
    let unsubscribeForeground: (() => void) | undefined

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

        if (!user?.id) return
        const sessionKey = `fcm_token_${user.id}`
        const sessionRegisteredToken = typeof sessionStorage !== "undefined" ? sessionStorage.getItem(sessionKey) : null
        if (lastRegisteredTokenRef.current !== token && sessionRegisteredToken !== token) {
          await registerPushSubscriptionAction({
            fcmToken: token,
            deviceName: await getDeviceName(),
            deviceFingerprint: getDeviceFingerprint(),
          })
          lastRegisteredTokenRef.current = token
          if (typeof sessionStorage !== "undefined") {
            sessionStorage.setItem(sessionKey, token)
          }
        }

        // Foreground message listener: prevents default alert spam and handles toast if needed
        unsubscribeForeground = onMessage(messaging, (payload) => {
          if (cancelled) return
          // Log foreground notification gracefully
          console.log("[push] foreground notification received", payload.data?.title || payload.notification?.title)
        })
      } catch (err) {
        console.warn("[push] registration skipped", err)
      }
    }

    let idleHandle: number | ReturnType<typeof setTimeout> | null = null

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandle = (window as any).requestIdleCallback(() => setup(), { timeout: 4000 })
    } else {
      idleHandle = setTimeout(setup, 3000)
    }

    return () => {
      cancelled = true
      if (idleHandle !== null) {
        if (typeof window !== "undefined" && "cancelIdleCallback" in window && typeof idleHandle === "number") {
          (window as any).cancelIdleCallback(idleHandle)
        } else {
          clearTimeout(idleHandle as any)
        }
      }
      if (unsubscribeForeground) unsubscribeForeground()
    }
  }, [user?.id])

  return null
}
