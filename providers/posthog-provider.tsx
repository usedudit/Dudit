"use client"

import React, { useEffect, Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import posthog from "posthog-js"
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react"
import * as Sentry from "@sentry/nextjs"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"

// Initialize PostHog once in browser environment
if (typeof window !== "undefined" && POSTHOG_KEY) {
    if (!posthog.__loaded) {
        posthog.init(POSTHOG_KEY, {
            api_host: "/ingest",
            ui_host: POSTHOG_HOST,
            person_profiles: "identified_only",
            capture_pageview: false, // Controlled manually below for Next.js App Router
            capture_pageleave: true,
            autocapture: true,
            session_recording: {
                maskAllInputs: true,
                maskTextSelector: ".ph-no-capture, [data-sensitive='true']",
                maskInputOptions: {
                    password: true,
                    email: true,
                    tel: true,
                },
            },
            loaded: (ph) => {
                // Connect PostHog session replay to Sentry
                try {
                    const sessionId = ph.get_session_id()
                    if (sessionId) {
                        Sentry.setTag("posthog_session_id", sessionId)
                    }
                } catch {
                    // Sentry might not be initialized yet
                }
            },
        })
    }
}

function PostHogPageView(): null {
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const ph = usePostHog()

    useEffect(() => {
        if (pathname && ph && typeof window !== "undefined") {
            let url = window.origin + pathname
            const search = searchParams?.toString()
            if (search) {
                url += `?${search}`
            }

            ph.capture("$pageview", {
                $current_url: url,
                pathname,
            })

            // Keep Sentry tag updated with PostHog session
            try {
                const sessionId = ph.get_session_id()
                if (sessionId) {
                    Sentry.setTag("posthog_session_id", sessionId)
                }
            } catch {
                // safe ignore
            }
        }
    }, [pathname, searchParams, ph])

    return null
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    if (!POSTHOG_KEY) {
        return <>{children}</>
    }

    return (
        <PHProvider client={posthog}>
            <Suspense fallback={null}>
                <PostHogPageView />
            </Suspense>
            {children}
        </PHProvider>
    )
}

export { posthog }
