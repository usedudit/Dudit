"use client"

import { useEffect } from "react"
import { Button, IconPlaceholder } from "@/components/reusable"

export default function ERPErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        // Log error to an error reporting service if desired
        console.error("ERP Error Boundary caught:", error)
    }, [error])

    const msg = error.message?.toLowerCase() || ""
    const isAccessDenied = msg.includes("acesso negado") || msg.includes("permissão") || error.name === "ForbiddenError"

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
            <div className="flex flex-col items-center mb-8">
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
                        action: "/erp/dashboard"
                    }}
                />
            </div>
        </div>
    )
}
