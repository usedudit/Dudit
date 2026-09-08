"use client"

import { useEffect, useRef } from "react"
import { useSupabase } from "@/providers/supabase-provider"
import { supabaseBrowser } from "@/lib/supabase/browser-client"

interface UseRealtimeRecordOptions<T = any> {
  table: string
  id: string | null | undefined
  onUpdate: (newRecord: T, oldRecord?: T) => void
  enabled?: boolean
  schema?: string
}

/**
 * Custom hook to listen to real-time changes on a specific record by ID via Supabase Realtime.
 * Automatically handles channel subscription, cleanup on unmount, and avoids memory leaks.
 */
export function useRealtimeRecord<T = any>({
  table,
  id,
  onUpdate,
  enabled = true,
  schema = "public",
}: UseRealtimeRecordOptions<T>) {
  // Gracefully get Supabase client: prefer context, fallback to singleton browser client
  let supabaseClient: any = null
  try {
    const ctx = useSupabase()
    supabaseClient = ctx.supabase
  } catch {
    supabaseClient = supabaseBrowser
  }

  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  useEffect(() => {
    if (!enabled || !id || !supabaseClient) return

    const channelName = `realtime:${table}:${id}`
    const channel = supabaseClient
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema,
          table,
          filter: `id=eq.${id}`,
        },
        (payload: any) => {
          if (payload?.new) {
            onUpdateRef.current(payload.new as T, payload.old as T)
          }
        }
      )
      .subscribe()

    return () => {
      try {
        supabaseClient.removeChannel(channel)
      } catch (err) {
        // Silently ignore channel removal errors on unmount
      }
    }
  }, [supabaseClient, table, id, enabled, schema])
}
