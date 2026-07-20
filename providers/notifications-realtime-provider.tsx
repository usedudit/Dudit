"use client"

import React from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { useQueryClient } from "@tanstack/react-query"
import { useNotificationsRealtime } from "@/hooks/use-notifications-realtime"

export function NotificationsRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useSupabase()
  const queryClient = useQueryClient()

  useNotificationsRealtime({
    userId: user?.id,
    enabled: Boolean(user?.id),
    onChange: () => {
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: ["notifications", "unread-count", user.id] })
        queryClient.invalidateQueries({ queryKey: ["notifications", "list", user.id] })
      }
    },
  })

  return <>{children}</>
}
