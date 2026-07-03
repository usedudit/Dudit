"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/reusable"
import { ChevronLeftIcon } from "@/lib/icons"
import { usePaymentMethods } from "@/hooks/use-payment-methods"
import { getPaymentMethodDetailsAction } from "@/app/actions/erp/payment-methods"
import { generateStaticPix } from "@/lib/utils/pix-generator"
import { useStore } from "@/lib/store-context"
import QRCode from "qrcode"
import {
  buildAvailableMethodTypes,
  CardPaymentView,
  getTargetViewForMethodType,
  MethodGridForPartnerMethods,
  MoneyPaymentView,
  normalizeMethodType,
  PaymentMethodSelector,
  PixPaymentView,
  SplitMethodSelector,
  SplitPaymentView,
  type PaymentBreakdownLeg,
  type PaymentFlowView,
  type PartnerPaymentMethod,
  type SplitPaymentLeg,
} from "@/components/erp/payments/shared"

type BalancePaymentCollectorProps = {
  partnerId: string
  remainingBalance: number
  disabled?: boolean
  onLegsReady: (legs: PaymentBreakdownLeg[]) => void
  onValidityChange?: (valid: boolean) => void
  lockedMethodLabel?: string | null
}

function buildFlatLeg(method: PartnerPaymentMethod, amount: number, installmentNumber = 1): PaymentBreakdownLeg {
  const label = method.name || method.type
  return {
    method: label,
    amount,
    effectiveAmount: amount,
    amountReceived: amount,
    paymentMethodId: method.id,
    installmentNumber,
    adjustmentType: "none",
    adjustmentPercent: 0,
    adjustmentAmount: 0,
  }
}

export function BalancePaymentCollector({
  partnerId,
  remainingBalance,
  disabled = false,
  onLegsReady,
  onValidityChange,
  lockedMethodLabel,
}: BalancePaymentCollectorProps) {
  const { selectedStore } = useStore()
  const { methods, isLoading } = usePaymentMethods(partnerId)
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

  useEffect(() => {
    if (lockedMethodLabel) return
    setAmount(remainingBalance)
    setView("methods")
    setSelectedMethod(null)
    setSelectedMethodType(null)
    setPixQrData(null)
    setSplitLegs([
      { id: 1, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
      { id: 2, method: null, paymentMethodId: null, amount: 0, installmentNumber: 1 },
    ])
  }, [remainingBalance, partnerId, lockedMethodLabel])

  useEffect(() => {
    if (!lockedMethodLabel || activeMethods.length === 0 || isLoading) return
    const methodType = normalizeMethodType(lockedMethodLabel)
    const matches = activeMethods.filter((m: PartnerPaymentMethod) => normalizeMethodType(m.type) === methodType)
    if (matches.length > 0) {
      selectSingleMethod(matches[0])
    }
  }, [lockedMethodLabel, activeMethods, isLoading])

  const isLocked = Boolean(lockedMethodLabel)

  const emitLegs = useCallback(
    (legs: PaymentBreakdownLeg[]) => {
      onLegsReady(legs)
      const total = legs.reduce((sum, leg) => sum + Number(leg.amountReceived || leg.amount || 0), 0)
      onValidityChange?.(total > 0.009 && total <= remainingBalance + 0.005)
    },
    [onLegsReady, onValidityChange, remainingBalance],
  )

  const openMethodType = (type: string) => {
    setSelectedMethodType(type)
    const matches = activeMethods.filter((m: PartnerPaymentMethod) => normalizeMethodType(m.type) === type)
    if (matches.length === 1) {
      selectSingleMethod(matches[0])
      return
    }
    setView("method_type_select")
  }

  const selectSingleMethod = (method: PartnerPaymentMethod) => {
    setSelectedMethod(method)
    setAmount(remainingBalance)
    setView(getTargetViewForMethodType(normalizeMethodType(method.type)) as PaymentFlowView)
    emitLegs([buildFlatLeg(method, remainingBalance)])
  }

  const handleAmountChange = (value: number) => {
    const clean = Math.max(0, Math.min(value, remainingBalance))
    setAmount(clean)
    if (selectedMethod) {
      emitLegs([buildFlatLeg(selectedMethod, clean, Math.max(1, Number(installments || 1)))])
    }
  }

  const handleSplitMethodSelect = (method: PartnerPaymentMethod) => {
    if (editingSplitIndex == null) return
    setSplitLegs((prev) =>
      prev.map((leg, idx) =>
        idx === editingSplitIndex
          ? { ...leg, method: method.name, paymentMethodId: method.id, amount: leg.amount || 0 }
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
      emitLegs([buildFlatLeg(selectedMethod, amount, Math.max(1, Number(installments || 1)))])
    }
  }, [amount, installments, selectedMethod, view, emitLegs])

  const handleGeneratePix = async (pixAmount: number) => {
    if (!selectedMethod?.id) return null
    setGeneratingPix(true)
    try {
      const res = await getPaymentMethodDetailsAction(selectedMethod.id)
      if (!res.success || !res.method.pix_key) return null
      const payload = generateStaticPix(
        res.method.pix_key,
        pixAmount,
        selectedStore?.name || "Loja",
        "",
      )
      const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 })
      const data = { payload, qrDataUrl }
      setPixQrData(data)
      return data
    } finally {
      setGeneratingPix(false)
    }
  }

  if (remainingBalance <= 0.009) {
    return (
      <div className="rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 p-4 text-sm font-semibold text-green-700 dark:text-green-400 text-center">
        Pedido quitado — nenhum saldo restante.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {!isLocked && view !== "methods" && (
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 shrink-0"
            onClick={() => {
              if (view === "method_type_select" || view === "split_method_select") {
                setView(view === "split_method_select" ? "split" : "methods")
                return
              }
              setView("methods")
              setSelectedMethod(null)
              onValidityChange?.(false)
            }}
          >
            <ChevronLeftIcon size={18} />
          </Button>
        )}
        <h4 className="text-sm text-brand-inactive-text dark:text-dark-body font-medium">
          {isLocked ? `Receber saldo (${selectedMethod?.name || lockedMethodLabel})` : `Receber saldo (${view === "methods" ? "escolha o método" : selectedMethod?.name || "registrar"})`}
        </h4>
      </div>

      {!isLocked && view === "methods" && (
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
      )}

      {!isLocked && view === "method_type_select" && selectedMethodType && (
        <MethodGridForPartnerMethods
          methods={activeMethods.filter((m: PartnerPaymentMethod) => normalizeMethodType(m.type) === selectedMethodType)}
          onSelect={selectSingleMethod}
        />
      )}

      {view === "money" && selectedMethod && (
        <MoneyPaymentView
          amount={amount}
          onAmountChange={handleAmountChange}
          baseAllocated={amount}
          flatAmount
          totalPaid={amount}
          totalNeed={remainingBalance}
          showNumpad={false}
        />
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
          qrData={pixQrData}
          isGenerating={generatingPix}
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
          maxInstallments={1}
          readOnlyInstallments
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
          />
          {splitLegs.map((leg, idx) => (
            <div key={leg.id} className="space-y-2">
              <label className="text-xs font-bold text-brand-inactive-text uppercase">
                {leg.method || `Método ${idx + 1}`} — valor
              </label>
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
    </div>
  )
}
