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
    const normalizedDuration = duration || 5000

    setNotifications((prev) => {
      const existingNotification = prev.find(
        (notification) =>
          notification.type === type && notification.title === title && notification.message === message,
      )

      if (existingNotification) {
        return prev.map((notification) =>
          notification.id === existingNotification.id
            ? {
                ...notification,
                duration: normalizedDuration,
                repeatCount: (notification.repeatCount || 1) + 1,
                resetKey: Date.now(),
              }
            : notification,
        )
      }

      const notification: Notification = {
        id: Math.random().toString(36).substring(2, 9),
        type,
        title,
        message,
        duration: normalizedDuration,
        repeatCount: 1,
        resetKey: Date.now(),
      }

      return [...prev, notification]
    })
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
