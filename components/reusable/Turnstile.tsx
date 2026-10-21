"use client"

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from "react"

export interface TurnstileRef {
  reset: () => void
  execute: () => void
  getToken: () => Promise<string | null>
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
    // "interaction-only" keeps the widget hidden for legitimate visitors and only
    // shows it when Cloudflare actually needs an interaction. Invisible widgets are
    // never shown regardless of this setting.
    appearance = "interaction-only",
    // "render" (Cloudflare's default) runs the challenge in the background right
    // after render(), so the token is ready by the time the user submits.
    execution = "render",
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
  const tokenWaitersRef = useRef<Array<(token: string | null) => void>>([])

  // Callbacks refs to avoid stale closures
  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onSuccessRef.current = onSuccess
    onErrorRef.current = onError
    onExpireRef.current = onExpire
  }, [onSuccess, onError, onExpire])

  // Resolves every pending getToken() waiter.
  const settleWaiters = (token: string | null) => {
    if (tokenWaitersRef.current.length === 0) return
    const waiters = tokenWaitersRef.current
    tokenWaitersRef.current = []
    waiters.forEach((resolve) => resolve(token))
  }

  // Re-arms the challenge so a fresh token is produced after a failed attempt.
  const rearmChallenge = () => {
    if (!widgetIdRef.current || typeof window === "undefined" || !(window as any).turnstile) return
    const id = widgetIdRef.current
    setTimeout(() => {
      try {
        ;(window as any).turnstile?.execute(id)
      } catch (err) {
        console.warn("[TURNSTILE] Failed to re-arm challenge:", err)
      }
    }, 0)
  }

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && typeof window !== "undefined" && (window as any).turnstile) {
        try {
          ;(window as any).turnstile.reset(widgetIdRef.current)
          rearmChallenge()
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
    /**
     * Returns a valid token, waiting for the challenge to finish if needed.
     * This avoids firing an auth request that is guaranteed to fail with
     * `captcha_failed` because the token was not ready yet.
     */
    getToken: () => {
      if (typeof window === "undefined" || !(window as any).turnstile || !widgetIdRef.current) {
        return Promise.resolve<string | null>(null)
      }

      const current = (window as any).turnstile.getResponse(widgetIdRef.current)
      if (current) return Promise.resolve<string>(current)

      return new Promise<string | null>((resolve) => {
        let settled = false
        let fallbackTimer: ReturnType<typeof setTimeout> | undefined
        let timeoutTimer: ReturnType<typeof setTimeout> | undefined

        const finish = (token: string | null) => {
          if (settled) return
          settled = true
          if (fallbackTimer) clearTimeout(fallbackTimer)
          if (timeoutTimer) clearTimeout(timeoutTimer)
          const index = tokenWaitersRef.current.indexOf(finish)
          if (index >= 0) tokenWaitersRef.current.splice(index, 1)
          resolve(token)
        }

        tokenWaitersRef.current.push(finish)

        // Manual execution mode: the challenge only runs when requested.
        if (execution === "execute") {
          try {
            ;(window as any).turnstile.execute(widgetIdRef.current)
          } catch (err) {
            console.warn("[TURNSTILE] Failed to execute widget:", err)
          }
        } else {
          // Auto execution mode: if the widget did not produce a token on its own,
          // force the challenge to run.
          fallbackTimer = setTimeout(() => {
            try {
              ;(window as any).turnstile?.execute(widgetIdRef.current)
            } catch (err) {
              console.warn("[TURNSTILE] Failed to force challenge execution:", err)
            }
          }, 4000)
        }

        timeoutTimer = setTimeout(() => finish(null), 15000)
      })
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
              settleWaiters(token)
              if (isMountedRef.current) {
                onSuccessRef.current?.(token)
              }
            },
            "error-callback": (error: any) => {
              console.warn("[TURNSTILE] Error reported by Cloudflare:", error)
              settleWaiters(null)
              if (isMountedRef.current) {
                onErrorRef.current?.(error)
              }
            },
            "expired-callback": () => {
              settleWaiters(null)
              if (isMountedRef.current) {
                onExpireRef.current?.()
              }
              // Tokens expire after 5 minutes. Produce a fresh one right away.
              rearmChallenge()
            },
          })

          widgetIdRef.current = widgetId
        } catch (renderError) {
          console.error("[TURNSTILE] Render error:", renderError)
          settleWaiters(null)
          onErrorRef.current?.(renderError)
        }
      })
      .catch((scriptError) => {
        console.error("[TURNSTILE] Failed to load script:", scriptError)
        settleWaiters(null)
        onErrorRef.current?.(scriptError)
      })

    return () => {
      isCancelled = true
      isMountedRef.current = false
      settleWaiters(null)
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
