"use client"

import { useEffect, useRef, useCallback } from "react"
import { useSupabase } from "@/providers/supabase-provider"

const DEBOUNCE_MS = 300

export function useNotificationsRealtime(params: {
  userId: string | null | undefined
  onChange: () => void
  enabled?: boolean
}) {
  const { supabase } = useSupabase()
  const onChangeRef = useRef(params.onChange)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectedRef = useRef(false)

  onChangeRef.current = params.onChange

  const debouncedChange = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChangeRef.current()
    }, DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    if (!params.enabled || !params.userId) return

    connectedRef.current = false

    const channel = supabase
      .channel(`notifications:${params.userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${params.userId}`,
        },
        () => {
          debouncedChange()
        },
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") {
          connectedRef.current = true
        }
      })

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)

      if (connectedRef.current) {
        supabase.removeChannel(channel)
      } else {
        channel.subscribe((status: string) => {
          if (status === "SUBSCRIBED" || status === "CLOSED" || status === "CHANNEL_ERROR") {
            supabase.removeChannel(channel)
          }
        })
      }
    }
  }, [supabase, params.userId, params.enabled, debouncedChange])
}
