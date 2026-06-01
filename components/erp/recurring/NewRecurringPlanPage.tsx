"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo, type FC } from "react"
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Button,
  Badge,
  Input,
  Checkbox,
  FormTextarea,
  FormDropdown,
  SavingStatusModal,
  AlertModal,
  UnsavedChangesDialog
} from "@/components/reusable"
import { ChevronLeftIcon, SaveIcon, TrashIcon, PlusIcon } from "@/lib/icons"
import { useNotification } from "@/hooks/use-notification"
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes"
import { FadeIn } from "@/components/animations/FadeIn"
import { AnimatePresence } from "framer-motion"
import {
  createRecurringPlanAction,
  updateRecurringPlanAction,
  getRecurringPlanFormDataAction
} from "@/app/actions/erp/recurring-plans"
import type { RecurringPlan, RecurringPlanItem, RecurringFrequencyType } from "@/lib/types/recurring"
import { useSidebar } from "@/lib/sidebar-context"

interface NewRecurringPlanPageProps {
  onBack: () => void
  partnerId: string
  plan?: any | null
  onSuccess?: (msg: string) => void
  onError?: (msg: string) => void
}

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

const REQUIRED_FIELDS = [
  { field: "name", tab: "general" },
  { field: "frequencyInterval", tab: "general" },
  { field: "startDate", tab: "general" },
]

