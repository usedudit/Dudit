"use client"

import React, { useState, useEffect } from "react"
import { DefaultModal, Button, Input, FormTextarea, Badge, Checkbox, Separator, ListItem, FormSection, InfoCard, PasswordInput } from "@/components/reusable"
import {
    AlertTriangleIcon,
    ShieldIcon,
    StoreIcon,
    UserIcon,
    CalendarIcon,
    NotificationIcon
} from "@/lib/icons"
import { requestStepUpToken } from "@/app/actions/admin/step-up"

export type EnforcementScope = "store" | "erp" | "partner" | "user"
export type EnforcementActionType = "suspend" | "unsuspend"

export interface AdminEnforcementModalProps {
    isOpen: boolean
    onClose: () => void
    actionType: EnforcementActionType
    scope: EnforcementScope
    entityId: string
    entityName: string
    currentRiskScore?: number
    onConfirm: (params: {
        reason: string
        durationDays: number | null
        stepUpToken: string
        riskScore?: number | null
        notifyOwner: boolean
    }) => Promise<{ success: boolean; error?: string; caseId?: string } | void>
}

const SCOPE_CONFIG: Record<EnforcementScope, {
    label: string
    icon: React.ComponentType<{ className?: string; size?: number }>
    suspendImpacts: string[]
    unsuspendImpacts: string[]
}> = {
    store: {
        label: "Loja / Filial",
        icon: StoreIcon,
        suspendImpacts: [
            "Apenas esta loja específica será desativada.",
            "A loja não aceitará novos pedidos no marketplace.",
            "Os operadores não poderão gerenciar esta loja no ERP.",
            "As demais filiais e o cadastro da organização permanecem intactos."
        ],
        unsuspendImpacts: [
            "O funcionamento desta loja será reativado imediatamente.",
            "A loja voltará a receber pedidos e transacionar.",
            "Os operadores terão o acesso ao painel da loja restabelecido."
        ]
    },
    erp: {
        label: "Acesso ao Painel ERP (Organização)",
        icon: StoreIcon,
        suspendImpacts: [
            "Bloqueia o acesso ao painel de gestão /erp para todos os membros desta organização.",
            "As lojas no marketplace podem continuar ativas até moderação adicional.",
            "O proprietário verá aviso de suspensão ao tentar logar no ERP."
        ],
        unsuspendImpacts: [
            "O acesso ao painel /erp será desbloqueado para o proprietário e operadores.",
            "Todas as funcionalidades administrativas da organização voltam a funcionar."
        ]
    },
    partner: {
        label: "Parceiro Completo (ERP + Todas as Lojas)",
        icon: ShieldIcon,
        suspendImpacts: [
            "Suspende toda a organização, matriz e filiais simultaneamente.",
            "Todos os produtos cadastrados são desativados do marketplace.",
            "O acesso ao painel ERP é bloqueado para toda a equipe.",
            "Nenhum novo pedido poderá ser criado."
        ],
        unsuspendImpacts: [
            "A organização, a matriz e todas as filiais serão reativadas.",
            "O acesso ao ERP é restaurado para a equipe.",
            "Os produtos e operações voltam ao ar."
        ]
    },
    user: {
        label: "Conta de Usuário",
        icon: UserIcon,
        suspendImpacts: [
            "A sessão do usuário será invalidada e ele será desconectado.",
            "O usuário será redirecionado para a página de banimento (/banned).",
            "Não poderá fazer compras, acessar ERPs ou interagir na plataforma."
        ],
        unsuspendImpacts: [
            "A conta do usuário será desbloqueada.",
            "O usuário poderá realizar login normalmente e utilizar seus acessos."
        ]
    }
}

