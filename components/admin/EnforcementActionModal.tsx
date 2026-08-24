"use client"

import React, { useState, useEffect } from "react"
import { AlertTriangle, X, ShieldAlert, Eye, EyeOff, Bell, KeyRound } from "lucide-react"
import { Button, Input, Badge } from "@/components/reusable"
import { requestStepUpToken } from "@/app/actions/admin/step-up"

export interface EnforcementActionModalProps {
    isOpen: boolean
    onClose: () => void
    onConfirm: (params: {
        reason: string
        stepUpToken: string
        riskScore?: number | null
        notifyOwner: boolean
    }) => Promise<void>
    title: string
    description: string
    entityName: string
    entityTypeLabel?: string
    currentRiskScore?: number
    showRiskScoreInput?: boolean
    consequences: string[]
    confirmButtonText?: string
    isPending?: boolean
}

const DEFAULT_REASON_PRESETS = [
    "Violação dos Termos de Uso e Políticas da Plataforma",
    "Suspeita de Fraude ou Atividade Irregular",
    "Inadimplência Recorrente ou Pendência Financeira",
    "Alto Volume de Reclamações de Clientes",
    "Não Conformidade com Padrões de Qualidade",
    "Solicitação Judicial ou Notificação Extrajudicial",
]

export default function EnforcementActionModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    description,
    entityName,
    entityTypeLabel = "Entidade",
    currentRiskScore,
    showRiskScoreInput = true,
    consequences,
    confirmButtonText = "Confirmar Ação",
    isPending = false,
}: EnforcementActionModalProps) {
    const [reason, setReason] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [riskScore, setRiskScore] = useState<string>(
        currentRiskScore !== undefined ? String(currentRiskScore) : ""
    )
    const [notifyOwner, setNotifyOwner] = useState(true)
    const [isConfirmed, setIsConfirmed] = useState(false)
    const [authError, setAuthError] = useState<string | null>(null)
    const [isValidatingAuth, setIsValidatingAuth] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setReason("")
            setPassword("")
            setShowPassword(false)
            setRiskScore(currentRiskScore !== undefined ? String(currentRiskScore) : "")
            setNotifyOwner(true)
            setIsConfirmed(false)
            setAuthError(null)
            setIsValidatingAuth(false)
        }
    }, [isOpen, currentRiskScore])

    if (!isOpen) return null

    const handleSelectPreset = (preset: string) => {
        setReason((prev) => {
            if (!prev.trim()) return preset
            return `${prev}\n- ${preset}`
        })
    }

    const handleConfirm = async () => {
        if (!reason.trim() || reason.trim().length < 5) {
            setAuthError("Informe uma justificativa de pelo menos 5 caracteres.")
            return
        }
        if (!password.trim()) {
            setAuthError("Digite sua senha de administrador para autenticar esta ação.")
            return
        }
        if (!isConfirmed) {
            setAuthError("Você deve marcar a caixa de ciência para prosseguir.")
            return
        }

        setIsValidatingAuth(true)
        setAuthError(null)

        try {
            // 1. Obter o Step-Up Token validando a senha do administrador
            const stepUpResult = await requestStepUpToken(password)

            if (!stepUpResult.success || !stepUpResult.token) {
                setAuthError(stepUpResult.error || "Senha inválida. Autenticação adicional falhou.")
                setIsValidatingAuth(false)
                return
            }

            // 2. Executar a ação de enforcement com o token obtido
            const parsedRisk = showRiskScoreInput && riskScore.trim() !== "" ? Number(riskScore) : null
            await onConfirm({
                reason: reason.trim(),
                stepUpToken: stepUpResult.token,
                riskScore: Number.isFinite(parsedRisk) ? parsedRisk : null,
                notifyOwner,
            })
        } catch (err: any) {
            setAuthError(err?.message || "Erro ao processar a ação.")
        } finally {
            setIsValidatingAuth(false)
        }
    }

    const numericRisk = Number(riskScore)
    const riskLevel = Number.isFinite(numericRisk)
        ? numericRisk >= 75
            ? "Crítico"
            : numericRisk >= 50
                ? "Alto"
                : numericRisk >= 25
                    ? "Médio"
                    : "Baixo"
        : null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
            <div className="bg-white dark:bg-dark-surface rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-red-200 dark:border-red-900/30 my-8 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-red-50 dark:bg-red-900/20 p-5 flex items-start gap-3.5 border-b border-red-100 dark:border-red-900/30">
                    <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0">
                        <ShieldAlert size={22} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-red-700 dark:text-red-400 leading-tight">
                                {title}
                            </h2>
                            <Badge variant="red">{entityTypeLabel}</Badge>
                        </div>
                        <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1 leading-relaxed">
                            {description}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 rounded-lg transition-colors"
                        aria-label="Fechar"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* Entidade Alvo */}
                    <div>
                        <span className="text-[11px] font-bold text-brand-inactive-text dark:text-dark-body uppercase tracking-wider block mb-1">
                            {entityTypeLabel} Afetada
                        </span>
                        <div className="p-3 bg-brand-gray dark:bg-dark-border/40 rounded-xl border border-brand-border dark:border-dark-border font-bold text-sm text-brand-dark dark:text-dark-heading break-all">
                            {entityName}
                        </div>
                    </div>

                    {/* Consequências */}
                    {consequences.length > 0 && (
                        <div className="p-3.5 bg-red-50/40 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20">
                            <span className="text-[11px] font-bold text-red-800 dark:text-red-400 uppercase tracking-wider block mb-1.5">
                                Consequências Desta Ação
                            </span>
                            <ul className="space-y-1">
                                {consequences.map((c, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-red-900/90 dark:text-red-300">
                                        <span className="text-red-500 font-bold shrink-0">•</span>
                                        <span>{c}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Justificativa / Motivo */}
                    <div>
                        <label className="block text-xs font-bold text-brand-dark dark:text-dark-heading mb-1.5">
                            Motivo / Justificativa Administrativa <span className="text-red-500">*</span>
                        </label>

                        {/* Motivos rápidos */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                            {DEFAULT_REASON_PRESETS.map((preset, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSelectPreset(preset)}
                                    className="text-[11px] px-2 py-1 rounded-lg bg-brand-gray dark:bg-dark-border/40 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30 text-brand-dark dark:text-dark-heading border border-brand-border dark:border-dark-border transition-colors text-left"
                                >
                                    + {preset}
                                </button>
                            ))}
                        </div>

                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="w-full p-3 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-brand-dark dark:text-dark-heading focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none transition-all resize-none h-20 text-xs"
                            placeholder="Descreva detalhadamente o motivo que será registrado no log de auditoria e enviado ao lojista..."
                        />
                    </div>

                    {/* Ajuste de Score de Risco (Opcional) */}
                    {showRiskScoreInput && (
                        <div className="p-3.5 bg-brand-gray/50 dark:bg-dark-border/20 rounded-xl border border-brand-border dark:border-dark-border">
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs font-bold text-brand-dark dark:text-dark-heading">
                                    Atribuir Score de Risco (0 a 100)
                                </label>
                                {riskLevel && (
                                    <Badge
                                        variant={
                                            numericRisk >= 75
                                                ? "red"
                                                : numericRisk >= 50
                                                    ? "red"
                                                    : numericRisk >= 25
                                                        ? "orange"
                                                        : "green"
                                        }
                                    >
                                        Nível: {riskLevel} ({numericRisk} pts)
                                    </Badge>
                                )}
                            </div>

                            <div className="flex gap-2 mb-2">
                                {[
                                    { label: "Atual", val: currentRiskScore !== undefined ? String(currentRiskScore) : "0" },
                                    { label: "Médio (35)", val: "35" },
                                    { label: "Alto (50)", val: "50" },
                                    { label: "Crítico (80)", val: "80" },
                                    { label: "Máximo (100)", val: "100" },
                                ].map((chip, i) => (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => setRiskScore(chip.val)}
                                        className={`flex-1 text-[11px] py-1 px-1 rounded-lg border font-medium transition-colors text-center ${
                                            riskScore === chip.val
                                                ? "bg-red-500 text-white border-red-500 font-bold"
                                                : "bg-white dark:bg-dark-surface border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading hover:border-red-300"
                                        }`}
                                    >
                                        {chip.label}
                                    </button>
                                ))}
                            </div>

                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={riskScore}
                                onChange={(e) => setRiskScore(e.target.value)}
                                placeholder="Definir score manual..."
                                className="text-xs h-9"
                            />
                        </div>
                    )}

                    {/* Notificação ao Lojista */}
                    <div
                        onClick={() => setNotifyOwner(!notifyOwner)}
                        className="flex items-start gap-3 p-3 rounded-xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface cursor-pointer select-none"
                    >
                        <input
                            type="checkbox"
                            checked={notifyOwner}
                            onChange={(e) => setNotifyOwner(e.target.checked)}
                            className="mt-0.5 w-4 h-4 text-brand-green rounded border-brand-border focus:ring-brand-green shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className="space-y-0.5">
                            <span className="text-xs font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                                <Bell size={13} className="text-brand-green" /> Notificar o proprietário e operadores
                            </span>
                            <span className="text-[11px] text-brand-inactive-text block leading-relaxed">
                                Envia aviso no painel e canais de alerta com o protocolo do caso (<code className="font-mono font-bold text-red-600 dark:text-red-400">CAS-XXXXXXXX</code>) e orientações de recurso.
                            </span>
                        </div>
                    </div>

                    {/* Confirmação de Senha do Administrador (Step-Up Auth) */}
                    <div className="p-3.5 bg-amber-50/60 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-900/30">
                        <label className="block text-xs font-bold text-amber-900 dark:text-amber-300 mb-1 flex items-center gap-1.5">
                            <KeyRound size={14} /> Confirme sua Senha de Administrador <span className="text-red-500">*</span>
                        </label>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mb-2">
                            Ações disciplinares exigem validação da sua identidade para emissão do token seguro de uso único.
                        </p>
                        <div className="relative">
                            <Input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Digite sua senha de login de admin..."
                                className="pr-10 text-xs h-9 bg-white dark:bg-dark-surface"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-inactive-text hover:text-brand-dark p-1"
                            >
                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {/* Checkbox de Ciência */}
                    <div
                        onClick={() => setIsConfirmed(!isConfirmed)}
                        className="flex items-start gap-3 p-3 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/50 dark:bg-red-900/10 cursor-pointer select-none"
                    >
                        <input
                            type="checkbox"
                            checked={isConfirmed}
                            onChange={(e) => setIsConfirmed(e.target.checked)}
                            className="mt-0.5 w-4 h-4 text-red-600 rounded border-red-300 focus:ring-red-500 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        />
                        <div className="space-y-0.5">
                            <span className="text-xs text-red-900 dark:text-red-300 font-medium leading-relaxed block">
                                Estou ciente das consequências desta ação administrativa e confirmo que desejo prosseguir.
                            </span>
                            <span className="text-[11px] text-red-700/80 dark:text-red-400/80 block">
                                ℹ️ Um identificador oficial de caso (<code className="font-mono font-bold">CAS-XXXXXXXX</code>) será gerado para auditoria e recurso.
                            </span>
                        </div>
                    </div>

                    {/* Mensagem de Erro */}
                    {authError && (
                        <div className="p-3 bg-red-100 dark:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                            <AlertTriangle size={15} className="shrink-0" />
                            <span>{authError}</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 pt-3 border-t border-brand-border dark:border-dark-border flex justify-end gap-2.5">
                    <Button variant="outline" onClick={onClose} disabled={isPending || isValidatingAuth} className="text-xs">
                        Cancelar
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        disabled={!isConfirmed || !reason.trim() || !password.trim() || isPending || isValidatingAuth}
                        className="text-xs"
                    >
                        {isValidatingAuth || isPending ? "Autenticando & Processando..." : confirmButtonText}
                    </Button>
                </div>
            </div>
        </div>
    )
}
