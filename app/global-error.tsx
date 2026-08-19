"use client"

import { useEffect, useState } from "react"

/**
 * Last-resort error boundary. It replaces the whole app shell, so it CANNOT
 * depend on globals.css, Tailwind, fonts, providers or any heavy module
 * (Sentry, icons, etc). A failure here makes Next.js render its built-in
 * blank "Application error" page instead of this custom one.
 *
 * That is why everything is inline-styled and every optional side-effect is
 * wrapped in try/catch — this component must never throw.
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    const [isDark, setIsDark] = useState(false)

    useEffect(() => {
        try {
            const dark =
                document.documentElement.classList.contains("dark") ||
                localStorage.getItem("theme") === "dark"
            setIsDark(dark)
            document.documentElement.classList.toggle("dark", dark)
        } catch {}
    }, [])

    useEffect(() => {
        try {
            console.error("Global error boundary:", error)

            // Report to Sentry without risking the boundary: if this chunk
            // fails to load/execute, the error page must still render.
            import("@/lib/monitoring/sentry")
                .then(({ captureError }) => {
                    try {
                        captureError(error, {
                            module: "client",
                            action: "global_error_boundary",
                            metadata: { boundary: "app/global-error" },
                        })
                    } catch {}
                })
                .catch(() => {})
        } catch {}
    }, [error])

    const digest =
        typeof error?.digest === "string" ? error.digest : undefined
    const message = safeErrorMessage(error)

    return (
        <html lang="pt-BR">
            <body style={isDark ? styles.bodyDark : styles.body}>
                <div style={styles.wrapper}>
                    <img
                        src="https://img.dudit.com.br/static/mascots/Ops.png"
                        alt="Ops"
                        style={styles.mascot}
                    />

                    <h1 style={isDark ? styles.titleDark : styles.title}>
                        Ops! Algo deu errado por aqui
                    </h1>

                    <p style={isDark ? styles.subtitleDark : styles.subtitle}>
                        Algo inesperado aconteceu. Tente novamente em alguns
                        instantes.
                    </p>

                    <button onClick={() => reset()} style={styles.button}>
                        Tentar novamente
                    </button>

                    <div style={styles.card}>
                        <div style={styles.cardBar} />
                        <div style={styles.cardContent}>
                            <p style={styles.cardTitle}>Detalhes do erro</p>
                            <p style={styles.cardMessage}>{message}</p>
                            {digest && (
                                <p style={styles.cardDigest}>ID: {digest}</p>
                            )}
                        </div>
                    </div>
                </div>
            </body>
        </html>
    )
}

function safeErrorMessage(error: unknown): string {
    if (!error) return "Ocorreu um erro inesperado."
    if (typeof error === "string" && error) return error
    if (typeof error === "object") {
        const maybe = (error as Record<string, unknown>).message
        if (typeof maybe === "string" && maybe) return maybe
    }
    return "Ocorreu um erro inesperado."
}

const styles = {
    body: {
        margin: 0,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#ffffff",
        fontFamily:
            'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding: "24px",
        transition: "background-color 0.3s, color 0.3s",
    },
    bodyDark: {
        margin: 0,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#18181b",
        fontFamily:
            'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        padding: "24px",
        transition: "background-color 0.3s, color 0.3s",
    },
    wrapper: {
        maxWidth: "576px",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center" as const,
    },
    mascot: {
        width: "192px",
        height: "192px",
        objectFit: "contain" as const,
        marginBottom: "24px",
    },
    title: {
        fontSize: "24px",
        fontWeight: 700,
        color: "#003229",
        margin: "0 0 8px 0",
    },
    titleDark: {
        fontSize: "24px",
        fontWeight: 700,
        color: "#f0f0f0",
        margin: "0 0 8px 0",
    },
    subtitle: {
        fontSize: "18px",
        color: "#6b7280",
        margin: "0 0 32px 0",
    },
    subtitleDark: {
        fontSize: "18px",
        color: "#a1a1aa",
        margin: "0 0 32px 0",
    },
    button: {
        backgroundColor: "#059669",
        color: "#ffffff",
        border: "none",
        borderRadius: "9999px",
        padding: "10px 24px",
        fontSize: "16px",
        fontWeight: 600,
        cursor: "pointer",
    },
    card: {
        width: "100%",
        marginTop: "48px",
        maxWidth: "512px",
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        backgroundColor: "rgba(240, 68, 56, 0.08)",
        border: "1px solid #f04438",
        borderRadius: "8px",
        padding: "12px 16px",
    },
    cardBar: {
        width: "4px",
        alignSelf: "stretch",
        backgroundColor: "#f04438",
        borderRadius: "9999px",
        flexShrink: 0,
    },
    cardContent: {
        textAlign: "left" as const,
        minWidth: 0,
    },
    cardTitle: {
        fontSize: "14px",
        fontWeight: 700,
        color: "#f04438",
        margin: "0 0 4px 0",
    },
    cardMessage: {
        fontSize: "12px",
        color: "#f04438",
        margin: 0,
        wordBreak: "break-all" as const,
    },
    cardDigest: {
        fontSize: "10px",
        color: "#f04438",
        opacity: 0.7,
        margin: "4px 0 0 0",
    },
} as const