const SUSPEND_PRESETS: Record<EnforcementScope, string[]> = {
    store: [
        "Violação dos Termos de Serviço da Loja",
        "Suspeita de Fraude ou Atividade Irregular",
        "Inadimplência Financeira Reiterada",
        "Excesso de Cancelamentos e Reclamações",
        "Venda de Produtos Não Autorizados",
        "Manutenção Operacional ou Auditoria"
    ],
    erp: [
        "Inadimplência do Plano de Assinatura ERP",
        "Uso Abusivo das Ferramentas do Painel",
        "Violação de Políticas de Segurança",
        "Suspeita de Acesso Não Autorizado",
        "Auditoria de Compliance em Andamento",
        "Bloqueio Solicitado pela Moderação"
    ],
    partner: [
        "Fraude Comprovada na Organização",
        "Violação Grave dos Termos e Condições",
        "Inadimplência Contratual Prolongada",
        "Reclamações Massivas de Consumidores",
        "Descumprimento de Normas Sanitárias/Legais",
        "Determinação Judicial ou Regulatória"
    ],
    user: [
        "Comportamento Abusivo / Ofensivo",
        "Tentativa de Golpe ou Fraude em Pagamentos",
        "Criação de Múltiplas Contas Fraudulentas",
        "Violação das Diretrizes da Comunidade",
        "Chargebacks / Contestações Não Autorizadas",
        "Uso de Bots / Scraping Não Autorizado"
    ]
}

const UNSUSPEND_PRESETS: Record<EnforcementScope, string[]> = {
    store: [
        "Recurso Deferido pela Equipe de Moderação",
        "Regularização de Documentação e Pendências",
        "Regularização Financeira Concluída",
        "Esclarecimentos Prestados pelo Lojista"
    ],
    erp: [
        "Assinatura Regularizada com Sucesso",
        "Auditoria de Segurança Finalizada",
        "Recurso de Acesso Deferido",
        "Liberação Administrativa Concedida"
    ],
    partner: [
        "Organização Totalmente Regularizada",
        "Recurso Integral Deferido pela Diretoria",
        "Quitação de Débitos e Validação Cadastral",
        "Auditoria Concluída sem Irregularidades"
    ],
    user: [
        "Recurso de Usuário Aprovado",
        "Esclarecimento de Contestação Financeira",
        "Revisão Periódica da Moderação",
        "Desbloqueio Administrativo Concedido"
    ]
}

const DURATION_OPTIONS = [
    { label: "Permanente", days: null },
    { label: "3 dias", days: 3 },
    { label: "7 dias", days: 7 },
    { label: "15 dias", days: 15 },
    { label: "30 dias", days: 30 },
    { label: "60 dias", days: 60 },
    { label: "90 dias", days: 90 },
    { label: "180 dias", days: 180 },
    { label: "Customizado", days: -1 },
]

