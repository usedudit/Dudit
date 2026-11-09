"use client"

import React, { useEffect, useState } from "react"
import posthog from "posthog-js"
import { PostHogProvider as PHProvider } from "posthog-js/react"
import * as Sentry from "@sentry/nextjs"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"
const CONSENT_COOKIE = "dudit_analytics_consent"

function hasAnalyticsConsent(): boolean {
    return typeof document !== "undefined" && document.cookie
        .split(";")
        .some((part) => part.trim() === `${CONSENT_COOKIE}=accepted`)
}

// ─── Noise / privacy filters ────────────────────────────────────────────────

// Errors that add no signal and would flood error tracking. Mirrors the
// client-abort filter used by Sentry in instrumentation.ts.
const NOISE_EXCEPTION_PATTERNS = [
    /ResizeObserver loop/i,
    /ChunkLoadError/i,
    /Loading chunk .* failed/i,
    /Importing a module script failed/i,
    /Failed to fetch dynamically imported module/i,
    /AbortError/i,
    /ECONNRESET/,
    /The user aborted a request/i,
    /NetworkError when attempting to fetch resource/i,
]

const SENSITIVE_QUERY_KEYS = new Set([
    "token",
    "access_token",
    "refresh_token",
    "code",
    "email",
    "password",
    "cpf",
    "cnpj",
    "phone",
    "tel",
    "error_description",
])

function scrubUrl(value: unknown): unknown {
    if (typeof value !== "string") return value
    try {
        const url = new URL(value)
        if (!url.search) return value
        const params = new URLSearchParams(url.search)
        for (const key of Array.from(params.keys())) {
            if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) params.delete(key)
        }
        url.search = params.toString()
        return url.toString()
    } catch {
        return value
    }
}

function isNoiseException(event: { properties?: Record<string, any> }): boolean {
    const props = event.properties || {}
    const text = [
        props.$exception_message,
        props.$exception_type,
        ...(Array.isArray(props.$exception_list)
            ? props.$exception_list.map((item: any) => `${item?.type || ""} ${item?.value || ""}`)
            : []),
    ]
        .filter(Boolean)
        .join(" ")
    if (!text) return false
    return NOISE_EXCEPTION_PATTERNS.some((pattern) => pattern.test(text))
}

// PostHog starts opted out. Session replay and analytics are enabled only after
// the visitor makes an explicit choice in the privacy notice.
function initializePostHog(): void {
    if (typeof window === "undefined" || !POSTHOG_KEY || posthog.__loaded) return

    posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: "never",
        capture_pageview: false,
        capture_pageleave: false,
        autocapture: false,
        capture_performance: false,
        capture_dead_clicks: false,
        capture_heatmaps: false,
        opt_out_capturing_by_default: true,
        disable_session_recording: false,
        // Client-side error tracking is kept here so every $exception can be
        // watched next to its session replay. Sentry stays responsible for
        // alerting and server-side stack traces.
        capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false,
        },
        before_send: (event: any) => {
            if (!event) return event
            // Internal consent events are not user behaviour and only add noise.
            if (event.event === "$opt_in" || event.event === "$opt_out") return null
            if (event.event === "$exception" && isNoiseException(event)) return null

            const props = event.properties
            if (props) {
                for (const key of ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]) {
                    if (key in props) props[key] = scrubUrl(props[key])
                }
            }
            return event
        },
        session_recording: {
            maskAllInputs: true,
            maskTextSelector: ".ph-no-capture, [data-sensitive='true']",
            maskInputOptions: { password: true, email: true, tel: true },
            // Network metadata is useful for debugging failed requests, but
            // query strings can carry tokens/e-mails.
            maskCapturedNetworkRequestFn: (data) => {
                data.name = scrubUrl(data.name) as string
                return data
            },
        },
        loaded: (ph) => {
            if (hasAnalyticsConsent()) {
                // The $opt_in event is dropped by before_send above.
                ph.opt_in_capturing()
                ph.startSessionRecording()
            } else {
                ph.opt_out_capturing()
                ph.stopSessionRecording()
            }

            if (hasAnalyticsConsent()) {
                try {
                    const sessionId = ph.get_session_id()
                    if (sessionId) Sentry.setTag("posthog_session_id", sessionId)
                } catch {
                    // Sentry may not be available in every browser session.
                }
            }
        },
    })
}

if (hasAnalyticsConsent()) initializePostHog()

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    const [isPreferencesOpen, setIsPreferencesOpen] = useState(false)

    useEffect(() => {
        const reopen = () => setIsPreferencesOpen(true)
        const sync = () => {
            if (hasAnalyticsConsent()) {
                initializePostHog()
                posthog.opt_in_capturing({ captureEventName: false })
                posthog.startSessionRecording()
            } else if (posthog.__loaded) {
                posthog.stopSessionRecording()
                posthog.opt_out_capturing()
            }
        }
        window.addEventListener("dudit:privacy-settings", reopen)
        window.addEventListener("dudit:analytics-consent", sync)
        return () => {
            window.removeEventListener("dudit:privacy-settings", reopen)
            window.removeEventListener("dudit:analytics-consent", sync)
        }
    }, [])

    const saveConsent = (choice: "accepted" | "rejected") => {
        const secure = window.location.protocol === "https:" ? "; Secure" : ""
        document.cookie = `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`
        setIsPreferencesOpen(false)

        if (choice === "accepted") {
            initializePostHog()
            posthog.opt_in_capturing({ captureEventName: false })
            posthog.startSessionRecording()
        } else {
            posthog.stopSessionRecording()
            posthog.opt_out_capturing()
        }
    }

    if (!POSTHOG_KEY) return <>{children}</>

    return (
        <PHProvider client={posthog}>
            {children}
            {isPreferencesOpen && (
                <aside
                    aria-label="Preferências de privacidade"
                    className="fixed inset-x-4 bottom-4 z-[100] mx-auto max-w-2xl rounded-2xl border border-brand-border bg-white p-5 shadow-2xl"
                    role="dialog"
                    aria-modal="false"
                >
                    <p className="font-semibold text-brand-dark">Preferências de privacidade</p>
                    <p className="mt-2 text-sm text-brand-inactive-text">
                        A Dudit usa o PostHog para métricas e gravação de sessões para melhorar a plataforma. Essas ferramentas só serão ativadas se você aceitar. Você pode recusar ou alterar essa escolha depois.
                    </p>
                    <div className="mt-4 flex flex-wrap justify-end gap-2">
                        <button className="rounded-lg border px-4 py-2 text-sm" onClick={() => saveConsent("rejected")}>
                            Recusar
                        </button>
                        <button className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-white" onClick={() => saveConsent("accepted")}>
                            Aceitar métricas e gravação
                        </button>
                    </div>
                </aside>
            )}
        </PHProvider>
    )
}

export { posthog }
