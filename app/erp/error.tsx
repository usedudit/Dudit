"use client"

import { useEffect } from "react"
import { IconPlaceholder } from "@/components/reusable"

export default function ERPErrorBoundary({
    error,
}: {
    error: Error & { digest?: string }
}) {
    useEffect(() => {
        console.error("ERP Error Boundary caught:", error)

        fetch("/api/log-error", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: error.message, stack: error.stack, name: error.name, digest: (error as any).digest }),
        }).catch(() => {})

        const isChunkError =
            error.name === "ChunkLoadError" ||
            error.message?.includes("ChunkLoadError") ||
            error.message?.includes("Loading chunk") ||
            error.message?.includes("Failed to fetch dynamically imported module")

        if (isChunkError) {
            const lastReload = sessionStorage.getItem("last-chunk-error-reload")
            const now = Date.now()
            // Only reload if we haven't reloaded in the last 10 seconds to prevent infinite reload loops
            if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
                sessionStorage.setItem("last-chunk-error-reload", now.toString())
                window.location.reload()
            }
        }
    }, [error])

    const msg = error.message?.toLowerCase() || ""
    const isAccessDenied = msg.includes("acesso negado") || msg.includes("permissão") || error.name === "ForbiddenError"

    return (
        <div className="flex items-center justify-center h-screen p-4 text-center">
            <div className="flex flex-col items-center">
                <IconPlaceholder
                    placeholderType="image"
                    imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                    imageAlt="Erro"
                    title={`${isAccessDenied ? "Acesso Restrito" : "Algo deu errado"}`}
                    subtitle={`${isAccessDenied
                        ? "Você não tem permissão para visualizar ou acessar este recurso. Se o seu cargo foi alterado recentemente, recarregue a página."
                        : "Ocorreu um erro inesperado ao carregar esta página. Tente recarregá-la."}`}
                    itemButton={{
                        text: "Voltar para o Início",
                        action: "/erp/inicio"
                    }}
                />
            </div>
        </div>
    )
}
