"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { FadeIn } from "@/components/animations/FadeIn"
import {
  AlertModal,
  Button,
  Checkbox,
  Combobox,
  DefaultModal,
  FormDropdown,
  Input,
  ListItem,
  MoneyInput,
  UnsavedChangesDialog,
} from "@/components/reusable"
import { ChevronLeftIcon, PlusIcon, SaveIcon, TargetIcon } from "@/lib/icons"
import { formatCurrency } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import { upsertSalesGoalAction } from "@/app/actions/erp/goals"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { createFinanceAccountAction } from "@/app/actions/erp/finance-accounts"

type GoalMode = "create" | "edit" | "duplicate"
type FinanceAccountType = "cash" | "bank" | "wallet"

type FieldErrors = Partial<Record<"name" | "startDate" | "endDate" | "targetAmount" | "bonusValue" | "assignedUserIds" | "bonusAccountId", string>>

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
  const [showValidationModal, setShowValidationModal] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [accountOptions, setAccountOptions] = useState(accounts)
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [newAccountName, setNewAccountName] = useState("")
  const [newAccountNameError, setNewAccountNameError] = useState(false)
  const [newAccountType, setNewAccountType] = useState<FinanceAccountType>("bank")
  const [newAccountInitialBalance, setNewAccountInitialBalance] = useState(0)
  const [newAccountIsDefault, setNewAccountIsDefault] = useState(false)
  const [form, setForm] = useState({
    id: mode === "edit" ? String(initialGoal?.id || "") : "",
    name: mode === "duplicate" ? `${String(initialGoal?.name || "Meta")} (cópia)` : String(initialGoal?.name || ""),
    periodType: (initialGoal?.period_type || "monthly") as "monthly" | "weekly",
    startDate: String(initialGoal?.start_date || ""),
    endDate: String(initialGoal?.end_date || ""),
    targetAmount: Number(initialGoal?.target_amount || 0),
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

  const initialSnapshot = useMemo(
    () =>
      JSON.stringify({
        name: mode === "duplicate" ? `${String(initialGoal?.name || "Meta")} (cópia)` : String(initialGoal?.name || ""),
        periodType: String(initialGoal?.period_type || "monthly"),
        startDate: String(initialGoal?.start_date || ""),
        endDate: String(initialGoal?.end_date || ""),
        targetAmount: Number(initialGoal?.target_amount || 0),
        bonusType: String(initialGoal?.bonus_type || "fixed"),
        bonusValue: String(initialGoal?.bonus_value || "0"),
        appliesTo: String(initialGoal?.applies_to || "all"),
        assignedUserIds: Array.isArray(initialGoal?.assigned_user_ids)
          ? [...(initialGoal.assigned_user_ids as string[])].sort()
          : initialGoal?.user_id
            ? [String(initialGoal.user_id)]
            : [],
        goalType: String(initialGoal?.goal_type || "sales"),
        autoLaunchBonus: Boolean(initialGoal?.auto_launch_bonus),
        bonusAccountId: String(initialGoal?.bonus_account_id || ""),
      }),
    [initialGoal, mode],
  )

  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        ...form,
        assignedUserIds: [...form.assignedUserIds].sort(),
      }),
    [form],
  )

  const isDirty = currentSnapshot !== initialSnapshot
  const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

  const assignedSellerNames = useMemo(
    () => sellers.filter((seller) => form.assignedUserIds.includes(seller.id)).map((seller) => seller.name),
    [form.assignedUserIds, sellers],
  )

  const validationMessages = useMemo(() => Object.values(fieldErrors), [fieldErrors])

  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  const toggleSeller = (sellerId: string) => {
    setForm((prev) => {
      const exists = prev.assignedUserIds.includes(sellerId)
      return {
        ...prev,
        assignedUserIds: exists ? prev.assignedUserIds.filter((id) => id !== sellerId) : [...prev.assignedUserIds, sellerId],
      }
    })
    clearFieldError("assignedUserIds")
  }

  const validateForm = () => {
    const nextErrors: FieldErrors = {}

    if (!form.name.trim()) nextErrors.name = "Informe o nome da meta."
    if (!form.startDate) nextErrors.startDate = "Informe a data de início."
    if (!form.endDate) nextErrors.endDate = "Informe a data de fim."
    if (form.startDate && form.endDate && form.endDate < form.startDate) {
      nextErrors.endDate = "A data de fim deve ser maior ou igual à data de início."
    }
    if (Number(form.targetAmount || 0) <= 0) nextErrors.targetAmount = "A meta deve ser maior que zero."
    if (Number(form.bonusValue || 0) < 0) nextErrors.bonusValue = "O bônus não pode ser negativo."
    if (form.appliesTo === "user" && form.assignedUserIds.length === 0) {
      nextErrors.assignedUserIds = "Selecione ao menos um vendedor."
    }
    if (form.autoLaunchBonus && !form.bonusAccountId) {
      nextErrors.bonusAccountId = "Selecione a conta para lançamento."
    }

    setFieldErrors(nextErrors)
    return nextErrors
  }

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) {
      setNewAccountNameError(true)
      return
    }

    setIsSavingAccount(true)
    const result = await createFinanceAccountAction({
      partnerId,
      name: newAccountName,
      type: newAccountType,
      initialBalance: newAccountInitialBalance,
      isDefault: newAccountIsDefault,
    })
    setIsSavingAccount(false)

    if (!result.success) {
      toast({ title: "Erro", description: result.error, variant: "destructive" })
      return
    }

    const createdAccount = {
      id: String(result.data.id),
      name: String(result.data.name || newAccountName.trim()),
      type: String(result.data.type || newAccountType),
    }

    setAccountOptions((prev) => [...prev, createdAccount].sort((a, b) => a.name.localeCompare(b.name)))
    setForm((prev) => ({ ...prev, bonusAccountId: createdAccount.id }))
    setIsAccountModalOpen(false)
    setNewAccountName("")
    setNewAccountNameError(false)
    setNewAccountType("bank")
    setNewAccountInitialBalance(0)
    setNewAccountIsDefault(false)
    clearFieldError("bonusAccountId")
    toast({ title: "Sucesso", description: "Conta criada com sucesso." })
  }

  const save = async () => {
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setShowValidationModal(true)
      return
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
              <Button variant="filled" onClick={() => handleNavigation("/erp/goals")} className="w-10 h-10 p-0 flex items-center justify-center">
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
                <Button variant="outline" onClick={() => handleNavigation("/erp/goals")} disabled={saving}>
                  Cancelar
                </Button>
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
                <section className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border space-y-8">
                  <div>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Dados da meta</h3>
                    <div className="grid grid-cols-12 gap-5">
                      <div className="col-span-12">
                        <Input
                          label="Nome da meta"
                          value={form.name}
                          onChange={(e) => {
                            setForm((prev) => ({ ...prev, name: e.target.value }))
                            clearFieldError("name")
                          }}
                          error={Boolean(fieldErrors.name)}
                          errorMessage={fieldErrors.name}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <FormDropdown
                          label="Tipo de meta"
                          value={form.goalType}
                          setValue={(value) => setForm((prev) => ({ ...prev, goalType: value as typeof prev.goalType }))}
                          options={[
                            { value: "sales", label: "Apenas vendas" },
                            { value: "service_orders", label: "Apenas ordens de serviço" },
                            { value: "both", label: "Vendas e ordens de serviço" },
                          ]}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <FormDropdown
                          label="Recorrência"
                          value={form.periodType}
                          setValue={(value) => setForm((prev) => ({ ...prev, periodType: value as typeof prev.periodType }))}
                          options={[
                            { value: "monthly", label: "Mensal" },
                            { value: "weekly", label: "Semanal" },
                          ]}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <Input
                          label="Início"
                          type="date"
                          value={form.startDate}
                          onChange={(e) => {
                            setForm((prev) => ({ ...prev, startDate: e.target.value }))
                            clearFieldError("startDate")
                          }}
                          error={Boolean(fieldErrors.startDate)}
                          errorMessage={fieldErrors.startDate}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <Input
                          label="Fim"
                          type="date"
                          value={form.endDate}
                          onChange={(e) => {
                            setForm((prev) => ({ ...prev, endDate: e.target.value }))
                            clearFieldError("endDate")
                          }}
                          error={Boolean(fieldErrors.endDate)}
                          errorMessage={fieldErrors.endDate}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <MoneyInput
                          label="Valor alvo"
                          value={form.targetAmount}
                          onChange={(value) => {
                            setForm((prev) => ({ ...prev, targetAmount: value }))
                            clearFieldError("targetAmount")
                          }}
                          error={Boolean(fieldErrors.targetAmount)}
                          errorMessage={fieldErrors.targetAmount}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <FormDropdown
                          label="Tipo de bônus"
                          value={form.bonusType}
                          setValue={(value) => setForm((prev) => ({ ...prev, bonusType: value as typeof prev.bonusType }))}
                          options={[
                            { value: "fixed", label: "Fixo (R$)" },
                            { value: "percentage", label: "Percentual (%)" },
                          ]}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <Input
                          label="Valor do bônus"
                          value={form.bonusValue}
                          onChange={(e) => {
                            setForm((prev) => ({ ...prev, bonusValue: e.target.value }))
                            clearFieldError("bonusValue")
                          }}
                          error={Boolean(fieldErrors.bonusValue)}
                          errorMessage={fieldErrors.bonusValue}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-brand-border dark:border-dark-border w-full" />

                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Abrangência</h3>
                    <FormDropdown
                      label="Aplicar para"
                      value={form.appliesTo}
                      setValue={(value) => {
                        setForm((prev) => ({
                          ...prev,
                          appliesTo: value as typeof prev.appliesTo,
                          assignedUserIds: value === "all" ? [] : prev.assignedUserIds,
                        }))
                        clearFieldError("assignedUserIds")
                      }}
                      options={[
                        { value: "all", label: "Todos os vendedores" },
                        { value: "user", label: "Vendedores específicos" },
                      ]}
                    />
                    {form.appliesTo === "user" && (
                      <div className="space-y-3">
                        {sellers.map((seller) => (
                          <ListItem
                            key={seller.id}
                            title={seller.name}
                            description="Selecionar vendedor para esta meta"
                            className="px-4 py-3"
                            onClick={() => toggleSeller(seller.id)}
                            right={
                              <div onClick={(e) => e.stopPropagation()}>
                                <Checkbox checked={form.assignedUserIds.includes(seller.id)} onChange={() => toggleSeller(seller.id)} />
                              </div>
                            }
                          />
                        ))}
                        {fieldErrors.assignedUserIds && <p className="text-xs text-brand-red">{fieldErrors.assignedUserIds}</p>}
                      </div>
                    )}
                  </div>
                </section>

                <section className="bg-white dark:bg-dark-surface p-6 rounded-2xl border border-brand-border dark:border-dark-border">
                  <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Bônus no financeiro</h3>
                  <label className="flex items-start gap-3">
                    <Checkbox checked={form.autoLaunchBonus} onChange={(value) => setForm((prev) => ({ ...prev, autoLaunchBonus: Boolean(value) }))} />
                    <div>
                      <p className="text-sm font-bold text-brand-dark dark:text-dark-heading">Lançar bônus no financeiro automaticamente</p>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body">
                        Quando a meta for batida, cria uma despesa na categoria Metas e Bônus.
                      </p>
                    </div>
                  </label>
                  {form.autoLaunchBonus && (
                    <div className="mt-4">
                      <Combobox
                        label="Conta para lançamento"
                        options={accountOptions.map((account) => ({ value: account.id, label: account.name }))}
                        value={form.bonusAccountId}
                        onChange={(value) => {
                          setForm((prev) => ({ ...prev, bonusAccountId: value }))
                          clearFieldError("bonusAccountId")
                        }}
                        actionItem={{
                          label: "Criar nova conta",
                          icon: <PlusIcon className="w-4 h-4" />,
                          onClick: () => setIsAccountModalOpen(true),
                        }}
                        error={Boolean(fieldErrors.bonusAccountId)}
                      />
                      {fieldErrors.bonusAccountId && <p className="text-xs text-brand-red mt-1">{fieldErrors.bonusAccountId}</p>}
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
                  <p className="font-bold text-brand-dark dark:text-dark-heading">
                    {form.startDate || "-"} até {form.endDate || "-"}
                  </p>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4">Valor alvo</p>
                  <p className="font-bold text-brand-green">{formatCurrency(Number(form.targetAmount || 0))}</p>
                  <p className="text-sm text-brand-inactive-text dark:text-dark-body mt-4">Abrangência</p>
                  <p className="font-bold text-brand-dark dark:text-dark-heading">
                    {form.appliesTo === "all" ? "Todos os vendedores" : assignedSellerNames.join(", ") || "-"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DefaultModal
        isOpen={isAccountModalOpen}
        onClose={() => {
          if (!isSavingAccount) setIsAccountModalOpen(false)
        }}
        title="Nova conta"
        footer={
          <div className="flex justify-end gap-3 w-full">
            <Button variant="outline" onClick={() => setIsAccountModalOpen(false)} disabled={isSavingAccount}>
              Cancelar
            </Button>
            <Button isLoading={isSavingAccount} onClick={handleCreateAccount}>
              Salvar
            </Button>
          </div>
        }
      >
        <div className="space-y-4 p-2">
          <Input
            label="Nome"
            value={newAccountName}
            onChange={(e) => {
              setNewAccountName(e.target.value)
              setNewAccountNameError(false)
            }}
            placeholder="Ex: Banco Inter PJ"
            error={newAccountNameError}
            errorMessage={newAccountNameError ? "O nome é obrigatório." : undefined}
          />
          <FormDropdown
            label="Tipo"
            options={[
              { value: "cash", label: "Caixa" },
              { value: "bank", label: "Banco" },
              { value: "wallet", label: "Carteira digital" },
            ]}
            value={newAccountType}
            setValue={(value) => setNewAccountType(value as FinanceAccountType)}
          />
          <MoneyInput label="Saldo inicial" value={newAccountInitialBalance} onChange={setNewAccountInitialBalance} />
          <Checkbox
            id="new_goal_account_default"
            label="Conta padrão deste tipo"
            checked={newAccountIsDefault}
            onChange={(checked) => setNewAccountIsDefault(Boolean(checked))}
          />
        </div>
      </DefaultModal>

      <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />

      <AlertModal
        isOpen={showValidationModal}
        onClose={() => setShowValidationModal(false)}
        title="Campos obrigatórios"
        description="Existem campos pendentes. Verifique os erros abaixo antes de salvar."
        message={<ul className="list-disc list-inside">{validationMessages.map((message, index) => <li key={index}>{message}</li>)}</ul>}
        variant="warning"
      />
    </FadeIn>
  )
}
