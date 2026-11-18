"use client"

import React from "react"

/**
 * Passthrough wrapper kept for backwards compatibility with layouts.
 *
 * Notification freshness is now handled via visibility-aware React Query
 * refetching in `useNotifications` instead of a permanent `postgres_changes`
 * WebSocket subscription, which previously forced Supabase Realtime to poll
 * WAL ~2x/second (~178k queries/day) whenever any ERP tab stayed open.
 */
export function NotificationsRealtimeProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
