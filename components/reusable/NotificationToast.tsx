"use client"

import { useEffect, useState } from "react"
import { CloseIcon, CheckCircleIcon, AlertCircleIcon } from "@/lib/icons"
import { cn } from "@/lib/utils"
import { Button } from "@/components/reusable"

export type NotificationType = "success" | "error" | "warning" | "info"

export interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  duration?: number
}

interface NotificationToastProps {
  notifications: Notification[]
  onDismiss: (id: string) => void
}

export function NotificationToast({ notifications, onDismiss }: NotificationToastProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex flex-col items-center pt-4 px-4 pointer-events-none">
      <div className="w-full max-w-2xl space-y-2">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} onDismiss={onDismiss} />
        ))}
      </div>
    </div>
  )
}

function NotificationItem({
  notification,
  onDismiss,
}: { notification: Notification; onDismiss: (id: string) => void }) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // Anima entrada
    requestAnimationFrame(() => {
      setIsVisible(true)
    })

    // Auto-dismiss após duração
    const duration = notification.duration || 5000
    const timer = setTimeout(() => {
      handleDismiss()
    }, duration)

    return () => clearTimeout(timer)
  }, [notification.id])

  const handleDismiss = () => {
    setIsExiting(true)
    setTimeout(() => {
      onDismiss(notification.id)
    }, 300)
  }

  const getStyles = () => {
    switch (notification.type) {
      case "success":
        return {
          bg: "bg-background/95 dark:bg-background/95 border-border dark:border-border",
          icon: <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />,
          iconBg: "bg-green-100 dark:bg-green-950",
          titleColor: "text-foreground dark:text-foreground",
          messageColor: "text-muted-foreground dark:text-muted-foreground",
        }
      case "error":
        return {
          bg: "bg-background/95 dark:bg-background/95 border-border dark:border-border",
          icon: <AlertCircleIcon className="w-5 h-5 text-brand-red dark:text-brand-red shrink-0" />,
          iconBg: "bg-red-100 dark:bg-red-950",
          titleColor: "text-foreground dark:text-foreground",
          messageColor: "text-muted-foreground dark:text-muted-foreground",
        }
      case "warning":
        return {
          bg: "bg-background/95 dark:bg-background/95 border-border dark:border-border",
          icon: <AlertCircleIcon className="w-5 h-5 text-yellow-600 dark:text-yellow-400 shrink-0" />,
          iconBg: "bg-yellow-100 dark:bg-yellow-950",
          titleColor: "text-foreground dark:text-foreground",
          messageColor: "text-muted-foreground dark:text-muted-foreground",
        }
      case "info":
        return {
          bg: "bg-background/95 dark:bg-background/95 border-border dark:border-border",
          icon: <AlertCircleIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />,
          iconBg: "bg-blue-100 dark:bg-blue-950",
          titleColor: "text-foreground dark:text-foreground",
          messageColor: "text-muted-foreground dark:text-muted-foreground",
        }
    }
  }

  const styles = getStyles()

  return (
    <div
      className={cn(
        "pointer-events-auto w-full rounded-lg border-1 backdrop-blur-lg shadow-2xl",
        "transition-all duration-300 ease-out",
        styles.bg,
        isVisible && !isExiting ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4",
        isExiting && "opacity-0 -translate-y-2 scale-95",
      )}
    >
      <div className="flex items-center gap-4 px-6 py-4">
        {/* Icon */}
        <div className={cn("flex items-center justify-center rounded-full p-2", styles.iconBg)}>{styles.icon}</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-semibold", styles.titleColor)}>{notification.title}</p>
          {notification.message && <p className={cn("text-xs mt-0.5", styles.messageColor)}>{notification.message}</p>}
        </div>

        {/* Close button */}
        <Button variant="ghost" className="w-[40px] h-[40px]"
          onClick={handleDismiss}>
          <CloseIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
        </Button>
      </div>
    </div>
  )
}
