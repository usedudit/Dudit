"use client"

import { useState, useEffect, useTransition } from "react"
import { DefaultModal, Button, Input, FormTextarea, Checkbox, InfoCard, ListItem, PhoneInput, EmailInput, IconPlaceholder, ThreeDotsLoader, FormSection } from "@/components/reusable"
import {
    CheckCircleIcon,
    UserIcon,
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
            footer={
                <div className="flex items-center justify-end gap-3 pt-2">
                    {/* State 1: Submitted Success - only "Concluir" */}
                    {isSubmittedSuccess && (
                        <Button onClick={onClose} className="w-full sm:w-auto" disabled={isPending}>
                            Concluir
                        </Button>
                    )}

                    {/* State 2: Existing Appeal (Pending) - only "Fechar" */}
                    {existingAppeal && !isSubmittedSuccess && (
                        <Button onClick={onClose} className="w-full sm:w-auto h-12" disabled={isPending}>
                            Fechar
                        </Button>
                    )}

                    {/* State 3: Open Form - "Cancelar" and "Enviar Recurso" */}
                    {!isSubmittedSuccess && !existingAppeal && !isCheckingStatus && (
                        <>
                            <Button variant="outline" onClick={onClose} disabled={isPending}>
                                Cancelar
                            </Button>
                            <Button
                                onClick={handleSubmitAppeal}
                                disabled={isPending || !truthConfirmed || appealStatement.trim().length < 15}
                            >
                                {isPending ? "Enviando Recurso..." : "Enviar Recurso para Análise"}
                            </Button>
                        </>
                    )}

                    {/* Loading state - no buttons or just disabled */}
                    {isCheckingStatus && (
                        <Button disabled className="w-full sm:w-auto">
                            Carregando...
                        </Button>
                    )}
                </div>
            }
        >
            <div className="space-y-5 pt-2">
                {/* Header Info - show in form (recorrer) and existing appeal (acompanhamento), hide in success */}
                {!isSubmittedSuccess && (
                    <ListItem
                        title={entityName}
                        description={`ID do caso: #${caseId}`}
                        icon={UserIcon}
                        className="px-4 py-3"
                    />
                )}

                {/* Loading status */}
                {isCheckingStatus && (
                    <div className="flex items-center justify-center py-8">
                        <ThreeDotsLoader />
                    </div>
                )}

                {/* State 1: Just Submitted Successfully */}
                {!isCheckingStatus && isSubmittedSuccess && (
                    <>
                        <IconPlaceholder
                            title="Recurso Enviado com Sucesso!"
                            subtitle="Seus esclarecimentos foram recebidos e encaminhados para a equipe de moderação e auditoria."
                            icon={CheckCircleIcon}
                        />

                        <InfoCard
                            color="green"
                            title="Prazo de Resposta"
                            message="Nossa equipe analisa os recursos em até 2 a 3 dias úteis. Você será notificado por e-mail e no painel assim que houver um parecer."
                        />
                    </>
                )}

                {/* State 2: Already Pending (Anti-Spam State) */}
                {!isCheckingStatus && !isSubmittedSuccess && existingAppeal && (
                    <div className="space-y-4">
                        <InfoCard
                            color="orange"
                            title="Recurso em Análise pela Moderação"
                            message={
                                <div className="space-y-2">
                                    <p>
                                        Já existe uma solicitação de recurso protocolada sob o número <strong>#{existingAppeal.caseId}</strong>.
                                    </p>
                                    <p>
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

                        <FormSection title="Esclarecimentos enviados" hasSeparator>
                            <div className="text-brand-inactive-text dark:text-dark-body italic whitespace-pre-wrap">
                                &ldquo;{existingAppeal.appealStatement}&rdquo;
                            </div>
                        </FormSection>
                    </div>
                )}

                {/* State 3: Open Appeal Form */}
                {!isCheckingStatus && !isSubmittedSuccess && !existingAppeal && (
                    <div className="space-y-4">
                        {/* Motivo registrado */}
                        {reason && (
                            <InfoCard
                                color="red"
                                title="Motivo Registrado da Medida Administrativa"
                                message={reason}
                            />
                        )}

                        {/* Responsible name */}
                        <div className="space-y-1.5">
                            <Input
                                label="Nome do Responsável"
                                value={contactName}
                                onChange={(e) => setContactName(e.target.value)}
                                placeholder="Nome completo do titular ou administrador"
                                className="w-full"
                                required
                            />
                        </div>

                        {/* Contact details */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <EmailInput
                                    label="E-mail para Retorno"
                                    value={contactEmail}
                                    onChange={(e) => setContactEmail(e.target.value)}
                                    className="w-full"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <PhoneInput
                                    label="Telefone / WhatsApp (Opcional)"
                                    value={contactPhone}
                                    onChange={(e) => setContactPhone(e.target.value)}
                                    className="w-full"
                                />
                            </div>
                        </div>

                        {/* Justification / Clarifications */}
                        <div className="space-y-1.5">
                            <FormTextarea
                                label="Esclarecimentos & Justificativa do Recurso"
                                rows={4}
                                value={appealStatement}
                                onChange={(e) => setAppealStatement(e.target.value)}
                                placeholder="Apresente seus esclarecimentos, contexto, regularizações efetuadas ou links comprobatórios..."
                                className="w-full"
                                required
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
                    </div>
                )}
            </div>
        </DefaultModal >
    )
}