export const NewRecurringPlanPage: FC<NewRecurringPlanPageProps> = ({
  onBack,
  partnerId,
  plan,
  onSuccess,
  onError
}) => {
  const { success: notifySuccess, error: notifyError } = useNotification()
  const { setHeaderOverride } = useSidebar()
  const [activeTab, setActiveTab] = useState("general")
  const [isScrolled, setIsScrolled] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (scrollContainerRef.current) setIsScrolled(scrollContainerRef.current.scrollTop > 5)
  }, [])

  // Form Fields State
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [status, setStatus] = useState<"active" | "inactive" | "archived">("active")
  const [frequencyType, setFrequencyType] = useState<RecurringFrequencyType>("monthly")
  const [frequencyInterval, setFrequencyInterval] = useState(1)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState("")
  const [showInMarketplace, setShowInMarketplace] = useState(true)
  const [items, setItems] = useState<RecurringPlanItem[]>([{ ...EMPTY_ITEM }])

  const [formData, setFormData] = useState<FormData>({ products: [], services: [], staff: [] })
  const [isSaving, setIsSaving] = useState(false)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set())

  // Load select options
  useEffect(() => {
    setIsLoadingData(true)
    getRecurringPlanFormDataAction(partnerId)
      .then((res) => {
        if (res.success && res.data) {
          setFormData(res.data as FormData)
        }
      })
      .finally(() => {
        setIsLoadingData(false)
      })
  }, [partnerId])

  // Populate data when editing
  useEffect(() => {
    if (plan) {
      setName(plan.name || "")
      setDescription(plan.description || "")
      setStatus(plan.status || "active")
      setFrequencyType(plan.frequencyType || "monthly")
      setFrequencyInterval(plan.frequencyInterval || 1)
      setStartDate(plan.startDate ? plan.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10))
      setEndDate(plan.endDate ? plan.endDate.slice(0, 10) : "")
      setShowInMarketplace(plan.showInMarketplace !== false)
      if (plan.items && plan.items.length > 0) {
        setItems(
          plan.items.map((item: any) => ({
            id: item.id,
            itemType: item.itemType,
            productId: item.productId,
            variantId: item.variantId,
            serviceId: item.serviceId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            staffPartnerUserId: item.staffPartnerUserId,
            preferredTime: item.preferredTime,
            durationMinutes: item.durationMinutes,
          }))
        )
      } else {
        setItems([{ ...EMPTY_ITEM }])
      }
    }
  }, [plan])

  const isDirty = useMemo(() => {
    if (!plan) {
      return name !== "" || description !== "" || items.length > 1 || items[0]?.productId !== null || items[0]?.serviceId !== null
    }
    return (
      name !== (plan.name || "") ||
      description !== (plan.description || "") ||
      status !== (plan.status || "active") ||
      frequencyType !== (plan.frequencyType || "monthly") ||
      frequencyInterval !== (plan.frequencyInterval || 1) ||
      startDate !== (plan.startDate ? plan.startDate.slice(0, 10) : "") ||
      endDate !== (plan.endDate ? plan.endDate.slice(0, 10) : "") ||
      showInMarketplace !== (plan.showInMarketplace !== false) ||
      JSON.stringify(items) !== JSON.stringify(plan.items)
    )
  }, [name, description, status, frequencyType, frequencyInterval, startDate, endDate, showInMarketplace, items, plan])

  const { showConfirmDialog, confirmNavigation, cancelNavigation, handleNavigation } = useUnsavedChanges(isDirty)

  const handleBack = useCallback(() => handleNavigation(onBack), [handleNavigation, onBack])

  const getTabErrorCount = useCallback((tab: string) => {
    return REQUIRED_FIELDS.filter(({ field, tab: fieldTab }) => fieldTab === tab && fieldErrors.has(field)).length
  }, [fieldErrors])

  const handleAddItem = () => {
    setItems((prev) => [...prev, { ...EMPTY_ITEM }])
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length === 0 ? [{ ...EMPTY_ITEM }] : next
    })
  }

  const handleItemChange = (index: number, key: keyof RecurringPlanItem, value: any) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = { ...next[index], [key]: value }
      if (key === "itemType") {
        next[index].productId = null
        next[index].serviceId = null
        next[index].variantId = null
        next[index].staffPartnerUserId = null
        next[index].preferredTime = null
        next[index].durationMinutes = null
      }
      return next
    })
  }

  const handleSave = async () => {
    const errors = new Set<string>()
    if (!name.trim()) errors.add("name")
    if (frequencyInterval <= 0) errors.add("frequencyInterval")
    if (!startDate) errors.add("startDate")

    // Items validation
    let hasItemsError = false
    items.forEach((item, index) => {
      if (item.itemType === "product" && !item.productId) {
        hasItemsError = true
      }
      if (item.itemType === "service") {
        if (!item.serviceId || !item.staffPartnerUserId) {
          hasItemsError = true
        }
      }
      if (item.quantity <= 0) {
        hasItemsError = true
      }
    })

    if (errors.size > 0 || hasItemsError) {
      setFieldErrors(errors)
      notifyError("Preencha todos os campos obrigatórios e verifique os itens do plano.")
      return
    }
    setFieldErrors(new Set())

    try {
      setIsSaving(true)

      const payload = {
        partnerId,
        name,
        description: description || null,
        status,
        frequencyType,
        frequencyInterval,
        startDate: `${startDate}T12:00:00.000Z`,
        endDate: endDate ? `${endDate}T23:59:59.000Z` : null,
        showInMarketplace,
        items: items.map((item) => ({
          ...item,
          preferredTime: item.preferredTime ? (item.preferredTime.includes(":") && item.preferredTime.split(":").length === 2 ? `${item.preferredTime}:00` : item.preferredTime) : null
        }))
      }

      const res = plan?.id
        ? await updateRecurringPlanAction({ ...payload, planId: plan.id })
        : await createRecurringPlanAction(payload)

      if (res.success) {
        notifySuccess(plan?.id ? "Plano atualizado com sucesso!" : "Plano criado com sucesso!")
        if (onSuccess) onSuccess(plan?.id ? "Plano atualizado" : "Plano criado")
        onBack()
      } else {
        notifyError(res.error || "Erro ao salvar o plano.")
        if (onError) onError(res.error || "Erro ao salvar")
      }
    } catch (e) {
      console.error(e)
      notifyError("Ocorreu um erro ao salvar o plano.")
    } finally {
      setIsSaving(false)
    }
  }

  const pageTitle = plan ? "Editar plano" : "Novo plano recorrente"
  const isEditLoadingLocked = Boolean(plan && isLoadingData)

  useEffect(() => {
    setHeaderOverride({
      title: pageTitle,
      onBack: handleBack,
      isSubPage: true
    })
    return () => setHeaderOverride(null)
  }, [pageTitle, handleBack, setHeaderOverride])

  const frequencyOptions = [
    { value: "daily", label: "Diária" },
    { value: "weekly", label: "Semanal" },
    { value: "monthly", label: "Mensal" },
    { value: "yearly", label: "Anual" },
    { value: "custom", label: "Personalizada" }
  ]

  const statusOptions = [
    { value: "active", label: "Ativo" },
    { value: "inactive", label: "Inativo" },
    { value: "archived", label: "Arquivado" }
  ]

  return (
    <FadeIn>
      <div className="flex flex-col h-[calc(100vh-65px)] bg-white dark:bg-dark-background overflow-hidden transition-colors duration-500 ease-in-out">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full w-full">
          <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto w-full relative pb-24 md:pb-8 scroll-smooth no-scrollbar">

            {/* Sticky Header */}
            <div className="sticky top-0 z-30 w-full bg-white dark:bg-dark-surface border-b transition-all duration-500 ease-in-out">
              <div className="max-w-[1300px] mx-auto relative px-4 md:px-6 md:pt-4">

                {/* Back button - desktop only */}
                <div className={`absolute -left-12 top-7 h-full hidden xl:flex justify-center transition-all duration-500 ${isScrolled ? "scale-90" : "scale-100"}`}>
                  <Button variant="filled" onClick={handleBack} className="w-10 h-10 p-0 flex items-center justify-center">
                    <ChevronLeftIcon className="w-5 h-5 text-brand-inactive-text dark:text-dark-body" />
                  </Button>
                </div>

                {/* Title row */}
                <div className="hidden md:flex items-start justify-between">
                  <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                    <h1 className={`font-bold text-brand-dark dark:text-dark-heading transition-all duration-500 flex items-center gap-3 ${isScrolled ? "text-xl" : "text-xl md:text-3xl"}`}>
                      <span className="truncate">{pageTitle}</span>
                    </h1>

                    <div className={`hidden md:block text-brand-inactive-text dark:text-dark-body text-[15px] font-medium transition-all duration-500 ease-in-out overflow-hidden ${isScrolled ? "max-h-0 opacity-0" : "max-h-20 opacity-100"}`}>
                      Configure as regras de cobrança e os produtos/serviços inclusos no plano.
                    </div>
                  </div>

                  {/* Desktop action buttons */}
                  <div className="hidden md:flex items-center gap-3 shrink-0 ml-3">
                    <Button variant="outline" onClick={handleBack} disabled={isSaving || isEditLoadingLocked}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSave} disabled={isSaving || isEditLoadingLocked}>
                      <SaveIcon className="w-5 h-5 mr-2" />
                      {isSaving ? "Salvando..." : "Salvar"}
                    </Button>
                  </div>
                </div>

                {/* Tabs */}
                <div className={`w-full transition-all duration-500 ${isScrolled ? "md:mt-2" : "md:mt-4"}`}>
                  <TabsList className="bg-transparent p-0 gap-6 w-full justify-start border-b-0">
                    <TabsTrigger value="general">
                      Dados gerais
                      {getTabErrorCount("general") > 0 && <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />}
                    </TabsTrigger>
                    <TabsTrigger value="items">
                      Itens do plano
                      {items.some((i) => i.itemType === "product" ? !i.productId : (!i.serviceId || !i.staffPartnerUserId)) && (
                        <span className="ml-2 w-2 h-2 bg-brand-red rounded-full inline-block" />
                      )}
                    </TabsTrigger>
                  </TabsList>
                </div>
              </div>
            </div>

            {/* Content Body */}
            <div className={`px-3 md:px-6 py-6 max-w-[1300px] mx-auto min-h-[400px] relative ${isEditLoadingLocked ? "pointer-events-none" : ""}`}>
              {isEditLoadingLocked && (
                <div className="absolute inset-0 z-20 bg-white/65 dark:bg-dark-background/65 backdrop-blur-[2px] flex items-center justify-center rounded-xl">
                  <div className="text-sm font-semibold text-brand-dark dark:text-dark-heading">Carregando dados...</div>
                </div>
              )}

              <TabsContent value="general" className="mt-0">
                <FadeIn key="general" className="space-y-10 max-w-4xl">
                  <section>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Identificação do Plano</h3>
                    <div className="grid grid-cols-12 gap-5">
                      <div className="col-span-12 md:col-span-8">
                        <Input
                          label="Nome do plano"
                          placeholder="Ex: Assinatura Mensal de Ração"
                          value={name}
                          onChange={(e) => {
                            setName(e.target.value)
                            setFieldErrors((prev) => {
                              const next = new Set(prev)
                              next.delete("name")
                              return next
                            })
                          }}
                          required
                          error={fieldErrors.has("name")}
                          errorMessage={fieldErrors.has("name") ? "Nome é obrigatório" : undefined}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-4 mt-[1px]">
                        <FormDropdown
                          label="Status"
                          value={status}
                          setValue={(val) => setStatus(val as any)}
                          options={statusOptions}
                        />
                      </div>
                      <div className="col-span-12">
                        <FormTextarea
                          label="Descrição"
                          placeholder="Detalhes sobre o que este plano recorrente oferece..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          name="description"
                        />
                      </div>
                    </div>
                  </section>

                  <div className="h-px bg-brand-border dark:bg-dark-border w-full" />

                  <section>
                    <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading mb-6">Regra de Recorrência</h3>
                    <div className="grid grid-cols-12 gap-5">
                      <div className="col-span-12 md:col-span-6 mt-[1px]">
                        <FormDropdown
                          label="Frequência"
                          value={frequencyType}
                          setValue={(val) => setFrequencyType(val as any)}
                          options={frequencyOptions}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <Input
                          type="number"
                          label="Intervalo (Frequência)"
                          placeholder="Ex: 1"
                          value={frequencyInterval}
                          onChange={(e) => {
                            setFrequencyInterval(Number(e.target.value))
                            setFieldErrors((prev) => {
                              const next = new Set(prev)
                              next.delete("frequencyInterval")
                              return next
                            })
                          }}
                          required
                          min={1}
                          error={fieldErrors.has("frequencyInterval")}
                          errorMessage={fieldErrors.has("frequencyInterval") ? "Intervalo inválido" : undefined}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <Input
                          type="date"
                          label="Data de Início"
                          value={startDate}
                          onChange={(e) => {
                            setStartDate(e.target.value)
                            setFieldErrors((prev) => {
                              const next = new Set(prev)
                              next.delete("startDate")
                              return next
                            })
                          }}
                          required
                          error={fieldErrors.has("startDate")}
                          errorMessage={fieldErrors.has("startDate") ? "Data de início é obrigatória" : undefined}
                        />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <Input
                          type="date"
                          label="Data de Fim (Opcional)"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                        />
                      </div>
                      <div className="col-span-12 pt-2">
                        <Checkbox
                          label="Exibir este plano no marketplace para venda pública"
                          checked={showInMarketplace}
                          onChange={(checked) => setShowInMarketplace(checked)}
                        />
                      </div>
                    </div>
                  </section>
                </FadeIn>
              </TabsContent>

              <TabsContent value="items" className="mt-0">
                <FadeIn key="items" className="space-y-6 max-w-4xl">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-brand-dark dark:text-dark-heading">Produtos e Serviços inclusos</h3>
                      <p className="text-sm text-brand-inactive-text dark:text-dark-body">Adicione itens que serão gerados em cada ciclo da assinatura.</p>
                    </div>
                    <Button onClick={handleAddItem} leftIcon={<PlusIcon size={16} />}>
                      Adicionar item
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {items.map((item, index) => (
                      <div key={index} className="bg-brand-gray/50 dark:bg-dark-surface/50 border border-brand-border dark:border-dark-border rounded-xl p-5 relative flex flex-col gap-4">
                        
                        {/* Remove item button */}
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="absolute right-4 top-4 text-brand-inactive-text hover:text-brand-red transition-colors p-1"
                          title="Remover Item"
                        >
                          <TrashIcon size={18} />
                        </button>

                        <div className="grid grid-cols-12 gap-4 mr-6">
                          <div className="col-span-12 md:col-span-4 mt-[1px]">
                            <FormDropdown
                              label="Tipo do Item"
                              value={item.itemType}
                              setValue={(val) => handleItemChange(index, "itemType", val as any)}
                              options={[
                                { value: "product", label: "Produto" },
                                { value: "service", label: "Serviço" }
                              ]}
                            />
                          </div>

                          {item.itemType === "product" ? (
                            <div className="col-span-12 md:col-span-8 mt-[1px]">
                              <FormDropdown
                                label="Produto"
                                placeholder="Selecione um produto"
                                value={item.productId || ""}
                                setValue={(val) => handleItemChange(index, "productId", val)}
                                options={formData.products.map((p) => ({ value: p.id, label: `${p.name} - R$ ${p.price.toFixed(2)}` }))}
                              />
                            </div>
                          ) : (
                            <>
                              <div className="col-span-12 md:col-span-8 mt-[1px]">
                                <FormDropdown
                                  label="Serviço"
                                  placeholder="Selecione um serviço"
                                  value={item.serviceId || ""}
                                  setValue={(val) => handleItemChange(index, "serviceId", val)}
                                  options={formData.services.map((s) => ({ value: s.id, label: `${s.name} - R$ ${s.price.toFixed(2)}` }))}
                                />
                              </div>
                              <div className="col-span-12 md:col-span-6 mt-[1px]">
                                <FormDropdown
                                  label="Profissional"
                                  placeholder="Selecione o profissional"
                                  value={item.staffPartnerUserId || ""}
                                  setValue={(val) => handleItemChange(index, "staffPartnerUserId", val)}
                                  options={formData.staff.map((st) => ({ value: st.id, label: st.display_name }))}
                                />
                              </div>
                              <div className="col-span-12 md:col-span-6">
                                <Input
                                  type="time"
                                  label="Horário Preferencial (Opcional)"
                                  value={item.preferredTime ? item.preferredTime.slice(0, 5) : ""}
                                  onChange={(e) => handleItemChange(index, "preferredTime", e.target.value)}
                                />
                              </div>
                            </>
                          )}
                        </div>

                        <div className="grid grid-cols-12 gap-4">
                          <div className="col-span-6 md:col-span-3">
                            <Input
                              type="number"
                              label="Quantidade"
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, "quantity", Number(e.target.value))}
                              min={1}
                              required
                            />
                          </div>
                          <div className="col-span-6 md:col-span-3">
                            <Input
                              type="number"
                              label="Preço Unitário Customizado (Opcional)"
                              placeholder="Preço padrão do item"
                              value={item.unitPrice !== null ? item.unitPrice : ""}
                              onChange={(e) => handleItemChange(index, "unitPrice", e.target.value === "" ? null : Number(e.target.value))}
                              min={0}
                              step="0.01"
                            />
                          </div>
                        </div>

                      </div>
                    ))}
                  </div>
                </FadeIn>
              </TabsContent>

            </div>

          </div>
        </Tabs>
      </div>

      {/* Floating Save/Cancel bar for mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-surface border-t py-4 px-6 flex items-center justify-between gap-4 z-40">
        <Button variant="outline" className="flex-1" onClick={handleBack} disabled={isSaving || isEditLoadingLocked}>
          Cancelar
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={isSaving || isEditLoadingLocked}>
          <SaveIcon className="w-5 h-5 mr-2" />
          Salvar
        </Button>
      </div>

      <SavingStatusModal isOpen={isSaving} text="Salvando plano..." />
      <UnsavedChangesDialog open={showConfirmDialog} onConfirm={confirmNavigation} onCancel={cancelNavigation} />
    </FadeIn>
  )
}

export default NewRecurringPlanPage
