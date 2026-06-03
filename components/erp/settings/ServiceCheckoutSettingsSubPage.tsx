"use client"

import { useEffect, useState } from "react"
import { Button, FormDropdown, FormSection, InfoCard } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { ChevronLeftIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  getServiceCheckoutSettingsAction,
  updateServiceCheckoutSettingsAction,
} from "@/app/actions/marketplace/service-checkout-settings"
import { planStarIconForTarget, usePlanUpgrade } from "@/components/erp/subscription/PlanUpgradeModal"

const DEPOSIT_OPTIONS = [
  { value: "10", label: "10%" },
  { value: "20", label: "20%" },
  { value: "30", label: "30%" },
  { value: "50", label: "50%" },
]

export function ServiceCheckoutSettingsSubPage({
  partnerId,
  onBack,
}: {
  partnerId: string
  onBack: () => void
}) {
  const { openPlanUpgrade } = usePlanUpgrade()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [depositFeatureAllowed, setDepositFeatureAllowed] = useState(false)
  const [depositEnabled, setDepositEnabled] = useState(false)
  const [depositPercentage, setDepositPercentage] = useState("50")

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const res = await getServiceCheckoutSettingsAction(partnerId)
      if (res.success && res.settings) {
        setDepositFeatureAllowed(res.depositFeatureAllowed)
        setDepositEnabled(res.settings.depositEnabled)
        setDepositPercentage(String(res.settings.depositPercentage))
      }
      setLoading(false)
    })()
  }, [partnerId])

  async function handleSave() {
    setSaving(true)
    const res = await updateServiceCheckoutSettingsAction({
      partnerId,
      depositEnabled: depositFeatureAllowed ? depositEnabled : false,
      depositPercentage: Number(depositPercentage) as 10 | 20 | 30 | 50,
    })
    setSaving(false)
    if (!res.success) alert(res.error || "Erro ao salvar")
  }

  if (loading) {
    return <FadeIn className="p-6">Carregando configurações de serviços...</FadeIn>
  }

  return (
    <FadeIn className="flex flex-col h-full bg-white dark:bg-dark-background">
      <div className="p-4 md:p-6 max-w-3xl mx-auto w-full space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0">
            <ChevronLeftIcon className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold text-brand-dark dark:text-dark-heading">Serviços — Checkout</h1>
            <p className="text-sm text-brand-inactive-text">Entrada (sinal) no checkout da vitrine</p>
          </div>
        </div>

        {!depositFeatureAllowed && (
          <InfoCard
            color="orange"
            title="Recurso do plano Crescer ou Escalar"
            message={
              <div className="flex flex-col gap-2">
                <span>Atualize seu plano para permitir pagamento de entrada em agendamentos.</span>
                <div>
                  <Button
                    size="sm"
                    onClick={() => openPlanUpgrade("crescer")}
                    className="mt-1"
                  >
                    Ver planos
                  </Button>
                </div>
              </div>
            }
          />
        )}

        <FormSection title="Entrada (down payment)">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-brand-dark dark:text-dark-heading">Permitir entrada</p>
              <p className="text-xs text-brand-inactive-text">Cliente pode pagar apenas o sinal no checkout</p>
            </div>
            <Switch
              checked={depositEnabled && depositFeatureAllowed}
              onCheckedChange={(v) => depositFeatureAllowed && setDepositEnabled(v)}
              disabled={!depositFeatureAllowed}
            />
          </div>
          <FormDropdown
            label="Percentual da entrada"
            value={depositPercentage}
            setValue={setDepositPercentage}
            options={DEPOSIT_OPTIONS}
            disabled={!depositEnabled || !depositFeatureAllowed}
          />
        </FormSection>

        <Button onClick={handleSave} isLoading={saving} className="w-full md:w-auto">
          Salvar
        </Button>
      </div>
    </FadeIn>
  )
}
