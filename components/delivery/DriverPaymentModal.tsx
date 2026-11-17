"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Button,
  Spinner,
  Badge,
  InfoCard,
  Input,
  Barcode,
  IconPlaceholder,
} from "@/components/reusable"
import {
  CheckCircleIcon,
  XIcon,
  MoneyIcon,
  QRCodeIcon,
  CreditCardIcon,
  CopyIcon,
  PrinterIcon,
} from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { generateStaticPix } from "@/lib/utils/pix-generator"
import QRCode from "qrcode"
import { useToast } from "@/components/ui/use-toast"
import { useModalLayer } from "@/lib/modal-stack"
import { ReceiptScallopEdge } from "@/components/erp/POSComponents"
import { UserProfileImage } from "@/lib/utils/UserProfileImage"
import SaleReceiptPrintModal from "@/components/erp/orders/receipt/SaleReceiptPrintModal"
import {
  getDriverPaymentMethodsAction,
  driverConfirmPaymentAction,
} from "@/app/actions/delivery-drivers"

const standardTransition = { type: "spring" as const, stiffness: 380, damping: 30 }

interface DriverPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  assignmentId?: string
  order: any
  partnerId?: string
  onSuccess?: () => void
}

const TransactionReceiptContent = ({
  cart,
  totalOrder,
  totalPaid,
  totalRemaining,
  orderNumber,
  customerName,
}: {
  cart: Array<{ name: string; quantity: number; unitPrice: number }>
  totalOrder: number
  totalPaid: number
  totalRemaining: number
  orderNumber?: string
  customerName?: string
}) => (
  <div className="bg-brand-gray dark:bg-dark-border/50 rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none p-6 pb-12 flex flex-col relative h-full border border-brand-border dark:border-dark-border border-b-0 md:border-b md:border-r-0">
    <div className="mb-6 flex justify-between items-center">
      <h3 className="text-md font-bold text-brand-dark dark:text-dark-heading">
        Detalhes do Pedido
      </h3>
      {orderNumber && (
        <span className="text-xs font-bold text-brand-inactive-text dark:text-dark-body">
          {orderNumber}
        </span>
      )}
    </div>

    {customerName && (
      <div className="mb-4 flex items-center gap-2">
        <UserProfileImage fullName={customerName} className="w-6 h-6 text-xs" />
        <span className="text-sm font-semibold text-brand-dark dark:text-dark-heading truncate">
          {customerName}
        </span>
      </div>
    )}

    <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 mb-4 space-y-4 max-h-[220px] md:max-h-[300px]">
      {cart.map((item, idx) => (
        <div key={idx} className="flex flex-col w-full">
          <div className="flex justify-between items-start mb-1 w-full">
            <span className="font-medium text-brand-dark dark:text-dark-heading text-[13px] leading-snug max-w-[80%]">
              {item.name}
            </span>
            <span className="font-bold text-brand-dark dark:text-dark-heading text-xs whitespace-nowrap ml-2">
              {item.quantity}x
            </span>
          </div>
          <span className="text-[13px] font-bold text-brand-dark dark:text-dark-heading">
            {formatCurrency(item.unitPrice * item.quantity)}
          </span>
        </div>
      ))}
      {cart.length === 0 && (
        <div className="py-4 text-center text-xs text-brand-inactive-text">
          Valor do pedido: {formatCurrency(totalOrder)}
        </div>
      )}
    </div>

    <div className="mt-auto pt-4 border-t border-dashed border-brand-border dark:border-dark-border">
      <div className="space-y-2 mb-6">
        <div className="flex justify-between items-center text-sm">
          <span className="text-brand-inactive-text dark:text-dark-body font-medium">
            Total
          </span>
          <span className="font-bold text-brand-dark dark:text-dark-heading">
            {formatCurrency(totalOrder)}
          </span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-brand-inactive-text dark:text-dark-body font-medium">
            Recebido
          </span>
          <span className="font-bold text-brand-green">
            {formatCurrency(totalPaid)}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <span className="font-bold text-base text-brand-dark dark:text-dark-heading">
          Restante
        </span>
        <span className="font-black text-2xl text-brand-orange tracking-tight">
          {formatCurrency(totalRemaining)}
        </span>
      </div>
    </div>

    <ReceiptScallopEdge />
  </div>
)

