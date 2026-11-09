"use client"

import { useState } from "react"
import type { SuspendedStoreRecord } from "@/lib/auth/partner-context"
import { AlertCircleIcon, StoreIcon } from "@/lib/icons"
import { Button, Badge, FormSection, IconPlaceholder } from "@/components/reusable"
import { EnforcementAppealModal } from "./EnforcementAppealModal"

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
    const [appealTarget, setAppealTarget] = useState<SuspendedStoreRecord | null>(null)

    if (!suspendedStores || suspendedStores.length === 0) return null

    const handleCopyProtocol = (caseId: string) => {
        navigator.clipboard.writeText(caseId)
        setCopiedId(caseId)
        setTimeout(() => setCopiedId(null), 2500)
    }

    return (
        <div className="flex flex-col gap-4 w-full">
            {onlySuspended ? (
                <IconPlaceholder
                    icon={AlertCircleIcon}
                    title="Acesso Suspenso"
                    subtitle="Sua conta de parceiro ou loja está temporariamente suspensa ou com acesso restrito pela moderação da Dudit."
                />
            ) : (
                <FormSection title={`Lojas / Acessos Suspensos (${suspendedStores.length})`}>
                    <div className="space-y-4 p-4 rounded-xl border border-brand-red">
                        {suspendedStores.map((item) => {
                            const fallbackCaseId = `CAS-${item.storeId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
                            const caseId = item.caseId || fallbackCaseId
                            const isCopied = copiedId === caseId

                            const unbanDate = item.suspendedUntil
                                ? new Date(item.suspendedUntil).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
                                : "Permanente"
                            const isPermanent = !item.suspendedUntil

                            return (
                                <div
                                    key={item.storeId}
                                    className="space-y-4 text-left"
                                >
                                    {/* Header */}
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="w-10 h-10 rounded-full bg-brand-red/10 text-brand-red flex items-center justify-center shrink-0">
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
                                        <Badge variant="red" className="shrink-0">
                                            {item.statusLabel}
                                        </Badge>
                                    </div>

                                    {/* Protocol & Reason Box */}
                                    <div className="border-t border-brand-border dark:border-dark-border space-y-2 text-sm">
                                        <div className="flex items-center justify-between pt-2">
                                            <span className="font-bold text-brand-dark dark:text-dark-heading">
                                                Protocolo do Caso:
                                            </span>
                                            <button
                                                onClick={() => handleCopyProtocol(caseId)}
                                                className="font-mono font-bold text-brand-red hover:underline cursor-pointer flex items-center gap-1"
                                            >
                                                <span>{caseId}</span>
                                            </button>
                                        </div>

                                        <div>
                                            <span className="text-brand-red block font-medium">Motivo:</span>
                                            <p className="font-semibold text-brand-inactive-text dark:text-dark-body mt-0.5">
                                                {item.reason || "Decisão administrativa da moderação."}
                                            </p>
                                        </div>

                                        <div className="text-sm text-brand-red pt-1 border-t border-brand-border dark:border-dark-border">
                                            Vigência: {isPermanent ? "Permanente" : `Até ${unbanDate}`}
                                        </div>
                                    </div>

                                    {/* Appeal CTA - apenas para o dono (isOwn) */}
                                    {item.isOwn ? (
                                        <div className="flex items-center justify-between gap-3 pt-1">
                                            <span className="text-sm font-medium text-brand-inactive-text dark:text-dark-body">
                                                Acredita que houve um equívoco?
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => setAppealTarget(item)}
                                            >
                                                Recorrer da Decisão
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="pt-1 text-sm text-brand-inactive-text dark:text-dark-body">
                                            Apenas o proprietário titular da conta pode submeter recursos para esta loja.
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </FormSection>
            )}

            {/* Appeal Modal */}
            {appealTarget && (
                <EnforcementAppealModal
                    isOpen={!!appealTarget}
                    onClose={() => setAppealTarget(null)}
                    caseId={appealTarget.caseId || `CAS-${appealTarget.storeId.replace(/-/g, "").slice(0, 8).toUpperCase()}`}
                    entityId={appealTarget.storeId}
                    entityName={appealTarget.storeName}
                    entityType="store"
                    reason={appealTarget.reason}
                    userEmail={userEmail}
                />
            )}
        </div>
    )
}
