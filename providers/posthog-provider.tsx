"use client"

import React from "react"
import posthog from "posthog-js"
import { PostHogProvider as PHProvider } from "posthog-js/react"
import * as Sentry from "@sentry/nextjs"

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com"

// Initialize PostHog once in browser environment (Ultra-Lean mode: zero dead clicks, zero web vitals, zero person properties, zero group identify)
if (typeof window !== "undefined" && POSTHOG_KEY) {
    if (!posthog.__loaded) {
        posthog.init(POSTHOG_KEY, {
            api_host: POSTHOG_HOST,
            person_profiles: "never", // Desativa criação/atualização de person profiles e envio de $set
            capture_pageview: false, // Desativado para economizar cota de eventos
            capture_pageleave: false, // Desativado para economizar cota de eventos
            autocapture: false, // Desativado: não grava cliques aleatórios de tela/ERP
            capture_performance: false, // Desativa $web_vitals e métricas de performance do navegador
            capture_dead_clicks: false, // Desativa detecção e eventos de $dead_click e $dead_swipe
            capture_heatmaps: false, // Desativa envio de dados de mapa de calor
            disable_session_recording: false, // Gravação de replay apenas com mascaramento estrito
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
                // Conecta o session replay do PostHog ao Sentry para depuração visual
                try {
                    const sessionId = ph.get_session_id()
                    if (sessionId) {
                        Sentry.setTag("posthog_session_id", sessionId)
                    }
                } catch {
                    // Sentry pode não estar disponível
                }
            },
        })
    }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
    if (!POSTHOG_KEY) {
        return <>{children}</>
    }

    return (
        <PHProvider client={posthog}>
            {children}
        </PHProvider>
    )
}

export { posthog }
