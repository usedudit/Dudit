"use client"

import { useEffect, useMemo, useState } from "react"
import { Button, DefaultModal, Input, InfoCard, FormTextarea } from "@/components/reusable"
import { Switch } from "@/components/reusable/Switch"
import { toast } from "@/hooks/use-notification"
import { getERPDeliveryDriversAction, updateERPDeliveryDriverAction } from "@/app/actions/erp/deliveries"

type DriverRow = {
  id: string
  name: string
  active: boolean
  phone: string
  notes: string
  currentDeliveries: number
  completedDeliveries: number
  avgDeliveryMinutes: number
}

export default function DriversPage({ partnerId }: { partnerId: string }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<DriverRow[]>([])
  const [selected, setSelected] = useState<DriverRow | null>(null)
  const [saving, setSaving] = useState(false)

  const reload = async () => {
    setLoading(true)
    const res = await getERPDeliveryDriversAction(partnerId)
    if (res.success) setItems(res.items || [])
    setLoading(false)
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId])

  const stats = useMemo(() => {
    const active = items.filter((d) => d.active).length
    const total = items.length
    const current = items.reduce((sum, d) => sum + Number(d.currentDeliveries || 0), 0)
    return { active, total, current }
  }, [items])

  if (loading) {
    return <div className="text-sm text-brand-inactive-text">Carregando entregadores...</div>
  }

  return (
    <div className="max-w-[1300px] mx-auto space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard color="gray" title="Entregadores" message={String(stats.total)} />
        <InfoCard color="green" title="Ativos" message={String(stats.active)} />
        <InfoCard color="blue" title="Entregas em andamento" message={String(stats.current)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {items.map((d) => (
          <button
            key={d.id}
            type="button"
            className="text-left rounded-2xl border border-brand-border dark:border-dark-border bg-white dark:bg-dark-surface p-5 hover:border-brand-dark/30 transition-colors"
            onClick={() => setSelected(d)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading truncate">{d.name}</div>
                <div className="text-xs text-brand-inactive-text dark:text-dark-body">
                  {d.active ? "Ativo" : "Inativo"} {d.phone ? `• ${d.phone}` : ""}
                </div>
              </div>
              <div className="text-xs font-bold text-brand-dark dark:text-dark-heading shrink-0">
                {d.avgDeliveryMinutes ? `${d.avgDeliveryMinutes} min` : "-"}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-brand-inactive-text">Em andamento</div>
                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{d.currentDeliveries}</div>
              </div>
              <div>
                <div className="text-xs text-brand-inactive-text">Concluídas</div>
                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{d.completedDeliveries}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <DefaultModal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Editar entregador"
        maxWidth="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!selected) return
                setSaving(true)
                const res = await updateERPDeliveryDriverAction({
                  partnerId,
                  driverPartnerUserId: selected.id,
                  phone: selected.phone,
                  notes: selected.notes,
                  active: selected.active,
                })
                setSaving(false)
                if (res.success) {
                  toast.success("Entregador atualizado.")
                  setSelected(null)
                  await reload()
                } else {
                  toast.error(res.error || "Erro ao atualizar entregador.")
                }
              }}
              disabled={saving || !selected}
            >
              {saving ? "Salvando..." : "Salvar"}
            </Button>
          </>
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-brand-border dark:border-dark-border p-4">
              <div>
                <div className="text-sm font-bold text-brand-dark dark:text-dark-heading">{selected.name}</div>
                <div className="text-xs text-brand-inactive-text">Ativo para receber entregas</div>
              </div>
              <Switch
                checked={selected.active}
                onCheckedChange={(checked) => setSelected((prev) => (prev ? { ...prev, active: checked } : prev))}
              />
            </div>

            <Input
              label="Telefone"
              value={selected.phone}
              onChange={(e) => setSelected((prev) => (prev ? { ...prev, phone: e.target.value } : prev))}
              placeholder="(11) 99999-9999"
            />
            <FormTextarea
              label="Observações"
              name="notes"
              value={selected.notes}
              onChange={(e) => setSelected((prev) => (prev ? { ...prev, notes: e.target.value } : prev))}
              placeholder="Ex.: veículo, horários, preferências..."
            />
          </div>
        ) : null}
      </DefaultModal>
    </div>
  )
}

