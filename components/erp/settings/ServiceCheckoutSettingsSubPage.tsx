"use client"

import { useEffect, useState, useRef } from "react"
import { Button, FormDropdown, FormSection, InfoCard } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { ChevronLeftIcon, SaveIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import { useNotification } from "@/hooks/use-notification"
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

const SidebarCard = ({ children, className = "", hasTopStrip = false }: { children: React.ReactNode; className?: string; hasTopStrip?: boolean }) => (
  <div className={`bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden mb-6 transition-colors ${className}`}>
    {hasTopStrip && <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl"></div>}
    {children}
  </div>
)

export function ServiceCheckoutSettingsSubPage({
  partnerId,
  onBack,
}: {
  partnerId: string
  onBack: () => void
}) {
  const { openPlanUpgrade } = usePlanUpgrade()
  const { success: notifySuccess, error: notifyError } = useNotification()
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [depositFeatureAllowed, setDepositFeatureAllowed] = useState(false)
  const [depositEnabled, setDepositEnabled] = useState(false)
  const [depositPercentage, setDepositPercentage] = useState("50")
  
  const [depositManualEnabled, setDepositManualEnabled] = useState(false)
  const [depositMpEnabled, setDepositMpEnabled] = useState(false)
  const [mpConnected, setMpConnected] = useState(false)

  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const res = await getServiceCheckoutSettingsAction(partnerId)
      if (res.success && res.settings) {
        setDepositFeatureAllowed(res.depositFeatureAllowed)
        setDepositEnabled(res.settings.depositEnabled)
        setDepositPercentage(String(res.settings.depositPercentage))
        setDepositManualEnabled(res.settings.depositManualEnabled)
        setDepositMpEnabled(res.settings.depositMpEnabled)
        setMpConnected(res.settings.mpConnected)
      }
      setLoading(false)
    })()
  }, [partnerId])

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      setIsScrolled(scrollContainerRef.current.scrollTop > 5)
    }
  }

  async function handleSave() {
    if (depositEnabled) {
      if (!depositManualEnabled && !depositMpEnabled) {
        notifyError("Selecione pelo menos um meio de recebimento do sinal (Mercado Pago ou Sinal Manual).")
        return
      }
      if (!mpConnected && !depositManualEnabled) {
        notifyError("O sinal manual é obrigatório já que a loja não possui conexão com o Mercado Pago.")
        return
      }
    }

    setSaving(true)
    const res = await updateServiceCheckoutSettingsAction({
      partnerId,
      depositEnabled: depositFeatureAllowed ? depositEnabled : false,
      depositPercentage: Number(depositPercentage) as 10 | 20 | 30 | 50,
      depositManualEnabled: depositEnabled ? depositManualEnabled : false,
      depositMpEnabled: depositEnabled ? depositMpEnabled : false,
    })
    setSaving(false)
    if (res.success) {
      notifySuccess("Configurações salvas com sucesso!")
    } else {
      notifyError(res.error || "Erro ao salvar")
    }
  }

  if (loading) {
    return <FadeIn className="p-6">Carregando configurações de serviços...</FadeIn>
  }

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden relative transition-colors duration-500 ease-in-out">
      <div 
        ref={scrollContainerRef} 
        onScroll={handleScroll} 
        className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth custom-scrollbar"
      >
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface transition-all duration-500 ease-in-out">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6">
            {/* Back button - desktop only */}
            <div className={`absolute -left-12 top-3 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
              <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0 flex items-center justify-center">
                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </Button>
            </div>

            {/* Title row */}
            <div className="hidden md:flex items-start justify-between mb-4">
              <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                  <span className="truncate">Serviços — Checkout</span>
                </h1>
                <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                  Gerencie a cobrança de entrada (sinal) no checkout de agendamentos
                </div>
              </div>

              {/* Desktop action buttons */}
              <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                <Button variant="outline" onClick={onBack} disabled={saving}>
                  Cancelar
                </Button>
                <Button
                  disabled={saving}
                  onClick={handleSave}
                >
                  <SaveIcon className="w-5 h-5 mr-2" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="max-w-[1300px] mx-auto p-4 md:p-8 pt-6">
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
              className="mb-6"
            />
          )}

          <div className="grid grid-cols-12 gap-y-8 lg:gap-y-0 relative">
            {/* Left Column */}
            <div className="col-span-12 lg:col-span-8 pr-0 lg:pr-12 space-y-12">
              <FormSection title="Entrada (down payment)">
                <div className="space-y-6">
                  <div className="flex items-center justify-between py-3">
                    <div>
                      <p className="font-medium text-brand-dark dark:text-dark-heading">Permitir entrada</p>
                      <p className="text-xs text-brand-inactive-text">Cliente pode pagar apenas o sinal no checkout</p>
                    </div>
                    <Switch
                      checked={depositEnabled && depositFeatureAllowed}
                      onCheckedChange={(v) => {
                        if (depositFeatureAllowed) {
                          setDepositEnabled(v)
                          if (v) {
                            if (!depositManualEnabled && !depositMpEnabled) {
                              setDepositManualEnabled(true)
                              if (mpConnected) setDepositMpEnabled(true)
                            }
                          }
                        }
                      }}
                      disabled={!depositFeatureAllowed}
                    />
                  </div>
                  
                  {depositEnabled && (
                    <FormDropdown
                      label="Percentual da entrada"
                      value={depositPercentage}
                      setValue={setDepositPercentage}
                      options={DEPOSIT_OPTIONS}
                      disabled={!depositEnabled || !depositFeatureAllowed}
                    />
                  )}
                </div>
              </FormSection>
            </div>

            {/* Right Column / SidebarCard */}
            <div className="col-span-12 lg:col-span-4 pl-0 lg:pl-12 border-l-0 lg:border-l border-brand-border dark:border-dark-border mt-8 lg:mt-0 space-y-6">
              <SidebarCard hasTopStrip>
                <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-4 mt-2">Meios de recebimento</h3>
                <p className="text-xs text-brand-inactive-text mb-6">
                  Selecione as formas de pagamento disponíveis para o sinal dos agendamentos.
                </p>
                
                <div className="space-y-6">
                  {/* Mercado Pago (Online) */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading">Sinal Online (Mercado Pago)</p>
                      {mpConnected ? (
                        <p className="text-xs text-brand-green font-medium">Conectado</p>
                      ) : (
                        <p className="text-xs text-amber-500 font-medium">Requer conexão nas integrações</p>
                      )}
                    </div>
                    <Switch
                      checked={depositMpEnabled && mpConnected && depositEnabled}
                      onCheckedChange={(v) => {
                        if (mpConnected && depositEnabled) {
                          setDepositMpEnabled(v)
                          if (!v && !depositManualEnabled) {
                            setDepositManualEnabled(true)
                          }
                        }
                      }}
                      disabled={!mpConnected || !depositEnabled}
                    />
                  </div>

                  {/* Sinal Manual (Pix) */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm text-brand-dark dark:text-dark-heading">Sinal Manual (Pix)</p>
                      <p className="text-xs text-brand-inactive-text">Gera QR Code Pix com chave padrão do parceiro</p>
                    </div>
                    <Switch
                      checked={depositManualEnabled && depositEnabled}
                      onCheckedChange={(v) => {
                        if (depositEnabled) {
                          if (!mpConnected && !v) {
                            notifyError("O Sinal Manual é obrigatório pois a loja não está conectada ao Mercado Pago.")
                            return
                          }
                          if (!v && !depositMpEnabled) {
                            notifyError("Selecione pelo menos um meio de recebimento do sinal (Mercado Pago ou Sinal Manual).")
                            return
                          }
                          setDepositManualEnabled(v)
                        }
                      }}
                      disabled={!depositEnabled}
                    />
                  </div>
                </div>
              </SidebarCard>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-dark-surface border-t border-brand-border dark:border-dark-border px-4 py-3 flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12" disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSave} className="flex-1 h-12" disabled={saving}>
          Salvar
        </Button>
      </div>
    </FadeIn>
  )
}
