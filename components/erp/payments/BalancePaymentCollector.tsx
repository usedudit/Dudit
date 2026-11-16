"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { formatCurrency } from "@/lib/utils"
import { Button, AlertModal } from "@/components/reusable"
import { ChevronLeftIcon } from "@/lib/icons"
import { usePaymentMethods } from "@/hooks/use-payment-methods"
import { getPaymentMethodDetailsAction, updatePaymentMethodAction } from "@/app/actions/erp/payment-methods"
import { generateStaticPix } from "@/lib/utils/pix-generator"
import { useStore } from "@/lib/store-context"
import { usePermissions } from "@/lib/permission-context"
import { hasMinimumPlan } from "@/lib/subscription/plan-tier"
import { usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"
import QRCode from "qrcode"
import {
  buildAvailableMethodTypes,
  CardPaymentView,
  getTargetViewForMethodType,
  MethodGridForPartnerMethods,
  MoneyPaymentView,
  normalizeMethodType,
  normalizePaymentMethodLabel,
  PaymentMethodSelector,
  PixPaymentView,
  PixQrDisplayModal,
  SplitMethodSelector,
  SplitPaymentView,
  type PaymentBreakdownLeg,
  type PaymentFlowView,
  type PartnerPaymentMethod,
  type SplitPaymentLeg,
} from "@/components/erp/payments/shared"

type BalancePaymentCollectorProps = {
  partnerId: string
  storeId?: string | null
  remainingBalance: number
  disabled?: boolean
  onLegsReady: (legs: PaymentBreakdownLeg[]) => void
  onValidityChange?: (valid: boolean) => void
  lockedMethodLabel?: string | null
  lockedInstallments?: number | null
  targetLeg?: PaymentBreakdownLeg | null
  onClearTargetLeg?: () => void
  onConfirmPayment?: () => void
  onHeaderStateChange?: (state: { title: string; canGoBack: boolean; onGoBack: () => void }) => void
}

function buildFlatLeg(method: PartnerPaymentMethod, amount: number, installmentNumber = 1): PaymentBreakdownLeg {
  const label = method.name || method.type
  return {
    method: label,
    amount,
    effectiveAmount: amount,
    amountReceived: amount,
    paymentMethodId: method.id || null,
    installmentNumber,
    adjustmentType: "none",
    adjustmentPercent: 0,
    adjustmentAmount: 0,
  }
}

export function BalancePaymentCollector({
  partnerId,
  storeId,
  remainingBalance,
  disabled = false,
  onLegsReady,
  onValidityChange,
  lockedMethodLabel,
  lockedInstallments,
  targetLeg,
  onClearTargetLeg,
  onConfirmPayment,
  onHeaderStateChange,
}: BalancePaymentCollectorProps) {
  const { selectedStore } = useStore()
  const { planSlug } = usePermissions()
  const { openPlanUpgrade } = usePlanUpgrade()
  const isFreePlan = !hasMinimumPlan(planSlug, "crescer")
  const effectiveStoreId = storeId !== undefined ? storeId : selectedStore?.id
  const { methods, isLoading } = usePaymentMethods(partnerId, effectiveStoreId)
  const activeMethods = useMemo(
    () => (methods || []).filter((m: PartnerPaymentMethod) => m.is_active !== false),
    [methods],
  )
  const availableMethodTypes = useMemo(() => buildAvailableMethodTypes(activeMethods), [activeMethods])

  const [view, setView] = useState<PaymentFlowView>("methods")
  const [amount, setAmount] = useState(remainingBalance)
  const [installments, setInstallments] = useState("1")
  const [selectedMethod, setSelectedMethod] = useState<PartnerPaymentMethod | null>(null)
  const [selectedMethodType, setSelectedMethodType] = useState<string | null>(null)
  const [splitLegs, setSplitLegs] = useState<SplitPaymentLeg[]>([
    { id: 1, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
    { id: 2, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
  ])
  const [editingSplitIndex, setEditingSplitIndex] = useState<number | null>(null)
  const [pixQrData, setPixQrData] = useState<{ payload: string; qrDataUrl: string } | null>(null)
  const [generatingPix, setGeneratingPix] = useState(false)
  const [activePixModalData, setActivePixModalData] = useState<{ payload: string; qrDataUrl: string } | null>(null)

  // New state variables for Pix key warning and entry flow
  const [hasPixKey, setHasPixKey] = useState<boolean | null>(null)
  const [savedPixKey, setSavedPixKey] = useState<string | null>(null)
  const [savedPixKeyType, setSavedPixKeyType] = useState<string | null>(null)
  const [tempPixKey, setTempPixKey] = useState("")
  const [tempPixKeyType, setTempPixKeyType] = useState<"cpf" | "cnpj" | "email" | "phone" | "random">("cpf")
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false)
  const [showKeyInputs, setShowKeyInputs] = useState(false)
  const [savingPixKey, setSavingPixKey] = useState(false)

  const isLocked = Boolean(lockedMethodLabel)

  const getCollectorTitle = useCallback(() => {
    if (isLocked) {
      return `Receber saldo (${selectedMethod?.name || lockedMethodLabel})`
    }
    if (view === "methods") return "Receber saldo"
    if (view === "method_type_select") return "Selecionar Método"
    if (view === "split") return "Dividir Pagamento"
    if (view === "split_method_select") return "Selecionar Método"
    return selectedMethod?.name || "Receber saldo"
  }, [isLocked, selectedMethod, lockedMethodLabel, view])

  const canGoBack = !isLocked && view !== "methods"

  const handleGoBack = useCallback(() => {
    if (view === "method_type_select" || view === "split_method_select") {
      setView(view === "split_method_select" ? "split" : "methods")
      return
    }
    setView("methods")
    setSelectedMethod(null)
    onClearTargetLeg?.()
    onValidityChange?.(false)
  }, [view, onClearTargetLeg, onValidityChange])

  useEffect(() => {
    onHeaderStateChange?.({
      title: getCollectorTitle(),
      canGoBack,
      onGoBack: handleGoBack,
    })
  }, [view, selectedMethod, lockedMethodLabel, isLocked, canGoBack, getCollectorTitle, handleGoBack, onHeaderStateChange])

  useEffect(() => {
    if (lockedInstallments) {
      setInstallments(String(lockedInstallments))
    }
  }, [lockedInstallments])

  useEffect(() => {
    if (lockedMethodLabel) return
    setAmount(remainingBalance)
    setView("methods")
    setSelectedMethod(null)
    setSelectedMethodType(null)
    setPixQrData(null)
    setActivePixModalData(null)
    setSplitLegs([
      { id: 1, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
      { id: 2, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
    ])
    // Reset our new states
    setHasPixKey(null)
    setSavedPixKey(null)
    setSavedPixKeyType(null)
    setTempPixKey("")
    setTempPixKeyType("cpf")
    setShowWarningModal(false)
    setShowConfirmSaveModal(false)
    setShowKeyInputs(false)
  }, [remainingBalance, partnerId, lockedMethodLabel])

  useEffect(() => {
    if (!lockedMethodLabel || activeMethods.length === 0 || isLoading) return
    const normalizedLabel = normalizePaymentMethodLabel(lockedMethodLabel)
    const methodType = normalizeMethodType(normalizedLabel)
    const matches = activeMethods.filter((m: PartnerPaymentMethod) => {
      if (normalizeMethodType(m.type) === methodType) return true
      if (normalizePaymentMethodLabel(m.name) === normalizedLabel) return true
      return false
    })
    if (matches.length > 0) {
      selectSingleMethod(matches[0])
    }
  }, [lockedMethodLabel, activeMethods, isLoading])

  useEffect(() => {
    if (!targetLeg || activeMethods.length === 0 || isLoading) return
    const normalizedLabel = normalizePaymentMethodLabel(targetLeg.method)
    const methodType = normalizeMethodType(normalizedLabel)
    const matches = activeMethods.filter((m: PartnerPaymentMethod) => {
      if (targetLeg.paymentMethodId && m.id === targetLeg.paymentMethodId) return true
      if (normalizeMethodType(m.type) === methodType) return true
      if (normalizePaymentMethodLabel(m.name) === normalizedLabel) return true
      return false
    })
    if (matches.length > 0) {
      selectSingleMethod(matches[0])
    } else {
      const dummy: PartnerPaymentMethod = {
        id: targetLeg.paymentMethodId || "",
        name: targetLeg.method || (methodType === "cash" ? "Dinheiro" : methodType === "pix" ? "Pix" : "Outros"),
        type: methodType,
        is_active: true,
      }
      setSelectedMethod(dummy)
      setAmount(remainingBalance)
      setView(getTargetViewForMethodType(methodType) as PaymentFlowView)
      emitLegs([buildFlatLeg(dummy, remainingBalance, 1)])
    }
  }, [targetLeg, activeMethods, isLoading, remainingBalance])

  // Effect to load Pix key details when method is selected and view goes to "pix"
  useEffect(() => {
    if (view === "pix" && selectedMethod) {
      getPaymentMethodDetailsAction(selectedMethod.id).then((res) => {
        if (res.success) {
          if (res.method.pix_key) {
            setHasPixKey(true)
            setSavedPixKey(res.method.pix_key)
            setSavedPixKeyType(res.method.pix_key_type)
            setShowKeyInputs(false)
          } else {
            setHasPixKey(false)
            setShowWarningModal(true)
            setShowKeyInputs(true)
          }
        }
      })
    }
  }, [view, selectedMethod])

  const emitLegs = useCallback(
    (legs: PaymentBreakdownLeg[]) => {
      onLegsReady(legs)
      const coveredBalance = legs.reduce(
        (sum, leg) => sum + Number(leg.amount || Math.min(Number(leg.amountReceived || 0), remainingBalance)),
        0,
      )
      const hasNonCashOverpayment = legs.some(
        (leg) => normalizeMethodType(String(leg.method || "")) !== "cash" && Number(leg.amount || 0) > remainingBalance + 0.005,
      )
      onValidityChange?.(coveredBalance > 0.009 && coveredBalance <= remainingBalance + 0.005 && !hasNonCashOverpayment)
    },
    [onLegsReady, onValidityChange, remainingBalance],
  )

  const openMethodType = (type: string) => {
    setSelectedMethodType(type)
    const matches = activeMethods.filter((m: PartnerPaymentMethod) => normalizeMethodType(m.type) === type)
    if (isFreePlan || matches.length === 1) {
      if (matches.length > 0) {
        selectSingleMethod(matches[0])
      } else {
        const dummy: PartnerPaymentMethod = {
          id: "",
          name: type === "cash" ? "Dinheiro" : type === "pix" ? "Pix" : type === "credit_card" ? "Cartão de Crédito" : type === "debit_card" ? "Cartão de Débito" : "Outros",
          type,
          is_active: true,
        }
        setSelectedMethod(dummy)
        setAmount(remainingBalance)
        setView(getTargetViewForMethodType(type) as PaymentFlowView)
        emitLegs([buildFlatLeg(dummy, remainingBalance, lockedInstallments || 1)])
      }
      return
    }
    setView("method_type_select")
  }

  const selectSingleMethod = (method: PartnerPaymentMethod) => {
    setSelectedMethod(method)
    setAmount(remainingBalance)
    setView(getTargetViewForMethodType(normalizeMethodType(method.type)) as PaymentFlowView)
    emitLegs([buildFlatLeg(method, remainingBalance, lockedInstallments || 1)])
  }

  const handleAmountChange = (value: number) => {
    const isMoney = selectedMethod && normalizeMethodType(selectedMethod.type) === "cash"
    const clean = isMoney ? Math.max(0, value) : Math.max(0, Math.min(value, remainingBalance))
    setAmount(clean)
    if (selectedMethod) {
      const legAmount = Math.min(clean, remainingBalance)
      const flatLeg = buildFlatLeg(selectedMethod, legAmount, Math.max(1, Number(installments || 1))) as any
      if (isMoney && clean > remainingBalance) {
        flatLeg.amountReceived = clean
        flatLeg.changeAmount = Number((clean - remainingBalance).toFixed(2))
      }
      emitLegs([flatLeg])
    }
  }

  const handleSplitMethodSelect = (method: PartnerPaymentMethod) => {
    if (editingSplitIndex == null) return
    setSplitLegs((prev) =>
      prev.map((leg, idx) =>
        idx === editingSplitIndex
          ? { ...leg, method: method.name, paymentMethodId: method.id || null, amount: leg.amount || 0 }
          : leg,
      ),
    )
    setEditingSplitIndex(null)
    setView("split")
  }

  const handleSplitLegClick = (index: number) => {
    setEditingSplitIndex(index)
    setView("split_method_select")
  }

  useEffect(() => {
    if (view !== "split") return
    const legs = splitLegs
      .filter((leg) => leg.method && leg.paymentMethodId && leg.amount > 0.009)
      .map((leg) => {
        const method = activeMethods.find((m: PartnerPaymentMethod) => m.id === leg.paymentMethodId)
        if (!method) return null
        return buildFlatLeg(method, leg.amount, leg.installmentNumber)
      })
      .filter(Boolean) as PaymentBreakdownLeg[]
    emitLegs(legs)
  }, [splitLegs, view, activeMethods, emitLegs])

  useEffect(() => {
    if (selectedMethod && view !== "split" && view !== "methods" && view !== "method_type_select") {
      const isMoney = normalizeMethodType(selectedMethod.type) === "cash"
      const legAmount = isMoney ? Math.min(amount, remainingBalance) : amount
      const flatLeg = buildFlatLeg(selectedMethod, legAmount, Math.max(1, Number(installments || 1))) as any
      if (isMoney && amount > remainingBalance) {
        flatLeg.amountReceived = amount
        flatLeg.changeAmount = Number((amount - remainingBalance).toFixed(2))
      }
      emitLegs([flatLeg])
    }
  }, [amount, installments, selectedMethod, view, remainingBalance, emitLegs])

  const handleGeneratePixWithKey = async (keyToUse: string, typeToUse: string) => {
    if (isFreePlan) {
      openPlanUpgrade("crescer")
      return null
    }
    if (!selectedMethod?.id) return null
    setGeneratingPix(true)
    try {
      const payload = generateStaticPix(
        keyToUse,
        amount,
        selectedStore?.name || "Loja",
        "",
        "DUDIT",
        typeToUse
      )
      const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 })
      setActivePixModalData({ payload, qrDataUrl })
    } catch (err) {
      console.error("Error generating static Pix:", err)
    } finally {
      setGeneratingPix(false)
    }
  }

  const handleGeneratePix = async (pixAmount: number) => {
    if (isFreePlan) {
      openPlanUpgrade("crescer")
      return null
    }
    if (!selectedMethod?.id) return null
    if (hasPixKey && savedPixKey) {
      setGeneratingPix(true)
      try {
        const payload = generateStaticPix(
          savedPixKey,
          pixAmount,
          selectedStore?.name || "Loja",
          "",
          "DUDIT",
          savedPixKeyType
        )
        const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 })
        const data = { payload, qrDataUrl }
        setActivePixModalData(data)
        return data
      } finally {
        setGeneratingPix(false)
      }
    }

    setGeneratingPix(true)
    try {
      const res = await getPaymentMethodDetailsAction(selectedMethod.id)
      if (res.success && res.method.pix_key) {
        setHasPixKey(true)
        setSavedPixKey(res.method.pix_key)
        setSavedPixKeyType(res.method.pix_key_type)

        const payload = generateStaticPix(
          res.method.pix_key,
          pixAmount,
          selectedStore?.name || "Loja",
          "",
          "DUDIT",
          res.method.pix_key_type
        )
        const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 })
        const data = { payload, qrDataUrl }
        setActivePixModalData(data)
        return data
      } else {
        setHasPixKey(false)
        setShowWarningModal(true)
        setShowKeyInputs(true)
        return null
      }
    } finally {
      setGeneratingPix(false)
    }
  }

  if (remainingBalance <= 0.009) {
    return (
      <div className="rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 p-4 text-sm font-semibold text-green-700 dark:text-green-400 text-center">
        Pedido quitado - nenhum saldo restante.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {!isLocked && view === "methods" && (
        <div className="space-y-3">
          <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
            Ou escolha outro método de pagamento:
          </h4>
          <PaymentMethodSelector
            availableMethodTypes={availableMethodTypes}
            isLoading={isLoading}
            disabled={disabled}
            onSelectCash={() => openMethodType("cash")}
            onSelectPix={() => openMethodType("pix")}
            onSelectCreditCard={() => openMethodType("credit_card")}
            onSelectDebitCard={() => openMethodType("debit_card")}
            onSelectBankTransfer={() => openMethodType("bank_transfer")}
            onSelectOther={() => openMethodType("other")}
            onSelectSplit={() => setView("split")}
          />
        </div>
      )}

      {!isLocked && view === "method_type_select" && selectedMethodType && (
        <MethodGridForPartnerMethods
          methods={activeMethods.filter((m: PartnerPaymentMethod) => normalizeMethodType(m.type) === selectedMethodType)}
          onSelect={selectSingleMethod}
        />
      )}

      {view === "money" && selectedMethod && (
        <>
          <MoneyPaymentView
            amount={amount}
            onAmountChange={handleAmountChange}
            baseAllocated={amount}
            flatAmount
            totalPaid={amount}
            totalNeed={remainingBalance}
            showNumpad={false}
          />
        </>
      )}

      {view === "pix" && selectedMethod && (
        <PixPaymentView
          amount={amount}
          onAmountChange={handleAmountChange}
          baseAllocated={amount}
          flatAmount
          totalPaid={amount}
          totalNeed={remainingBalance}
          onGenerateQr={handleGeneratePix}
          qrData={null}
          isGenerating={generatingPix}
          showKeyInputs={showKeyInputs}
          tempPixKey={tempPixKey}
          onTempPixKeyChange={setTempPixKey}
          tempPixKeyType={tempPixKeyType}
          onTempPixKeyTypeChange={setTempPixKeyType}
          isFreePlan={isFreePlan}
          onConfirmGenerateWithKey={() => {
            if (tempPixKey) {
              if (isFreePlan) {
                handleGeneratePixWithKey(tempPixKey, tempPixKeyType)
              } else {
                setShowConfirmSaveModal(true)
              }
            }
          }}
        />
      )}

      {view === "card" && selectedMethod && (
        <CardPaymentView
          amount={amount}
          onAmountChange={handleAmountChange}
          baseAllocated={amount}
          flatAmount
          installments={installments}
          onInstallmentsChange={setInstallments}
          maxInstallments={selectedMethod.max_installments || lockedInstallments || 12}
          readOnlyInstallments={false}
          hideInstallments={isFreePlan || normalizeMethodType(selectedMethod.type) === "debit_card"}
          totalPaid={amount}
          totalNeed={remainingBalance}
        />
      )}

      {!isLocked && view === "split" && (
        <div className="space-y-4">
          <SplitPaymentView
            legs={splitLegs}
            chargeTarget={remainingBalance}
            flatAmount
            onLegClick={handleSplitLegClick}
            onAddLeg={() => {
              setSplitLegs((prev) => [
                ...prev,
                {
                  id: Date.now() + Math.floor(Math.random() * 1000),
                  method: null,
                  paymentMethodId: null,
                  amount: 0,
                  installmentNumber: 1,
                },
              ])
            }}
            onRemoveLeg={(idxToRemove) => {
              setSplitLegs((prev) => prev.filter((_, i) => i !== idxToRemove))
            }}
          />
          {splitLegs.map((leg, idx) => (
            <div key={leg.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-brand-inactive-text uppercase">
                  {leg.method || `Método ${idx + 1}`} - valor
                </label>
                {splitLegs.length > 2 && (
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="text-xs text-red-500 hover:text-red-600 p-0 h-auto"
                    onClick={() => {
                      setSplitLegs((prev) => prev.filter((_, i) => i !== idx))
                    }}
                  >
                    Remover
                  </Button>
                )}
              </div>
              <MoneyPaymentView
                amount={leg.amount}
                onAmountChange={(val) => {
                  setSplitLegs((prev) =>
                    prev.map((row, i) => (i === idx ? { ...row, amount: Math.max(0, Math.min(val, remainingBalance)) } : row)),
                  )
                }}
                baseAllocated={leg.amount}
                flatAmount
                showNumpad={false}
              />
            </div>
          ))}
        </div>
      )}

      {!isLocked && view === "split_method_select" && (
        <SplitMethodSelector methods={activeMethods} onSelect={handleSplitMethodSelect} />
      )}

      {showWarningModal && (
        <AlertModal
          title="Chave Pix Não Cadastrada"
          message="Este método de pagamento Pix não possui uma chave cadastrada. Por favor, preencha os dados da chave Pix para gerar o QR Code."
          variant="warning"
          isOpen={showWarningModal}
          onClose={() => setShowWarningModal(false)}
          confirmText="Ok"
        />
      )}

      {showConfirmSaveModal && (
        <AlertModal
          title="Salvar Chave Pix?"
          message="Deseja salvar esta chave Pix e o tipo dela como padrão para as próximas cobranças deste método de pagamento?"
          variant="info"
          isOpen={showConfirmSaveModal}
          onClose={async () => {
            setShowConfirmSaveModal(false)
            await handleGeneratePixWithKey(tempPixKey, tempPixKeyType)
          }}
          onConfirm={async () => {
            if (!selectedMethod) return
            setShowConfirmSaveModal(false)
            setSavingPixKey(true)
            try {
              await updatePaymentMethodAction(selectedMethod.id, {
                pixKeyType: tempPixKeyType,
                pixKey: tempPixKey
              })
              setHasPixKey(true)
              setSavedPixKey(tempPixKey)
              setSavedPixKeyType(tempPixKeyType)
            } catch (err) {
              console.error("Error saving Pix key:", err)
            } finally {
              setSavingPixKey(false)
            }
            await handleGeneratePixWithKey(tempPixKey, tempPixKeyType)
          }}
          confirmText="Sim, salvar"
          cancelText="Não, apenas gerar"
          isLoading={savingPixKey}
        />
      )}

      {activePixModalData && (
        <PixQrDisplayModal
          isOpen={!!activePixModalData}
          onClose={() => setActivePixModalData(null)}
          qrCode={activePixModalData.qrDataUrl}
          payload={activePixModalData.payload}
          amount={amount}
          onConfirmPayment={() => {
            setActivePixModalData(null)
            onConfirmPayment?.()
          }}
        />
      )}
    </div>
  )
}
