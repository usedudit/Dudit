"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Button,
  Spinner,
  Badge,
  InfoCard,
} from "@/components/reusable"
import {
  ChevronLeftIcon,
  CheckCircleIcon,
  XIcon,
  MoneyIcon,
  QRCodeIcon,
  CreditCardIcon,
  FileIcon,
} from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { generateStaticPix } from "@/lib/utils/pix-generator"
import QRCode from "qrcode"
import { useToast } from "@/components/ui/use-toast"
import { useModalLayer } from "@/lib/modal-stack"

import type { PartnerPaymentMethod } from "@/components/erp/payments/shared/payment-utils"

type DriverPartnerPaymentMethod = PartnerPaymentMethod & {
  pix_key?: string | null
  pix_key_type?: string | null
  card_brand?: string | null
  store_id?: string | null
}
import {
  normalizeMethodType,
  normalizePaymentMethodLabel,
} from "@/components/erp/payments/shared/payment-utils"
import { PixQrDisplayModal } from "@/components/erp/payments/shared/PixQrDisplayModal"
import { CardPaymentView } from "@/components/erp/payments/shared/CardPaymentView"
import { MoneyPaymentView } from "@/components/erp/payments/shared/MoneyPaymentView"

import {
  getDriverPaymentMethodsAction,
  driverConfirmPaymentAction,
} from "@/app/actions/delivery-drivers"

const UNDEFINED_PAYMENT_PLACEHOLDERS = [
  "método não definido",
  "metodo nao definido",
  "não informado",
  "nao definido",
  "",
]

const isPlaceholderMethod = (value?: string | null): boolean => {
  const norm = String(value || "").trim().toLowerCase()
  return UNDEFINED_PAYMENT_PLACEHOLDERS.some((p) => norm === p || norm.includes(p))
}

const PAYMENT_METHOD_ICONS: Record<string, React.ReactElement<any> | null> = {
  cash: <MoneyIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
  pix: <QRCodeIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
  credit_card: <CreditCardIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
  debit_card: <CreditCardIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
  bank_transfer: <FileIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
}

const standardTransition = { type: "spring" as const, stiffness: 380, damping: 30 }

interface DriverPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  assignmentId: string
  order: {
    id: string
    order_number?: string
    total_amount?: number
    paid_amount?: number
    payment_method?: string
    situation?: string
    payment_breakdown?: any[]
    order_items?: any[]
    customer_name?: string
    created_at?: string
  }
  onSuccess?: () => void
}

