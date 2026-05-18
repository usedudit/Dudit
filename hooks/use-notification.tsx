"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import { NotificationToast, type Notification, type NotificationType } from "@/components/reusable/NotificationToast"

interface NotificationContextType {
  notify: (type: NotificationType, title: string, message?: string, duration?: number) => void
  success: (title: string, message?: string, duration?: number) => void
  error: (title: string, message?: string, duration?: number) => void
  warning: (title: string, message?: string, duration?: number) => void
  info: (title: string, message?: string, duration?: number) => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

type GlobalNotifyFn = (type: NotificationType, title: string, message?: string, duration?: number) => void
type GlobalDismissFn = (id: string) => void

let globalNotify: GlobalNotifyFn | null = null
let globalDismiss: GlobalDismissFn | null = null

export const globalNotification = {
  notify: (type: NotificationType, title: string, message?: string, duration?: number) => {
    if (globalNotify) {
      globalNotify(type, title, message, duration)
    } else {
      console.warn("NotificationProvider is not mounted yet.")
    }
  },
  dismiss: (id: string) => {
    if (globalDismiss) {
      globalDismiss(id)
    }
  },
  success: (title: string, message?: string, duration?: number) => {
    globalNotification.notify("success", title, message, duration)
  },
  error: (title: string, message?: string, duration?: number) => {
    globalNotification.notify("error", title, message, duration)
  },
  warning: (title: string, message?: string, duration?: number) => {
    globalNotification.notify("warning", title, message, duration)
  },
  info: (title: string, message?: string, duration?: number) => {
    globalNotification.notify("info", title, message, duration)
  }
}

interface ToastProps {
  title?: ReactNode
  description?: ReactNode
  variant?: "default" | "destructive" | "success" | "warning" | "info"
  duration?: number
}

export const toast = (props: string | ToastProps) => {
  if (typeof props === "string") {
    globalNotification.info(props)
    return
  }

  const titleStr = props.title ? String(props.title) : ""
  const descStr = props.description ? String(props.description) : undefined
  const variant = props.variant || "info"

  let type: NotificationType = "info"
  if (variant === "destructive") {
    type = "error"
  } else if (variant === "success") {
    type = "success"
  } else if (variant === "warning") {
    type = "warning"
  }

  globalNotification.notify(type, titleStr || descStr || "", titleStr ? descStr : undefined, props.duration)
}

toast.success = (title: string, message?: string, duration?: number) => {
  globalNotification.success(title, message, duration)
}

toast.error = (title: string, message?: string, duration?: number) => {
  globalNotification.error(title, message, duration)
}

toast.warning = (title: string, message?: string, duration?: number) => {
  globalNotification.warning(title, message, duration)
}

toast.info = (title: string, message?: string, duration?: number) => {
  globalNotification.info(title, message, duration)
}

toast.dismiss = (id?: string) => {
  if (id) {
    globalNotification.dismiss(id)
  }
}

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

  const handleDismiss = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id))
  }, [])

  useEffect(() => {
    globalNotify = notify
    globalDismiss = handleDismiss
    return () => {
      globalNotify = null
      globalDismiss = null
    }
  }, [notify, handleDismiss])

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