export function AdminEnforcementModal({
    isOpen,
    onClose,
    actionType,
    scope,
    entityId,
    entityName,
    currentRiskScore = 0,
    onConfirm,
}: AdminEnforcementModalProps) {
    const isSuspend = actionType === "suspend"
    const config = SCOPE_CONFIG[scope] || SCOPE_CONFIG.store
    const ScopeIcon = config.icon

    // Wizard Step State
    const [step, setStep] = useState<1 | 2>(1)

    // Form State (Step 1)
    const [selectedDurationOption, setSelectedDurationOption] = useState<number | null>(null) // null = permanent
    const [customDays, setCustomDays] = useState<string>("14")
    const [reason, setReason] = useState<string>("")
    const [riskScore, setRiskScore] = useState<number>(isSuspend ? Math.max(currentRiskScore, 50) : 0)
    const [notifyOwner, setNotifyOwner] = useState<boolean>(true)

    // Form State (Step 2)
    const [adminPassword, setAdminPassword] = useState<string>("")
    const [showPassword, setShowPassword] = useState<boolean>(false)
    const [acknowledged, setAcknowledged] = useState<boolean>(false)

    // Loading and Feedback
    const [isLoading, setIsLoading] = useState<boolean>(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    // Reset modal on open/close
    useEffect(() => {
        if (isOpen) {
            setStep(1)
            setSelectedDurationOption(null)
            setCustomDays("14")
            setReason(isSuspend ? "" : "Reativação administrativa após análise.")
            setRiskScore(isSuspend ? (currentRiskScore > 50 ? currentRiskScore : 60) : 0)
            setNotifyOwner(true)
            setAdminPassword("")
            setShowPassword(false)
            setAcknowledged(false)
            setErrorMessage(null)
            setIsLoading(false)
        }
    }, [isOpen, actionType, currentRiskScore, isSuspend])

    if (!isOpen) return null

    // Effective duration in days
    const effectiveDurationDays = selectedDurationOption === -1
        ? (parseInt(customDays, 10) > 0 ? parseInt(customDays, 10) : null)
        : selectedDurationOption

    const calculatedExpirationDate = effectiveDurationDays
        ? new Date(Date.now() + effectiveDurationDays * 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
        })
        : null

    const handleNextStep = () => {
        setErrorMessage(null)
        if (isSuspend && (!reason || reason.trim().length < 5)) {
            setErrorMessage("Por favor, insira uma justificativa com no mínimo 5 caracteres.")
            return
        }
        setStep(2)
    }

    const handlePrevStep = () => {
        setErrorMessage(null)
        setStep(1)
    }

    const handleExecuteAction = async () => {
        setErrorMessage(null)

        if (!adminPassword || adminPassword.trim().length === 0) {
            setErrorMessage("Digite sua senha de administrador para confirmar.")
            return
        }

        if (!acknowledged) {
            setErrorMessage("Você precisa marcar a caixa de ciência para confirmar esta ação.")
            return
        }

        setIsLoading(true)

        try {
            // Step-up verification
            const stepUpRes = await requestStepUpToken(adminPassword)
            if (!stepUpRes.success || !stepUpRes.token) {
                setErrorMessage(stepUpRes.error || "Senha de administrador incorreta.")
                setIsLoading(false)
                return
            }

            // Execute enforcement action
            const result = await onConfirm({
                reason: reason.trim() || (isSuspend ? "Suspensão administrativa" : "Reativação administrativa"),
                durationDays: isSuspend ? effectiveDurationDays : null,
                stepUpToken: stepUpRes.token,
                riskScore: riskScore !== undefined ? riskScore : null,
                notifyOwner,
            })

            if (result && !result.success && result.error) {
                setErrorMessage(result.error)
                setIsLoading(false)
                return
            }

            onClose()
        } catch (err: any) {
            console.error("[ADMIN_ENFORCEMENT_MODAL] Error:", err)
            setErrorMessage(err?.message || "Ocorreu um erro ao processar a ação.")
        } finally {
            setIsLoading(false)
        }
    }

    const presets = isSuspend
        ? (SUSPEND_PRESETS[scope] || SUSPEND_PRESETS.store)
        : (UNSUSPEND_PRESETS[scope] || UNSUSPEND_PRESETS.store)

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={onClose}
            title={isSuspend ? "Aplicar Suspensão Disciplinar" : "Reativar e Restaurar Acesso"}
            maxWidth="2xl"
            description={`Passo ${step} de 2: ${step === 1 ? "Parâmetros e Configuração" : "Autenticação e Confirmação"}`}
            footer={
                <div className="flex items-center justify-end gap-3 pt-2">
                    <Button variant="outline" onClick={onClose}>
                        Cancelar
                    </Button>
                    <Button variant={isSuspend ? "destructive" : "default"} onClick={handleNextStep}>
                        Avançar para Confirmação →
                    </Button>
                </div>
            }
        >
            <div className="space-y-6 pt-2">
                {/* Step Progress Bar */}
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-brand-green" />
                    <div className={`flex-1 h-1.5 rounded-full transition-colors ${step === 2 ? "bg-brand-green" : "bg-brand-gray dark:bg-dark-border/50"}`} />
                </div>

                {/* Entity & Scope Header Card */}
                <ListItem
                    icon={<ScopeIcon />}
                    title={entityName}
                    description={scope}
                    right={<Badge variant={isSuspend ? "red" : "green"} className="shrink-0 text-xs uppercase font-bold">
                        {isSuspend ? "Suspensão" : "Reativação"}
                    </Badge>}
                />

                {/* STEP 1: CONFIGURATION */}
                {step === 1 && (
                    <div className="space-y-5">
                        {/* Suspension Duration Options (Only for Suspend) */}
                        {isSuspend && (
                            <FormSection title="Período de Vigência da Suspensão:">
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                    {DURATION_OPTIONS.map((opt) => {
                                        const isSelected = selectedDurationOption === opt.days
                                        return (
                                            <button
                                                key={opt.label}
                                                type="button"
                                                onClick={() => setSelectedDurationOption(opt.days)}
                                                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-all cursor-pointer text-center ${isSelected
                                                    ? "border-brand-green"
                                                    : "border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading"
                                                    }`}
                                            >
                                                {opt.label}
                                            </button>
                                        )
                                    })}
                                </div>

                                {selectedDurationOption === -1 && (
                                    <div className="flex items-center gap-3 pt-2">
                                        <label className="text-xs text-brand-inactive-text dark:text-dark-body whitespace-nowrap">
                                            Quantidade de dias:
                                        </label>
                                        <Input
                                            type="number"
                                            min="1"
                                            max="3650"
                                            value={customDays}
                                            onChange={(e) => setCustomDays(e.target.value)}
                                            className="w-32 h-9 text-xs"
                                        />
                                    </div>
                                )}

                                <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-dark-surface border border-gray-100 dark:border-dark-border text-xs flex items-center gap-2 text-brand-inactive-text dark:text-dark-body">
                                    <CalendarIcon size={14} className="text-brand-primary shrink-0" />
                                    <span>
                                        {calculatedExpirationDate ? (
                                            <>Vigência Temporária: <strong>Término previsto para {calculatedExpirationDate}</strong></>
                                        ) : (
                                            <>Vigência Indeterminada: <strong>Suspensão Permanente</strong> (até recurso ou revisão)</>
                                        )}
                                    </span>
                                </div>
                            </FormSection>
                        )}

                        {/* Reason and Preset Chips */}
                        <FormSection title={isSuspend ? "Justificativa / Motivo Detalhado *" : "Motivo da Reativação (Opcional):"} hasSeparator>
                            {/* Quick Presets */}
                            <div className="flex flex-wrap gap-1.5">
                                {presets.map((preset) => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setReason(preset)}
                                        className="text-[11px] px-2.5 py-1 rounded-full border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-surface hover:border-brand-primary/50 text-brand-dark dark:text-dark-heading transition-colors cursor-pointer"
                                    >
                                        + {preset}
                                    </button>
                                ))}
                            </div>

                            <FormTextarea
                                rows={3}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder={isSuspend ? "Descreva o motivo claro e circunstanciado para a suspensão..." : "Descreva os motivos da liberação..."}
                                className="w-full"
                            />
                        </FormSection>

                        {/* Risk Score Setting */}
                        <FormSection title="Score de Risco (0 - 100)" hasSeparator>
                            <div className="flex items-center justify-between">
                                <Badge
                                    variant={riskScore >= 80 ? "red" : riskScore >= 50 ? "orange" : riskScore >= 25 ? "orange" : "green"}
                                >
                                    {riskScore >= 80 ? "Crítico" : riskScore >= 50 ? "Alto" : riskScore >= 25 ? "Médio" : "Baixo / Seguro"}
                                </Badge>
                                <span className="text-xs text-brand-inactive-text dark:text-dark-body">{riskScore} pts</span>
                            </div>

                            {/* Manual Input */}
                            <Input
                                label="Digite o Score de Risco"
                                type="number"
                                min={0}
                                max={100}
                                value={riskScore}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10)
                                    if (!isNaN(val) && val >= 0 && val <= 100) setRiskScore(val)
                                }}
                                placeholder="Ex: 50"
                                className="w-32 mt-2"
                            />
                            <span className="text-[11px] text-brand-inactive-text mt-1 block">
                                0 a 24: Baixo risco • 25 a 49: Médio risco • 50+: Alto risco (alerta vermelho)
                            </span>

                            {/* Quick Risk Score Chips */}
                            <div className="flex flex-wrap gap-2 mt-2">
                                {(isSuspend
                                    ? [
                                        { label: `Manter Atual (${currentRiskScore})`, val: currentRiskScore },
                                        { label: "Moderado (35)", val: 35 },
                                        { label: "Alto (50)", val: 50 },
                                        { label: "Severo (80)", val: 80 },
                                        { label: "Crítico (100)", val: 100 },
                                    ]
                                    : [
                                        { label: "Redefinir para 0 (Seguro)", val: 0 },
                                        { label: "Baixo Risco (10)", val: 10 },
                                        { label: "Moderado (25)", val: 25 },
                                        { label: `Manter Atual (${currentRiskScore})`, val: currentRiskScore },
                                    ]
                                ).map((chip) => (
                                    <button
                                        key={chip.label}
                                        type="button"
                                        onClick={() => setRiskScore(chip.val)}
                                        className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all cursor-pointer ${riskScore === chip.val
                                            ? "bg-brand-dark text-white border-brand-dark dark:bg-white dark:text-brand-dark"
                                            : "bg-white dark:bg-dark-surface border-gray-200 dark:border-dark-border text-brand-inactive-text dark:text-dark-body hover:bg-gray-50"
                                            }`}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>
                        </FormSection>

                        {/* Notification Toggle */}
                        <ListItem
                            icon={<NotificationIcon />}
                            title="Enviar Notificação no App e Alertas"
                            description={isSuspend
                                ? "Dispara notificação com o protocolo do caso para que o lojista possa acompanhar ou recorrer."
                                : "Informa o lojista e seus operadores sobre o restabelecimento imediato dos serviços."}
                            right={<Checkbox
                                id="notifyOwner"
                                checked={notifyOwner}
                                onCheckedChange={(checked) => setNotifyOwner(!!checked)}
                                className="mt-0.5"
                            />}
                        />

                        {errorMessage && (
                            <InfoCard color="red" message={errorMessage} />
                        )}
                    </div>
                )}

                {/* STEP 2: AUTHENTICATION & CONFIRMATION */}
                {step === 2 && (
                    <div className="space-y-5">
                        {/* Summary Box */}
                        <FormSection title="Resumo da Ação Disciplinar:">
                            <div className="grid grid-cols-2 gap-2 text-brand-dark dark:text-dark-heading">
                                <div>
                                    <span className="text-brand-inactive-text dark:text-dark-body">Alvo:</span>{" "}
                                    <strong>{entityName}</strong>
                                </div>
                                <div>
                                    <span className="text-brand-inactive-text dark:text-dark-body">Ação:</span>{" "}
                                    <strong className={isSuspend ? "text-brand-red" : "text-brand-green"}>
                                        {isSuspend ? "Suspensão" : "Reativação"}
                                    </strong>
                                </div>
                                <div>
                                    <span className="text-brand-inactive-text dark:text-dark-body">Vigência:</span>{" "}
                                    <strong>{calculatedExpirationDate ? `Até ${calculatedExpirationDate}` : "Permanente"}</strong>
                                </div>
                                <div>
                                    <span className="text-brand-inactive-text dark:text-dark-body">Score de Risco:</span>{" "}
                                    <strong>{riskScore} pts</strong>
                                </div>
                            </div>
                            <div className="pt-2 border-t border-brand-border dark:border-dark-border text-brand-inactive-text dark:text-dark-body">
                                <span>Motivo:</span> <strong className="text-brand-dark dark:text-white">{reason || "Padrão"}</strong>
                            </div>
                        </FormSection>

                        <InfoCard title="Impacto Operacional" message={<ul className="space-y-1 list-disc pl-5">
                            {(isSuspend ? config.suspendImpacts : config.unsuspendImpacts).map((impact, idx) => (
                                <li key={idx}>{impact}</li>
                            ))}
                        </ul>} color="red" />

                        <Separator />

                        {/* Step-Up Password Input */}
                        <div className="space-y-2">
                            <div className="relative">
                                <PasswordInput
                                    label="Confirme sua senha"
                                    value={adminPassword}
                                    onChange={(e) => setAdminPassword(e.target.value)}
                                    className="w-full"
                                    autoFocus
                                    autoComplete="off"
                                />
                            </div>
                        </div>

                        {/* Science Checkbox */}
                        <Checkbox
                            label="Confirmo que revisei os parâmetros acima e autorizo a execução imediata desta medida administrativa."
                            id="acknowledged"
                            checked={acknowledged}
                            onCheckedChange={(checked) => setAcknowledged(!!checked)}
                            className="mt-0.5"
                        />

                        {errorMessage && (
                            <InfoCard color="red" message={errorMessage} />
                        )}

                        <div className="flex items-center justify-between gap-3 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={handlePrevStep}
                                disabled={isLoading}
                                className="text-xs"
                            >
                                ← Voltar ao Passo 1
                            </Button>
                            <Button
                                type="button"
                                variant="filled"
                                onClick={handleExecuteAction}
                                disabled={isLoading || !acknowledged || !adminPassword}
                                className={`text-xs font-bold ${isSuspend
                                    ? "bg-brand-red hover:bg-brand-red/90 text-white"
                                    : "bg-brand-green hover:bg-brand-green/90 text-white"
                                    }`}
                            >
                                {isLoading ? "Autenticando & Executando..." : isSuspend ? "Confirmar Suspensão" : "Confirmar Reativação"}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </DefaultModal >
    )
}
