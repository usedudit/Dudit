"use client"

import { useEffect, useState } from "react"

/**
 * Last-resort error boundary. It replaces the whole app shell, so it CANNOT
 * depend on globals.css, Tailwind, fonts, providers or any heavy module
 * (Sentry, icons, etc). A failure here makes Next.js render its built-in
 * blank "Application error" page instead of this custom one.
 *
 * That is why everything is inline-styled and every optional side-effect is
 * wrapped in try/catch - this component must never throw.
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
        } catch { }
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
                    } catch { }
                })
                .catch(() => { })
        } catch { }
    }, [error])

    useEffect(() => {
        try {
            const isChunkError =
                error.name === "ChunkLoadError" ||
                error.message?.includes("ChunkLoadError") ||
                error.message?.includes("Loading chunk") ||
                error.message?.includes("Failed to fetch dynamically imported module")

            if (isChunkError) {
                const lastReload = sessionStorage.getItem("last-chunk-error-reload")
                const now = Date.now()
                if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
                    sessionStorage.setItem("last-chunk-error-reload", now.toString())
                    window.location.reload()
                }
            }
        } catch { }
    }, [error])

    const digest = typeof error?.digest === "string" ? error.digest : undefined
    const message = safeErrorMessage(error)

    const pageBg = isDark ? "#18181b" : "#ffffff"
    const headerBg = isDark ? "#18181b" : "#003229"
    const footerBg = isDark ? "#18181b" : "#003229"
    const titleColor = isDark ? "#f0f0f0" : "#003229"
    const subtitleColor = isDark ? "#a1a1aa" : "#6b7280"
    const tryAgainBorder = isDark ? "#24252b" : "#ebebeb"
    const tryAgainBg = isDark ? "#18181b" : "#ffffff"
    const tryAgainText = isDark ? "#f0f0f0" : "#003229"
    const cardBg = isDark ? "rgba(127, 29, 29, 0.1)" : "#fef2f2"
    const cardBorder = isDark ? "rgba(127, 29, 29, 0.3)" : "#fee2e2"
    const cardTextColor = isDark ? "rgba(252, 165, 165, 0.8)" : "#b91c1c"

    return (
        <html lang="pt-BR">
            <body
                style={{
                    margin: 0,
                    minHeight: "100vh",
                    backgroundColor: pageBg,
                    fontFamily:
                        'system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                    transition: "background-color 0.3s, color 0.3s",
                }}
            >
                <div style={styles.pageWrap}>
                    {/* Header */}
                    <header style={{ ...styles.header, backgroundColor: headerBg }}>
                        <div style={styles.headerInner}>
                            <a href="/" style={styles.logoLink}>
                                <img
                                    src="https://img.dudit.com.br/static/Logo.png"
                                    alt="Dudit"
                                    width={140}
                                    height={40}
                                    loading="lazy"
                                    style={styles.logoImg}
                                />
                            </a>
                        </div>
                    </header>

                    {/* Main */}
                    <main style={styles.main}>
                        <div style={styles.mainInner}>
                            <img
                                src="https://img.dudit.com.br/static/mascots/Ops.png"
                                alt="Erro"
                                loading="lazy"
                                style={styles.mascot}
                            />

                            <h1 style={{ ...styles.title, color: titleColor }}>
                                Ops! Algo deu errado por aqui
                            </h1>

                            <p style={{ ...styles.subtitle, color: subtitleColor }}>
                                Algo inesperado aconteceu. Tente novamente em alguns
                                instantes.
                            </p>

                            <div style={styles.buttonContainer}>
                                <a href="/" style={styles.homeButton}>
                                    Voltar para o início
                                </a>
                                <button
                                    onClick={() => reset()}
                                    style={{
                                        ...styles.tryAgainButton,
                                        borderColor: tryAgainBorder,
                                        backgroundColor: tryAgainBg,
                                        color: tryAgainText,
                                    }}
                                >
                                    Tentar novamente
                                </button>
                            </div>

                            <div style={styles.cardContainer}>
                                <div
                                    style={{
                                        ...styles.card,
                                        backgroundColor: cardBg,
                                        borderColor: cardBorder,
                                    }}
                                >
                                    <div style={styles.cardBar} />
                                    <div style={styles.cardContent}>
                                        <p style={{ ...styles.cardTitle, color: cardTextColor }}>
                                            Detalhes do erro
                                        </p>
                                        <p style={{ ...styles.cardMessage, color: cardTextColor }}>
                                            {message}
                                        </p>
                                        {digest && (
                                            <p
                                                style={{
                                                    ...styles.cardDigest,
                                                    color: cardTextColor,
                                                }}
                                            >
                                                ID: {digest}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>

                    {/* Footer */}
                    <footer style={{ ...styles.footer, backgroundColor: footerBg }}>
                        <div style={styles.footerInner}>
                            <p style={styles.footerText}>
                                © {new Date().getFullYear()} Dudit. Todos os
                                direitos reservados.
                            </p>
                        </div>
                    </footer>
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
    pageWrap: {
        maxWidth: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column" as const,
        minHeight: "100vh",
    },
    header: {
        display: "flex",
        flexDirection: "column" as const,
        width: "100%",
        borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        position: "sticky" as const,
        top: 0,
        zIndex: 50,
        boxShadow:
            "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
    },
    headerInner: {
        width: "100%",
        height: "68px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        maxWidth: "1400px",
        padding: "0 8px",
        margin: "0 auto",
        gap: "16px",
    },
    logoLink: {
        cursor: "pointer",
        flexShrink: 0,
        zIndex: 110,
        paddingTop: "4px",
    },
    logoImg: {
        height: "40px",
        width: "auto",
        objectFit: "contain" as const,
    },
    main: {
        flex: 1,
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        marginTop: "80px",
    },
    mainInner: {
        maxWidth: "704px",
        width: "100%",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
    },
    mascot: {
        width: "288px",
        height: "288px",
        objectFit: "contain" as const,
        marginBottom: "16px",
    },
    title: {
        fontSize: "24px",
        fontWeight: 700,
        margin: "0 0 8px 0",
        textAlign: "center" as const,
    },
    subtitle: {
        fontSize: "18px",
        margin: "0 0 32px 0",
        maxWidth: "384px",
        textAlign: "center" as const,
    },
    buttonContainer: {
        display: "flex",
        flexDirection: "row" as const,
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: "12px",
        marginTop: "32px",
    },
    homeButton: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        borderRadius: "9999px",
        backgroundColor: "#79c325",
        padding: "10px 24px",
        fontSize: "14px",
        fontWeight: 600,
        color: "#ffffff",
        textDecoration: "none",
    },
    tryAgainButton: {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        borderRadius: "9999px",
        border: "1px solid",
        padding: "10px 24px",
        fontSize: "14px",
        fontWeight: 600,
        cursor: "pointer",
    },
    cardContainer: {
        width: "100%",
        marginTop: "48px",
        maxWidth: "512px",
    },
    card: {
        display: "flex",
        gap: "12px",
        alignItems: "flex-start",
        border: "1px solid",
        borderRadius: "8px",
        padding: "12px 16px",
    },
    cardBar: {
        width: "4px",
        alignSelf: "stretch" as const,
        backgroundColor: "#f87171",
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
        margin: "0 0 4px 0",
    },
    cardMessage: {
        fontSize: "12px",
        margin: 0,
        wordBreak: "break-all" as const,
    },
    cardDigest: {
        fontSize: "10px",
        opacity: 0.7,
        margin: "4px 0 0 0",
    },
    footer: {
        width: "100%",
        borderTop: "1px solid rgba(255, 255, 255, 0.1)",
    },
    footerInner: {
        maxWidth: "1400px",
        margin: "0 auto",
        padding: "0 24px",
        display: "flex",
        flexDirection: "column" as const,
        justifyContent: "center",
        alignItems: "center",
    },
    footerText: {
        color: "#ffffff",
        fontSize: "12px",
        fontWeight: 500,
        letterSpacing: "0.025em",
    },
} as const
