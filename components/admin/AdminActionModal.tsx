"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import DefaultModal from "@/components/reusable/DefaultModal"
import { Button, Input } from "@/components/reusable"

export interface AdminActionPayload {
    reason: string
    riskScore: number | null
    notifySeller: boolean
}

interface AdminActionModalProps {
    isOpen: boolean
    /** Cancelamento (fechar sem executar a ação). */
    onClose: () => void
    title: string
    description?: string
    /** Resumo das alterações que serão aplicadas (usado no "salvar"). */
    changedFields?: string[]
    /** Exige motivo com mínimo de 5 caracteres (ações destrutivas). */
    requireReason?: boolean
    confirmLabel: string
    notifyLabel?: string
    /** Executa a ação. O modal fica com spinner até a promise resolver. */
    onConfirm: (payload: AdminActionPayload) => Promise<void>
}

/**
 * Modal de ação administrativa: motivo/mensagem ao vendedor (notificação
 * in-app via Dudit) + ajuste opcional de risk score da loja (fallback:
 * parceiro). Usado em arquivar/excluir/salvar de produto, serviço, plano
 * e de pedidos.
 */
export default function AdminActionModal({
    isOpen,
    onClose,
    title,
    description,
    changedFields,
    requireReason = false,
    confirmLabel,
    notifyLabel,
    onConfirm,
}: AdminActionModalProps) {
    const [reason, setReason] = useState("")
    const [riskScore, setRiskScore] = useState("")
    const [notifySeller, setNotifySeller] = useState(true)
    const [isPending, setIsPending] = useState(false)

    useEffect(() => {
        if (isOpen) {
            setReason("")
            setRiskScore("")
            setNotifySeller(true)
            setIsPending(false)
        }
    }, [isOpen])

    const trimmedReason = reason.trim()
    const reasonOk = !requireReason || trimmedReason.length >= 5
    const canConfirm = reasonOk && !isPending

    const handleConfirm = async () => {
        if (!canConfirm) return
        setIsPending(true)
        try {
            const raw = riskScore.trim()
            let parsed: number | null = null
            if (raw !== "") {
                const num = Number(raw)
                parsed = Number.isFinite(num) ? Math.max(0, Math.min(100, Math.round(num))) : null
            }
            await onConfirm({
                reason: trimmedReason,
                riskScore: parsed,
                notifySeller: notifySeller && Boolean(trimmedReason),
            })
        } finally {
            setIsPending(false)
        }
    }

    return (
        <DefaultModal
            isOpen={isOpen}
            onClose={() => {
                if (!isPending) onClose()
            }}
            title={title}
            description={description}
            maxWidth="lg"
            footer={
                <div className="flex w-full justify-end gap-3">
                    <Button variant="outline" onClick={onClose} disabled={isPending}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirm} disabled={!canConfirm} isLoading={isPending}>
                        {confirmLabel}
                    </Button>
                </div>
            }
        >
            <div className="space-y-4 pt-2">
                {changedFields && changedFields.length > 0 && (
                    <div className="p-3 rounded-xl border border-brand-border dark:border-dark-border bg-brand-gray dark:bg-dark-border/40">
                        <p className="text-xs font-semibold text-brand-dark dark:text-dark-heading">
                            Alterações que serão salvas
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {changedFields.map((field) => (
                                <span
                                    key={field}
                                    className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white dark:bg-dark-surface border border-brand-border dark:border-dark-border text-brand-dark dark:text-dark-heading capitalize"
                                >
                                    {field}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                        Risk score da loja (0–100) - opcional
                    </label>
                    <Input
                        type="number"
                        min={0}
                        max={100}
                        value={riskScore}
                        onChange={(e) => setRiskScore(e.target.value)}
                        placeholder="Manter atual"
                    />
                    <span className="text-[11px] text-brand-inactive-text mt-1 block">
                        0–24: baixo • 25–49: médio • 50+: alto. Deixe vazio para não alterar. Vale para a loja
                        (ou para o parceiro, se a loja não existir).
                    </span>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-brand-dark dark:text-dark-heading mb-1">
                        Motivo / mensagem ao vendedor{requireReason ? " (obrigatório)" : " (opcional)"}
                    </label>
                    <textarea
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        rows={3}
                        placeholder="Explique por que esta ação está sendo feita. O vendedor recebe isso como notificação na Dudit."
                        className="w-full px-3 py-2 rounded-lg border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface text-sm text-brand-dark dark:text-dark-heading focus:outline-none focus:ring-2 focus:ring-brand-green/50 resize-none"
                    />
                    {requireReason && (
                        <span className="text-[11px] text-brand-inactive-text mt-1 block">
                            Mínimo de 5 caracteres.
                        </span>
                    )}
                </div>

                <label
                    className={`flex items-center gap-2 text-sm text-brand-dark dark:text-dark-heading ${!reason.trim() ? "opacity-50" : ""
                        }`}
                >
                    <input
                        type="checkbox"
                        checked={notifySeller && Boolean(reason.trim())}
                        onChange={(e) => setNotifySeller(e.target.checked)}
                        disabled={!reason.trim()}
                        className="w-4 h-4 rounded border-brand-border accent-brand-green"
                    />
                    {notifyLabel || "Enviar notificação ao vendedor pelo Dudit"}
                </label>
            </div>
        </DefaultModal>
    )
}

export interface AdminActionResult {
    success: boolean
    error?: string
    cancelled?: boolean
}

export interface AdminActionRequest {
    title: string
    description?: string
    /** Rótulos das alterações (chips no modal e texto da notificação). */
    changedFields?: string[]
    /** Sempre abre o modal (ações destrutivas exigem motivo). */
    requireReason?: boolean
    /** Força abertura do modal mesmo sem changedFields/requireReason (ex.: save admin de pedido). */
    force?: boolean
    confirmLabel: string
    notifyLabel?: string
    runner: (payload: AdminActionPayload) => Promise<AdminActionResult>
}

/**
 * Estado + promise do AdminActionModal.
 *
 * `runAction(req)` abre o modal e resolve quando o admin confirma/cancela.
 * Se não há motivo obrigatório nem alterações resumidas, executa o runner
 * direto (sem modal).
 */
export function useAdminActionModal() {
    const [request, setRequest] = useState<AdminActionRequest | null>(null)
    const resolveRef = useRef<((result: AdminActionResult) => void) | null>(null)

    const settle = useCallback((result: AdminActionResult) => {
        setRequest(null)
        const resolve = resolveRef.current
        resolveRef.current = null
        resolve?.(result)
    }, [])

    const runAction = useCallback(
        (req: AdminActionRequest): Promise<AdminActionResult> => {
            const needsModal =
                Boolean(req.requireReason) ||
                (req.changedFields?.length ?? 0) > 0 ||
                Boolean(req.force)
            if (!needsModal) {
                return Promise.resolve(
                    req.runner({ reason: "", riskScore: null, notifySeller: false }),
                ).catch((e) => ({ success: false, error: e?.message || "Erro na ação" }))
            }
            return new Promise((resolve) => {
                if (resolveRef.current) resolveRef.current({ success: false, cancelled: true })
                resolveRef.current = resolve
                setRequest(req)
            })
        },
        [],
    )

    const modal = request ? (
        <AdminActionModal
            isOpen
            onClose={() => settle({ success: false, cancelled: true })}
            title={request.title}
            description={request.description}
            changedFields={request.changedFields}
            requireReason={request.requireReason}
            confirmLabel={request.confirmLabel}
            notifyLabel={request.notifyLabel}
            onConfirm={async (payload) => {
                const result = await request.runner(payload).catch((e) => ({
                    success: false,
                    error: e?.message || "Erro na ação",
                }))
                settle(result)
            }}
        />
    ) : null

    return { modal, runAction }
}
