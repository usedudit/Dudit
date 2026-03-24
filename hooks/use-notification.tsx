"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import { NotificationToast, type Notification, type NotificationType } from "@/components/reusable/NotificationToast"

interface NotificationContextType {
  notify: (type: NotificationType, title: string, message?: string, duration?: number) => void
  success: (title: string, message?: string, duration?: number) => void
  error: (title: string, message?: string, duration?: number) => void
  warning: (title: string, message?: string, duration?: number) => void
  info: (title: string, message?: string, duration?: number) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])

  const notify = useCallback((type: NotificationType, title: string, message?: string, duration?: number) => {
    const id = Math.random().toString(36).substring(2, 9)
    const notification: Notification = {
      id,
      type,
      title,
      message,
      duration: duration || 5000,
    }

    setNotifications((prev) => [...prev, notification])
  }, [])

  const success = useCallback(
    (title: string, message?: string, duration?: number) => {
      notify("success", title, message, duration)
    },
    [notify],
  )

  const error = useCallback(
    (title: string, message?: string, duration?: number) => {
      notify("error", title, message, duration)
    },
    [notify],
  )

  const warning = useCallback(
    (title: string, message?: string, duration?: number) => {
      notify("warning", title, message, duration)
    },
    [notify],
  )

  const info = useCallback(
    (title: string, message?: string, duration?: number) => {
      notify("info", title, message, duration)
    },
    [notify],
  )

  const handleDismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return (
    <NotificationContext.Provider value={{ notify, success, error, warning, info }}>
      {children}
      <NotificationToast notifications={notifications} onDismiss={handleDismiss} />
    </NotificationContext.Provider>
  )
}

export function useNotification() {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error("useNotification must be used within NotificationProvider")
  }
  return context
}