export default function DriverPaymentModal({
  isOpen,
  onClose,
  assignmentId,
  order: initialOrder,
  onSuccess,
}: DriverPaymentModalProps) {
  const { toast } = useToast()
  const zIndex = useModalLayer(isOpen) ?? 50

  const [isAnimating, setIsAnimating] = useState(false)
  const [step, setStep] = useState<"loading" | "main" | "processing" | "success" | "error">("loading")
  const [errorMessage, setErrorMessage] = useState("")

  const [currentOrder, setCurrentOrder] = useState<any>(initialOrder)
  const [storeName, setStoreName] = useState("Loja")
  const [storePixKey, setStorePixKey] = useState<string | null>(null)
  const [storePixKeyType, setStorePixKeyType] = useState<string | null>(null)
  const [methods, setMethods] = useState<any[]>([])

  // Mercado Pago
  const [mpLoading, setMpLoading] = useState(false)
  const [mpPaymentData, setMpPaymentData] = useState<{
    pixData?: { qrCode: string; qrCodeBase64: string } | null
    boletoData?: { barcode: string; ticketUrl: string } | null
    chargeAmount?: number
  } | null>(null)
  const [syncingMp, setSyncingMp] = useState(false)

  // Local Pix (chave da loja)
  const [localPixQrData, setLocalPixQrData] = useState<{ payload: string; qrDataUrl: string } | null>(null)
  const [generatingLocalPix, setGeneratingLocalPix] = useState(false)

  const [copiedPix, setCopiedPix] = useState(false)
  const [printOrderId, setPrintOrderId] = useState<string | null>(null)
  const [fallbackMethod, setFallbackMethod] = useState<string>("Dinheiro")
  const [selectedPaymentCategory, setSelectedPaymentCategory] = useState<"auto" | "pix" | "dinheiro" | "cartao">("auto")

  useEffect(() => {
    if (isOpen) {
      setCurrentOrder(initialOrder)
      setStep("loading")
      setErrorMessage("")
      setMpPaymentData(null)
      setLocalPixQrData(null)
      setCopiedPix(false)
      setPrintOrderId(null)
      setSelectedPaymentCategory("auto")
      const id = setTimeout(() => setIsAnimating(true), 50)
      return () => clearTimeout(id)
    } else {
      setIsAnimating(false)
    }
  }, [isOpen, initialOrder])

  // Hydrate order and store payment info
  useEffect(() => {
    if (!isOpen) return
    let active = true
    const targetOrderId = initialOrder?.id || initialOrder?.order_id || null
    const targetAssignmentId = assignmentId || initialOrder?.delivery_id || ""

    getDriverPaymentMethodsAction(targetAssignmentId, targetOrderId)
      .then((res) => {
        if (!active) return
        if (res.success) {
          if (res.order) {
            setCurrentOrder((prev: any) => ({ ...(prev || {}), ...res.order }))
          }
          if (res.storeName) setStoreName(res.storeName)
          if (res.storePixKey) setStorePixKey(res.storePixKey)
          if (res.storePixKeyType) setStorePixKeyType(res.storePixKeyType)
          if (res.methods) setMethods(res.methods)
          setStep("main")
        } else {
          setStep("main")
        }
      })
      .catch((err) => {
        if (!active) return
        console.error("Error loading driver payment methods:", err)
        setStep("main")
      })

    return () => {
      active = false
    }
  }, [isOpen, assignmentId, initialOrder?.id, initialOrder?.order_id, initialOrder?.delivery_id])

  // Target values
  const targetOrder = currentOrder || initialOrder
  const totalOrder = Number(targetOrder?.total_amount || 0)
  const totalPaid = Number(targetOrder?.paid_amount || targetOrder?.amount_paid || 0)
  const totalRemaining = Math.max(0, totalOrder - totalPaid)
  const isFullyPaid = targetOrder?.situation === "paid" || totalRemaining <= 0.009

  const orderNumber =
    targetOrder?.order_number ||
    (targetOrder?.id ? `#${String(targetOrder.id).slice(0, 8)}` : "")

  const breakdown: any[] = useMemo(() => {
    if (Array.isArray(targetOrder?.payment_breakdown) && targetOrder.payment_breakdown.length > 0) {
      return targetOrder.payment_breakdown
    }
    return []
  }, [targetOrder])

  const isSplit = breakdown.length > 1

  const isMpOrder = useMemo(() => {
    return Boolean(
      targetOrder?.payment_provider === "Mercado Pago" ||
      targetOrder?.mp_payment_id ||
      breakdown.some((leg) => {
        const p = String(leg?.provider || "").toLowerCase()
        const m = String(leg?.method || "").toLowerCase()
        return p.includes("mercado pago") || m.includes("mercado pago")
      })
    )
  }, [targetOrder, breakdown])

  // Cash change analysis
  const cashEntry = breakdown.find((leg) => {
    const m = String(leg?.method || "").toLowerCase().trim()
    return m === "cash" || m === "dinheiro"
  })
  const wantsChange =
    (cashEntry as any)?.wantsChange ??
    String(targetOrder?.payment_method || "").toLowerCase().includes("troco para")
  const payWithAmount =
    (cashEntry as any)?.payWithAmount ??
    (() => {
      const match = String(targetOrder?.payment_method || "").match(/troco para R\$\s*([\d,.]+)/i)
      if (match) {
        const cleanNum = match[1].replace(/\./g, "").replace(",", ".")
        return Number(cleanNum)
      }
      return null
    })()
  const cashChangeAmount = wantsChange && payWithAmount ? Math.max(0, payWithAmount - totalOrder) : 0

  // Fetch Mercado Pago details if needed
  useEffect(() => {
    if (!isOpen || !targetOrder || isFullyPaid) return
    const orderId = targetOrder.id || targetOrder.order_id
    if (!orderId || !isMpOrder) return

    setMpLoading(true)
    fetch("/api/orders/retry-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
      .then(async (res) => {
        if (!res.ok) return null
        return res.json()
      })
      .then((data) => {
        if (data && (data.pixData || data.boletoData)) {
          setMpPaymentData(data)
        }
      })
      .catch((err) => {
        console.error("Error fetching MP data in DriverPaymentModal:", err)
      })
      .finally(() => {
        setMpLoading(false)
      })
  }, [isOpen, targetOrder?.id, targetOrder?.order_id, isFullyPaid, isMpOrder])

  // Sync MP
  const handleSyncMp = async () => {
    const orderId = targetOrder?.id || targetOrder?.order_id
    if (!orderId) return
    setSyncingMp(true)
    try {
      const res = await fetch("/api/orders/sync-payment-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.newStatus === "paid" || data.paymentStatus === "approved") {
          toast({ title: "Pagamento Aprovado!", description: "Mercado Pago confirmou o pagamento." })
          setStep("success")
          onSuccess?.()
        } else {
          toast({ title: "Aguardando pagamento", description: "O pagamento ainda não foi identificado pelo Mercado Pago." })
        }
      } else {
        toast({ title: "Aviso", description: "Não foi possível sincronizar no momento.", variant: "warning" })
      }
    } catch (err) {
      console.error("Error syncing MP:", err)
      toast({ title: "Erro", description: "Falha ao verificar com Mercado Pago.", variant: "destructive" })
    } finally {
      setSyncingMp(false)
    }
  }

  // Regenerate MP Pix if expired or requested
  const handleRegenerateMpPix = async () => {
    const orderId = targetOrder?.id || targetOrder?.order_id
    if (!orderId) return
    setMpLoading(true)
    try {
      const res = await fetch("/api/orders/retry-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data && (data.pixData || data.boletoData)) {
          setMpPaymentData(data)
          toast({ title: "QR Code Pix Atualizado", description: "Novo código de pagamento gerado com sucesso." })
        }
      } else {
        toast({ title: "Aviso", description: "Não foi possível gerar novo QR Code no momento.", variant: "warning" })
      }
    } catch (err) {
      console.error("Error regenerating MP Pix:", err)
      toast({ title: "Erro", description: "Falha ao gerar QR Code.", variant: "destructive" })
    } finally {
      setMpLoading(false)
    }
  }

  // Generate local Pix if order is Pix and not Mercado Pago
  const resolvedMethodName = String(
    targetOrder?.payment_method || breakdown[0]?.method || ""
  ).trim()

  const activeCategory = useMemo(() => {
    if (selectedPaymentCategory !== "auto") return selectedPaymentCategory
    if (isMpOrder) return "pix"
    if (resolvedMethodName.toLowerCase().includes("pix") || fallbackMethod.toLowerCase().includes("pix")) return "pix"
    if (resolvedMethodName.toLowerCase().includes("dinheiro") || resolvedMethodName.toLowerCase().includes("cash")) return "dinheiro"
    if (resolvedMethodName.toLowerCase().includes("cartão") || resolvedMethodName.toLowerCase().includes("cartao") || resolvedMethodName.toLowerCase().includes("crédito") || resolvedMethodName.toLowerCase().includes("débito")) return "cartao"
    return "fallback"
  }, [selectedPaymentCategory, isMpOrder, resolvedMethodName, fallbackMethod])

  const isPixMethod =
    !isMpOrder &&
    (activeCategory === "pix" || resolvedMethodName.toLowerCase().includes("pix") || fallbackMethod.toLowerCase().includes("pix"))

  useEffect(() => {
    if (!isOpen || isFullyPaid || !isPixMethod) return
    if (localPixQrData || generatingLocalPix) return

    const key = storePixKey || methods.find((m) => m.type === "pix")?.pix_key
    if (!key) return

    setGeneratingLocalPix(true)
    try {
      const payload = generateStaticPix(
        key,
        totalRemaining,
        storeName || "Loja",
        "",
        "DUDIT",
        storePixKeyType
      )
      QRCode.toDataURL(payload, { width: 300, margin: 2 })
        .then((qrDataUrl) => {
          setLocalPixQrData({ payload, qrDataUrl })
        })
        .catch(console.error)
        .finally(() => setGeneratingLocalPix(false))
    } catch (err) {
      console.error("Error generating local Pix:", err)
      setGeneratingLocalPix(false)
    }
  }, [
    isOpen,
    isFullyPaid,
    isPixMethod,
    storePixKey,
    storePixKeyType,
    methods,
    totalRemaining,
    storeName,
    localPixQrData,
    generatingLocalPix,
  ])

  // Confirm payment execution
  const handleConfirmReceipt = async (methodOverride?: string) => {
    if (isFullyPaid) {
      toast({ title: "Aviso", description: "Este pedido já está pago.", variant: "warning" })
      return
    }

    const finalMethod =
      methodOverride ||
      (activeCategory === "pix"
        ? (isMpOrder ? "Pix Mercado Pago" : "Pix")
        : activeCategory === "dinheiro"
        ? "Dinheiro"
        : activeCategory === "cartao"
        ? (resolvedMethodName.toLowerCase().includes("débito") ? "Cartão de Débito" : "Cartão de Crédito")
        : (resolvedMethodName && !resolvedMethodName.toLowerCase().includes("não definido")
          ? resolvedMethodName
          : fallbackMethod))

    setStep("processing")
    try {
      const installments =
        breakdown[0]?.installmentNumber ||
        (finalMethod.toLowerCase().includes("crédito") ? 1 : 1)

      const targetOrderId = targetOrder?.id || targetOrder?.order_id || null
      const targetAssignmentId = assignmentId || initialOrder?.delivery_id || targetOrderId || ""

      const res = await driverConfirmPaymentAction({
        assignmentId: targetAssignmentId,
        orderId: targetOrderId,
        paymentMethod: finalMethod,
        amountReceived: totalRemaining,
        installments,
      })

      if (res.success) {
        setStep("success")
        onSuccess?.()
      } else {
        setErrorMessage(res.error || "Não foi possível confirmar o recebimento.")
        setStep("error")
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Erro inesperado ao registrar o pagamento.")
      setStep("error")
    }
  }

  const handleSafeClose = () => {
    setIsAnimating(false)
    setTimeout(() => {
      onClose()
      setStep("loading")
    }, 200)
  }

  const receiptCart = useMemo(() => {
    const items = targetOrder?.order_items || targetOrder?.items || []
    return items.map((item: any) => ({
      name: item.products?.name || item.product_name || item.name || "Item",
      quantity: Number(item.quantity || 1),
      unitPrice: Number(item.product_price || item.unit_price || item.unitPrice || item.price || 0),
    }))
  }, [targetOrder])

  if (!isOpen) return null

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 transition-opacity duration-200 ${isAnimating ? "opacity-100" : "opacity-0"}`}
        style={{ zIndex }}
        onClick={handleSafeClose}
      />

      <div
        className="fixed inset-0 flex items-center justify-center p-3 md:p-6 pointer-events-none"
        style={{ zIndex: zIndex + 1 }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: isAnimating ? 1 : 0, scale: isAnimating ? 1 : 0.96, y: isAnimating ? 0 : 10 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={standardTransition}
          className="bg-white dark:bg-dark-surface w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden pointer-events-auto max-h-[92vh] border border-brand-border dark:border-dark-border"
        >
          {/* LEFT COLUMN: RECEIPT */}
          <div className="w-full md:w-[40%] flex flex-col shrink-0">
            <TransactionReceiptContent
              cart={receiptCart}
              totalOrder={totalOrder}
              totalPaid={totalPaid}
              totalRemaining={totalRemaining}
              orderNumber={orderNumber}
              customerName={targetOrder?.customer_name}
            />
          </div>

          {/* RIGHT COLUMN: ACTIONS */}
          <div className="w-full md:w-[60%] bg-white dark:bg-dark-surface flex flex-col relative h-full overflow-hidden">
            {/* Header */}
            <div className="px-6 py-5 md:px-8 flex items-center justify-between border-b border-brand-border dark:border-dark-border shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <MoneyIcon size={20} className="text-brand-primary shrink-0" />
                <h2 className="text-lg md:text-xl font-bold text-brand-dark dark:text-dark-heading truncate">
                  Receber Pagamento {orderNumber ? `– ${orderNumber}` : ""}
                </h2>
              </div>
              <button
                onClick={handleSafeClose}
                className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-dark-border/50 text-brand-dark dark:text-dark-heading hover:bg-gray-200 transition-colors shrink-0"
              >
                <XIcon size={18} />
              </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-6 py-6 md:px-8 custom-scrollbar flex flex-col justify-between">
              <AnimatePresence mode="wait">
                {/* 1. LOADING */}
                {step === "loading" && (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center py-16 my-auto text-brand-inactive-text"
                  >
                    <Spinner size={32} className="text-brand-primary mb-3" />
                    <p className="text-sm font-medium">Carregando detalhes do pagamento...</p>
                  </motion.div>
                )}

                {/* 2. MAIN STATE */}
                {step === "main" && (
                  <motion.div
                    key="main"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={standardTransition}
                    className="flex flex-col gap-5 my-auto"
                  >
                    {/* Alerta de troco */}
                    {wantsChange && payWithAmount !== null && (
                      <InfoCard
                        color="blue"
                        message={`O cliente solicitou troco para ${formatCurrency(payWithAmount)}. Troco a devolver: ${formatCurrency(cashChangeAmount)}.`}
                      />
                    )}

                    {/* Pedido já totalmente pago */}
                    {isFullyPaid ? (
                      <div className="py-10 text-center flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-950/40 text-brand-green flex items-center justify-center mb-4">
                          <CheckCircleIcon size={36} />
                        </div>
                        <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">
                          Este pedido já está pago
                        </h3>
                        <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-1">
                          Não há valores pendentes para receber nesta entrega.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Seletor rápido de forma de recebimento */}
                        <div className="flex items-center gap-1.5 mb-4 bg-brand-gray dark:bg-dark-border/40 p-1 rounded-xl">
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentCategory("auto")}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all truncate ${
                              selectedPaymentCategory === "auto"
                                ? "bg-white dark:bg-dark-surface shadow-sm text-brand-dark dark:text-dark-heading"
                                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                            }`}
                          >
                            Padrão ({resolvedMethodName || "Pedido"})
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentCategory("pix")}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all truncate ${
                              activeCategory === "pix"
                                ? "bg-white dark:bg-dark-surface shadow-sm text-brand-primary"
                                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                            }`}
                          >
                            Pix
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentCategory("dinheiro")}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all truncate ${
                              activeCategory === "dinheiro"
                                ? "bg-white dark:bg-dark-surface shadow-sm text-brand-primary"
                                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                            }`}
                          >
                            Dinheiro
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedPaymentCategory("cartao")}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition-all truncate ${
                              activeCategory === "cartao"
                                ? "bg-white dark:bg-dark-surface shadow-sm text-brand-primary"
                                : "text-brand-inactive-text hover:text-brand-dark dark:hover:text-dark-heading"
                            }`}
                          >
                            Cartão
                          </button>
                        </div>

                        {isMpOrder && (activeCategory === "pix" || activeCategory === "fallback") ? (
                          /* MERCADO PAGO CASE */
                          <div className="flex flex-col gap-4 rounded-xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center shrink-0 border border-blue-100 dark:border-blue-900/30">
                                  <img
                                    src="https://img.dudit.com.br/static/icons/payments/MercadoPago.png"
                                    alt="Mercado Pago"
                                    className="w-6 h-6 object-contain"
                                  />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                                    {mpPaymentData?.boletoData ? "Boleto Mercado Pago" : "Pix Mercado Pago"}
                                    <Badge variant="orange" className="text-[10px] scale-90">Pendente</Badge>
                                  </h4>
                                  <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                                    {mpPaymentData?.boletoData
                                      ? "Linha digitável gerada no pedido"
                                      : "Escaneie o QR Code ou copie a chave Pix"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleRegenerateMpPix}
                                  disabled={mpLoading || syncingMp}
                                  className="h-8 text-xs font-semibold"
                                  title="Atualizar ou regerar QR Code Pix"
                                >
                                  {mpLoading ? <Spinner size={12} className="mr-1.5" /> : null}
                                  Atualizar QR Code
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={handleSyncMp}
                                  disabled={syncingMp}
                                  className="h-8 text-xs font-semibold"
                                >
                                  {syncingMp ? <Spinner size={12} className="mr-1.5" /> : null}
                                  Verificar
                                </Button>
                              </div>
                            </div>

                            {mpLoading && (
                              <div className="flex flex-col items-center justify-center py-6 text-brand-inactive-text">
                                <Spinner size={24} className="text-brand-primary mb-2" />
                                <span className="text-xs">Buscando QR Code no Mercado Pago...</span>
                              </div>
                            )}

                            {!mpLoading && !mpPaymentData?.pixData && !mpPaymentData?.boletoData && (
                              <div className="flex flex-col items-center justify-center py-6 text-center bg-gray-50 dark:bg-dark-border/20 rounded-xl p-4 border border-dashed border-brand-border dark:border-dark-border">
                                <p className="text-xs text-brand-inactive-text dark:text-dark-body mb-3">
                                  QR Code Pix ainda não gerado ou expirado no Mercado Pago.
                                </p>
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={handleRegenerateMpPix}
                                  disabled={mpLoading}
                                  className="h-9 font-semibold"
                                >
                                  Gerar QR Code Pix
                                </Button>
                              </div>
                            )}

                            {/* Pix MP QR Code */}
                            {mpPaymentData?.pixData && (
                              <div className="flex flex-col items-center gap-3 pt-2">
                                {mpPaymentData.pixData.qrCodeBase64 && (
                                  <div className="w-44 h-44 p-2 bg-white rounded-xl border border-brand-border flex items-center justify-center shadow-sm">
                                    <img
                                      src={`data:image/png;base64,${mpPaymentData.pixData.qrCodeBase64}`}
                                      alt="PIX QR Code"
                                      className="w-full h-full object-contain"
                                    />
                                  </div>
                                )}
                                <div className="text-center">
                                  <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Valor do Pix</span>
                                  <span className="text-2xl font-black text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(mpPaymentData.chargeAmount || totalRemaining)}
                                  </span>
                                </div>
                                {mpPaymentData.pixData.qrCode && (
                                  <div className="w-full flex gap-2">
                                    <Input
                                      variant="full-rounded"
                                      readOnly
                                      value={mpPaymentData.pixData.qrCode}
                                      className="flex-1 h-10 truncate text-xs"
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        if (mpPaymentData?.pixData?.qrCode) {
                                          navigator.clipboard.writeText(mpPaymentData.pixData.qrCode)
                                          setCopiedPix(true)
                                          toast({ title: "Copiado!", description: "Código Pix copiado para a área de transferência." })
                                          setTimeout(() => setCopiedPix(false), 2000)
                                        }
                                      }}
                                      className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                      title="Copiar código Pix"
                                    >
                                      {copiedPix ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Boleto MP */}
                            {mpPaymentData?.boletoData && (
                              <div className="flex flex-col items-center gap-3 pt-2">
                                {mpPaymentData.boletoData.barcode && (
                                  <div className="w-full overflow-hidden bg-white p-2 rounded-xl border flex justify-center">
                                    <Barcode
                                      value={mpPaymentData.boletoData.barcode}
                                      format="CODE128"
                                      width={1.5}
                                      height={45}
                                      displayValue={false}
                                      margin={4}
                                      className="w-full max-w-xs"
                                    />
                                  </div>
                                )}
                                <div className="text-center">
                                  <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Valor do Boleto</span>
                                  <span className="text-2xl font-black text-brand-dark dark:text-dark-heading">
                                    {formatCurrency(mpPaymentData.chargeAmount || totalRemaining)}
                                  </span>
                                </div>
                                {mpPaymentData.boletoData.barcode && (
                                  <div className="w-full flex gap-2">
                                    <Input
                                      variant="full-rounded"
                                      readOnly
                                      value={mpPaymentData.boletoData.barcode}
                                      className="flex-1 h-10 truncate text-xs"
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        if (mpPaymentData?.boletoData?.barcode) {
                                          navigator.clipboard.writeText(mpPaymentData.boletoData.barcode)
                                          setCopiedPix(true)
                                          toast({ title: "Copiado!", description: "Linha digitável copiada." })
                                          setTimeout(() => setCopiedPix(false), 2000)
                                        }
                                      }}
                                      className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                      title="Copiar código de barras"
                                    >
                                      {copiedPix ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="pt-2">
                              <Button
                                className="w-full h-11"
                                onClick={() => handleConfirmReceipt("Pix Mercado Pago")}
                              >
                                Confirmar Recebimento do Cliente
                              </Button>
                            </div>
                          </div>
                        ) : activeCategory === "pix" || isPixMethod ? (
                          /* PIX DA LOJA CASE */
                      <div className="flex flex-col gap-4 rounded-xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/30 flex items-center justify-center shrink-0 border border-teal-100 dark:border-teal-900/30">
                            <QRCodeIcon size={24} className="text-teal-600 dark:text-teal-400" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                              Pix da Loja ({storeName})
                              <Badge variant="orange" className="text-[10px] scale-90">A Receber</Badge>
                            </h4>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                              {storePixKey
                                ? `Chave: ${storePixKey}`
                                : "Chave Pix configurada pela loja"}
                            </p>
                          </div>
                        </div>

                        {/* QR Code gerado */}
                        {localPixQrData?.qrDataUrl ? (
                          <div className="flex flex-col items-center gap-3 pt-2">
                            <div className="w-44 h-44 p-2 bg-white rounded-xl border border-brand-border flex items-center justify-center shadow-sm">
                              <img
                                src={localPixQrData.qrDataUrl}
                                alt="PIX QR Code"
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="text-center">
                              <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Valor a transferir</span>
                              <span className="text-2xl font-black text-brand-dark dark:text-dark-heading">
                                {formatCurrency(totalRemaining)}
                              </span>
                            </div>
                            {storePixKey && (
                              <div className="w-full flex gap-2">
                                <Input
                                  variant="full-rounded"
                                  readOnly
                                  value={storePixKey}
                                  className="flex-1 h-10 truncate"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(storePixKey)
                                    setCopiedPix(true)
                                    toast({ title: "Copiado!", description: "Chave Pix copiada." })
                                    setTimeout(() => setCopiedPix(false), 2000)
                                  }}
                                  className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                  title="Copiar chave Pix"
                                >
                                  {copiedPix ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : generatingLocalPix ? (
                          <div className="flex flex-col items-center justify-center py-6 text-brand-inactive-text">
                            <Spinner size={24} className="text-brand-primary mb-2" />
                            <span className="text-xs">Gerando QR Code Pix da loja...</span>
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <span className="text-xs text-brand-inactive-text dark:text-dark-body block mb-1">Valor a receber</span>
                            <span className="text-2xl font-black text-brand-dark dark:text-dark-heading block mb-2">
                              {formatCurrency(totalRemaining)}
                            </span>
                            {storePixKey ? (
                              <div className="w-full flex gap-2 mt-2">
                                <Input
                                  variant="full-rounded"
                                  readOnly
                                  value={storePixKey}
                                  className="flex-1 h-10 truncate"
                                />
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(storePixKey)
                                    setCopiedPix(true)
                                    toast({ title: "Copiado!", description: "Chave Pix copiada." })
                                    setTimeout(() => setCopiedPix(false), 2000)
                                  }}
                                  className="h-10 w-10 shrink-0 p-0 flex items-center justify-center"
                                >
                                  {copiedPix ? <CheckCircleIcon size={16} className="text-brand-green" /> : <CopyIcon size={16} />}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        )}

                        <InfoCard
                          color="blue"
                          message="Solicite ao cliente o pagamento via Pix. Após conferir o comprovante, confirme o recebimento."
                        />

                        <Button
                          className="w-full h-11"
                          onClick={() => handleConfirmReceipt("Pix")}
                        >
                          Confirmar Recebimento do Pix
                        </Button>
                      </div>
                    ) : activeCategory === "cartao" || (!isMpOrder && !isPixMethod && (resolvedMethodName.toLowerCase().includes("cartão") || resolvedMethodName.toLowerCase().includes("cartao") || resolvedMethodName.toLowerCase().includes("crédito") || resolvedMethodName.toLowerCase().includes("débito"))) ? (
                      /* CARTÃO CRÉDITO OU DÉBITO */
                      <div className="flex flex-col gap-4 rounded-xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center shrink-0 border border-purple-100 dark:border-purple-900/30">
                            <CreditCardIcon size={24} className="text-purple-600 dark:text-purple-400" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                              {resolvedMethodName}
                              <Badge variant="orange" className="text-[10px] scale-90">Na Maquininha</Badge>
                            </h4>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                              Valor pré-definido pelo vendedor
                            </p>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-brand-gray dark:bg-dark-border/40 text-center my-2">
                          <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Valor a passar na maquininha</span>
                          <span className="text-2xl font-black text-brand-dark dark:text-dark-heading block mt-0.5">
                            {formatCurrency(totalRemaining)}
                          </span>
                          {breakdown[0]?.installmentNumber > 1 && (
                            <span className="text-xs font-semibold text-brand-primary block mt-1">
                              {breakdown[0].installmentNumber}x de {formatCurrency(totalRemaining / breakdown[0].installmentNumber)}
                            </span>
                          )}
                        </div>

                        <InfoCard
                          color="blue"
                          message="Passe o cartão do cliente na maquininha. Assim que a maquininha aprovar a transação, confirme abaixo."
                        />

                        <Button
                          variant="default"
                          className="w-full h-11 font-bold"
                          onClick={() => handleConfirmReceipt(resolvedMethodName)}
                        >
                          Confirmar Recebimento no Cartão
                        </Button>
                      </div>
                    ) : activeCategory === "dinheiro" || (!isMpOrder && !isPixMethod && (resolvedMethodName.toLowerCase().includes("dinheiro") || resolvedMethodName.toLowerCase().includes("cash"))) ? (
                      /* DINHEIRO (CASH) */
                      <div className="flex flex-col gap-4 rounded-xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 flex items-center justify-center shrink-0 border border-emerald-100 dark:border-emerald-900/30">
                            <MoneyIcon size={24} className="text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                              Pagamento em Dinheiro
                              <Badge variant="orange" className="text-[10px] scale-90">A Receber</Badge>
                            </h4>
                            <p className="text-xs text-brand-inactive-text dark:text-dark-body">
                              Recebimento presencial na entrega
                            </p>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-brand-gray dark:bg-dark-border/40 text-center my-2">
                          <span className="text-xs text-brand-inactive-text dark:text-dark-body block">Valor a receber</span>
                          <span className="text-2xl font-black text-brand-dark dark:text-dark-heading block mt-0.5">
                            {formatCurrency(totalRemaining)}
                          </span>
                          {wantsChange && payWithAmount ? (
                            <div className="mt-2 pt-2 border-t border-brand-border dark:border-dark-border flex justify-around text-xs">
                              <span>Paga com: <strong>{formatCurrency(payWithAmount)}</strong></span>
                              <span className="text-brand-orange">Troco: <strong>{formatCurrency(cashChangeAmount)}</strong></span>
                            </div>
                          ) : null}
                        </div>

                        <Button
                          variant="default"
                          className="w-full h-11 font-bold"
                          onClick={() => handleConfirmReceipt("Dinheiro")}
                        >
                          Confirmar Recebimento em Dinheiro
                        </Button>
                      </div>
                    ) : isSplit ? (
                      /* SPLIT BREAKDOWN */
                      <div className="flex flex-col gap-4 rounded-xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface">
                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading flex items-center gap-1.5">
                          Pagamento Dividido ({breakdown.length} formas)
                        </h4>
                        <div className="space-y-2">
                          {breakdown.map((leg, idx) => (
                            <div key={idx} className="flex justify-between items-center p-3 rounded-lg border bg-brand-gray dark:bg-dark-border/30 text-sm">
                              <div>
                                <span className="font-bold text-brand-dark dark:text-dark-heading block">{leg.method || "Método"}</span>
                                {leg.installmentNumber > 1 && (
                                  <span className="text-xs text-brand-inactive-text">{leg.installmentNumber}x</span>
                                )}
                              </div>
                              <span className="font-bold text-brand-primary">{formatCurrency(leg.amount || leg.effectiveAmount || 0)}</span>
                            </div>
                          ))}
                        </div>
                        <Button
                          variant="default"
                          className="w-full h-11 font-bold mt-2"
                          onClick={() => handleConfirmReceipt(targetOrder?.payment_method || "Múltiplos Meios")}
                        >
                          Confirmar Recebimento de Todas as Formas
                        </Button>
                      </div>
                    ) : (
                      /* FALLBACK: SELECTOR RÁPIDO */
                      <div className="flex flex-col gap-4 rounded-xl border border-brand-border dark:border-dark-border p-5 bg-white dark:bg-dark-surface">
                        <h4 className="text-sm font-bold text-brand-dark dark:text-dark-heading">
                          Selecione como o cliente está pagando:
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          {["Dinheiro", "Pix", "Cartão de Crédito", "Cartão de Débito"].map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setFallbackMethod(m)}
                              className={`p-3 rounded-xl border text-sm font-bold transition-all text-left ${fallbackMethod === m ? "border-brand-primary bg-brand-primary/5 text-brand-primary" : "border-brand-border dark:border-dark-border hover:bg-gray-50"}`}
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                        <div className="p-3 rounded-xl bg-brand-gray dark:bg-dark-border/40 text-center">
                          <span className="text-xs text-brand-inactive-text block">Valor a confirmar</span>
                          <span className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                            {formatCurrency(totalRemaining)}
                          </span>
                        </div>
                        <Button
                          variant="default"
                          className="w-full h-11 font-bold"
                          onClick={() => handleConfirmReceipt(fallbackMethod)}
                        >
                          Confirmar Recebimento em {fallbackMethod}
                        </Button>
                      </div>
                    )}
                  </>
                )}
                  </motion.div>
                )}

                {/* 3. PROCESSING STATE */}
                {step === "processing" && (
                  <motion.div
                    key="processing"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={standardTransition}
                    className="w-full h-full flex flex-col items-center justify-center py-16 text-center my-auto"
                  >
                    <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-brand-green to-[#10b981] flex items-center justify-center mb-6 relative">
                      <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-ping" />
                      <MoneyIcon size={44} className="text-white" />
                    </div>
                    <h3 className="text-xl font-bold text-brand-dark dark:text-dark-heading mb-1">
                      Processando recebimento...
                    </h3>
                    <p className="text-brand-inactive-text dark:text-dark-body text-sm">
                      Registrando pagamento no pedido e atualizando o sistema.
                    </p>
                  </motion.div>
                )}

                {/* 4. SUCCESS STATE */}
                {step === "success" && (
                  <motion.div
                    key="success"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={standardTransition}
                    className="w-full h-full flex flex-col p-4 md:p-6 my-auto justify-center"
                  >
                    <div className="flex items-center gap-4 mb-6">
                      <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-950/40 flex items-center justify-center text-brand-green shrink-0">
                        <CheckCircleIcon size={32} />
                      </div>
                      <div>
                        <h2 className="text-xl md:text-2xl font-bold text-brand-dark dark:text-dark-heading">
                          Pedido {orderNumber}
                        </h2>
                        <p className="text-brand-inactive-text dark:text-dark-body font-medium text-sm">
                          Recebimento registrado com sucesso!
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 mb-8 border-l-4 border-brand-green pl-4">
                      <div>
                        <span className="block text-xs font-medium text-brand-inactive-text mb-0.5">Total do Pedido</span>
                        <div className="text-xl font-bold text-brand-dark dark:text-dark-heading">
                          {formatCurrency(totalOrder)}
                        </div>
                      </div>
                      <div>
                        <span className="block text-xs font-medium text-brand-inactive-text mb-0.5">Valor Recebido</span>
                        <div className="text-xl font-bold text-brand-green">
                          {formatCurrency(totalRemaining > 0 ? totalRemaining : totalOrder)}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button
                        variant="outline"
                        className="flex-1 h-11"
                        leftIcon={<PrinterIcon size={16} />}
                        onClick={() => setPrintOrderId(targetOrder?.id || targetOrder?.order_number)}
                      >
                        Imprimir Recibo
                      </Button>
                      <Button
                        variant="default"
                        className="flex-1 h-11 font-bold"
                        onClick={handleSafeClose}
                      >
                        Concluir
                      </Button>
                    </div>
                  </motion.div>
                )}

                {/* 5. ERROR STATE */}
                {step === "error" && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={standardTransition}
                    className="w-full h-full flex flex-col items-center justify-center py-10 text-center my-auto"
                  >
                    <IconPlaceholder
                      placeholderType="image"
                      imageSrc="https://img.dudit.com.br/static/mascots/Ops.png"
                      imageAlt="Erro no recebimento"
                      title="Não foi possível concluir"
                      subtitle={errorMessage}
                    />
                    <Button
                      variant="outline"
                      className="mt-6"
                      onClick={() => setStep("main")}
                    >
                      Tentar Novamente
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Impressão de recibo */}
      {printOrderId && (
        <SaleReceiptPrintModal
          isOpen={Boolean(printOrderId)}
          onClose={() => setPrintOrderId(null)}
          orderId={printOrderId}
        />
      )}
    </>
  )
}
