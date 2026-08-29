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

  onChangeRef.current = params.onChange

  const debouncedChange = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChangeRef.current()
    }, DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    if (!params.enabled || !params.userId) return

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
      .subscribe()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      try {
        supabase.removeChannel(channel)
      } catch {
        // Ignora erros de canal já desconectado no unmount
      }
    }
  }, [supabase, params.userId, params.enabled, debouncedChange])
}
