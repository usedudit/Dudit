"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button, Badge } from "@/components/reusable"
import { PlusIcon } from "@/lib/icons"
import { useToast } from "@/hooks/use-toast"
import { usePermissions } from "@/lib/permission-context"
import {
  createRecurringPlanAction,
  getRecurringPlanFormDataAction,
  listRecurringPlansAction,
  updateRecurringPlanAction,
} from "@/app/actions/erp/recurring-plans"
import type { RecurringPlan, RecurringPlanItem, RecurringFrequencyType } from "@/lib/types/recurring"
import { getRecurringFrequencyLabel } from "@/lib/types/recurring"
import { formatFullDate } from "@/lib/utils"

type FormData = {
  products: Array<{ id: string; name: string; price: number }>
  services: Array<{ id: string; name: string; price: number; duration_minutes?: number }>
  staff: Array<{ id: string; display_name: string }>
}

const EMPTY_ITEM: RecurringPlanItem = {
  itemType: "product",
  productId: null,
  variantId: null,
  serviceId: null,
  quantity: 1,
  unitPrice: null,
  staffPartnerUserId: null,
  preferredTime: null,
  durationMinutes: null,
}

export default function RecurringPlansPage({
  partnerId,
  initialPlans,
  initialHasMore,
  initialNextCursor,
}: {
  partnerId: string
  initialPlans: RecurringPlan[]
  initialHasMore: boolean
  initialNextCursor: string | null
}) {
  const { toast } = useToast()
  const { canCreate, canEdit } = usePermissions()
  const canManage = canCreate("recurring_plans") || canEdit("recurring_plans")

  const [plans, setPlans] = useState(initialPlans)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [mode, setMode] = useState<"list" | "form">("list")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<FormData>({ products: [], services: [], staff: [] })
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "active" as "active" | "inactive" | "archived",
    frequencyType: "monthly" as RecurringFrequencyType,
    frequencyInterval: 1,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: "",
    showInMarketplace: true,
    items: [{ ...EMPTY_ITEM }] as RecurringPlanItem[],
  })

  useEffect(() => {
    if (mode === "form") {
      getRecurringPlanFormDataAction(partnerId).then((res) => {
        if (res.success && res.data) setFormData(res.data as FormData)
      })
    }
  }, [mode, partnerId])

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    const res = await listRecurringPlansAction(partnerId, { cursor: nextCursor })
    setLoadingMore(false)
    if (res.success && res.data) {
      setPlans((prev) => [...prev, ...res.data.items])
      setHasMore(res.data.hasMore)
      setNextCursor(res.data.nextCursor)
    }
  }, [partnerId, nextCursor, loadingMore])

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      status: "active",
      frequencyType: "monthly",
      frequencyInterval: 1,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      showInMarketplace: true,
      items: [{ ...EMPTY_ITEM }],
    })
    setEditingId(null)
  }

  const openCreate = () => {
    resetForm()
    setMode("form")
  }

  const openEdit = (plan: RecurringPlan & { items?: RecurringPlanItem[] }) => {
    setEditingId(plan.id)
    setForm({
      name: plan.name,
      description: plan.description || "",
      status: plan.status,
      frequencyType: plan.frequencyType,
      frequencyInterval: plan.frequencyInterval,
      startDate: plan.startDate.slice(0, 10),
      endDate: plan.endDate?.slice(0, 10) || "",
      showInMarketplace: plan.showInMarketplace,
      items: (plan.items || []).map((item) => ({
        itemType: item.itemType,
        productId: item.productId,
        variantId: item.variantId,
        serviceId: item.serviceId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        staffPartnerUserId: item.staffPartnerUserId,
        preferredTime: item.preferredTime,
        durationMinutes: item.durationMinutes,
      })),
    })
    setMode("form")
  }

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      partnerId,
      name: form.name,
      description: form.description || null,
      status: form.status,
      frequencyType: form.frequencyType,
      frequencyInterval: form.frequencyInterval,
      startDate: `${form.startDate}T12:00:00.000Z`,
      endDate: form.endDate ? `${form.endDate}T23:59:59.000Z` : null,
      showInMarketplace: form.showInMarketplace,
      items: form.items,
    }

    const res = editingId
      ? await updateRecurringPlanAction({ ...payload, planId: editingId })
      : await createRecurringPlanAction(payload)

    setSaving(false)
    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }

    toast({ title: editingId ? "Plano atualizado" : "Plano criado" })
    const listRes = await listRecurringPlansAction(partnerId)
    if (listRes.success && listRes.data) {
      setPlans(listRes.data.items)
      setHasMore(listRes.data.hasMore)
      setNextCursor(listRes.data.nextCursor)
    }
    setMode("list")
    resetForm()
  }

  const statusVariant = useMemo(() => ({
    active: "success" as const,
    inactive: "warning" as const,
    archived: "secondary" as const,
  }), [])

  if (mode === "form") {
    return (
      <div className="space-y-6 max-w-3xl">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{editingId ? "Editar plano" : "Novo plano recorrente"}</h2>
          <Button variant="outline" onClick={() => { setMode("list"); resetForm() }}>Voltar</Button>
        </div>

        <div className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm font-medium">Nome</span>
            <input className="border rounded-lg px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm font-medium">Descrição</span>
            <textarea className="border rounded-lg px-3 py-2 min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Frequência</span>
              <select className="border rounded-lg px-3 py-2" value={form.frequencyType} onChange={(e) => setForm({ ...form, frequencyType: e.target.value as RecurringFrequencyType })}>
                <option value="daily">Diária</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
                <option value="custom">Personalizada</option>
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Intervalo</span>
              <input type="number" min={1} className="border rounded-lg px-3 py-2" value={form.frequencyInterval} onChange={(e) => setForm({ ...form, frequencyInterval: Number(e.target.value) })} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Status</span>
              <select className="border rounded-lg px-3 py-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
                <option value="active">Ativo</option>
                <option value="inactive">Inativo</option>
                <option value="archived">Arquivado</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Início</span>
              <input type="date" className="border rounded-lg px-3 py-2" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">Fim (opcional)</span>
              <input type="date" className="border rounded-lg px-3 py-2" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.showInMarketplace} onChange={(e) => setForm({ ...form, showInMarketplace: e.target.checked })} />
            Exibir no marketplace
          </label>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Itens do plano</h3>
            <Button variant="outline" size="sm" onClick={() => setForm({ ...form, items: [...form.items, { ...EMPTY_ITEM }] })}>Adicionar item</Button>
          </div>
          {form.items.map((item, index) => (
            <div key={index} className="border rounded-xl p-4 grid gap-3">
              <select className="border rounded-lg px-3 py-2" value={item.itemType} onChange={(e) => {
                const items = [...form.items]
                items[index] = { ...EMPTY_ITEM, itemType: e.target.value as "product" | "service" }
                setForm({ ...form, items })
              }}>
                <option value="product">Produto</option>
                <option value="service">Serviço</option>
              </select>
              {item.itemType === "product" ? (
                <select className="border rounded-lg px-3 py-2" value={item.productId || ""} onChange={(e) => {
                  const items = [...form.items]
                  items[index] = { ...items[index], productId: e.target.value }
                  setForm({ ...form, items })
                }}>
                  <option value="">Selecione um produto</option>
                  {formData.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              ) : (
                <>
                  <select className="border rounded-lg px-3 py-2" value={item.serviceId || ""} onChange={(e) => {
                    const items = [...form.items]
                    items[index] = { ...items[index], serviceId: e.target.value }
                    setForm({ ...form, items })
                  }}>
                    <option value="">Selecione um serviço</option>
                    {formData.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <select className="border rounded-lg px-3 py-2" value={item.staffPartnerUserId || ""} onChange={(e) => {
                    const items = [...form.items]
                    items[index] = { ...items[index], staffPartnerUserId: e.target.value }
                    setForm({ ...form, items })
                  }}>
                    <option value="">Profissional</option>
                    {formData.staff.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
                  </select>
                  <input type="time" className="border rounded-lg px-3 py-2" value={(item.preferredTime || "").slice(0, 5)} onChange={(e) => {
                    const items = [...form.items]
                    items[index] = { ...items[index], preferredTime: `${e.target.value}:00` }
                    setForm({ ...form, items })
                  }} />
                </>
              )}
              <input type="number" min={0.001} step={1} className="border rounded-lg px-3 py-2" placeholder="Quantidade" value={item.quantity} onChange={(e) => {
                const items = [...form.items]
                items[index] = { ...items[index], quantity: Number(e.target.value) }
                setForm({ ...form, items })
              }} />
            </div>
          ))}
        </div>

        {canManage && (
          <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar plano"}</Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Planos recorrentes</h2>
          <p className="text-sm text-muted-foreground">Configure planos que geram pedidos e agendamentos automaticamente.</p>
        </div>
        {canManage && (
          <Button onClick={openCreate}><PlusIcon className="w-4 h-4 mr-2" />Novo plano</Button>
        )}
      </div>

      <div className="grid gap-3">
        {plans.length === 0 ? (
          <div className="border rounded-xl p-8 text-center text-muted-foreground">Nenhum plano cadastrado.</div>
        ) : plans.map((plan) => (
          <div key={plan.id} className="border rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">{plan.name}</h3>
                <Badge variant={statusVariant[plan.status]}>{plan.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {getRecurringFrequencyLabel(plan.frequencyType, plan.frequencyInterval)} · Início {formatFullDate(plan.startDate)}
              </p>
              {plan.description && <p className="text-sm mt-2">{plan.description}</p>}
            </div>
            {canManage && (
              <Button variant="outline" onClick={() => openEdit(plan as RecurringPlan & { items?: RecurringPlanItem[] })}>Editar</Button>
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "Carregando..." : "Carregar mais"}
        </Button>
      )}
    </div>
  )
}
