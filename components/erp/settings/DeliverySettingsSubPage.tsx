"use client"

import { useEffect, useMemo, useState } from "react"
import { Button, Input, ListItem, FormDropdown, InfoCard } from "@/components/reusable"
import { ChevronLeftIcon, TruckIcon, ClockIcon, PlusIcon } from "@/lib/icons"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  deleteDeliveryFeeRuleAction,
  getPartnerDeliveryConfigAction,
  upsertDeliveryFeeRuleAction,
  upsertPartnerDeliveryConfigAction,
} from "@/app/actions/shared/delivery"

export function DeliverySettingsSubPage({ partnerId, onBack }: { partnerId: string; onBack: () => void }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [planSlug, setPlanSlug] = useState("free")
  const [advancedEnabled, setAdvancedEnabled] = useState(false)
  const [settings, setSettings] = useState({
    baseFee: "0",
    includedKm: "0",
    extraKmPrice: "0",
    maxDeliveryKm: "",
    isDeliveryEnabled: true,
  })
  const [rules, setRules] = useState<any[]>([])
  const [newRule, setNewRule] = useState({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })

  const isFree = planSlug === "free"
  const isVendedor = planSlug === "vendedor"

  async function reload() {
    setLoading(true)
    const res = await getPartnerDeliveryConfigAction(partnerId)
    if (res.success) {
      setPlanSlug(res.planSlug)
      setAdvancedEnabled(res.capability.advancedEnabled)
      setSettings({
        baseFee: String(res.settings.baseFee || 0),
        includedKm: String(res.settings.includedKm || 0),
        extraKmPrice: String(res.settings.extraKmPrice || 0),
        maxDeliveryKm: res.settings.maxDeliveryKm == null ? "" : String(res.settings.maxDeliveryKm),
        isDeliveryEnabled: Boolean(res.settings.isDeliveryEnabled),
      })
      setRules(res.rules || [])
    }
    setLoading(false)
  }

  useEffect(() => { void reload() }, [partnerId])

  const upgradeHint = useMemo(
    () => isVendedor ? "Desbloqueie cálculo por distância e horários com o plano Crescer" : null,
    [isVendedor]
  )

  if (loading) return <FadeIn className="p-6">Carregando configurações de entrega...</FadeIn>

  return (
    <FadeIn className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
      <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b border-brand-border dark:border-dark-border">
        <div className="max-w-[1300px] mx-auto px-4 md:px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="filled" onClick={onBack} className="w-10 h-10 p-0"><ChevronLeftIcon className="w-5 h-5" /></Button>
            <div>
              <h1 className="text-xl md:text-3xl font-bold text-brand-dark dark:text-dark-heading">Entrega</h1>
              <p className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">Configure taxas e regras de entrega</p>
            </div>
          </div>
          <Button
            disabled={saving || isFree}
            onClick={async () => {
              setSaving(true)
              await upsertPartnerDeliveryConfigAction({
                partnerId,
                settings: {
                  baseFee: Number(settings.baseFee || 0),
                  includedKm: Number(settings.includedKm || 0),
                  extraKmPrice: Number(settings.extraKmPrice || 0),
                  maxDeliveryKm: settings.maxDeliveryKm ? Number(settings.maxDeliveryKm) : null,
                  isDeliveryEnabled: settings.isDeliveryEnabled,
                },
              })
              await reload()
              setSaving(false)
            }}
          >
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </div>

      <div className="max-w-[1300px] mx-auto w-full px-4 md:px-6 py-6 overflow-y-auto space-y-6">
        {isFree && <InfoCard color="yellow" title="Plano Free" message="O recurso de entrega está indisponível neste plano." />}
        {upgradeHint && <InfoCard color="blue" title="Disponível no plano Crescer" message={`${upgradeHint} - Faça upgrade em Assinatura.`} />}

        <div className="rounded-2xl border border-brand-border p-5 dark:border-dark-border">
          <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-3">Taxa base</h3>
          <Input label="Taxa base" value={settings.baseFee} onChange={(e) => setSettings((s) => ({ ...s, baseFee: e.target.value }))} />
        </div>

        <div className="rounded-2xl border border-brand-border p-5 dark:border-dark-border">
          <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-3">Distância</h3>
          {!advancedEnabled && <p className="text-sm text-brand-inactive-text mb-3">Disponível no plano Crescer</p>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input disabled={!advancedEnabled} label="KM incluído" value={settings.includedKm} onChange={(e) => setSettings((s) => ({ ...s, includedKm: e.target.value }))} />
            <Input disabled={!advancedEnabled} label="Preço por KM extra" value={settings.extraKmPrice} onChange={(e) => setSettings((s) => ({ ...s, extraKmPrice: e.target.value }))} />
            <Input disabled={!advancedEnabled} label="Distância máxima (km)" value={settings.maxDeliveryKm} onChange={(e) => setSettings((s) => ({ ...s, maxDeliveryKm: e.target.value }))} />
          </div>
        </div>

        <div className="rounded-2xl border border-brand-border p-5 dark:border-dark-border">
          <h3 className="font-bold text-brand-dark dark:text-dark-heading mb-3">Regras por horário</h3>
          {!advancedEnabled && <p className="text-sm text-brand-inactive-text">Disponível no plano Crescer</p>}
          {advancedEnabled && (
            <div className="space-y-3">
              {rules.map((rule) => (
                <ListItem
                  key={rule.id}
                  icon={ClockIcon}
                  title={`${rule.startTime} - ${rule.endTime}`}
                  description={`${rule.type === "fixed" ? "Fixo" : "Multiplicador"}: ${rule.value}`}
                  right={<Button variant="ghost" onClick={async () => { await deleteDeliveryFeeRuleAction(partnerId, rule.id); await reload() }}>Remover</Button>}
                />
              ))}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input label="Início" value={newRule.startTime} onChange={(e) => setNewRule((r) => ({ ...r, startTime: e.target.value }))} />
                <Input label="Fim" value={newRule.endTime} onChange={(e) => setNewRule((r) => ({ ...r, endTime: e.target.value }))} />
                <FormDropdown
                  label="Tipo"
                  value={newRule.type}
                  setValue={(value) => setNewRule((r) => ({ ...r, type: value }))}
                  options={[{ value: "fixed", label: "Fixo" }, { value: "multiplier", label: "Multiplicador" }]}
                />
                <Input label="Valor" value={newRule.value} onChange={(e) => setNewRule((r) => ({ ...r, value: e.target.value }))} />
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await upsertDeliveryFeeRuleAction({
                    partnerId,
                    rule: {
                      startTime: newRule.startTime,
                      endTime: newRule.endTime,
                      type: newRule.type as "fixed" | "multiplier",
                      value: Number(newRule.value || 0),
                      isActive: true,
                    },
                  })
                  setNewRule({ startTime: "18:00", endTime: "22:00", type: "fixed", value: "0" })
                  await reload()
                }}
              >
                <PlusIcon className="w-4 h-4 mr-2" /> Adicionar regra
              </Button>
            </div>
          )}
        </div>

        <ListItem
          icon={TruckIcon}
          title="Entrega ativa"
          description={settings.isDeliveryEnabled ? "Clientes podem selecionar entrega" : "Entrega desativada"}
          right={<Button variant={settings.isDeliveryEnabled ? "outline" : "filled"} disabled={isFree} onClick={() => setSettings((s) => ({ ...s, isDeliveryEnabled: !s.isDeliveryEnabled }))}>{settings.isDeliveryEnabled ? "Desativar" : "Ativar"}</Button>}
        />
      </div>
    </FadeIn>
  )
}
