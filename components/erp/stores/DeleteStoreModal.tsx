"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  getStoreDeletionDryRunAction,
  cancelStoreRecurringSubscriptionsAction,
  requestStoreDeletionCodeAction,
  confirmStoreDeletionAction,
} from "@/app/actions/erp/stores"
import type { StorePreDeleteReport } from "@/lib/services/store-deletion.service"
import { getCSRFToken } from "@/lib/utils/fetch-with-csrf"
import { useNotification } from "@/hooks/use-notification"
import { DefaultModal, Button, FormTextarea, InfoCard, Input } from "@/components/reusable"
import type { StoreRow } from "./StoreGridCard"

interface DeleteStoreModalProps {
  isOpen: boolean
  store: StoreRow | null
  partnerId: string
  onClose: () => void
  onDeleted: (deletedStoreId: string, fallbackStoreId: string | null) => void | Promise<void>
}

export function DeleteStoreModal({
  isOpen,
  store,
  partnerId,
  onClose,
  onDeleted,
}: DeleteStoreModalProps) {
  const { success: notifySuccess, error: notifyError } = useNotification()

  const [step, setStep] = useState<"reason" | "verify_code">("reason")
  const [reason, setReason] = useState("")
  const [code, setCode] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [maskedEmail, setMaskedEmail] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [dryRunReport, setDryRunReport] = useState<StorePreDeleteReport | null>(null)
  const [loadingDryRun, setLoadingDryRun] = useState(false)
  const [cancellingSubscriptions, setCancellingSubscriptions] = useState(false)
  const [isRequestingCode, setIsRequestingCode] = useState(false)
  const [isConfirming, setIsConfirming] = useState(false)

  const cooldownRef = useRef<NodeJS.Timeout | null>(null)
  const activeRecurringSubscriptions = dryRunReport?.activeRecurringSubscriptionsCount ?? 0

  const clearCooldown = () => {
    if (cooldownRef.current) {
      clearInterval(cooldownRef.current)
      cooldownRef.current = null
    }
  }

  const startCooldown = (seconds: number) => {
    setCooldown(seconds)
    clearCooldown()
    cooldownRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearCooldown()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  useEffect(() => {
    return () => clearCooldown()
  }, [])

  // Reset state and load dry-run report whenever modal opens for a store
  useEffect(() => {
    if (!isOpen || !store) return

    let cancelled = false
    setStep("reason")
    setReason("")
    setCode("")
    setConfirmText("")
    setMaskedEmail("")
    setAttemptsRemaining(null)
    setErrorMsg(null)
    setDryRunReport(null)
    setLoadingDryRun(true)

    ;(async () => {
      try {
        const token = await getCSRFToken()
        const res = await getStoreDeletionDryRunAction(store.id, partnerId, token)
        if (cancelled) return
        if (res.success && res.report) {
          setDryRunReport(res.report)
        } else if (res.error) {
          setErrorMsg(res.error)
        }
      } catch {
        // Non-critical simulation failure
      } finally {
        if (!cancelled) setLoadingDryRun(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, store, partnerId])

  const handleClose = () => {
    if (isRequestingCode || isConfirming || cancellingSubscriptions) return
    clearCooldown()
    setCooldown(0)
    setErrorMsg(null)
    onClose()
  }

  const handleCancelStoreSubscriptions = async () => {
    if (!store) return
    setCancellingSubscriptions(true)
    setErrorMsg(null)
    try {
      const token = await getCSRFToken()
      const res = await cancelStoreRecurringSubscriptionsAction(store.id, partnerId, token)
      if (res.error || !res.success) {
        const msg = res.error || "Não foi possível cancelar as assinaturas recorrentes desta filial."
        setErrorMsg(msg)
        notifyError("Erro ao cancelar assinaturas", msg)
        return
      }

      setDryRunReport((prev) =>
        prev ? { ...prev, activeRecurringSubscriptionsCount: 0 } : prev,
      )
      notifySuccess(
        "Assinaturas canceladas",
        `${res.cancelled ?? 0} assinatura(s) cancelada(s).${(res.failed ?? 0) > 0 ? ` ${res.failed} falharam.` : ""}`,
      )
    } catch {
      setErrorMsg("Erro inesperado ao cancelar as assinaturas recorrentes.")
      notifyError("Erro", "Erro inesperado ao cancelar as assinaturas recorrentes.")
    } finally {
      setCancellingSubscriptions(false)
    }
  }

  const handleRequestCode = async () => {
    if (!store) return
    if (activeRecurringSubscriptions > 0) {
      setErrorMsg("Cancele todas as assinaturas recorrentes ativas desta filial antes de continuar.")
      return
    }

    setIsRequestingCode(true)
    setErrorMsg(null)
    try {
      const token = await getCSRFToken()
      const res = await requestStoreDeletionCodeAction({
        storeId: store.id,
        partnerId,
        reason: reason.trim() || null,
        csrf_token: token,
      })

      if (res.error) {
        setErrorMsg(res.error)
        notifyError("Erro ao solicitar código", res.error)
        if (res.cooldownSeconds) {
          startCooldown(res.cooldownSeconds)
        }
        return
      }

      if (res.success) {
        setMaskedEmail(res.maskedEmail || "seu e-mail")
        setStep("verify_code")
        setCode("")
        setConfirmText("")
        setAttemptsRemaining(null)
        if (res.cooldownSeconds) {
          startCooldown(res.cooldownSeconds)
        }
        notifySuccess("Código enviado", `Enviamos o código para ${res.maskedEmail || "seu e-mail"}.`)
      }
    } catch {
      setErrorMsg("Ocorreu um erro ao enviar o código de confirmação.")
      notifyError("Erro", "Ocorreu um erro ao enviar o código de confirmação.")
    } finally {
      setIsRequestingCode(false)
    }
  }

  const handleConfirmDeletion = async () => {
    if (!store) return
    if (code.trim().length !== 6) {
      setErrorMsg("Digite o código de 6 dígitos recebido por e-mail.")
      return
    }
    if (confirmText !== "EXCLUIR") {
      setErrorMsg("Digite EXCLUIR para confirmar.")
      return
    }

    setIsConfirming(true)
    setErrorMsg(null)
    try {
      const token = await getCSRFToken()
      const res = await confirmStoreDeletionAction({
        storeId: store.id,
        partnerId,
        code: code.trim(),
        reason: reason.trim() || null,
        csrf_token: token,
      })

      if (res.error) {
        setErrorMsg(res.error)
        if (res.remainingAttempts !== undefined) {
          setAttemptsRemaining(res.remainingAttempts)
        }
        notifyError("Erro na confirmação", res.error)
        return
      }

      if (res.success) {
        clearCooldown()
        notifySuccess(
          "Filial excluída",
          `A filial "${store.name}" e todos os seus dados foram excluídos permanentemente.`,
        )
        await onDeleted(store.id, res.fallbackStoreId ?? null)
      }
    } catch {
      setErrorMsg("Ocorreu um erro ao confirmar a exclusão da filial.")
      notifyError("Erro", "Ocorreu um erro ao confirmar a exclusão da filial.")
    } finally {
      setIsConfirming(false)
    }
  }

  const storeName = store?.name || "esta filial"

  return (
    <DefaultModal
      isOpen={isOpen && !!store}
      onClose={handleClose}
      title={step === "verify_code" ? "Confirmação por E-mail" : `Excluir Filial`}
      footer={
        step === "verify_code" ? (
          <>
            <Button
              variant="outline"
              onClick={() => {
                setStep("reason")
                setErrorMsg(null)
              }}
              disabled={isConfirming}
              className="flex-1 h-12"
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDeletion}
              disabled={isConfirming || code.length !== 6 || confirmText !== "EXCLUIR"}
              className="flex-1 h-12 bg-red-600 hover:bg-red-700 font-bold"
            >
              {isConfirming ? "Excluindo filial..." : "Excluir filial definitivamente"}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={isRequestingCode || cancellingSubscriptions}
              className="flex-1 h-12"
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleRequestCode}
              disabled={
                isRequestingCode ||
                loadingDryRun ||
                cancellingSubscriptions ||
                activeRecurringSubscriptions > 0
              }
              className="flex-1 h-12 bg-red-600 hover:bg-red-700 font-bold"
            >
              {isRequestingCode ? "Enviando código..." : "Enviar código de confirmação"}
            </Button>
          </>
        )
      }
    >
      {step === "reason" && (
        <div className="space-y-6 pt-2 pb-4 max-h-[65vh] overflow-y-auto pr-2 custom-scrollbar">
          <InfoCard
            title={`Ação permanente — ${storeName}`}
            message="Ao solicitar a exclusão desta filial, enviaremos um código de 6 dígitos para seu e-mail cadastrado. Todos os dados vinculados a esta filial no ERP e no Marketplace serão excluídos permanentemente. Sua conta e demais lojas não serão afetadas."
            color="red"
          />

          {activeRecurringSubscriptions > 0 && (
            <InfoCard
              title={`${activeRecurringSubscriptions} assinatura(s) recorrente(s) ativa(s) nesta filial`}
              message="Esta filial possui assinaturas recorrentes ativas. Cancele todas antes de excluir para evitar novas cobranças aos clientes."
              color="orange"
              bottomElement={
                <Button
                  variant="link"
                  onClick={handleCancelStoreSubscriptions}
                  isLoading={cancellingSubscriptions}
                  disabled={cancellingSubscriptions || isRequestingCode}
                >
                  Cancelar assinaturas ativas desta filial
                </Button>
              }
            />
          )}

          {errorMsg && (
            <div className="p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl text-xs font-semibold text-red-700 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          <div className="space-y-2">
            <FormTextarea
              label="Por que você está excluindo esta filial? (opcional)"
              placeholder="Ex.: encerramento da unidade, consolidação de estoque, reorganização..."
              value={reason}
              onChange={(e: any) => setReason(e.target.value)}
              maxLength={500}
              showCharacterCount
              name="motivo_exclusao_filial"
              className="min-h-[100px]"
            />
          </div>

          {/* O QUE SERÁ EXCLUÍDO */}
          {loadingDryRun ? (
            <div className="space-y-2 pt-2">
              <div className="h-4 w-56 rounded bg-brand-gray/50 dark:bg-dark-border animate-pulse" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="h-10 rounded-lg bg-brand-gray/40 dark:bg-dark-border animate-pulse" />
                <div className="h-10 rounded-lg bg-brand-gray/40 dark:bg-dark-border animate-pulse" />
              </div>
            </div>
          ) : dryRunReport ? (
            <div className="space-y-3 pt-2">
              <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
                Ao excluir a filial <strong className="text-brand-dark dark:text-dark-heading">{storeName}</strong>, serão removidos permanentemente:
              </h4>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-brand-dark/80 dark:text-dark-body">
                {(dryRunReport.productsCount > 0 || dryRunReport.servicesCount > 0) && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Produtos e serviços</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.productsCount} produto(s), {dryRunReport.servicesCount} serviço(s))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.ordersCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Pedidos e vendas</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.ordersCount} pedido(s))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.customersCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Clientes da filial</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.customersCount} registro(s))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.suppliersCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Fornecedores</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.suppliersCount} registro(s))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.appointmentsCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Agenda</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.appointmentsCount} compromisso(s))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.serviceOrdersCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Ordens de serviço</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.serviceOrdersCount} ordem(ns))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.quotesCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Orçamentos</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.quotesCount} orçamento(s))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.transactionsCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Financeiro</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.transactionsCount} lançamento(s))
                      </span>
                    </div>
                  </li>
                )}
                {(dryRunReport.couponsCount > 0 || dryRunReport.promotionsCount > 0) && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">Cupons e promoções</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.couponsCount + dryRunReport.promotionsCount} item(ns))
                      </span>
                    </div>
                  </li>
                )}
                {dryRunReport.whatsappCount > 0 && (
                  <li className="flex items-start gap-2">
                    <span className="text-brand-red mt-0.5">•</span>
                    <div>
                      <strong className="text-brand-dark dark:text-dark-heading">WhatsApp da filial</strong>
                      <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                        ({dryRunReport.whatsappCount} conexão(ões) ativa(s))
                      </span>
                    </div>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span className="text-brand-red mt-0.5">•</span>
                  <div>
                    <strong className="text-brand-dark dark:text-dark-heading">Vitrine no Marketplace</strong>
                    <span className="block text-xs text-brand-inactive-text dark:text-dark-body">
                      (perfil da loja, anúncios, avaliações e acessos da equipe)
                    </span>
                  </div>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      )}

      {step === "verify_code" && (
        <div className="space-y-4">
          <InfoCard
            title="Código enviado por e-mail"
            message={`Enviamos um código numérico de 6 dígitos para ${maskedEmail} para confirmar a exclusão da filial "${storeName}". O código expira em 15 minutos.`}
            color="green"
          />

          {errorMsg && (
            <InfoCard
              title="Erro na confirmação"
              message={`${errorMsg}${attemptsRemaining !== null && attemptsRemaining > 0 ? ` Tentativas restantes: ${attemptsRemaining}.` : ""}`}
              color="red"
            />
          )}

          <div className="space-y-2">
            <Input
              label="Código de Confirmação (6 dígitos)"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              required
            />
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-brand-inactive-text dark:text-dark-body">
                Não recebeu o e-mail?
              </span>
              {cooldown > 0 ? (
                <span className="text-brand-inactive-text dark:text-dark-body font-medium">
                  Reenviar em {cooldown}s
                </span>
              ) : (
                <Button
                  variant="link"
                  onClick={handleRequestCode}
                  disabled={isRequestingCode}
                  className="text-xs"
                >
                  {isRequestingCode ? "Reenviando..." : "Reenviar novo código"}
                </Button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-brand-border dark:border-dark-border space-y-2">
            <Input
              label="Digite EXCLUIR para confirmar"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="EXCLUIR"
            />
          </div>
        </div>
      )}
    </DefaultModal>
  )
}