export default function DriverPaymentModal({
  isOpen,
  onClose,
  assignmentId,
  order,
  onSuccess,
}: DriverPaymentModalProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<"loading" | "methods" | "payment" | "confirm" | "success">("loading")
  const [isAnimating, setIsAnimating] = useState(false)

  const [methods, setMethods] = useState<DriverPartnerPaymentMethod[]>([])
  const [isLoadingMethods, setIsLoadingMethods] = useState(true)
  const [storeName, setStoreName] = useState("Loja")

  const [selectedMethod, setSelectedMethod] = useState<DriverPartnerPaymentMethod | null>(null)
  const [amount, setAmount] = useState(0)
  const [installments, setInstallments] = useState("1")
  const [pixQrData, setPixQrData] = useState<{ payload: string; qrDataUrl: string } | null>(null)
  const [generatingPix, setGeneratingPix] = useState(false)

  const [isSubmitting, setIsSubmitting] = useState(false)

  // z-index dinâmico: este modal abre acima de tudo que já estava aberto.
  const zIndex = useModalLayer(isOpen)

  const orderTotal = useMemo(() => Number(order?.total_amount || 0), [order])
  const orderPaid = useMemo(() => Number(order?.paid_amount || 0), [order])
  const remainingBalance = useMemo(() => Math.max(0, orderTotal - orderPaid), [orderTotal, orderPaid])

  const isFullyPaid = useMemo(() => {
    return order?.situation === "paid" || remainingBalance <= 0.009
  }, [order, remainingBalance])

  const lockedMethod = useMemo(() => {
    if (isFullyPaid) return null
    const method = order?.payment_method
    if (method && !isPlaceholderMethod(method)) return method
    const breakdown = Array.isArray(order?.payment_breakdown) ? order.payment_breakdown : []
    const paidLeg = breakdown.find(
      (leg: any) => leg && !isPlaceholderMethod(leg.method)
    )
    if (paidLeg?.method) return paidLeg.method
    return null
  }, [order, isFullyPaid])

  const availableMethodTypes = useMemo(() => {
    const types = new Set(
      methods
        .filter((m) => m.is_active !== false)
        .map((m) => normalizeMethodType(m.type))
    )
    types.add("cash")
    return types
  }, [methods])

  const activeMethods = useMemo(
    () => methods.filter((m) => m.is_active !== false),
    [methods],
  )

  useEffect(() => {
    if (!isOpen) return
    const controller = new AbortController()
    setStep("loading")
    setIsLoadingMethods(true)

    getDriverPaymentMethodsAction(assignmentId)
      .then((res) => {
        if (controller.signal.aborted) return
        if (res.success) {
          setMethods(res.methods || [])
          setStoreName(res.storeName || "Loja")
          setAmount(remainingBalance)
          setInstallments("1")
          setStep("methods")
        } else {
          toast({
            title: "Erro",
            description: res.error || "Não foi possível carregar métodos de pagamento.",
            variant: "destructive",
          })
          setStep("methods")
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        toast({
          title: "Erro",
          description: err?.message || "Erro ao carregar métodos de pagamento.",
          variant: "destructive",
        })
        setStep("methods")
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingMethods(false)
      })

    return () => controller.abort()
  }, [isOpen, assignmentId, remainingBalance, toast])

  useEffect(() => {
    if (isOpen) {
      const id = setTimeout(() => setIsAnimating(true), 50)
      return () => clearTimeout(id)
    } else {
      setIsAnimating(false)
    }
  }, [isOpen])

  const handleSelectMethod = (method: DriverPartnerPaymentMethod) => {
    setSelectedMethod(method)
    setAmount(remainingBalance)
    setInstallments("1")
    setPixQrData(null)
    setStep("payment")
  }

  const handleMethodTypeSelect = (type: string) => {
    const methodType = normalizeMethodType(type)
    const matches = activeMethods.filter((m) => normalizeMethodType(m.type) === methodType)
    if (matches.length > 0) {
      handleSelectMethod(matches[0])
    } else {
      const dummy: PartnerPaymentMethod = {
        id: "",
        name:
          methodType === "cash" ? "Dinheiro" :
          methodType === "pix" ? "Pix" :
          methodType === "credit_card" ? "Cartão de Crédito" :
          methodType === "debit_card" ? "Cartão de Débito" :
          methodType === "bank_transfer" ? "Transferência" : "Outros",
        type: methodType,
        is_active: true,
        max_installments: 1,
      }
      handleSelectMethod(dummy)
    }
  }

  const handleGeneratePix = useCallback(async () => {
    if (!selectedMethod) return
    setGeneratingPix(true)
    try {
      const payload = generateStaticPix(
        selectedMethod.pix_key || "",
        amount,
        storeName || "Loja",
        "",
        "DUDIT",
        selectedMethod.pix_key_type,
      )
      const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 })
      setPixQrData({ payload, qrDataUrl })
    } catch (err) {
      console.error("Error generating Pix:", err)
      toast({
        title: "Erro",
        description: "Não foi possível gerar o QR Code Pix.",
        variant: "destructive",
      })
    } finally {
      setGeneratingPix(false)
    }
  }, [selectedMethod, amount, storeName, toast])

  useEffect(() => {
    if (step === "payment" && selectedMethod) {
      const methodType = normalizeMethodType(selectedMethod.type)
      if (methodType === "pix" && !pixQrData && !generatingPix) {
        if (selectedMethod.pix_key) {
          void handleGeneratePix()
        }
      }
    }
  }, [step, selectedMethod, pixQrData, generatingPix, handleGeneratePix])

  const handleConfirm = useCallback(async () => {
    if (!selectedMethod) return
    if (amount <= 0.009) {
      toast({ title: "Aviso", description: "Informe o valor recebido.", variant: "warning" })
      return
    }
    if (amount > orderTotal + 0.01) {
      toast({
        title: "Aviso",
        description: `O valor não pode passar de R$${orderTotal.toFixed(2)} (total do pedido).`,
        variant: "warning",
      })
      return
    }

    const methodType = normalizeMethodType(selectedMethod.type)
    const isCash = methodType === "cash"
    const isCardCredit = methodType === "credit_card"

    const methodLabel = normalizePaymentMethodLabel(selectedMethod.name) ||
      (isCash ? "Dinheiro" : methodType === "pix" ? "Pix" : methodType === "credit_card" ? "Cartão de Crédito" : methodType === "debit_card" ? "Cartão de Débito" : methodType === "bank_transfer" ? "Transferência" : "Outros")

    setIsSubmitting(true)
    setStep("confirm")

    try {
      const res = await driverConfirmPaymentAction({
        assignmentId,
        paymentMethod: methodLabel,
        paymentMethodId: selectedMethod.id || null,
        amountReceived: isCash ? Math.max(amount, orderTotal) : amount,
        installments: isCardCredit ? Number(installments) : 1,
      })

      if (res.success) {
        toast({ title: "Sucesso", description: "Pagamento confirmado com sucesso!" })
        setStep("success")
        onSuccess?.()
      } else {
        toast({
          title: "Erro",
          description: res.error || "Falha ao registrar recebimento.",
          variant: "destructive",
        })
        setStep("payment")
      }
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err?.message || "Ocorreu um erro ao confirmar.",
        variant: "destructive",
      })
      setStep("payment")
    } finally {
      setIsSubmitting(false)
    }
  }, [selectedMethod, amount, installments, orderTotal, assignmentId, onSuccess, toast])

  const handleSafeClose = () => {
    setIsAnimating(false)
    setTimeout(() => {
      onClose()
      setStep("methods")
    }, 200)
  }

  const methodTypeLabel = selectedMethod ? normalizePaymentMethodLabel(selectedMethod.name) : ""
  const showReceipt = order?.order_items && order.order_items.length > 0

  const receiptCart = useMemo(() => {
    const items = order?.order_items || []
    return items.map((item: any) => ({
      name: item.products?.name || item.product_name || item.name || "Item",
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.product_price || item.unit_price || item.unitPrice || 0),
    })) as Array<{ name: string; quantity: number; unitPrice: number }>
  }, [order])

  if (!isOpen) return null

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ zIndex }}
        onClick={handleSafeClose}
      />

      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-200 ease-out ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ zIndex }}
      >
        <div className={`
          relative bg-white dark:bg-dark-surface w-full h-full
          md:h-[85vh] md:max-w-[1100px] md:rounded-3xl
          flex flex-col md:flex-row overflow-hidden z-10
          ${isAnimating ? "scale-100 opacity-100" : "scale-95 opacity-0"}
        `}>
          {/* === LEFT: RECEIPT (Desktop) === */}
          {showReceipt && step !== "success" && (
            <div className="hidden md:flex w-[40%] bg-brand-gray dark:bg-dark-border/50 p-8 flex-col relative z-20 overflow-y-auto">
              <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-6">Resumo</h2>
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-brand-inactive-text dark:text-dark-body">Pedido</span>
                  <span className="font-medium text-brand-dark dark:text-dark-heading">#{order?.order_number || "N/A"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-brand-inactive-text dark:text-dark-body">Cliente</span>
                  <span className="font-medium text-brand-dark dark:text-dark-heading truncate max-w-[200px]">
                    {order?.customer_name || "Cliente"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-brand-inactive-text dark:text-dark-body">Data</span>
                  <span className="font-medium text-brand-dark dark:text-dark-heading">
                    {order?.created_at ? new Date(order.created_at).toLocaleDateString("pt-BR") : "-"}
                  </span>
                </div>
              </div>

              <div className="border-t border-brand-border dark:border-dark-border w-full mb-6" />

              <div className="space-y-4">
                {receiptCart.map((item, i) => (
                  <div key={i} className="flex justify-between text-sm">
                    <span className="text-brand-inactive-text dark:text-dark-body">
                      {item.quantity}x {item.name}
                    </span>
                    <span className="font-medium text-brand-dark dark:text-dark-heading">
                      {formatCurrency(item.quantity * item.unitPrice)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-brand-border dark:border-dark-border w-full mt-6 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-brand-inactive-text dark:text-dark-body">Total do Pedido</span>
                  <span className="font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(orderTotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-brand-inactive-text dark:text-dark-body">Recebido</span>
                  <span className="font-bold text-brand-green">{formatCurrency(orderPaid)}</span>
                </div>
              </div>
            </div>
          )}

          {/* === RIGHT: ACTIONS === */}
          <div className="w-full md:w-[60%] bg-white dark:bg-dark-surface flex flex-col relative h-full">
            {/* Header */}
            <div className="px-6 py-6 md:px-10 md:pt-10 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 overflow-hidden">
                {step === "payment" && (
                  <button
                    onClick={() => { setStep("methods"); setSelectedMethod(null) }}
                    className="w-10 h-10 rounded-full bg-gray-100 dark:bg-dark-border/50 flex items-center justify-center text-brand-dark dark:text-dark-heading hover:bg-gray-200 dark:hover:bg-dark-border transition-colors shrink-0"
                  >
                    <ChevronLeftIcon size={20} />
                  </button>
                )}
                <h2 className="text-2xl font-bold text-brand-dark dark:text-dark-heading truncate">
                  {step === "success"
                    ? "Recebimento Confirmado"
                    : selectedMethod
                      ? normalizePaymentMethodLabel(selectedMethod.name) || selectedMethod.name
                      : "Processar Pagamento"}
                </h2>
              </div>
              <button onClick={handleSafeClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading hover:bg-gray-200 transition-colors">
                <XIcon size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 md:px-10 pb-32 md:pb-10 relative custom-scrollbar">
              <AnimatePresence mode="wait">
                {/* LOADING */}
                {step === "loading" && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={standardTransition}
                    className="flex flex-col items-center justify-center h-full gap-4"
                  >
                    <Spinner size={32} />
                    <p className="text-brand-inactive-text dark:text-dark-body">Carregando métodos de pagamento...</p>
                  </motion.div>
                )}

                {/* SUCCESS */}
                {step === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }} transition={standardTransition}
                    className="flex flex-col items-center justify-center h-full text-center gap-6"
                  >
                    <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                      <CheckCircleIcon size={40} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold text-brand-dark dark:text-dark-heading mb-2">
                        Recebimento confirmado!
                      </h3>
                      <p className="text-brand-inactive-text dark:text-dark-body">
                        {methodTypeLabel ? `${methodTypeLabel}` : "Pagamento"} registrado com sucesso.
                      </p>
                    </div>
                    {amount > 0 && amount < orderTotal - 0.01 && (
                      <InfoCard
                        color="orange"
                        message={`Ainda faltam ${formatCurrency(Math.max(0, orderTotal - amount))} para pagamento total.`}
                      />
                    )}
                  </motion.div>
                )}

                {/* METHODS SELECTOR */}
                {step === "methods" && !lockedMethod && (
                  <motion.div
                    key="methods"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={standardTransition}
                    className="flex flex-col gap-6"
                  >
                    {isFullyPaid && (
                      <InfoCard color="green" message="Este pedido já está pago." />
                    )}

                    {!isFullyPaid && (
                      <>
                        <div className="space-y-2">
                          <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                            Selecione o método de pagamento
                          </h3>
                          <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                            Valor a receber: <strong className="text-brand-dark dark:text-dark-heading">{formatCurrency(remainingBalance)}</strong>
                          </p>
                        </div>

                        {isLoadingMethods ? (
                          <div className="grid grid-cols-2 gap-4">
                            {[1, 2, 3, 4].map((i) => (
                              <div key={i} className="h-28 rounded-2xl border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-border/10 animate-pulse flex items-center justify-center">
                                <Spinner size={16} />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-4">
                            {availableMethodTypes.has("cash") && (
                              <MethodCard icon="cash" label="Dinheiro" onClick={() => handleMethodTypeSelect("cash")} />
                            )}
                            {availableMethodTypes.has("pix") && (
                              <MethodCard icon="pix" label="Pix" onClick={() => handleMethodTypeSelect("pix")} />
                            )}
                            {availableMethodTypes.has("credit_card") && (
                              <MethodCard icon="credit_card" label="Cartão de Crédito" onClick={() => handleMethodTypeSelect("credit_card")} />
                            )}
                            {availableMethodTypes.has("debit_card") && (
                              <MethodCard icon="debit_card" label="Cartão de Débito" onClick={() => handleMethodTypeSelect("debit_card")} />
                            )}
                            {availableMethodTypes.has("bank_transfer") && (
                              <MethodCard icon="bank_transfer" label="Transferência" onClick={() => handleMethodTypeSelect("bank_transfer")} />
                            )}
                            {availableMethodTypes.has("other") && (
                              <MethodCard icon="other" label="Outros" onClick={() => handleMethodTypeSelect("other")} />
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </motion.div>
                )}

                {/* LOCKED METHOD (auto-enter payment view) */}
                {step === "methods" && lockedMethod && (
                  <motion.div
                    key="locked"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={standardTransition}
                    className="flex flex-col gap-6"
                  >
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-brand-border dark:border-dark-border bg-gray-50 dark:bg-dark-border/20">
                      <span className="text-sm text-brand-inactive-text dark:text-dark-body">Método definido:</span>
                      <Badge variant="blue">{lockedMethod}</Badge>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full h-14"
                      onClick={() => {
                        const matches = activeMethods.filter(
                          (m) =>
                            normalizePaymentMethodLabel(m.name) === normalizePaymentMethodLabel(lockedMethod) ||
                            normalizeMethodType(m.type) === normalizeMethodType(lockedMethod)
                        )
                        if (matches.length > 0) {
                          handleSelectMethod(matches[0])
                        } else {
                          const methodType = normalizeMethodType(lockedMethod)
                          const dummy: DriverPartnerPaymentMethod = {
                            id: "",
                            name: normalizePaymentMethodLabel(lockedMethod) || lockedMethod,
                            type: methodType,
                            is_active: true,
                            max_installments: 1,
                          }
                          handleSelectMethod(dummy)
                        }
                      }}
                    >
                      Confirmar como {lockedMethod}
                    </Button>

                    <Button
                      variant="ghost"
                      className="w-full h-12"
                      onClick={() => setStep("methods")}
                      disabled={!lockedMethod}
                    >
                      Escolher outro método
                    </Button>
                  </motion.div>
                )}

                {/* PAYMENT VIEW */}
                {step === "payment" && selectedMethod && (
                  <motion.div
                    key="payment"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    transition={standardTransition}
                    className="flex flex-col gap-6"
                  >
                    {renderPaymentView()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Bottom Action Bar */}
            {step === "payment" && selectedMethod && !isSubmitting && (
              <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex gap-3">
                <Button variant="outline" className="flex-1 h-[52px]" onClick={() => setStep("methods")}>
                  Voltar
                </Button>
                <Button className="flex-1 h-[52px]" onClick={handleConfirm}>
                  Confirmar Recebimento
                </Button>
              </div>
            )}

            {step === "confirm" && (
              <div className="w-full bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border p-4 md:p-6 mt-auto shrink-0 relative z-30 flex gap-3">
                <Button variant="outline" className="flex-1 h-[52px]" disabled>
                  Processando...
                </Button>
                <Button className="flex-1 h-[52px]" disabled>
                  <Spinner size={16} className="mr-2" />
                  Aguarde...
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pix QR Modal */}
      {pixQrData && selectedMethod && (
        <PixQrDisplayModal
          isOpen={!!pixQrData}
          onClose={() => setPixQrData(null)}
          qrCode={pixQrData.qrDataUrl}
          payload={pixQrData.payload}
          amount={amount}
          subtitle={`Pix - ${order?.order_number ? `#${order.order_number}` : ""}`}
          onConfirmPayment={handleConfirm}
          isConfirming={isSubmitting}
        />
      )}
    </>
  )

  function renderPaymentView() {
    if (!selectedMethod) return null
    const methodType = normalizeMethodType(selectedMethod.type)
    const label = normalizePaymentMethodLabel(selectedMethod.name) || selectedMethod.name
    const total = remainingBalance
    const isCash = methodType === "cash"

    if (methodType === "pix") {
      return (
        <div className="flex flex-col items-center justify-center gap-6 pt-4">
          <div className="text-center">
            <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-2">Valor a receber</p>
            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</div>
          </div>
          {pixQrData ? (
            <div className="flex flex-col items-center gap-4">
              <p className="text-sm text-brand-inactive-text dark:text-dark-body">Mostre este QR Code ao cliente</p>
              <img src={pixQrData.qrDataUrl} alt="QR Code Pix" className="w-48 h-48" />
              <Button onClick={handleConfirm} disabled={isSubmitting} isLoading={isSubmitting}>
                Confirmar Recebimento via Pix
              </Button>
            </div>
          ) : generatingPix ? (
            <div className="flex items-center gap-2 text-brand-inactive-text">
              <Spinner size={16} />
              <span>Gerando QR Code Pix...</span>
            </div>
          ) : !selectedMethod.pix_key ? (
            <InfoCard color="orange" message="Este método Pix não possui chave configurada pelo parceiro." />
          ) : (
            <Button onClick={handleGeneratePix} disabled={generatingPix} isLoading={generatingPix}>
              Gerar QR Code Pix
            </Button>
          )}
        </div>
      )
    }

    if (methodType === "cash") {
      return (
        <div className="flex flex-col gap-6">
          <MoneyPaymentView
            amount={amount}
            onAmountChange={(v) => setAmount(Math.max(0, v))}
            baseAllocated={amount}
            flatAmount
            totalPaid={amount}
            totalNeed={total}
            showNumpad={false}
          />
        </div>
      )
    }

    if (methodType === "credit_card") {
      const maxInst = selectedMethod.max_installments || 1
      const installmentsOptions = Array.from({ length: Math.max(1, maxInst) }, (_, i) => i + 1)
      return (
        <div className="flex flex-col gap-6">
          <CardPaymentView
            amount={total}
            onAmountChange={setAmount}
            baseAllocated={total}
            flatAmount
            installments={installments}
            onInstallmentsChange={setInstallments}
            maxInstallments={maxInst}
            readOnlyInstallments={false}
            totalPaid={total}
            totalNeed={total}
          />
          {installmentsOptions.length > 1 && (
            <div className="text-center text-sm text-brand-inactive-text dark:text-dark-body">
              {formatCurrency(total / Number(installments))} x {installments} parcelas
            </div>
          )}
        </div>
      )
    }

    if (methodType === "debit_card" || methodType === "bank_transfer" || methodType === "other") {
      return (
        <div className="flex flex-col items-center justify-center gap-6 pt-8">
          <div className="text-center">
            <p className="text-sm text-brand-inactive-text dark:text-dark-body mb-2">Valor a receber</p>
            <div className="text-3xl font-bold text-brand-dark dark:text-dark-heading">{formatCurrency(total)}</div>
            <div className="mt-2 text-sm text-brand-inactive-text dark:text-dark-body">
              Método: <Badge variant="blue">{label}</Badge>
            </div>
          </div>
          <Button onClick={handleConfirm} disabled={isSubmitting} isLoading={isSubmitting}>
            Confirmar Recebimento
          </Button>
        </div>
      )
    }

    return (
      <InfoCard color="orange" message={`Método "${label}" não suportado para confirmação de recebimento.`} />
    )
  }
}

function MethodCard({
  icon,
  label,
  onClick,
}: {
  icon: string
  label: string
  onClick: () => void
}) {
  const iconMap: Record<string, React.ReactElement> = {
    cash: <MoneyIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
    pix: <QRCodeIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
    credit_card: <CreditCardIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
    debit_card: <CreditCardIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
    bank_transfer: <FileIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
    other: <MoneyIcon size={24} className="text-brand-dark dark:text-dark-heading" />,
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-3 h-28 rounded-2xl border-2 border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface hover:bg-gray-50 dark:hover:bg-dark-border/20 transition-colors"
    >
      {iconMap[icon]}
      <span className="font-bold text-sm text-brand-dark dark:text-dark-heading">{label}</span>
    </button>
  )
}
