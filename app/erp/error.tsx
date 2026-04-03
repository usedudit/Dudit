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
                        action: "/erp/dashboard"
                    }}
                />
            </div>
        </div>
    )
}
