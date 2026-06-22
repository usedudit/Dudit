"use client"

import { useEffect, useRef, useCallback } from "react"
import { useSupabase } from "@/providers/supabase-provider"

const DEBOUNCE_MS = 300

export function useReturnsRealtime(params: {
  returnRequestId: string | null | undefined
  partnerId?: string | null
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
    if (!params.enabled || !params.returnRequestId) return

    connectedRef.current = false
    const requestId = params.returnRequestId

    const channel = supabase
      .channel(`returns:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "return_messages",
          filter: `return_request_id=eq.${requestId}`,
        },
        () => debouncedChange(),
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "return_requests",
          filter: `id=eq.${requestId}`,
        },
        () => debouncedChange(),
      )
      .subscribe((status: string) => {
        if (status === "SUBSCRIBED") connectedRef.current = true
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
  }, [supabase, params.returnRequestId, params.enabled, debouncedChange])
}
