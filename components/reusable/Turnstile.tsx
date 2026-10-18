"use client"

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react"

export interface TurnstileRef {
  reset: () => void
  execute: () => void
  getResponse: () => string | undefined
  getWidgetId: () => string | null
}

export interface TurnstileProps {
  siteKey?: string
  action?: string
  cdata?: string
  theme?: "light" | "dark" | "auto"
  size?: "normal" | "compact" | "flexible"
  appearance?: "always" | "execute" | "interaction-only"
  execution?: "render" | "execute"
  onSuccess: (token: string) => void
  onError?: (error: any) => void
  onExpire?: () => void
  className?: string
}

const DEFAULT_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "0x4AAAAAAEs_LzzHb8CsDoNM"

let turnstilePromise: Promise<any> | null = null

function loadTurnstileScript(): Promise<any> {
  if (typeof window === "undefined") return Promise.resolve(null)
  if ((window as any).turnstile) return Promise.resolve((window as any).turnstile)
  if (turnstilePromise) return turnstilePromise

  turnstilePromise = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="challenges.cloudflare.com/turnstile"]'
    )
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if ((window as any).turnstile) {
          clearInterval(checkInterval)
          resolve((window as any).turnstile)
        }
      }, 50)
      return
    }

    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.defer = true
    script.onload = () => {
      const checkInterval = setInterval(() => {
        if ((window as any).turnstile) {
          clearInterval(checkInterval)
          resolve((window as any).turnstile)
        }
      }, 50)
    }
    script.onerror = (e) => {
      turnstilePromise = null
      reject(e)
    }
    document.head.appendChild(script)
  })

  return turnstilePromise
}

export const Turnstile = forwardRef<TurnstileRef, TurnstileProps>(function Turnstile(
  {
    siteKey = DEFAULT_SITE_KEY,
    action,
    cdata,
    theme = "auto",
    size = "normal",
    appearance = "interaction-only",
    execution = "execute",
    onSuccess,
    onError,
    onExpire,
    className,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  // Callbacks refs to avoid stale closures
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
    onExpireRef.current = onExpire
  }, [onSuccess, onError, onExpire])

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && typeof window !== "undefined" && (window as any).turnstile) {
        try {
          ;(window as any).turnstile.reset(widgetIdRef.current)
          // In "execute" mode the widget does not run on its own after a reset,
          // so we re-run it (deferred) to produce a fresh token.
          if (execution === "execute") {
            const id = widgetIdRef.current
            setTimeout(() => {
              try {
                ;(window as any).turnstile?.execute(id)
              } catch (err) {
                console.warn("[TURNSTILE] Failed to re-execute after reset:", err)
              }
            }, 0)
          }
        } catch (err) {
          console.warn("[TURNSTILE] Failed to reset widget:", err)
        }
      }
    },
    execute: () => {
      if (widgetIdRef.current && typeof window !== "undefined" && (window as any).turnstile) {
        try {
          ;(window as any).turnstile.execute(widgetIdRef.current)
        } catch (err) {
          console.warn("[TURNSTILE] Failed to execute widget:", err)
        }
      }
    },
    getResponse: () => {
      if (widgetIdRef.current && typeof window !== "undefined" && (window as any).turnstile) {
        try {
          return (window as any).turnstile.getResponse(widgetIdRef.current)
        } catch (err) {
          console.warn("[TURNSTILE] Failed to get response:", err)
        }
      }
      return undefined
    },
    getWidgetId: () => widgetIdRef.current,
  }))

  useEffect(() => {
    isMountedRef.current = true
    let isCancelled = false

    if (!siteKey) {
      console.warn("[TURNSTILE] Missing siteKey for Turnstile widget.")
      return
    }

    loadTurnstileScript()
      .then((turnstile) => {
        if (isCancelled || !isMountedRef.current || !containerRef.current || !turnstile) {
          return
        }

        // Clean up previous widget instance if container re-rendered
        if (widgetIdRef.current) {
          try {
            turnstile.remove(widgetIdRef.current)
          } catch {
            // Ignore removal errors on re-render
          }
          widgetIdRef.current = null
        }

        try {
          const widgetId = turnstile.render(containerRef.current, {
            sitekey: siteKey,
            action,
            cdata,
            theme,
            size,
            appearance,
            execution,
            callback: (token: string) => {
              if (isMountedRef.current) {
                onSuccessRef.current?.(token)
              }
            },
            "error-callback": (error: any) => {
              console.warn("[TURNSTILE] Error reported by Cloudflare:", error)
              if (isMountedRef.current) {
                onErrorRef.current?.(error)
              }
            },
            "expired-callback": () => {
              if (isMountedRef.current) {
                onExpireRef.current?.()
              }
              // Tokens expire (~5min). Re-run (deferred) so a fresh token is ready.
              if (execution === "execute") {
                const id = widgetIdRef.current
                setTimeout(() => {
                  try {
                    turnstile.execute(id)
                  } catch (err) {
                    console.warn("[TURNSTILE] Failed to re-execute after expiry:", err)
                  }
                }, 0)
              }
            },
          })

          widgetIdRef.current = widgetId

          // In "execute" mode (used for Invisible widgets) the widget does not run
          // on its own, so we trigger it on mount to have the token ready.
          if (execution === "execute") {
            try {
              turnstile.execute(widgetId)
            } catch (err) {
              console.warn("[TURNSTILE] Failed to auto-execute widget on mount:", err)
            }
          }
        } catch (renderError) {
          console.error("[TURNSTILE] Render error:", renderError)
          onErrorRef.current?.(renderError)
        }
      })
      .catch((scriptError) => {
        console.error("[TURNSTILE] Failed to load script:", scriptError)
        onErrorRef.current?.(scriptError)
      })

    return () => {
      isCancelled = true
      isMountedRef.current = false
      if (widgetIdRef.current && typeof window !== "undefined" && (window as any).turnstile) {
        try {
          ;(window as any).turnstile.remove(widgetIdRef.current)
        } catch {
          // Ignore removal errors on unmount
        }
        widgetIdRef.current = null
      }
    }
  }, [siteKey, action, cdata, theme, size, appearance, execution])

  return (
    <div
      ref={containerRef}
      className={className || "flex items-center justify-center"}
      data-testid="turnstile-container"
    />
  )
})
