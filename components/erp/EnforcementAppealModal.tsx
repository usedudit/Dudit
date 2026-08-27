"use client"

import React, { useState, useEffect, useTransition } from "react"
import { DefaultModal, Button, Input, FormTextarea, Badge, Checkbox, InfoCard, ListItem } from "@/components/reusable"
import {
    StoreIcon,
    AlertCircleIcon,
    CheckCircleIcon,
    AlertTriangleIcon,
    MailIcon,
    ClockIcon,
} from "@/lib/icons"
import {
    submitEnforcementAppealAction,
    checkAppealStatusAction,
    type CheckAppealStatusResult,
} from "@/app/actions/enforcement-appeal"
import { toast } from "@/hooks/use-notification"

export interface EnforcementAppealModalProps {
    isOpen: boolean
    onClose: () => void
    caseId: string
    entityId: string
    entityName: string
    entityType: "store" | "partner" | "erp" | "user"
    reason?: string | null
    userEmail?: string
    userName?: string
    onAppealSubmitted?: () => void
}

const SCOPE_LABELS: Record<string, string> = {
    store: "Loja / Filial",
    partner: "Parceiro Completo",
    erp: "Acesso ao ERP",
    user: "Conta de Usuário",
}

export function EnforcementAppealModal({
    isOpen,
    onClose,
    caseId,
    entityId,
    entityName,
    entityType,
    reason,
    userEmail = "",
    userName = "",
    onAppealSubmitted,
}: EnforcementAppealModalProps) {
    const [contactName, setContactName] = useState(userName)
    const [contactEmail, setContactEmail] = useState(userEmail)
    const [contactPhone, setContactPhone] = useState("")
    const [appealStatement, setAppealStatement] = useState("")
    const [truthConfirmed, setTruthConfirmed] = useState(false)

    // Status state
    const [isCheckingStatus, setIsCheckingStatus] = useState(true)
    const [existingAppeal, setExistingAppeal] = useState<CheckAppealStatusResult["appeal"] | null>(null)
    const [isSubmittedSuccess, setIsSubmittedSuccess] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const scopeLabel = SCOPE_LABELS[entityType] || "Loja"

    // Check status on open
    useEffect(() => {
        if (!isOpen) return

        let isMounted = true
        setIsCheckingStatus(true)
        setErrorMessage(null)
        setIsSubmittedSuccess(false)
        setContactName(userName)
        setContactEmail(userEmail)
        setAppealStatement("")
        setTruthConfirmed(false)

        checkAppealStatusAction(entityId, caseId).then((res) => {
            if (!isMounted) return
            if (res.hasPendingAppeal && res.appeal) {
                setExistingAppeal(res.appeal)
            } else {
                setExistingAppeal(null)
            }
            setIsCheckingStatus(false)
        })

        return () => {
            isMounted = false
        }
    }, [isOpen, entityId, caseId, userEmail, userName])

    if (!isOpen) return null

    const handleSubmitAppeal = () => {
        setErrorMessage(null)

        if (!contactName.trim()) {
            setErrorMessage("Por favor, informe o nome do responsável.")
            return
        }

        if (!contactEmail.trim() || !contactEmail.includes("@")) {
            setErrorMessage("Por favor, informe um e-mail de contato válido.")
            return
        }

        if (appealStatement.trim().length < 15) {
            setErrorMessage("Por favor, detalhe seus esclarecimentos com no mínimo 15 caracteres.")
            return
        }

        if (!truthConfirmed) {
            setErrorMessage("Você precisa declarar a veracidade das informações para prosseguir.")
            return
        }

        startTransition(async () => {
            try {
                const res = await submitEnforcementAppealAction({
                    caseId,
                    entityType,
                    entityId,
                    entityName,
                    reason,
                    appealStatement: appealStatement.trim(),
                    contactName: contactName.trim(),
                    contactEmail: contactEmail.trim(),
                    contactPhone: contactPhone.trim() || undefined,
                })

                if (res.success) {
                    toast.success("Recurso enviado com sucesso!")
                    setIsSubmittedSuccess(true)
                    onAppealSubmitted?.()
                } else if (res.alreadySubmitted) {
                    setErrorMessage(res.error || "Já existe um recurso em análise para este caso.")
                    setExistingAppeal({
                        id: res.appealId || "pending",
                        caseId,
                        status: "pending",
                        createdAt: new Date().toISOString(),
                        appealStatement: appealStatement.trim(),
                    })
                } else {
                    setErrorMessage(res.error || "Erro ao submeter o recurso.")
                }
            } catch (err: any) {
                setErrorMessage(err?.message || "Erro inesperado ao enviar o recurso.")
            }
        })
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={isSubmittedSuccess || existingAppeal ? "Acompanhamento do Recurso" : "Recorrer da Decisão"}
            maxWidth="xl"
            description={`Protocolo oficial: #${caseId}`}
        >
            <div className="space-y-5 pt-2">
                {/* Header Info */}
                <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/70 dark:bg-dark-surface/50 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-brand-orange/10 text-brand-orange flex items-center justify-center shrink-0">
                            <StoreIcon size={20} />
                        </div>
                        <div className="min-w-0">
                            <h4 className="font-bold text-sm text-brand-dark dark:text-dark-heading truncate">
                                {entityName}
                            </h4>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                Escopo: <span className="font-semibold text-brand-dark dark:text-white">{scopeLabel}</span>
                            </p>
                        </div>
                    </div>
                    <Badge variant="orange" className="shrink-0 font-mono text-xs">
                        {caseId}
                    </Badge>
                </div>

                {/* Loading status */}
                {isCheckingStatus && (
                    <div className="py-8 text-center text-xs text-brand-inactive-text flex items-center justify-center gap-2">
                        <ClockIcon size={16} className="animate-spin" />
                        <span>Consultando status do caso...</span>
                    </div>
                )}

                {/* State 1: Just Submitted Successfully */}
                {!isCheckingStatus && isSubmittedSuccess && (
                    <div className="space-y-4 text-center py-4">
                        <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircleIcon size={32} />
                        </div>
                        <div className="space-y-1">
                            <h3 className="text-base font-bold text-brand-dark dark:text-dark-heading">
                                Recurso Enviado com Sucesso!
                            </h3>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body max-w-md mx-auto">
                                Seus esclarecimentos foram recebidos e encaminhados para a equipe de moderação e auditoria. Um e-mail de confirmação com o protocolo foi enviado para <strong>{contactEmail}</strong>.
                            </p>
                        </div>

                        <InfoCard
                            color="green"
                            title="Prazo de Resposta"
                            message="Nossa equipe analisa os recursos em até 2 a 3 dias úteis. Você será notificado por e-mail e no painel assim que houver um parecer."
                        />

                        <div className="pt-2">
                            <Button onClick={onClose} className="w-full text-xs font-bold">
                                Entendido, Concluir
                            </Button>
                        </div>
                    </div>
                )}

                {/* State 2: Already Pending (Anti-Spam State) */}
                {!isCheckingStatus && !isSubmittedSuccess && existingAppeal && (
                    <div className="space-y-4">
                        <InfoCard
                            color="orange"
                            title="Recurso em Análise pela Moderação"
                            message={
                                <div className="space-y-2 text-xs">
                                    <p>
                                        Já existe uma solicitação de recurso protocolada sob o número <strong>#{existingAppeal.caseId}</strong>.
                                    </p>
                                    <p className="opacity-80">
                                        Data de envio: {new Date(existingAppeal.createdAt).toLocaleDateString("pt-BR", {
                                            day: "2-digit",
                                            month: "2-digit",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </p>
                                </div>
                            }
                        />

                        <div className="p-4 rounded-xl border border-gray-200 dark:border-dark-border bg-gray-50/50 dark:bg-dark-surface text-xs space-y-1.5">
                            <span className="font-bold text-brand-dark dark:text-dark-heading block">
                                Esclarecimentos enviados:
                            </span>
                            <p className="text-brand-inactive-text dark:text-dark-body italic whitespace-pre-wrap">
                                &ldquo;{existingAppeal.appealStatement}&rdquo;
                            </p>
                        </div>

                        <div className="p-3 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/30 text-xs text-blue-900 dark:text-blue-200">
                            <strong>Status Atual:</strong> Em análise. Para evitar duplicidades na fila, novos envios ficam bloqueados até a conclusão da análise deste recurso.
                        </div>

                        <div className="pt-2 flex justify-end">
                            <Button onClick={onClose} variant="outline" className="text-xs">
                                Fechar
                            </Button>
                        </div>
                    </div>
                )}

                {/* State 3: Open Appeal Form */}
                {!isCheckingStatus && !isSubmittedSuccess && !existingAppeal && (
                    <div className="space-y-4">
                        {/* Motivo registrado */}
                        {reason && (
                            <div className="p-3 bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl text-xs space-y-1">
                                <span className="font-bold text-red-900 dark:text-red-300 flex items-center gap-1.5">
                                    <AlertTriangleIcon size={14} className="text-brand-red shrink-0" />
                                    Motivo Registrado da Medida Administrativa:
                                </span>
                                <p className="text-red-950 dark:text-red-200">
                                    {reason}
                                </p>
                            </div>
                        )}

                        {/* Responsible name */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                Nome do Responsável *
                            </label>
                            <Input
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                placeholder="Nome completo do titular ou administrador"
                                className="w-full text-xs"
                            />
                        </div>

                        {/* Contact details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    E-mail para Retorno *
                                </label>
                                <Input
                                    type="email"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    placeholder="seu-email@exemplo.com"
                                    className="w-full text-xs"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    Telefone / WhatsApp (Opcional)
                                </label>
                                <Input
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    placeholder="(11) 99999-9999"
                                    className="w-full text-xs"
                                />
                            </div>
                        </div>

                        {/* Justification / Clarifications */}
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading">
                                Esclarecimentos & Justificativa do Recurso *
                            </label>
                            <FormTextarea
                                rows={4}
                                value={appealStatement}
                                onChange={(e) => setAppealStatement(e.target.value)}
                                placeholder="Apresente seus esclarecimentos, contexto, regularizações efetuadas ou links comprobatórios..."
                                className="w-full text-xs"
                            />
                            <span className="text-[11px] text-brand-inactive-text block">
                                Mínimo de 15 caracteres. Seja claro e objetivo nos argumentos.
                            </span>
                        </div>

                        {/* Confirmation Checkbox */}
                        <div className="pt-1">
                            <Checkbox
                                id="truthConfirmed"
                                checked={truthConfirmed}
                                onCheckedChange={(checked) => setTruthConfirmed(!!checked)}
                                label="Declaro que todas as informações e esclarecimentos prestados são verdadeiros e passíveis de comprovação."
                            />
                        </div>

                        {errorMessage && (
                            <InfoCard color="red" message={errorMessage} />
                        )}

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <Button type="button" variant="outline" onClick={onClose} disabled={isPending} className="text-xs">
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                onClick={handleSubmitAppeal}
                                disabled={isPending || !truthConfirmed || appealStatement.trim().length < 15}
                                className="text-xs font-bold"
                            >
                                {isPending ? "Enviando Recurso..." : "Enviar Recurso para Análise"}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </DefaultModal>
    )
}
