"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { usePathname } from "next/navigation"
import { useSupabase } from "@/providers/supabase-provider"
import { isFirebaseClientConfigured } from "@/lib/notifications/firebase-config"
import { registerPushSubscriptionAction } from "@/app/actions/notifications"

export async function getDeviceName(): Promise<string> {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (/android/i.test(ua)) return "Android"
  if (/iphone|ipad/i.test(ua)) return "iOS"
  if (/windows/i.test(ua)) return "Windows"
  if (/mac/i.test(ua)) return "macOS"
  return "Web"
}

export function getDeviceFingerprint(): string {
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

/**
 * Obtém ou registra o service worker do PWA de forma segura.
 */
async function getOrRegisterServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null

  try {
    let reg = await navigator.serviceWorker.getRegistration()
    if (!reg) {
      reg = await navigator.serviceWorker.register("/sw.js")
    }
    await navigator.serviceWorker.ready
    return reg
  } catch (err) {
    console.warn("[push] failed to get/register service worker", err)
    return null
  }
}

/**
 * Executa o fluxo de obtenção do token FCM e envio para o servidor.
 */
export async function syncFcmToken(userId: string): Promise<string | null> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return null
  }
  if (Notification.permission !== "granted") {
    return null
  }
  if (!isFirebaseClientConfigured()) {
    return null
  }

  try {
    const registration = await getOrRegisterServiceWorker()
    if (!registration) return null

    const { initializeApp, getApps } = await import("firebase/app")
    const { getMessaging, getToken } = await import("firebase/messaging")
    const { firebaseClientConfig } = await import("@/lib/notifications/firebase-config")

    const app = getApps().length ? getApps()[0]! : initializeApp(firebaseClientConfig)
    const messaging = getMessaging(app)

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    })

    if (!token) return null

    const deviceName = await getDeviceName()
    const deviceFingerprint = getDeviceFingerprint()

    await registerPushSubscriptionAction({
      fcmToken: token,
      deviceName,
      deviceFingerprint,
    })

    if (typeof localStorage !== "undefined") {
      const storageKey = `dudit_fcm_${userId}`
      localStorage.setItem(storageKey, JSON.stringify({ token, registeredAt: Date.now() }))
    }

    return token
  } catch (err) {
    console.warn("[push] syncFcmToken error:", err)
    return null
  }
}

/**
 * Hook para consultar o status da permissão e permitir que o usuário ative
 * as notificações com um clique direto (user gesture).
 */
export function usePushNotificationStatus() {
  const { user } = useSupabase()
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default")
  const [isEnabling, setIsEnabling] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported")
      return
    }
    setPermission(Notification.permission)
  }, [])

  const requestEnable = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      return false
    }

    setIsEnabling(true)
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)

      if (perm === "granted" && user?.id) {
        await syncFcmToken(user.id)
        return true
      }
      return false
    } catch (err) {
      console.warn("[push] requestPermission failed", err)
      return false
    } finally {
      setIsEnabling(false)
    }
  }, [user?.id])

  return {
    permission,
    isSupported: permission !== "unsupported",
    isGranted: permission === "granted",
    isEnabling,
    requestEnable,
  }
}

/**
 * Componente global que sincroniza o token FCM em segundo plano quando
 * a permissão já foi concedida pelo usuário.
 */
export function PushNotificationManager() {
  const pathname = usePathname()
  const { user } = useSupabase()
  const isSyncingRef = useRef(false)

  useEffect(() => {
    if (pathname?.startsWith("/print")) return
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("Headless")) return
    if (!user?.id || !isFirebaseClientConfigured()) return
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) return

    let cancelled = false
    let unsubscribeForeground: (() => void) | undefined

    async function setup() {
      if (cancelled || isSyncingRef.current) return
      if (Notification.permission !== "granted") return

      isSyncingRef.current = true
      try {
        // Verificar cache local para evitar chamadas redundantes frequentes
        const storageKey = `dudit_fcm_${user!.id}`
        const cachedRaw = typeof localStorage !== "undefined" ? localStorage.getItem(storageKey) : null
        let shouldSync = true

        if (cachedRaw) {
          try {
            const cached = JSON.parse(cachedRaw) as { token?: string; registeredAt?: number }
            const ageMs = Date.now() - (cached.registeredAt || 0)
            const MAX_CACHE_AGE_MS = 3 * 24 * 60 * 60 * 1000 // 3 dias
            if (cached.token && ageMs < MAX_CACHE_AGE_MS) {
              shouldSync = false
            }
          } catch {
            shouldSync = true
          }
        }

        if (shouldSync && !cancelled) {
          await syncFcmToken(user!.id)
        }

        // Listener para mensagens em primeiro plano
        const { initializeApp, getApps } = await import("firebase/app")
        const { getMessaging, onMessage } = await import("firebase/messaging")
        const { firebaseClientConfig } = await import("@/lib/notifications/firebase-config")

        const app = getApps().length ? getApps()[0]! : initializeApp(firebaseClientConfig)
        const messaging = getMessaging(app)

        unsubscribeForeground = onMessage(messaging, (payload) => {
          if (cancelled) return
          console.log("[push] foreground notification received", payload.data?.title || payload.notification?.title)
        })
      } catch (err) {
        console.warn("[push] registration skipped", err)
      } finally {
        isSyncingRef.current = false
      }
    }

    let idleHandle: number | ReturnType<typeof setTimeout> | null = null

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleHandle = (window as any).requestIdleCallback(() => setup(), { timeout: 3000 })
    } else {
      idleHandle = setTimeout(setup, 2000)
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
  }, [user?.id, pathname])

  return null
}
