"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { FadeIn } from "@/components/animations/FadeIn"
import { Button, Checkbox, FormDropdown, Input, ListItem } from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon, TargetIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { upsertSalesGoalAction } from "@/app/actions/erp/goals"

type GoalMode = "create" | "edit" | "duplicate"

type GoalFormPageProps = {
  partnerId: string
  mode: GoalMode
  sellers: Array<{ id: string; name: string }>
  accounts: Array<{ id: string; name: string; type: string }>
  initialGoal?: any | null
}

export default function GoalFormPage({ partnerId, mode, sellers, accounts, initialGoal }: GoalFormPageProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    id: mode === "edit" ? String(initialGoal?.id || "") : "",
    name:
      mode === "duplicate"
        ? `${String(initialGoal?.name || "Meta")} (cópia)`
        : String(initialGoal?.name || ""),
    periodType: (initialGoal?.period_type || "monthly") as "monthly" | "weekly",
    startDate: String(initialGoal?.start_date || ""),
    endDate: String(initialGoal?.end_date || ""),
    targetAmount: String(initialGoal?.target_amount || "0"),
    bonusType: (initialGoal?.bonus_type || "fixed") as "fixed" | "percentage",
    bonusValue: String(initialGoal?.bonus_value || "0"),
    appliesTo: (initialGoal?.applies_to || "all") as "all" | "user",
    assignedUserIds: Array.isArray(initialGoal?.assigned_user_ids)
      ? (initialGoal.assigned_user_ids as string[])
      : initialGoal?.user_id
        ? [String(initialGoal.user_id)]
        : [],
    goalType: (initialGoal?.goal_type || "sales") as "sales" | "service_orders" | "both",
    autoLaunchBonus: Boolean(initialGoal?.auto_launch_bonus),
    bonusAccountId: String(initialGoal?.bonus_account_id || ""),
  })

  const pageTitle = mode === "edit" ? "Editar meta" : mode === "duplicate" ? "Duplicar meta" : "Nova meta"

  const assignedSellerNames = useMemo(
    () => sellers.filter((s) => form.assignedUserIds.includes(s.id)).map((s) => s.name),
    [sellers, form.assignedUserIds],
  )

  const toggleSeller = (sellerId: string) => {
    setForm((prev) => {
      const exists = prev.assignedUserIds.includes(sellerId)
      return {
        ...prev,
        assignedUserIds: exists
          ? prev.assignedUserIds.filter((id) => id !== sellerId)
          : [...prev.assignedUserIds, sellerId],
      }
    })
  }

  const save = async () => {
    if (!form.name.trim()) return toast({ title: "Erro", description: "Informe o nome da meta.", variant: "destructive" })
    if (!form.startDate || !form.endDate) return toast({ title: "Erro", description: "Informe as datas.", variant: "destructive" })
    if (Number(form.targetAmount) <= 0) return toast({ title: "Erro", description: "A meta deve ser maior que zero.", variant: "destructive" })
    if (form.appliesTo === "user" && form.assignedUserIds.length === 0) {
      return toast({ title: "Erro", description: "Selecione ao menos um vendedor.", variant: "destructive" })
    }
    if (form.autoLaunchBonus && !form.bonusAccountId) {
      return toast({ title: "Erro", description: "Selecione a conta para lançar o bônus.", variant: "destructive" })
    }

    setSaving(true)
    const res = await upsertSalesGoalAction({
      id: mode === "edit" ? form.id : undefined,
      partnerId,
      name: form.name,
      periodType: form.periodType,
      startDate: form.startDate,
      endDate: form.endDate,
      targetAmount: Number(form.targetAmount || 0),
      bonusType: form.bonusType,
      bonusValue: Number(form.bonusValue || 0),
      appliesTo: form.appliesTo,
      userId: form.appliesTo === "user" ? form.assignedUserIds[0] || null : null,
      assignedUserIds: form.appliesTo === "user" ? form.assignedUserIds : [],
      goalType: form.goalType,
      autoLaunchBonus: form.autoLaunchBonus,
      bonusAccountId: form.autoLaunchBonus ? form.bonusAccountId || null : null,
    })
    setSaving(false)

    if (!res.success) {
      toast({ title: "Erro", description: res.error, variant: "destructive" })
      return
    }

    toast({ title: "Sucesso", description: mode === "edit" ? "Meta atualizada." : "Meta criada." })
    router.push("/erp/goals")
    router.refresh()
  }

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden">
        <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b">
          <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">
            <div className="absolute -left-12 top-7 h-full hidden xl:flex justify-center">
              <Button variant="filled" onClick={() => router.push("/erp/goals")} className="w-10 h-10 p-0 flex items-center justify-center">
                <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
              </Button>
            </div>
            <div className="hidden md:flex items-start justify-between">
              <div className="flex flex-col gap-1 min-w-0">
                <h1 className="font-bold text-xl md:text-3xl text-brand-dark dark:text-dark-heading">{pageTitle}</h1>
                <div className="text-brand-inactive-text dark:text-dark-body text-[15px] font-medium">
                  Configure regra, vendedores e lançamento de bônus.
                </div>
              </div>
              <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                <Button variant="outline" onClick={() => router.push("/erp/goals")} disabled={saving}>Cancelar</Button>
                <Button onClick={save} disabled={saving}>
                  <SaveIcon className="w-5 h-5 mr-2" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8">
          <div className="px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px]">
            <div className="grid grid-cols-12 gap-y-8 md:gap-y-0">
              <div className="col-span-12 xl:col-span-8 pr-0 xl:pr-12 space-y-8">
                <section>
                  <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Dados da meta</h3>
                  <div className="grid grid-cols-12 gap-5">
                    <div className="col-span-12">
                      <Input label="Nome da meta" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <FormDropdown label="Tipo de meta" value={form.goalType} setValue={(v) => setForm((p) => ({ ...p, goalType: v as any }))} options={[
                        { value: "sales", label: "Apenas Vendas" },
                        { value: "service_orders", label: "Apenas Ordens de Serviço" },
                        { value: "both", label: "Vendas e Ordens de Serviço" },
                      ]} />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <FormDropdown label="Recorrência" value={form.periodType} setValue={(v) => setForm((p) => ({ ...p, periodType: v as any }))} options={[
                        { value: "monthly", label: "Mensal" },
                        { value: "weekly", label: "Semanal" },
                      ]} />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <Input label="Início" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <Input label="Fim" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
                    </div>
                    <div className="col-span-12 md:col-span-6">
                      <Input label="Valor alvo (R$)" value={form.targetAmount} onChange={(e) => setForm((p) => ({ ...p, targetAmount: e.target.value }))} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <FormDropdown label="Tipo de bônus" value={form.bonusType} setValue={(v) => setForm((p) => ({ ...p, bonusType: v as any }))} options={[
                        { value: "fixed", label: "Fixo (R$)" },
                        { value: "percentage", label: "Percentual (%)" },
                      ]} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <Input label="Valor do bônus" value={form.bonusValue} onChange={(e) => setForm((p) => ({ ...p, bonusValue: e.target.value }))} />
                    </div>
                  </div>
                </section>

                <div className="border-t border-brand-border dark:border-dark-border w-full" />

                <section>
                  <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Abrangência</h3>
                  <div className="space-y-4">
                    <FormDropdown label="Aplicar para" value={form.appliesTo} setValue={(v) => setForm((p) => ({ ...p, appliesTo: v as any }))} options={[
                      { value: "all", label: "Todos os vendedores" },
                      { value: "user", label: "Vendedores específicos" },
                    ]} />
                    {form.appliesTo === "user" && (
                      <div className="space-y-3">
                        {sellers.map((seller) => (
                          <ListItem
                            key={seller.id}
                            title={seller.name}
                            onClick={() => toggleSeller(seller.id)}
                            right={
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={form.assignedUserIds.includes(seller.id)} onChange={() => toggleSeller(seller.id)} />
                              </div>
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </section>

                <div className="border-t border-brand-border dark:border-dark-border w-full" />

                <section>
                  <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Bônus no financeiro</h3>
                  <label className="flex items-start gap-3">
                    <Checkbox checked={form.autoLaunchBonus} onChange={(v) => setForm((p) => ({ ...p, autoLaunchBonus: Boolean(v) }))} />
                    <div>
                      <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Lançar bônus no financeiro automaticamente</p>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body">Quando a meta for batida, cria despesa na categoria Metas e Bônus.</p>
                    </div>
                  </label>
                  {form.autoLaunchBonus && (
                    <div className="mt-4">
                      <FormDropdown
                        label="Conta para lançamento"
                        value={form.bonusAccountId}
                        setValue={(v) => setForm((p) => ({ ...p, bonusAccountId: v }))}
                        options={accounts.map((a) => ({ value: a.id, label: a.name }))}
                      />
                    </div>
                  )}
                </section>
              </div>

              <div className="col-span-12 xl:col-span-4 pl-0 xl:pl-12 space-y-6 border-0 xl:border-l border-brand-border dark:border-dark-border">
                <div className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-brand-dark dark:bg-dark-border rounded-t-2xl" />
                  <div className="w-14 h-14 rounded-full bg-brand-gray dark:bg-dark-border flex items-center justify-center mb-4">
                    <TargetIcon className="w-6 h-6 text-brand-dark dark:text-dark-heading" />
                  </div>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body">Nome da meta</p>
                  <p className="font-bold text-brand-dark dark:text-dark-heading">{form.name || "-"}</p>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4">Período</p>
                  <p className="font-bold text-brand-dark dark:text-dark-heading">{form.startDate || "-"} até {form.endDate || "-"}</p>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4">Valor alvo</p>
                  <p className="font-bold text-brand-green">{formatCurrency(Number(form.targetAmount || 0))}</p>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4">Pago para</p>
                  <p className="font-bold text-brand-dark dark:text-dark-heading">
                    {form.appliesTo === "all" ? "Todos os vendedores" : (assignedSellerNames.join(", ") || "-")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </FadeIn>
  )
}
