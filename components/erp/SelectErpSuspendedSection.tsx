"use client"

import React, { useState } from "react"
import type { SuspendedStoreRecord } from "@/lib/auth/partner-context"
import { AlertCircleIcon, StoreIcon, AlertTriangleIcon } from "@/lib/icons"
import { Button, Badge } from "@/components/reusable"

interface SelectErpSuspendedSectionProps {
    suspendedStores: SuspendedStoreRecord[]
    userEmail?: string
    onlySuspended?: boolean
}

export function SelectErpSuspendedSection({
    suspendedStores,
    userEmail,
    onlySuspended = false,
}: SelectErpSuspendedSectionProps) {
    const [copiedId, setCopiedId] = useState<string | null>(null)

    if (!suspendedStores || suspendedStores.length === 0) return null

    const handleCopyProtocol = (caseId: string) => {
        navigator.clipboard.writeText(caseId)
        setCopiedId(caseId)
        setTimeout(() => setCopiedId(null), 2500)
    }

    return (
        <div className="flex flex-col gap-4 w-full">
            {onlySuspended ? (
                <div className="text-center space-y-2 mb-2">
                    <div className="mx-auto h-16 w-16 bg-brand-red/10 text-brand-red rounded-full flex items-center justify-center">
                        <AlertCircleIcon size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-brand-dark dark:text-dark-heading">
                        Acesso ao ERP Indisponível
                    </h1>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm max-w-md mx-auto">
                        Sua conta de parceiro ou loja está temporariamente suspensa ou com acesso restrito pela moderação da Dudit.
                    </p>
                </div>
            ) : (
                <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
                    <div className="flex items-center gap-2 mb-3">
                        <AlertTriangleIcon className="w-4 h-4 text-brand-orange shrink-0" />
                        <h2 className="text-sm font-bold text-brand-dark dark:text-dark-heading uppercase tracking-wider">
                            Lojas / Acessos Suspensos ({suspendedStores.length})
                        </h2>
                    </div>
                </div>
            )}

            <div className="space-y-4">
                {suspendedStores.map((item) => {
                    const fallbackCaseId = `CAS-${item.storeId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
                    const caseId = item.caseId || fallbackCaseId
                    const isCopied = copiedId === caseId

                    const unbanDate = item.suspendedUntil
                        ? new Date(item.suspendedUntil).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                        : "Permanente"
                    const isPermanent = !item.suspendedUntil

                    const mailSubject = encodeURIComponent(`[Recurso Dudit] Solicitação de Revisão - Loja ${item.storeName} - Protocolo #${caseId}`)
                    const mailBody = encodeURIComponent(
                        `Olá equipe de moderação da Dudit,\n\n` +
                        `Gostaria de solicitar a reavaliação do bloqueio/suspensão da minha loja no ERP sob o protocolo #${caseId}.\n\n` +
                        `--- Dados do Caso ---\n` +
                        `• Protocolo do Caso: ${caseId}\n` +
                        `• Nome da Loja: ${item.storeName}\n` +
                        `• ID da Loja: ${item.storeId}\n` +
                        `• ID do Parceiro: ${item.partnerId}\n` +
                        `• Status: ${item.statusLabel}\n` +
                        `• Motivo Registrado: ${item.reason || "Sem motivo"}\n` +
                        `• E-mail do Solicitante: ${userEmail || "N/A"}\n\n` +
                        `--- Justificativa do Recurso ---\n` +
                        `[Descreva aqui seus esclarecimentos ou comprovantes para regularização do acesso]:\n\n`
                    )
                    const appealMailUrl = `mailto:contato@dudit.com.br?subject=${mailSubject}&body=${mailBody}`

                    return (
                        <div
                            key={item.storeId}
                            className="bg-white dark:bg-dark-surface rounded-2xl border border-red-200 dark:border-red-900/30 p-5 shadow-sm space-y-4 text-left transition-all"
                        >
                            {/* Header */}
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-xl bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0">
                                        <StoreIcon size={20} />
                                    </div>
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                            {item.storeName}
                                        </h3>
                                        <p className="text-xs text-brand-inactive-text dark:text-dark-body truncate">
                                            {item.partnerName}
                                        </p>
                                    </div>
                                </div>
                                <Badge variant="red" className="shrink-0 text-[11px]">
                                    {item.statusLabel}
                                </Badge>
                            </div>

                            {/* Protocol & Reason Box */}
                            <div className="bg-red-50/60 dark:bg-red-950/20 rounded-xl p-3.5 border border-red-100 dark:border-red-900/30 space-y-2 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-red-900 dark:text-red-300">
                                        Protocolo do Caso:
                                    </span>
                                    <button
                                        onClick={() => handleCopyProtocol(caseId)}
                                        className="font-mono font-bold text-red-700 dark:text-red-400 hover:underline cursor-pointer flex items-center gap-1"
                                    >
                                        <span>{caseId}</span>
                                        <span className="text-[10px] uppercase font-sans font-bold bg-white dark:bg-dark-surface px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800">
                                            {isCopied ? "✓ Copiado" : "Copiar"}
                                        </span>
                                    </button>
                                </div>

                                <div>
                                    <span className="text-red-800/80 dark:text-red-400/80 block font-medium">Motivo:</span>
                                    <p className="font-semibold text-red-950 dark:text-red-200 mt-0.5">
                                        {item.reason || "Decisão administrativa da moderação."}
                                    </p>
                                </div>

                                <div className="text-[11px] text-red-700/70 dark:text-red-400/70 pt-1 border-t border-red-100 dark:border-red-900/30">
                                    Vigência: {isPermanent ? "Permanente" : `Até ${unbanDate}`}
                                </div>
                            </div>

                            {/* Appeal CTA */}
                            <div className="flex items-center justify-between gap-3 pt-1">
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    Acredita que houve um equívoco?
                                </span>
                                <Button asChild size="sm" variant="outline" className="text-xs font-bold shrink-0 border-brand-green/30 text-brand-green hover:bg-brand-green/10">
                                    <a href={appealMailUrl}>
                                        Recorrer da Decisão
                                    </a>
                                </Button>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
