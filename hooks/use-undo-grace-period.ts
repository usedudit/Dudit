"use client"

import { useState, useRef, useCallback, useEffect } from "react"

export interface PendingGraceAction<T = any> {
  id: string
  title: string
  description?: string
  itemCount: number
  payload: T
  onExecute: (payload: T) => Promise<any> | any
  onUndo?: (payload: T) => void
  onSuccess?: (result: any) => void
  onError?: (error: any) => void
}

export function useUndoGracePeriod(defaultDurationMs = 10000) {
  const [pendingAction, setPendingAction] = useState<PendingGraceAction | null>(null)
  const [remainingMs, setRemainingMs] = useState<number>(defaultDurationMs)
  const [isExecuting, setIsExecuting] = useState(false)

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const actionRef = useRef<PendingGraceAction | null>(null)
  const startTimeRef = useRef<number>(0)
  const durationRef = useRef<number>(defaultDurationMs)

  actionRef.current = pendingAction

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  const executeNow = useCallback(async (actionToRun?: PendingGraceAction | null) => {
    const action = actionToRun || actionRef.current
    if (!action) return

    clearTimers()
    setIsExecuting(true)

    try {
      const result = await action.onExecute(action.payload)
      action.onSuccess?.(result)
    } catch (err) {
      console.error("[useUndoGracePeriod] Execution failed:", err)
      action.onError?.(err)
    } finally {
      setIsExecuting(false)
      setPendingAction(null)
      actionRef.current = null
    }
  }, [clearTimers])

  const undo = useCallback(() => {
    const action = actionRef.current
    if (!action || isExecuting) return

    clearTimers()
    setPendingAction(null)
    actionRef.current = null
    action.onUndo?.(action.payload)
  }, [clearTimers, isExecuting])

  const schedule = useCallback(
    (action: PendingGraceAction, durationMs?: number) => {
      // If there's an existing action pending, flush it immediately before starting a new one
      if (actionRef.current) {
        void executeNow(actionRef.current)
      }

      clearTimers()
      const effectiveDuration = durationMs ?? defaultDurationMs
      durationRef.current = effectiveDuration
      startTimeRef.current = Date.now()
      setRemainingMs(effectiveDuration)
      setPendingAction(action)
      actionRef.current = action

      // Ticking interval for smooth countdown/progress bar
      intervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current
        const left = Math.max(0, durationRef.current - elapsed)
        setRemainingMs(left)
      }, 100)

      timerRef.current = setTimeout(() => {
        void executeNow(action)
      }, effectiveDuration)
    },
    [defaultDurationMs, clearTimers, executeNow],
  )

  // Flush on page unload so changes are never lost if user closes browser during the grace window
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (actionRef.current) {
        // execute synchronously or trigger
        void executeNow(actionRef.current)
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      clearTimers()
    }
  }, [executeNow, clearTimers])

  const progressPct = durationRef.current > 0
    ? Math.max(0, Math.min(100, (remainingMs / durationRef.current) * 100))
    : 0

  return {
    pendingAction,
    isExecuting,
    remainingSeconds: Math.ceil(remainingMs / 1000),
    progressPct,
    schedule,
    undo,
    flush: () => executeNow(),
  }
}
