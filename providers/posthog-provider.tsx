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
        session_recording: {
            maskAllInputs: true,
            maskTextSelector: ".ph-no-capture, [data-sensitive='true']",
            maskInputOptions: { password: true, email: true, tel: true },
        },
        loaded: (ph) => {
            if (hasAnalyticsConsent()) {
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
    const [consent, setConsent] = useState<"accepted" | "rejected" | "unset">("unset")

    useEffect(() => {
        const saved = document.cookie
            .split(";")
            .map((part) => part.trim())
            .find((part) => part.startsWith(`${CONSENT_COOKIE}=`))
            ?.split("=")[1]
        setConsent(saved === "accepted" || saved === "rejected" ? saved : "unset")

        const reopen = () => setConsent("unset")
        window.addEventListener("dudit:privacy-settings", reopen)
        return () => window.removeEventListener("dudit:privacy-settings", reopen)
    }, [])

    const saveConsent = (choice: "accepted" | "rejected") => {
        const secure = window.location.protocol === "https:" ? "; Secure" : ""
        document.cookie = `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=15552000; SameSite=Lax${secure}`
        setConsent(choice)

        if (choice === "accepted") {
            initializePostHog()
            posthog.opt_in_capturing()
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
            {consent === "unset" && (
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
